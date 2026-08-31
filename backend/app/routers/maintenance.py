import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AssetInstance,
    DowntimeEntry,
    HandoverNote,
    MachineState,
    Notification,
    PMSchedule,
    ProductionOrder,
    QualityLog,
    SparePart,
    WorkOrder,
)
from .ops import current_shift

router = APIRouter()

DEFECT_CODES = [
    {"code": "WELD-SPATTER", "label": "Weld spatter"},
    {"code": "PANEL-DENT", "label": "Panel dent / deformation"},
    {"code": "MISALIGN", "label": "Panel misalignment"},
    {"code": "DIM-OOT", "label": "Dimension out of tolerance"},
    {"code": "SURFACE", "label": "Surface defect"},
    {"code": "OTHER", "label": "Other"},
]
DEFECT_LABELS = {d["code"]: d["label"] for d in DEFECT_CODES}


def machine_names(db: Session) -> dict[str, str]:
    return {i.id: i.name for i in db.query(AssetInstance).all()}


# ---------- Handover notes ----------


class HandoverIn(BaseModel):
    text: str
    author: str = "Operator"
    machine_id: str | None = None


@router.get("/handover-notes")
def list_handover_notes(
    q: str | None = None, limit: int = 50, db: Session = Depends(get_db)
):
    query = db.query(HandoverNote).order_by(HandoverNote.created_at.desc())
    notes = query.limit(500).all()
    names = machine_names(db)
    if q:
        needle = q.lower()
        notes = [
            n
            for n in notes
            if needle in n.text.lower()
            or needle in (names.get(n.machine_id or "", "").lower())
            or needle in n.author.lower()
        ]
    return [
        {
            "id": n.id,
            "shift_date": n.shift_date,
            "shift": n.shift,
            "author": n.author,
            "text": n.text,
            "machine_id": n.machine_id,
            "machine_name": names.get(n.machine_id or ""),
            "created_at": n.created_at.isoformat(),
        }
        for n in notes[:limit]
    ]


@router.post("/handover-notes")
def create_handover_note(body: HandoverIn, db: Session = Depends(get_db)):
    shift_date, shift = current_shift()
    note = HandoverNote(
        id=f"hn-{uuid.uuid4().hex[:10]}",
        shift_date=shift_date,
        shift=shift,
        **body.model_dump(),
    )
    db.add(note)
    db.commit()
    return {"id": note.id}


# ---------- Quality logs ----------


class QualityIn(BaseModel):
    defect_code: str
    qty: int = 1
    note: str = ""


@router.get("/quality/defect-codes")
def defect_codes():
    return DEFECT_CODES


@router.post("/machines/{instance_id}/quality")
def log_quality(instance_id: str, body: QualityIn, db: Session = Depends(get_db)):
    if db.get(AssetInstance, instance_id) is None:
        raise HTTPException(404, "instance not found")
    log = QualityLog(
        id=f"ql-{uuid.uuid4().hex[:10]}", instance_id=instance_id, **body.model_dump()
    )
    db.add(log)
    db.commit()
    return {"id": log.id}


@router.get("/quality/logs")
def quality_logs(limit: int = 30, db: Session = Depends(get_db)):
    names = machine_names(db)
    logs = (
        db.query(QualityLog).order_by(QualityLog.logged_at.desc()).limit(limit).all()
    )
    return [
        {
            "id": log.id,
            "instance_id": log.instance_id,
            "machine_name": names.get(log.instance_id, "?"),
            "defect_code": log.defect_code,
            "defect": DEFECT_LABELS.get(log.defect_code, log.defect_code),
            "qty": log.qty,
            "note": log.note,
            "logged_at": log.logged_at.isoformat(),
        }
        for log in logs
    ]


@router.get("/quality/pareto")
def scrap_pareto(days: int = 7, db: Session = Depends(get_db)):
    since = datetime.now() - timedelta(days=days)
    logs = db.query(QualityLog).filter(QualityLog.logged_at > since).all()
    counts: dict[str, int] = {}
    for log in logs:
        counts[log.defect_code] = counts.get(log.defect_code, 0) + log.qty
    return sorted(
        [
            {
                "defect_code": code,
                "defect": DEFECT_LABELS.get(code, code),
                "qty": qty,
            }
            for code, qty in counts.items()
        ],
        key=lambda r: r["qty"],
        reverse=True,
    )


# ---------- Work orders ----------


class WorkOrderIn(BaseModel):
    instance_id: str
    title: str
    description: str = ""
    type: str = "corrective"
    priority: str = "medium"
    due_date: str | None = None
    downtime_entry_id: str | None = None


class WorkOrderPatch(BaseModel):
    status: str | None = None
    priority: str | None = None
    description: str | None = None
    due_date: str | None = None


def work_order_out(wo: WorkOrder, names: dict[str, str]) -> dict:
    return {
        "id": wo.id,
        "instance_id": wo.instance_id,
        "machine_name": names.get(wo.instance_id, "?"),
        "type": wo.type,
        "title": wo.title,
        "description": wo.description,
        "status": wo.status,
        "priority": wo.priority,
        "downtime_entry_id": wo.downtime_entry_id,
        "due_date": wo.due_date,
        "created_at": wo.created_at.isoformat(),
        "closed_at": wo.closed_at.isoformat() if wo.closed_at else None,
    }


@router.get("/work-orders")
def list_work_orders(db: Session = Depends(get_db)):
    names = machine_names(db)
    orders = db.query(WorkOrder).order_by(WorkOrder.created_at.desc()).all()
    return [work_order_out(wo, names) for wo in orders]


@router.post("/work-orders")
def create_work_order(body: WorkOrderIn, db: Session = Depends(get_db)):
    if db.get(AssetInstance, body.instance_id) is None:
        raise HTTPException(404, "instance not found")
    wo = WorkOrder(id=f"WO-{uuid.uuid4().hex[:6].upper()}", **body.model_dump())
    db.add(wo)
    db.commit()
    return work_order_out(wo, machine_names(db))


@router.patch("/work-orders/{wo_id}")
def update_work_order(wo_id: str, body: WorkOrderPatch, db: Session = Depends(get_db)):
    wo = db.get(WorkOrder, wo_id)
    if wo is None:
        raise HTTPException(404, "work order not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(wo, field, value)
    if body.status == "done" and wo.closed_at is None:
        wo.closed_at = datetime.now()
    db.commit()
    return work_order_out(wo, machine_names(db))


# ---------- PM schedules ----------


class PMIn(BaseModel):
    instance_id: str
    title: str
    interval_days: int | None = None
    interval_runtime_h: int | None = None


def runtime_hours_since(db: Session, instance_id: str, since: datetime) -> float:
    """Approximate runtime = elapsed - logged downtime."""
    now = datetime.now()
    elapsed_h = (now - since).total_seconds() / 3600
    entries = (
        db.query(DowntimeEntry)
        .filter(
            DowntimeEntry.instance_id == instance_id,
            (DowntimeEntry.ended_at.is_(None)) | (DowntimeEntry.ended_at > since),
        )
        .all()
    )
    down_h = 0.0
    for e in entries:
        start = max(e.started_at, since)
        end = e.ended_at or now
        if end > start:
            down_h += (end - start).total_seconds() / 3600
    return max(0.0, elapsed_h - down_h)


def pm_out(db: Session, pm: PMSchedule, names: dict[str, str]) -> dict:
    now = datetime.now()
    due = False
    due_reason = None
    next_due_date = None
    if pm.interval_days:
        next_due = pm.last_done + timedelta(days=pm.interval_days)
        next_due_date = next_due.strftime("%Y-%m-%d")
        if now >= next_due:
            due = True
            due_reason = "calendar interval elapsed"
    runtime_h = runtime_hours_since(db, pm.instance_id, pm.last_done)
    if pm.interval_runtime_h and runtime_h >= pm.interval_runtime_h:
        due = True
        due_reason = f"runtime {runtime_h:.0f} h ≥ {pm.interval_runtime_h} h"
    return {
        "id": pm.id,
        "instance_id": pm.instance_id,
        "machine_name": names.get(pm.instance_id, "?"),
        "title": pm.title,
        "interval_days": pm.interval_days,
        "interval_runtime_h": pm.interval_runtime_h,
        "last_done": pm.last_done.isoformat(),
        "runtime_h_since": round(runtime_h, 1),
        "next_due_date": next_due_date,
        "due": due,
        "due_reason": due_reason,
    }


@router.get("/pm-schedules")
def list_pm_schedules(db: Session = Depends(get_db)):
    names = machine_names(db)
    return [pm_out(db, pm, names) for pm in db.query(PMSchedule).all()]


@router.post("/pm-schedules")
def create_pm_schedule(body: PMIn, db: Session = Depends(get_db)):
    if db.get(AssetInstance, body.instance_id) is None:
        raise HTTPException(404, "instance not found")
    pm = PMSchedule(id=f"pm-{uuid.uuid4().hex[:10]}", **body.model_dump())
    db.add(pm)
    db.commit()
    return pm_out(db, pm, machine_names(db))


@router.post("/pm-schedules/{pm_id}/done")
def mark_pm_done(pm_id: str, db: Session = Depends(get_db)):
    pm = db.get(PMSchedule, pm_id)
    if pm is None:
        raise HTTPException(404, "schedule not found")
    pm.last_done = datetime.now()
    db.commit()
    return pm_out(db, pm, machine_names(db))


# ---------- Spare parts ----------


class SparePartIn(BaseModel):
    sku: str
    name: str
    qty: int = 0
    min_qty: int = 0
    location: str = ""
    instance_id: str | None = None


class SparePartPatch(BaseModel):
    qty: int | None = None
    min_qty: int | None = None
    location: str | None = None


@router.get("/spare-parts")
def list_spare_parts(db: Session = Depends(get_db)):
    names = machine_names(db)
    return [
        {
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "qty": p.qty,
            "min_qty": p.min_qty,
            "location": p.location,
            "instance_id": p.instance_id,
            "machine_name": names.get(p.instance_id or ""),
            "low": p.qty < p.min_qty,
        }
        for p in db.query(SparePart).all()
    ]


@router.post("/spare-parts")
def create_spare_part(body: SparePartIn, db: Session = Depends(get_db)):
    part = SparePart(id=f"sp-{uuid.uuid4().hex[:10]}", **body.model_dump())
    db.add(part)
    db.commit()
    return {"id": part.id}


@router.patch("/spare-parts/{part_id}")
def update_spare_part(
    part_id: str, body: SparePartPatch, db: Session = Depends(get_db)
):
    part = db.get(SparePart, part_id)
    if part is None:
        raise HTTPException(404, "part not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(part, field, value)
    db.commit()
    return {"ok": True}


# ---------- Notifications ----------


def _ensure_notification(
    db: Session, kind: str, ref_id: str, message: str, severity: str
) -> None:
    exists = (
        db.query(Notification)
        .filter(
            Notification.kind == kind,
            Notification.ref_id == ref_id,
            Notification.read == 0,
        )
        .first()
    )
    if exists is None:
        db.add(
            Notification(
                id=f"nt-{uuid.uuid4().hex[:10]}",
                kind=kind,
                ref_id=ref_id,
                message=message,
                severity=severity,
            )
        )


def evaluate_notifications(db: Session) -> None:
    """Lazily generate alerts: down > 30 min, low stock, late orders."""
    now = datetime.now()
    names = machine_names(db)

    for state in db.query(MachineState).filter(MachineState.status == "down").all():
        minutes = (now - state.since).total_seconds() / 60
        if minutes > 30:
            _ensure_notification(
                db,
                "machine_down",
                state.instance_id,
                f"{names.get(state.instance_id, '?')} down for {minutes:.0f} min"
                f" ({state.reason_code or 'no reason'})",
                "critical",
            )

    for part in db.query(SparePart).all():
        if part.qty < part.min_qty:
            _ensure_notification(
                db,
                "low_stock",
                part.id,
                f"Spare part {part.name} below min stock ({part.qty}/{part.min_qty})",
                "warning",
            )

    today = now.strftime("%Y-%m-%d")
    for order in (
        db.query(ProductionOrder).filter(ProductionOrder.status != "done").all()
    ):
        if order.due_date and order.due_date < today:
            _ensure_notification(
                db,
                "order_late",
                order.id,
                f"Order {order.id} is late (was due {order.due_date})",
                "warning",
            )
    db.commit()


@router.get("/notifications")
def list_notifications(unread_only: bool = False, db: Session = Depends(get_db)):
    evaluate_notifications(db)
    query = db.query(Notification).order_by(Notification.created_at.desc())
    if unread_only:
        query = query.filter(Notification.read == 0)
    return [
        {
            "id": n.id,
            "kind": n.kind,
            "message": n.message,
            "severity": n.severity,
            "read": bool(n.read),
            "created_at": n.created_at.isoformat(),
        }
        for n in query.limit(100).all()
    ]


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: str, db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if n is None:
        raise HTTPException(404, "notification not found")
    n.read = 1
    db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def mark_all_read(db: Session = Depends(get_db)):
    db.query(Notification).update({Notification.read: 1})
    db.commit()
    return {"ok": True}
