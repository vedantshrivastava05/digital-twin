import random
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Asset,
    AssetInstance,
    DowntimeEntry,
    HandoverNote,
    MachineState,
    PMSchedule,
    Product,
    ProductionLog,
    ProductionOrder,
    QualityLog,
    SparePart,
    WorkOrder,
)
from ..schemas import (
    DowntimeEntryOut,
    MachineStateOut,
    OeeOut,
    ProductionLogOut,
)

router = APIRouter(prefix="/ops")

REASON_CODES = [
    {"code": "BRK-MECH", "label": "Breakdown — mechanical"},
    {"code": "BRK-ELEC", "label": "Breakdown — electrical"},
    {"code": "CHG-OVER", "label": "Changeover / setup"},
    {"code": "NO-MAT", "label": "Waiting for material"},
    {"code": "QUAL", "label": "Quality issue"},
    {"code": "PM", "label": "Planned maintenance"},
    {"code": "AUTO", "label": "Auto-detected (telemetry)"},
    {"code": "OTHER", "label": "Other"},
]
REASON_LABELS = {r["code"]: r["label"] for r in REASON_CODES}

# Ideal output per hour by asset category, used for OEE performance
IDEAL_RATE_PER_H = {
    "robot": 320,
    "bodyline": 60,
    "trimline": 45,
    "press": 900,
    "cnc": 55,
    "conveyor": 1500,
    "stamping": 700,
    "cncmill": 40,
    "paintrobot": 300,
    "diptank": 50,
    "oven": 55,
    "asrs": 400,
    "agv": 200,
    "forklift": 90,
    "paintline": 300,
    "inboundrail": 240,
    "blanking": 700,
    "transferrobot": 700,
    "diecrane": 4,
    "scrapconv": 1200,
    "panelrack": 0,
    "coilcrane": 30,
    "galine": 55,
    "marriage": 55,
    "qcgate": 60,
    "framing": 60,
    "framecell": 55,
    "doorline": 55,
    "wheelstn": 55,
    "glassstn": 55,
    "seatstn": 55,
    "fluidfill": 55,
    "rollertest": 55,
    "lampaim": 55,
    "inspectpit": 55,
    "lighttunnel": 55,
    "showertest": 55,
}


def utcnow() -> datetime:
    """Naive local time — the whole demo runs on one machine."""
    return datetime.now()


def current_shift(now: datetime | None = None) -> tuple[str, str]:
    """Returns (shift_date, shift). Shifts: A 06-14, B 14-22, C 22-06."""
    now = now or datetime.now()
    if 6 <= now.hour < 14:
        shift = "A"
    elif 14 <= now.hour < 22:
        shift = "B"
    else:
        shift = "C"
    return now.strftime("%Y-%m-%d"), shift


def get_or_create_state(db: Session, instance_id: str) -> MachineState:
    state = db.get(MachineState, instance_id)
    if state is None:
        state = MachineState(instance_id=instance_id, status="running", since=utcnow())
        db.add(state)
        db.flush()
    return state


@router.get("/reason-codes")
def reason_codes():
    return REASON_CODES


@router.get("/state", response_model=list[MachineStateOut])
def all_states(db: Session = Depends(get_db)):
    instances = db.query(AssetInstance).all()
    return [get_or_create_state(db, i.id) for i in instances]


class StatusChange(BaseModel):
    status: str  # running|idle|warning|down
    reason_code: str | None = None
    note: str = ""


@router.post("/machines/{instance_id}/status", response_model=MachineStateOut)
def set_status(instance_id: str, body: StatusChange, db: Session = Depends(get_db)):
    if db.get(AssetInstance, instance_id) is None:
        raise HTTPException(404, "instance not found")
    if body.status not in ("running", "idle", "warning", "down"):
        raise HTTPException(400, "status must be running|idle|warning|down")
    if body.status == "down" and not body.reason_code:
        raise HTTPException(400, "downtime needs a reason_code")

    state = get_or_create_state(db, instance_id)
    now = utcnow()

    # Close any open downtime entry when leaving 'down'
    if state.status == "down" and body.status != "down":
        open_entry = (
            db.query(DowntimeEntry)
            .filter(
                DowntimeEntry.instance_id == instance_id,
                DowntimeEntry.ended_at.is_(None),
            )
            .first()
        )
        if open_entry is not None:
            open_entry.ended_at = now

    if body.status == "down" and state.status != "down":
        db.add(
            DowntimeEntry(
                id=f"dt-{uuid.uuid4().hex[:10]}",
                instance_id=instance_id,
                reason_code=body.reason_code or "OTHER",
                note=body.note,
                started_at=now,
            )
        )

    state.status = body.status
    state.since = now
    state.reason_code = body.reason_code if body.status == "down" else None
    state.note = body.note
    db.commit()
    return state


@router.get("/machines/{instance_id}/downtime", response_model=list[DowntimeEntryOut])
def downtime_history(
    instance_id: str, limit: int = 10, db: Session = Depends(get_db)
):
    return (
        db.query(DowntimeEntry)
        .filter(DowntimeEntry.instance_id == instance_id)
        .order_by(DowntimeEntry.started_at.desc())
        .limit(limit)
        .all()
    )


class ProductionEntry(BaseModel):
    good: int = 0
    reject: int = 0
    order_id: str | None = None


@router.post("/machines/{instance_id}/production", response_model=ProductionLogOut)
def log_production(
    instance_id: str, body: ProductionEntry, db: Session = Depends(get_db)
):
    if db.get(AssetInstance, instance_id) is None:
        raise HTTPException(404, "instance not found")
    shift_date, shift = current_shift()
    log = ProductionLog(
        id=f"pl-{uuid.uuid4().hex[:10]}",
        instance_id=instance_id,
        shift_date=shift_date,
        shift=shift,
        good=body.good,
        reject=body.reject,
        order_id=body.order_id,
    )
    db.add(log)
    db.commit()
    return log


@router.get(
    "/machines/{instance_id}/production", response_model=list[ProductionLogOut]
)
def production_history(
    instance_id: str, limit: int = 20, db: Session = Depends(get_db)
):
    return (
        db.query(ProductionLog)
        .filter(ProductionLog.instance_id == instance_id)
        .order_by(ProductionLog.logged_at.desc())
        .limit(limit)
        .all()
    )


def compute_oee(db: Session, instance_id: str, hours: int = 24) -> OeeOut:
    inst = db.get(AssetInstance, instance_id)
    if inst is None:
        raise HTTPException(404, "instance not found")
    asset = db.get(Asset, inst.asset_id)
    now = utcnow()
    window_start = now - timedelta(hours=hours)
    window_min = hours * 60

    entries = (
        db.query(DowntimeEntry)
        .filter(DowntimeEntry.instance_id == instance_id)
        .filter(
            (DowntimeEntry.ended_at.is_(None))
            | (DowntimeEntry.ended_at > window_start)
        )
        .all()
    )
    down_min = 0.0
    for e in entries:
        start = max(e.started_at, window_start)
        end = e.ended_at or now
        if end > start:
            down_min += (end - start).total_seconds() / 60

    down_min = min(down_min, window_min)
    availability = 1 - down_min / window_min

    logs = (
        db.query(ProductionLog)
        .filter(
            ProductionLog.instance_id == instance_id,
            ProductionLog.logged_at > window_start,
        )
        .all()
    )
    good = sum(log.good for log in logs)
    reject = sum(log.reject for log in logs)
    quality = good / (good + reject) if good + reject > 0 else 1.0

    rate = IDEAL_RATE_PER_H.get(asset.category if asset else "", 0)
    uptime_h = (window_min - down_min) / 60
    ideal = rate * uptime_h
    performance = min(1.0, good / ideal) if ideal > 0 else 1.0

    return OeeOut(
        instance_id=instance_id,
        window_hours=hours,
        availability=round(availability, 4),
        performance=round(performance, 4),
        quality=round(quality, 4),
        oee=round(availability * performance * quality, 4),
        good=good,
        reject=reject,
        downtime_minutes=round(down_min, 1),
    )


@router.get("/machines/{instance_id}/oee", response_model=OeeOut)
def machine_oee(instance_id: str, hours: int = 24, db: Session = Depends(get_db)):
    return compute_oee(db, instance_id, hours)


class OeePointOut(BaseModel):
    t: str
    oee: float
    availability: float
    performance: float
    quality: float
    good: int
    reject: int


@router.get("/machines/{instance_id}/oee-series", response_model=list[OeePointOut])
def oee_series(
    instance_id: str,
    hours: int = 24,
    buckets: int = 24,
    db: Session = Depends(get_db),
):
    """OEE broken into equal time buckets over the window — drives the trend chart."""
    inst = db.get(AssetInstance, instance_id)
    if inst is None:
        raise HTTPException(404, "instance not found")
    asset = db.get(Asset, inst.asset_id)
    rate = IDEAL_RATE_PER_H.get(asset.category if asset else "", 0)
    now = utcnow()
    buckets = max(1, min(buckets, 96))
    start = now - timedelta(hours=hours)
    step = timedelta(hours=hours) / buckets
    bucket_min = (hours * 60) / buckets

    logs = (
        db.query(ProductionLog)
        .filter(ProductionLog.instance_id == instance_id, ProductionLog.logged_at > start)
        .all()
    )
    downs = (
        db.query(DowntimeEntry)
        .filter(DowntimeEntry.instance_id == instance_id)
        .filter((DowntimeEntry.ended_at.is_(None)) | (DowntimeEntry.ended_at > start))
        .all()
    )

    out: list[OeePointOut] = []
    for k in range(buckets):
        b0 = start + step * k
        b1 = b0 + step
        good = sum(l.good for l in logs if b0 <= l.logged_at < b1)
        reject = sum(l.reject for l in logs if b0 <= l.logged_at < b1)
        d_min = 0.0
        for e in downs:
            s = max(e.started_at, b0)
            en = min(e.ended_at or now, b1)
            if en > s:
                d_min += (en - s).total_seconds() / 60
        d_min = min(d_min, bucket_min)
        availability = 1 - d_min / bucket_min if bucket_min > 0 else 1.0
        quality = good / (good + reject) if good + reject > 0 else 1.0
        uptime_h = (bucket_min - d_min) / 60
        ideal = rate * uptime_h
        performance = min(1.0, good / ideal) if ideal > 0 else (0.0 if good == 0 else 1.0)
        out.append(
            OeePointOut(
                t=b1.isoformat(),
                oee=round(availability * performance * quality, 4),
                availability=round(availability, 4),
                performance=round(performance, 4),
                quality=round(quality, 4),
                good=good,
                reject=reject,
            )
        )
    return out


@router.get("/morning-report")
def morning_report(date: str | None = None, db: Session = Depends(get_db)):
    """Yesterday-at-a-glance: output, OEE, top downtime reasons."""
    if date is None:
        date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    day_start = datetime.strptime(date, "%Y-%m-%d")
    day_end = day_start + timedelta(days=1)

    instances = db.query(AssetInstance).all()
    names = {i.id: i.name for i in instances}

    logs = db.query(ProductionLog).filter(ProductionLog.shift_date == date).all()
    per_machine: dict[str, dict] = {}
    for log in logs:
        m = per_machine.setdefault(
            log.instance_id,
            {"instance_id": log.instance_id, "name": names.get(log.instance_id, "?"),
             "good": 0, "reject": 0},
        )
        m["good"] += log.good
        m["reject"] += log.reject

    entries = (
        db.query(DowntimeEntry)
        .filter(DowntimeEntry.started_at < day_end)
        .filter(
            (DowntimeEntry.ended_at.is_(None)) | (DowntimeEntry.ended_at > day_start)
        )
        .all()
    )
    reasons: dict[str, float] = {}
    downtime_per_machine: dict[str, float] = {}
    now = utcnow()
    for e in entries:
        start = max(e.started_at, day_start)
        end = min(e.ended_at or now, day_end)
        if end <= start:
            continue
        minutes = (end - start).total_seconds() / 60
        reasons[e.reason_code] = reasons.get(e.reason_code, 0) + minutes
        downtime_per_machine[e.instance_id] = (
            downtime_per_machine.get(e.instance_id, 0) + minutes
        )

    total_good = sum(m["good"] for m in per_machine.values())
    total_reject = sum(m["reject"] for m in per_machine.values())
    total_down_min = sum(downtime_per_machine.values())

    # Simple day OEE across the plant
    n = max(1, len(instances))
    avail = max(0.0, 1 - total_down_min / (n * 24 * 60))
    quality = total_good / (total_good + total_reject) if total_good + total_reject else 1.0

    machines_down_now = [
        {
            "instance_id": s.instance_id,
            "name": names.get(s.instance_id, "?"),
            "reason_code": s.reason_code,
            "reason": REASON_LABELS.get(s.reason_code or "", s.reason_code),
            "since": s.since.isoformat(),
        }
        for s in db.query(MachineState).filter(MachineState.status == "down").all()
    ]

    return {
        "date": date,
        "total_good": total_good,
        "total_reject": total_reject,
        "downtime_minutes": round(total_down_min, 1),
        "plant_availability": round(avail, 4),
        "plant_quality": round(quality, 4),
        "machines": sorted(
            per_machine.values(), key=lambda m: m["good"], reverse=True
        ),
        "top_reasons": sorted(
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
        ),
        "downtime_per_machine": [
            {
                "instance_id": iid,
                "name": names.get(iid, "?"),
                "minutes": round(minutes, 1),
            }
            for iid, minutes in sorted(
                downtime_per_machine.items(), key=lambda kv: kv[1], reverse=True
            )
        ],
        "machines_down_now": machines_down_now,
    }


@router.post("/demo-data")
def generate_demo_data(days: int = 7, db: Session = Depends(get_db)):
    """Backfill history so reports and OEE have something to show."""
    instances = db.query(AssetInstance).all()
    assets = {a.id: a for a in db.query(Asset).all()}

    db.query(ProductionLog).delete()
    db.query(DowntimeEntry).delete()

    now = datetime.now()
    for day_offset in range(days, -1, -1):
        day = now - timedelta(days=day_offset)
        date_str = day.strftime("%Y-%m-%d")
        for inst in instances:
            asset = assets.get(inst.asset_id)
            rate = IDEAL_RATE_PER_H.get(asset.category if asset else "", 0)
            if rate <= 0:
                continue
            for shift, start_hour in (("A", 6), ("B", 14), ("C", 22)):
                perf = random.uniform(0.72, 0.98)
                good = int(rate * 8 * perf)
                reject = int(good * random.uniform(0.005, 0.04))
                logged = day.replace(
                    hour=(start_hour + 7) % 24, minute=45, second=0, microsecond=0
                )
                if logged > now:
                    continue
                db.add(
                    ProductionLog(
                        id=f"pl-{uuid.uuid4().hex[:10]}",
                        instance_id=inst.id,
                        shift_date=date_str,
                        shift=shift,
                        good=good,
                        reject=reject,
                        logged_at=logged,
                    )
                )
            for _ in range(random.choices([0, 1, 2], weights=[5, 3, 1])[0]):
                start = day.replace(
                    hour=random.randint(6, 21),
                    minute=random.randint(0, 59),
                    second=0,
                    microsecond=0,
                )
                if start > now:
                    continue
                duration = random.randint(5, 45)
                db.add(
                    DowntimeEntry(
                        id=f"dt-{uuid.uuid4().hex[:10]}",
                        instance_id=inst.id,
                        reason_code=random.choice(REASON_CODES)["code"],
                        started_at=start,
                        ended_at=start + timedelta(minutes=duration),
                    )
                )

    # Demo products and orders
    if db.query(Product).count() == 0:
        products = [
            Product(id="prd-bs450", sku="BS-450", name="Body shell — Model S450"),
            Product(id="prd-dp12", sku="DP-12", name="Door panel set"),
            Product(id="prd-tk8", sku="TK-8", name="Trim kit — chrome"),
        ]
        db.add_all(products)
        today = now.strftime("%Y-%m-%d")
        yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        db.add_all(
            [
                ProductionOrder(
                    id="PO-A1B2C3", product_id="prd-bs450", qty=120,
                    status="running", machine_id="line-body-1", due_date=tomorrow,
                    color="#b6bcc4", color_name="Platinum Silver",
                ),
                ProductionOrder(
                    id="PO-D4E5F6", product_id="prd-dp12", qty=400,
                    status="queued", machine_id=None, due_date=yesterday,
                    color="#1e2f52", color_name="Deep Sapphire",
                ),
                ProductionOrder(
                    id="PO-G7H8I9", product_id="prd-tk8", qty=250,
                    status="qc", machine_id="line-trim-1", due_date=today,
                    color="#7f1d1d", color_name="Carnelian Red",
                ),
                ProductionOrder(
                    id="PO-J1K2L3", product_id="prd-bs450", qty=90,
                    status="done", machine_id="line-body-1", due_date=yesterday,
                    color="#12151b", color_name="Onyx Black",
                ),
                # The paint queue the shops build to, in sequence.
                ProductionOrder(
                    id="PO-M4N5O6", product_id="prd-bs450", qty=140,
                    status="running", machine_id="paintline-1", due_date=tomorrow,
                    color="#e8ebee", color_name="Arctic White",
                ),
                ProductionOrder(
                    id="PO-P7Q8R9", product_id="prd-bs450", qty=110,
                    status="queued", machine_id="paintline-1", due_date=tomorrow,
                    color="#0e4d3a", color_name="British Racing Green",
                ),
                ProductionOrder(
                    id="PO-S1T2U3", product_id="prd-bs450", qty=95,
                    status="queued", machine_id="galine-1", due_date=tomorrow,
                    color="#8c1d3f", color_name="Garnet Metallic",
                ),
                ProductionOrder(
                    id="PO-V4W5X6", product_id="prd-bs450", qty=160,
                    status="queued", machine_id="galine-1", due_date=tomorrow,
                    color="#4b5563", color_name="Graphite Grey",
                ),
            ]
        )

    # Ops v1.1 demo records: quality logs, handover notes, PM, spares, work orders
    if db.query(SparePart).count() == 0:
        defects = ["WELD-SPATTER", "PANEL-DENT", "MISALIGN", "DIM-OOT", "SURFACE"]
        robots = [i for i in instances if i.asset_id == "AST-ROBOT-WELD-6X"]
        for day_offset in range(days, -1, -1):
            day = now - timedelta(days=day_offset)
            for _ in range(random.randint(2, 6)):
                logged = day.replace(
                    hour=random.randint(7, 21), minute=random.randint(0, 59)
                )
                if logged > now:
                    continue
                db.add(
                    QualityLog(
                        id=f"ql-{uuid.uuid4().hex[:10]}",
                        instance_id=random.choice(robots).id if robots else instances[0].id,
                        defect_code=random.choices(defects, weights=[5, 3, 3, 2, 1])[0],
                        qty=random.randint(1, 4),
                        logged_at=logged,
                    )
                )
        yesterday_dt = now - timedelta(days=1)
        yesterday_str = yesterday_dt.strftime("%Y-%m-%d")
        db.add_all(
            [
                HandoverNote(
                    id=f"hn-{uuid.uuid4().hex[:10]}",
                    shift_date=yesterday_str, shift="B", author="R. Sharma",
                    text="Robot 4L wrist making intermittent noise at high speed — keep an eye on it.",
                    machine_id="robot-s4l",
                    created_at=yesterday_dt.replace(hour=21, minute=50),
                ),
                HandoverNote(
                    id=f"hn-{uuid.uuid4().hex[:10]}",
                    shift_date=yesterday_str, shift="B", author="R. Sharma",
                    text="Trim line ran clean all shift. Skid 6 has a worn locator pin, swapped to spare.",
                    machine_id="line-trim-1",
                    created_at=yesterday_dt.replace(hour=21, minute=55),
                ),
            ]
        )
        for inst in robots:
            db.add(
                PMSchedule(
                    id=f"pm-{uuid.uuid4().hex[:10]}",
                    instance_id=inst.id,
                    title="Grease axes + check gun tips",
                    interval_days=30,
                    interval_runtime_h=600,
                    last_done=now - timedelta(days=random.randint(2, 40)),
                )
            )
        db.add(
            PMSchedule(
                id=f"pm-{uuid.uuid4().hex[:10]}",
                instance_id="line-body-1",
                title="Skid rail inspection + lubrication",
                interval_days=14,
                last_done=now - timedelta(days=10),
            )
        )
        db.add_all(
            [
                SparePart(
                    id=f"sp-{uuid.uuid4().hex[:10]}", sku="TIP-CU-16",
                    name="Weld gun tip (Cu, 16 mm)", qty=8, min_qty=20,
                    location="Rack B2",
                ),
                SparePart(
                    id=f"sp-{uuid.uuid4().hex[:10]}", sku="SRV-J4-KIT",
                    name="Axis 4 servo repair kit", qty=2, min_qty=1,
                    location="Store room",
                ),
                SparePart(
                    id=f"sp-{uuid.uuid4().hex[:10]}", sku="PIN-LOC-8",
                    name="Skid locator pin", qty=14, min_qty=10,
                    location="Rack A1",
                ),
            ]
        )
        db.add(
            WorkOrder(
                id=f"WO-{uuid.uuid4().hex[:6].upper()}",
                instance_id="robot-s4l",
                type="corrective",
                title="Investigate wrist noise on Robot 4L",
                description="Reported in shift handover. Suspect axis 5 bearing.",
                status="open",
                priority="high",
            )
        )

    # Current states: mostly running, one down for the demo
    db.query(MachineState).delete()
    for i, inst in enumerate(instances):
        status = "down" if i == 7 else "idle" if i == 3 else "running"
        db.add(
            MachineState(
                instance_id=inst.id,
                status=status,
                since=utcnow() - timedelta(minutes=random.randint(4, 90)),
                reason_code="BRK-MECH" if status == "down" else None,
            )
        )
        if status == "down":
            db.add(
                DowntimeEntry(
                    id=f"dt-{uuid.uuid4().hex[:10]}",
                    instance_id=inst.id,
                    reason_code="BRK-MECH",
                    note="Wrist axis fault",
                    started_at=utcnow() - timedelta(minutes=25),
                )
            )
    db.commit()
    return {"ok": True, "days": days, "machines": len(instances)}
