"""Factory Brain: health scores, anomaly detection, fault-tree diagnosis (PRD §10).

Condition rules + EWMA z-scores come from the virtual plant telemetry; fault
trees are static per machine family; diagnosis links to spare-part stock and
can raise a predictive work order in one click.
"""

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Alarm,
    Asset,
    AssetInstance,
    DowntimeEntry,
    MachineState,
    PMSchedule,
    SparePart,
    WorkOrder,
)
from ..telemetry import plant

router = APIRouter()

RUNTIME_UTILIZATION = 0.65  # assumed fraction of elapsed time a machine runs

# ---------- fault trees per machine family ----------

FAULT_TREES: dict[str, list[dict]] = {
    "robot": [
        {
            "id": "wrist-noise",
            "symptom": "Wrist noise / vibration",
            "suspects": [
                {"component": "Axis 5 wrist bearing", "confidence": 0.62, "spare_sku": "SRV-J4-KIT"},
                {"component": "Axis 4 servo motor", "confidence": 0.25, "spare_sku": "SRV-J4-KIT"},
                {"component": "Dress pack / cable loom loose", "confidence": 0.13, "spare_sku": None},
            ],
        },
        {
            "id": "overtemp",
            "symptom": "Running hot / overtemperature",
            "suspects": [
                {"component": "Axis bearing friction (lubrication)", "confidence": 0.55, "spare_sku": "SRV-J4-KIT"},
                {"component": "Cooling fan failure", "confidence": 0.30, "spare_sku": "FAN-AX-40"},
                {"component": "Cabinet filter clogged", "confidence": 0.15, "spare_sku": "FLT-CAB-2"},
            ],
        },
        {
            "id": "weld-quality",
            "symptom": "Weld quality poor / spatter",
            "suspects": [
                {"component": "Worn weld gun tip", "confidence": 0.70, "spare_sku": "TIP-CU-16"},
                {"component": "Gun pressure out of spec", "confidence": 0.20, "spare_sku": None},
                {"component": "Weld cable wear", "confidence": 0.10, "spare_sku": "CBL-WLD-70"},
            ],
        },
        {
            "id": "no-start",
            "symptom": "Won't start / no power",
            "suspects": [
                {"component": "Main contactor", "confidence": 0.50, "spare_sku": "CNT-3P-40"},
                {"component": "Servo drive fault", "confidence": 0.30, "spare_sku": None},
                {"component": "E-stop chain / safety relay", "confidence": 0.20, "spare_sku": None},
            ],
        },
    ],
    "bodyline": [
        {
            "id": "skid-jam",
            "symptom": "Skid jams / misalignment",
            "suspects": [
                {"component": "Worn skid locator pin", "confidence": 0.60, "spare_sku": "PIN-LOC-8"},
                {"component": "Rail debris / damage", "confidence": 0.25, "spare_sku": None},
                {"component": "Lift table proximity sensor", "confidence": 0.15, "spare_sku": "SNS-IND-M12"},
            ],
        },
        {
            "id": "slow-index",
            "symptom": "Slow indexing / missed cycle time",
            "suspects": [
                {"component": "Drive belt wear", "confidence": 0.50, "spare_sku": "BLT-DR-1400"},
                {"component": "VFD parameter drift", "confidence": 0.30, "spare_sku": None},
                {"component": "Roller bearing", "confidence": 0.20, "spare_sku": "SRV-J4-KIT"},
            ],
        },
        {
            "id": "overtemp",
            "symptom": "Gearbox / motor overtemperature",
            "suspects": [
                {"component": "Gearbox oil low", "confidence": 0.55, "spare_sku": "OIL-GB-220"},
                {"component": "Motor cooling fan", "confidence": 0.30, "spare_sku": "FAN-AX-40"},
                {"component": "Mechanical overload", "confidence": 0.15, "spare_sku": None},
            ],
        },
    ],
    "trimline": [
        {
            "id": "belt-slip",
            "symptom": "Conveyor slipping / stalling",
            "suspects": [
                {"component": "Belt tension loss", "confidence": 0.55, "spare_sku": "BLT-DR-1400"},
                {"component": "Drive roller wear", "confidence": 0.30, "spare_sku": None},
                {"component": "Motor coupling", "confidence": 0.15, "spare_sku": None},
            ],
        },
        {
            "id": "station-stop",
            "symptom": "Random station stoppages",
            "suspects": [
                {"component": "Photo-eye misaligned / dirty", "confidence": 0.50, "spare_sku": "SNS-IND-M12"},
                {"component": "Pallet stop wear", "confidence": 0.30, "spare_sku": None},
                {"component": "PLC I/O module fault", "confidence": 0.20, "spare_sku": None},
            ],
        },
    ],
    "stamping": [
        {
            "id": "tonnage-drop",
            "symptom": "Low tonnage / short-formed panels",
            "suspects": [
                {"component": "Hydraulic pressure loss", "confidence": 0.55, "spare_sku": None},
                {"component": "Worn die / punch", "confidence": 0.30, "spare_sku": None},
                {"component": "Slide gib clearance", "confidence": 0.15, "spare_sku": None},
            ],
        },
        {
            "id": "overtemp",
            "symptom": "Hydraulic overtemperature",
            "suspects": [
                {"component": "Cooler / heat exchanger", "confidence": 0.5, "spare_sku": "FAN-AX-40"},
                {"component": "Relief valve chatter", "confidence": 0.3, "spare_sku": None},
                {"component": "Low oil level", "confidence": 0.2, "spare_sku": "OIL-GB-220"},
            ],
        },
    ],
    "cncmill": [
        {
            "id": "spindle-vib",
            "symptom": "Spindle vibration / poor finish",
            "suspects": [
                {"component": "Spindle bearing wear", "confidence": 0.6, "spare_sku": None},
                {"component": "Tool holder runout", "confidence": 0.25, "spare_sku": None},
                {"component": "Way lubrication low", "confidence": 0.15, "spare_sku": "OIL-GB-220"},
            ],
        },
        {
            "id": "axis-fault",
            "symptom": "Axis servo fault / following error",
            "suspects": [
                {"component": "Servo drive fault", "confidence": 0.5, "spare_sku": None},
                {"component": "Ballscrew backlash", "confidence": 0.3, "spare_sku": None},
                {"component": "Linear scale contamination", "confidence": 0.2, "spare_sku": "SNS-IND-M12"},
            ],
        },
    ],
    "paintrobot": [
        {
            "id": "finish-defect",
            "symptom": "Orange peel / paint defects",
            "suspects": [
                {"component": "Bell cup contamination", "confidence": 0.55, "spare_sku": None},
                {"component": "Fluid regulator drift", "confidence": 0.3, "spare_sku": None},
                {"component": "Shaping-air ring blocked", "confidence": 0.15, "spare_sku": None},
            ],
        },
    ],
    "conveyor": [
        {
            "id": "belt-slip",
            "symptom": "Belt slipping / stalling",
            "suspects": [
                {"component": "Belt tension loss", "confidence": 0.55, "spare_sku": "BLT-DR-1400"},
                {"component": "Drive roller wear", "confidence": 0.30, "spare_sku": None},
                {"component": "Gearmotor fault", "confidence": 0.15, "spare_sku": None},
            ],
        },
    ],
    "oven": [
        {
            "id": "temp-uniformity",
            "symptom": "Cure temperature out of band",
            "suspects": [
                {"component": "Burner / heater element", "confidence": 0.55, "spare_sku": None},
                {"component": "Recirculation fan", "confidence": 0.3, "spare_sku": "FAN-AX-40"},
                {"component": "Zone thermocouple drift", "confidence": 0.15, "spare_sku": None},
            ],
        },
    ],
    "asrs": [
        {
            "id": "crane-position",
            "symptom": "Stacker crane positioning error",
            "suspects": [
                {"component": "Hoist encoder fault", "confidence": 0.5, "spare_sku": "SNS-IND-M12"},
                {"component": "Travel drive belt", "confidence": 0.3, "spare_sku": "BLT-DR-1400"},
                {"component": "Fork/shuttle jam", "confidence": 0.2, "spare_sku": None},
            ],
        },
    ],
    "agv": [
        {
            "id": "nav-lost",
            "symptom": "AGV navigation / stop faults",
            "suspects": [
                {"component": "LiDAR / nav sensor", "confidence": 0.5, "spare_sku": "SNS-IND-M12"},
                {"component": "Drive battery low", "confidence": 0.3, "spare_sku": None},
                {"component": "Safety bumper triggered", "confidence": 0.2, "spare_sku": None},
            ],
        },
    ],
    "forklift": [
        {
            "id": "no-lift",
            "symptom": "Forks won't lift / slow hydraulics",
            "suspects": [
                {"component": "Hydraulic pump / seals", "confidence": 0.5, "spare_sku": None},
                {"component": "Low hydraulic oil", "confidence": 0.3, "spare_sku": "OIL-GB-220"},
                {"component": "Lift control valve", "confidence": 0.2, "spare_sku": None},
            ],
        },
        {
            "id": "no-start",
            "symptom": "Won't start / stalls",
            "suspects": [
                {"component": "Traction battery / fuel", "confidence": 0.5, "spare_sku": None},
                {"component": "Seat / deadman switch", "confidence": 0.3, "spare_sku": "SNS-IND-M12"},
                {"component": "Main contactor", "confidence": 0.2, "spare_sku": "CNT-3P-40"},
            ],
        },
    ],
}

GENERIC_TREE = [
    {
        "id": "overtemp",
        "symptom": "Running hot / overtemperature",
        "suspects": [
            {"component": "Cooling system", "confidence": 0.5, "spare_sku": "FAN-AX-40"},
            {"component": "Bearing friction", "confidence": 0.3, "spare_sku": None},
            {"component": "Overload condition", "confidence": 0.2, "spare_sku": None},
        ],
    },
    {
        "id": "no-start",
        "symptom": "Won't start",
        "suspects": [
            {"component": "Main contactor", "confidence": 0.5, "spare_sku": "CNT-3P-40"},
            {"component": "Control fuse / supply", "confidence": 0.3, "spare_sku": None},
            {"component": "Interlock open", "confidence": 0.2, "spare_sku": None},
        ],
    },
]


BRAIN_SPARES = [
    ("FAN-AX-40", "Axial cooling fan 40 W", 4, 2, "Rack C1"),
    ("CNT-3P-40", "Main contactor 3P 40 A", 3, 1, "Panel shop"),
    ("SNS-IND-M12", "Inductive sensor M12", 12, 6, "Rack A3"),
    ("BLT-DR-1400", "Drive belt 1400 mm", 2, 2, "Store room"),
    ("OIL-GB-220", "Gearbox oil ISO 220 (5 L)", 6, 3, "Oil store"),
    # FLT-CAB-2 and CBL-WLD-70 intentionally left unstocked for the demo
]


def seed_brain_spares() -> None:
    """Idempotently insert spare parts referenced by the fault trees."""
    from ..database import SessionLocal

    with SessionLocal() as db:
        existing = {p.sku for p in db.query(SparePart).all()}
        for sku, name, qty, min_qty, location in BRAIN_SPARES:
            if sku not in existing:
                db.add(
                    SparePart(
                        id=f"sp-{uuid.uuid4().hex[:10]}",
                        sku=sku,
                        name=name,
                        qty=qty,
                        min_qty=min_qty,
                        location=location,
                    )
                )
        db.commit()


def _category(db: Session, instance: AssetInstance) -> str:
    asset = db.get(Asset, instance.asset_id)
    return asset.category if asset else "robot"


def _tree_for(db: Session, instance: AssetInstance) -> list[dict]:
    return FAULT_TREES.get(_category(db, instance), GENERIC_TREE)


# ---------- health scores ----------

TEMP_WARN = 70.0


def _health_for(
    db: Session,
    instance: AssetInstance,
    state: MachineState | None,
    pms: list[PMSchedule],
    open_alarms: int,
    downtime_7d: int,
    now: datetime,
) -> dict:
    factors: list[dict] = []
    score = 100.0
    sim = plant.sims.get(instance.id)

    if sim is not None:
        if sim.temp > TEMP_WARN:
            penalty = min(30.0, (sim.temp - TEMP_WARN) * 2.5)
            score -= penalty
            factors.append(
                {"label": f"Temperature {sim.temp:.1f} °C over {TEMP_WARN:.0f} °C limit", "delta": -round(penalty)}
            )
        z_temp = sim.zscores.get("temperature", 0.0)
        if abs(z_temp) >= 3.0:
            score -= 15
            factors.append(
                {"label": f"Temperature anomaly (z={z_temp:+.1f} vs baseline)", "delta": -15}
            )
        z_curr = sim.zscores.get("current", 0.0)
        if abs(z_curr) >= 3.0:
            score -= 10
            factors.append(
                {"label": f"Current deviation (z={z_curr:+.1f} vs baseline)", "delta": -10}
            )

    # Runtime / calendar vs. service interval
    worst_pm = 0.0
    worst_label = ""
    for pm in pms:
        elapsed = now - pm.last_done
        ratios = []
        if pm.interval_days:
            ratios.append((elapsed.days / pm.interval_days, f"{pm.title}: {elapsed.days}d of {pm.interval_days}d interval"))
        if pm.interval_runtime_h:
            run_h = elapsed.total_seconds() / 3600 * RUNTIME_UTILIZATION
            ratios.append((run_h / pm.interval_runtime_h, f"{pm.title}: ~{run_h:.0f}h of {pm.interval_runtime_h}h runtime interval"))
        for ratio, label in ratios:
            if ratio > worst_pm:
                worst_pm, worst_label = ratio, label
    if worst_pm >= 1.0:
        score -= 18
        factors.append({"label": f"Service overdue — {worst_label}", "delta": -18})
    elif worst_pm >= 0.8:
        score -= 8
        factors.append({"label": f"Service due soon — {worst_label}", "delta": -8})

    if state is not None and state.status == "down":
        score -= 20
        factors.append({"label": "Currently down", "delta": -20})

    if open_alarms:
        penalty = min(20, open_alarms * 10)
        score -= penalty
        factors.append({"label": f"{open_alarms} unacknowledged alarm(s)", "delta": -penalty})

    if downtime_7d > 6:
        score -= 10
        factors.append({"label": f"{downtime_7d} downtime events in 7 days", "delta": -10})
    elif downtime_7d > 3:
        score -= 5
        factors.append({"label": f"{downtime_7d} downtime events in 7 days", "delta": -5})

    score = max(0.0, min(100.0, score))
    grade = "healthy" if score >= 80 else "watch" if score >= 55 else "at-risk"
    return {
        "instance_id": instance.id,
        "name": instance.name,
        "category": _category(db, instance),
        "score": round(score),
        "grade": grade,
        "status": state.status if state else "running",
        "temperature": round(sim.temp, 1) if sim else None,
        "factors": factors,
    }


@router.get("/brain/health")
def health_scores(db: Session = Depends(get_db)):
    now = datetime.now()
    week_ago = now - timedelta(days=7)
    instances = db.query(AssetInstance).all()
    states = {s.instance_id: s for s in db.query(MachineState).all()}
    pms_by_machine: dict[str, list[PMSchedule]] = {}
    for pm in db.query(PMSchedule).all():
        pms_by_machine.setdefault(pm.instance_id, []).append(pm)
    alarms_by_machine: dict[str, int] = {}
    for alarm in db.query(Alarm).filter(Alarm.acknowledged == 0).all():
        alarms_by_machine[alarm.instance_id] = alarms_by_machine.get(alarm.instance_id, 0) + 1
    downtime_by_machine: dict[str, int] = {}
    for entry in db.query(DowntimeEntry).filter(DowntimeEntry.started_at >= week_ago).all():
        downtime_by_machine[entry.instance_id] = downtime_by_machine.get(entry.instance_id, 0) + 1

    results = [
        _health_for(
            db,
            inst,
            states.get(inst.id),
            pms_by_machine.get(inst.id, []),
            alarms_by_machine.get(inst.id, 0),
            downtime_by_machine.get(inst.id, 0),
            now,
        )
        for inst in instances
    ]
    results.sort(key=lambda r: r["score"])
    return results


@router.get("/brain/anomalies")
def anomalies(db: Session = Depends(get_db)):
    names = {i.id: i.name for i in db.query(AssetInstance).all()}
    events = [
        {**event, "machine_name": names.get(event["instance_id"], event["instance_id"])}
        for event in list(plant.anomaly_log)
    ]
    current = [
        {
            "instance_id": iid,
            "machine_name": names.get(iid, iid),
            "temperature_z": round(sim.zscores.get("temperature", 0.0), 2),
            "current_z": round(sim.zscores.get("current", 0.0), 2),
        }
        for iid, sim in plant.sims.items()
    ]
    current.sort(key=lambda r: -max(abs(r["temperature_z"]), abs(r["current_z"])))
    return {"events": events[:50], "current": current}


# ---------- risk queue ----------

@router.get("/brain/risk-queue")
def risk_queue(db: Session = Depends(get_db)):
    scores = health_scores(db)
    queue = []
    for row in scores:
        if row["score"] >= 80:
            continue
        top = row["factors"][0]["label"] if row["factors"] else "Multiple minor factors"
        queue.append(
            {
                "instance_id": row["instance_id"],
                "name": row["name"],
                "category": row["category"],
                "score": row["score"],
                "grade": row["grade"],
                "risk": 100 - row["score"],
                "top_factor": top,
                "factors": row["factors"],
            }
        )
    return queue


# ---------- fault-tree diagnosis ----------

@router.get("/brain/symptoms/{instance_id}")
def symptoms(instance_id: str, db: Session = Depends(get_db)):
    instance = db.get(AssetInstance, instance_id)
    if instance is None:
        raise HTTPException(404, "instance not found")
    tree = _tree_for(db, instance)
    return [{"id": entry["id"], "symptom": entry["symptom"]} for entry in tree]


class DiagnoseIn(BaseModel):
    instance_id: str
    symptom_id: str


@router.post("/brain/diagnose")
def diagnose(body: DiagnoseIn, db: Session = Depends(get_db)):
    instance = db.get(AssetInstance, body.instance_id)
    if instance is None:
        raise HTTPException(404, "instance not found")
    tree = _tree_for(db, instance)
    entry = next((e for e in tree if e["id"] == body.symptom_id), None)
    if entry is None:
        raise HTTPException(404, "unknown symptom for this machine family")

    parts = {p.sku: p for p in db.query(SparePart).all()}
    suspects = []
    for suspect in entry["suspects"]:
        sku = suspect["spare_sku"]
        part = parts.get(sku) if sku else None
        suspects.append(
            {
                "component": suspect["component"],
                "confidence": suspect["confidence"],
                "spare_sku": sku,
                "spare_name": part.name if part else None,
                "in_stock": part.qty if part else (0 if sku else None),
                "stocked": part is not None,
                "location": part.location if part else None,
            }
        )
    return {
        "instance_id": instance.id,
        "machine_name": instance.name,
        "symptom": entry["symptom"],
        "suspects": suspects,
    }


class DiagnosisWorkOrderIn(BaseModel):
    instance_id: str
    symptom: str
    component: str
    confidence: float
    spare_sku: str | None = None
    priority: str = "high"


@router.post("/brain/diagnose/work-order")
def work_order_from_diagnosis(body: DiagnosisWorkOrderIn, db: Session = Depends(get_db)):
    instance = db.get(AssetInstance, body.instance_id)
    if instance is None:
        raise HTTPException(404, "instance not found")
    description = (
        f"Factory Brain diagnosis — symptom: {body.symptom}. "
        f"Suspect: {body.component} (confidence {body.confidence:.0%})."
    )
    if body.spare_sku:
        description += f" Spare part: {body.spare_sku}."
    wo = WorkOrder(
        id=f"WO-{uuid.uuid4().hex[:6].upper()}",
        instance_id=instance.id,
        type="predictive",
        title=f"Check {body.component} — {instance.name}",
        description=description,
        status="open",
        priority=body.priority,
    )
    db.add(wo)
    db.commit()
    return {"id": wo.id, "title": wo.title}


# ---------- predicted vs actual accuracy ----------

@router.get("/brain/accuracy")
def accuracy(db: Session = Depends(get_db)):
    predictive = db.query(WorkOrder).filter(WorkOrder.type == "predictive").all()
    confirmed = [w for w in predictive if w.status == "done"]
    open_count = len([w for w in predictive if w.status != "done"])
    alarm_count = db.query(Alarm).count()
    return {
        "anomaly_events": len(plant.anomaly_log),
        "alarms_raised": alarm_count,
        "predictive_work_orders": len(predictive),
        "confirmed_done": len(confirmed),
        "open": open_count,
        "hit_rate": round(len(confirmed) / len(predictive), 2) if predictive else None,
        "recent": [
            {
                "id": w.id,
                "title": w.title,
                "status": w.status,
                "created_at": w.created_at.isoformat(),
                "closed_at": w.closed_at.isoformat() if w.closed_at else None,
            }
            for w in sorted(predictive, key=lambda w: w.created_at, reverse=True)[:10]
        ],
    }
