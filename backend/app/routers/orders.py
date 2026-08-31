import csv
import io
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AssetInstance,
    DowntimeEntry,
    MachineState,
    Product,
    ProductionLog,
    ProductionOrder,
)
from .ops import REASON_LABELS

router = APIRouter()

ORDER_STATUSES = ["queued", "running", "qc", "done"]


class ProductIn(BaseModel):
    sku: str
    name: str
    uom: str = "pcs"


class ProductOut(ProductIn):
    id: str

    class Config:
        from_attributes = True


class OrderIn(BaseModel):
    product_id: str
    qty: int
    machine_id: str | None = None
    due_date: str | None = None
    color: str | None = None
    color_name: str | None = None


class OrderPatch(BaseModel):
    status: str | None = None
    machine_id: str | None = None
    due_date: str | None = None
    qty: int | None = None
    color: str | None = None
    color_name: str | None = None


def order_out(db: Session, order: ProductionOrder, products: dict | None = None) -> dict:
    if products is None:
        products = {p.id: p for p in db.query(Product).all()}
    produced = (
        db.query(ProductionLog)
        .filter(ProductionLog.order_id == order.id)
        .with_entities(ProductionLog.good)
        .all()
    )
    product = products.get(order.product_id)
    machine = db.get(AssetInstance, order.machine_id) if order.machine_id else None
    return {
        "id": order.id,
        "product_id": order.product_id,
        "product_sku": product.sku if product else "?",
        "product_name": product.name if product else "?",
        "qty": order.qty,
        "produced": sum(g for (g,) in produced),
        "status": order.status,
        "machine_id": order.machine_id,
        "machine_name": machine.name if machine else None,
        "due_date": order.due_date,
        "color": order.color,
        "color_name": order.color_name,
        "created_at": order.created_at.isoformat(),
        "late": bool(
            order.due_date
            and order.status != "done"
            and order.due_date < datetime.now().strftime("%Y-%m-%d")
        ),
    }


@router.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    return db.query(Product).all()


@router.post("/products", response_model=ProductOut)
def create_product(body: ProductIn, db: Session = Depends(get_db)):
    if db.query(Product).filter(Product.sku == body.sku).first():
        raise HTTPException(400, "sku already exists")
    product = Product(id=f"prd-{uuid.uuid4().hex[:8]}", **body.model_dump())
    db.add(product)
    db.commit()
    return product


@router.get("/orders")
def list_orders(db: Session = Depends(get_db)):
    products = {p.id: p for p in db.query(Product).all()}
    orders = (
        db.query(ProductionOrder).order_by(ProductionOrder.created_at.desc()).all()
    )
    return [order_out(db, o, products) for o in orders]


@router.post("/orders")
def create_order(body: OrderIn, db: Session = Depends(get_db)):
    if db.get(Product, body.product_id) is None:
        raise HTTPException(400, "unknown product_id")
    order = ProductionOrder(
        id=f"PO-{uuid.uuid4().hex[:6].upper()}", **body.model_dump()
    )
    db.add(order)
    db.commit()
    return order_out(db, order)


@router.patch("/orders/{order_id}")
def update_order(order_id: str, body: OrderPatch, db: Session = Depends(get_db)):
    order = db.get(ProductionOrder, order_id)
    if order is None:
        raise HTTPException(404, "order not found")
    if body.status is not None and body.status not in ORDER_STATUSES:
        raise HTTPException(400, f"status must be one of {ORDER_STATUSES}")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(order, field, value)
    db.commit()
    return order_out(db, order)


@router.delete("/orders/{order_id}", status_code=204)
def delete_order(order_id: str, db: Session = Depends(get_db)):
    order = db.get(ProductionOrder, order_id)
    if order is None:
        raise HTTPException(404, "order not found")
    db.delete(order)
    db.commit()


@router.post("/orders/import-csv")
def import_orders_csv(file: UploadFile, db: Session = Depends(get_db)):
    """CSV columns: sku, product_name, qty, due_date, machine_id (last two optional)."""
    text = file.file.read().decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    created, errors = 0, []
    for i, row in enumerate(reader, start=2):
        sku = (row.get("sku") or "").strip()
        try:
            qty = int((row.get("qty") or "0").strip())
        except ValueError:
            qty = 0
        if not sku or qty <= 0:
            errors.append(f"row {i}: needs sku and positive qty")
            continue
        product = db.query(Product).filter(Product.sku == sku).first()
        if product is None:
            product = Product(
                id=f"prd-{uuid.uuid4().hex[:8]}",
                sku=sku,
                name=(row.get("product_name") or sku).strip(),
            )
            db.add(product)
            db.flush()
        machine_id = (row.get("machine_id") or "").strip() or None
        if machine_id and db.get(AssetInstance, machine_id) is None:
            errors.append(f"row {i}: unknown machine {machine_id}")
            machine_id = None
        db.add(
            ProductionOrder(
                id=f"PO-{uuid.uuid4().hex[:6].upper()}",
                product_id=product.id,
                qty=qty,
                machine_id=machine_id,
                due_date=(row.get("due_date") or "").strip() or None,
            )
        )
        created += 1
    db.commit()
    return {"created": created, "errors": errors}


@router.get("/ops/pareto/downtime")
def downtime_pareto(days: int = 7, db: Session = Depends(get_db)):
    since = datetime.now() - timedelta(days=days)
    entries = (
        db.query(DowntimeEntry)
        .filter(
            (DowntimeEntry.ended_at.is_(None)) | (DowntimeEntry.ended_at > since)
        )
        .all()
    )
    now = datetime.now()
    reasons: dict[str, float] = {}
    for e in entries:
        start = max(e.started_at, since)
        end = e.ended_at or now
        if end <= start:
            continue
        reasons[e.reason_code] = (
            reasons.get(e.reason_code, 0) + (end - start).total_seconds() / 60
        )
    return sorted(
        [
            {
                "reason_code": code,
                "reason": REASON_LABELS.get(code, code),
                "minutes": round(minutes, 1),
            }
            for code, minutes in reasons.items()
        ],
        key=lambda r: r["minutes"],
        reverse=True,
    )


@router.get("/ops/dashboard")
def owner_dashboard(db: Session = Depends(get_db)):
    """Everything the owner glances at: output, down machines, late orders, trend."""
    today = datetime.now().strftime("%Y-%m-%d")
    names = {i.id: i.name for i in db.query(AssetInstance).all()}

    logs_today = (
        db.query(ProductionLog).filter(ProductionLog.shift_date == today).all()
    )
    good_today = sum(log.good for log in logs_today)
    reject_today = sum(log.reject for log in logs_today)

    down_now = [
        {
            "instance_id": s.instance_id,
            "name": names.get(s.instance_id, "?"),
            "reason_code": s.reason_code,
            "reason": REASON_LABELS.get(s.reason_code or "", s.reason_code),
            "since": s.since.isoformat(),
        }
        for s in db.query(MachineState).filter(MachineState.status == "down").all()
    ]

    products = {p.id: p for p in db.query(Product).all()}
    late_orders = [
        order_out(db, o, products)
        for o in db.query(ProductionOrder)
        .filter(ProductionOrder.status != "done")
        .all()
        if o.due_date and o.due_date < today
    ]

    # 7-day output trend
    trend = []
    for offset in range(6, -1, -1):
        day = (datetime.now() - timedelta(days=offset)).strftime("%Y-%m-%d")
        day_logs = (
            db.query(ProductionLog).filter(ProductionLog.shift_date == day).all()
        )
        trend.append(
            {
                "date": day,
                "good": sum(log.good for log in day_logs),
                "reject": sum(log.reject for log in day_logs),
            }
        )

    orders = db.query(ProductionOrder).all()
    order_counts = {status: 0 for status in ORDER_STATUSES}
    for o in orders:
        order_counts[o.status] = order_counts.get(o.status, 0) + 1

    return {
        "date": today,
        "good_today": good_today,
        "reject_today": reject_today,
        "machines_total": len(names),
        "machines_down": down_now,
        "late_orders": late_orders,
        "order_counts": order_counts,
        "trend": trend,
        "pareto": downtime_pareto(days=7, db=db),
    }
