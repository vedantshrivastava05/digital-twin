"""Copilot: deterministic intent engine over Factory Memory (PRD §10.2, §10.5).

No LLM key required — questions are parsed with keyword rules and answered
from the database and the virtual plant, and every numeric claim carries a
source link. An LLM adapter interface is left pluggable for later.

Also hosts the what-if discrete-event simulation of the body line.
"""

import random
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Alarm,
    Asset,
    AssetInstance,
    Document,
    DowntimeEntry,
    MachineState,
    ProductionLog,
    ProductionOrder,
    SparePart,
    WorkOrder,
)
from ..telemetry import plant
from .ops import REASON_LABELS, compute_oee

router = APIRouter(prefix="/copilot")


# ---------- pluggable LLM adapter (PRD: interface left open, no key needed) ----------

class LlmAdapter:
    """Swap in a real LLM here later; the deterministic engine is the default."""

    def rephrase(self, answer: str) -> str:
        return answer


llm: LlmAdapter = LlmAdapter()


# ---------- helpers ----------

def _find_machines(q: str, instances: list[AssetInstance]) -> list[AssetInstance]:
    """Token-overlap matching: 'robot 4l' matches 'Weld Robot 4L'."""
    qtokens = set(re.findall(r"[a-z0-9]+", q.lower()))
    hits = []
    for inst in instances:
        tokens = set(re.findall(r"[a-z0-9]+", inst.name.lower()))
        overlap = tokens & qtokens
        # Require the distinguishing token (e.g. '4l', '1') plus one word
        specific = [t for t in overlap if any(c.isdigit() for c in t)]
        if specific and len(overlap) >= 2:
            hits.append((len(overlap), inst))
    hits.sort(key=lambda h: -h[0])
    return [inst for _, inst in hits]


def _src(label: str, href: str) -> dict:
    return {"label": label, "href": href}


class AskIn(BaseModel):
    question: str


@router.post("/ask")
def ask(body: AskIn, db: Session = Depends(get_db)):
    q = body.question.lower().strip()
    instances = db.query(AssetInstance).all()
    names = {i.id: i.name for i in instances}
    states = {s.instance_id: s for s in db.query(MachineState).all()}

    def respond(answer, sources=None, actions=None, data=None):
        return {
            "answer": llm.rephrase(answer),
            "sources": sources or [],
            "actions": actions or [],
            "data": data,
        }

    # --- down / idle / running machines ---
    if re.search(r"\b(down|broken|stopped|not running)\b", q) and re.search(
        r"\b(machine|robot|line|which|show|what|list|any)\b", q
    ):
        down = [iid for iid, s in states.items() if s.status == "down"]
        if not down:
            return respond(
                "No machines are down right now — everything is running or idle.",
                sources=[_src("Live machine states", "/dashboard")],
            )
        parts = []
        for iid in down:
            s = states[iid]
            mins = int((datetime.now() - s.since).total_seconds() / 60)
            reason = REASON_LABELS.get(s.reason_code or "", s.reason_code or "unknown")
            parts.append(f"{names.get(iid, iid)} ({reason}, {mins} min)")
        return respond(
            f"{len(down)} machine(s) down: " + "; ".join(parts) + ". Highlighted in the viewer.",
            sources=[_src("Live machine states", "/dashboard")],
            actions=[{"type": "highlight", "instance_ids": down}],
        )

    # --- alarms ---
    if "alarm" in q or "alert" in q:
        active = db.query(Alarm).filter(Alarm.acknowledged == 0).all()
        if not active:
            return respond(
                "No active alarms.", sources=[_src("Alarm feed", "/alarms")]
            )
        lines = [f"{a.severity.upper()}: {a.message}" for a in active[:5]]
        return respond(
            f"{len(active)} active alarm(s). " + " | ".join(lines),
            sources=[_src("Alarm feed", "/alarms")],
            actions=[{"type": "highlight", "instance_ids": [a.instance_id for a in active]}],
        )

    # --- health / risk ---
    if re.search(r"\b(health|risk|worst|least healthy|attention)\b", q):
        from .brain import health_scores

        scores = health_scores(db)
        worst = scores[:3]
        lines = [
            f"{r['name']}: {r['score']}/100 ({r['factors'][0]['label'] if r['factors'] else 'ok'})"
            for r in worst
        ]
        return respond(
            "Lowest health scores: " + "; ".join(lines),
            sources=[_src("Factory Brain health", "/brain")],
            actions=[{"type": "highlight", "instance_ids": [r["instance_id"] for r in worst]}],
        )

    # --- late / open orders ---
    if "order" in q:
        orders = db.query(ProductionOrder).filter(ProductionOrder.status != "done").all()
        today = datetime.now().strftime("%Y-%m-%d")
        late = [o for o in orders if o.due_date and o.due_date < today]
        if "late" in q or "overdue" in q:
            if not late:
                return respond(
                    "No late orders — everything open is still within its due date.",
                    sources=[_src("Order board", "/ops")],
                )
            lines = [f"{o.id} (due {o.due_date}, {o.status})" for o in late]
            return respond(
                f"{len(late)} late order(s): " + "; ".join(lines),
                sources=[_src("Order board", "/ops")],
            )
        return respond(
            f"{len(orders)} open order(s), {len(late)} of them late.",
            sources=[_src("Order board", "/ops")],
        )

    # --- spare part stock ---
    if re.search(r"\b(spare|stock|part|inventory)\b", q):
        parts = db.query(SparePart).all()
        qtokens = set(re.findall(r"[a-z0-9]+", q))
        matched = [
            p
            for p in parts
            if (set(re.findall(r"[a-z0-9]+", p.name.lower())) & qtokens - {"spare", "stock", "part", "parts", "in", "do", "we", "have", "of", "the", "how", "many"})
            or p.sku.lower() in q
        ]
        if matched:
            lines = [
                f"{p.name} ({p.sku}): {p.qty} in stock at {p.location or 'n/a'}"
                + (" — BELOW MIN" if p.qty < p.min_qty else "")
                for p in matched[:4]
            ]
            return respond(
                " | ".join(lines), sources=[_src("Spare parts", "/maintenance")]
            )
        low = [p for p in parts if p.qty < p.min_qty]
        if low:
            lines = [f"{p.name} ({p.sku}): {p.qty}/{p.min_qty} min" for p in low]
            return respond(
                f"{len(low)} part(s) below minimum stock: " + "; ".join(lines),
                sources=[_src("Spare parts", "/maintenance")],
            )
        return respond(
            "All spare parts are at or above their minimum stock levels.",
            sources=[_src("Spare parts", "/maintenance")],
        )

    # --- downtime reasons ---
    if "downtime" in q or "reason" in q:
        since = datetime.now() - timedelta(days=1)
        entries = (
            db.query(DowntimeEntry)
            .filter(
                (DowntimeEntry.ended_at.is_(None)) | (DowntimeEntry.ended_at > since)
            )
            .all()
        )
        reasons: dict[str, float] = {}
        now = datetime.now()
        for e in entries:
            start = max(e.started_at, since)
            end = e.ended_at or now
            if end > start:
                minutes = (end - start).total_seconds() / 60
                reasons[e.reason_code] = reasons.get(e.reason_code, 0) + minutes
        if not reasons:
            return respond(
                "No downtime recorded in the last 24 hours.",
                sources=[_src("Morning report", "/report")],
            )
        top = sorted(reasons.items(), key=lambda kv: -kv[1])[:3]
        lines = [
            f"{REASON_LABELS.get(code, code)}: {minutes:.0f} min" for code, minutes in top
        ]
        return respond(
            "Top downtime reasons in the last 24 h: " + "; ".join(lines),
            sources=[_src("Morning report", "/report"), _src("Dashboard Pareto", "/dashboard")],
        )

    # --- production output ---
    if re.search(r"\b(output|produced|production|parts|units|count|made)\b", q):
        day = datetime.now().strftime("%Y-%m-%d")
        label = "today"
        if "yesterday" in q:
            day = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            label = "yesterday"
        logs = db.query(ProductionLog).filter(ProductionLog.shift_date == day).all()
        good = sum(log.good for log in logs)
        reject = sum(log.reject for log in logs)
        return respond(
            f"Plant output {label}: {good} good, {reject} rejects"
            + (f" ({good / (good + reject):.1%} quality)." if good + reject else "."),
            sources=[_src("Morning report", "/report"), _src("Owner dashboard", "/dashboard")],
        )

    # --- machine-specific: status / OEE / temperature ---
    matched = _find_machines(q, instances)
    if matched:
        inst = matched[0]
        if "oee" in q:
            oee = compute_oee(db, inst.id, 24)
            return respond(
                f"{inst.name} OEE (24 h): {oee.oee:.1%} — availability {oee.availability:.1%}, "
                f"performance {oee.performance:.1%}, quality {oee.quality:.1%}.",
                sources=[_src(f"{inst.name} overview", f"/asset/{inst.id}")],
                actions=[{"type": "select", "instance_ids": [inst.id]}],
            )
        if re.search(r"\b(temp|temperature|current|energy|sensor|telemetry)\b", q):
            sim = plant.sims.get(inst.id)
            if sim is None:
                return respond(
                    f"No live telemetry for {inst.name} yet.",
                    sources=[_src("Tag mapper", "/tags")],
                )
            return respond(
                f"{inst.name} live: {sim.temp:.1f} °C, {sim.current:.1f} A, "
                f"{sim.cycle_count} cycles, {sim.energy:.1f} kWh.",
                sources=[_src(f"{inst.name} live strip", f"/asset/{inst.id}")],
                actions=[{"type": "select", "instance_ids": [inst.id]}],
            )
        if re.search(r"\b(work order|maintenance|wo)\b", q):
            wos = (
                db.query(WorkOrder)
                .filter(WorkOrder.instance_id == inst.id, WorkOrder.status != "done")
                .all()
            )
            if not wos:
                return respond(
                    f"No open work orders on {inst.name}.",
                    sources=[_src("Maintenance", "/maintenance")],
                )
            lines = [f"{w.id}: {w.title} ({w.status}, {w.priority})" for w in wos]
            return respond(
                f"{len(wos)} open work order(s) on {inst.name}: " + "; ".join(lines),
                sources=[_src("Maintenance", "/maintenance")],
            )
        # default machine answer: status + zoom
        state = states.get(inst.id)
        status = state.status if state else "running"
        mins = int((datetime.now() - state.since).total_seconds() / 60) if state else 0
        reason = (
            f" ({REASON_LABELS.get(state.reason_code or '', state.reason_code)})"
            if state and state.reason_code
            else ""
        )
        return respond(
            f"{inst.name} is {status}{reason}, for the last {mins} min. Selected in the viewer.",
            sources=[_src(f"{inst.name} overview", f"/asset/{inst.id}")],
            actions=[{"type": "select", "instance_ids": [inst.id]}],
        )

    # --- document search ---
    if re.search(r"\b(document|manual|drawing|file|doc)\b", q):
        stop = {"find", "document", "documents", "manual", "about", "the", "a", "for", "doc", "docs", "search", "show", "me"}
        terms = [t for t in re.findall(r"[a-z0-9]+", q) if t not in stop]
        docs = db.query(Document).all()
        hits = [d for d in docs if any(t in d.filename.lower() for t in terms)]
        if hits:
            lines = [f"{d.filename} ({names.get(d.instance_id, '?')})" for d in hits[:5]]
            return respond(
                f"Found {len(hits)} document(s): " + "; ".join(lines),
                sources=[_src("Document search", "/")],
            )
        return respond(
            "No matching documents found. Try the search box in the twin sidebar.",
            sources=[_src("Twin viewer", "/")],
        )

    # --- plant OEE ---
    if "oee" in q:
        vals = [compute_oee(db, i.id, 24).oee for i in instances]
        avg = sum(vals) / len(vals) if vals else 0
        return respond(
            f"Average plant OEE over the last 24 h: {avg:.1%} across {len(vals)} machines.",
            sources=[_src("Owner dashboard", "/dashboard")],
        )

    # --- fallback (PRD: honest "no data" answer) ---
    return respond(
        "I don't have data on that. I can answer about machine status, OEE, output, "
        "downtime reasons, alarms, health scores, orders, spare parts, and documents — "
        "e.g. \"show all down machines\" or \"OEE of robot 4L\".",
    )


# ---------- what-if: discrete-event simulation of the body line (PRD §10.5) ----------

class WhatIfIn(BaseModel):
    stations: int = 8
    cycle_time_s: float = 75.0
    index_time_s: float = 6.0
    availability: float = 0.88  # fraction of time the line is not micro-stopped
    shifts: int = 2  # 8h shifts per day
    seed: int = 42


def _simulate_line(p: WhatIfIn) -> dict:
    """Simple DES: an indexing line moves one body per effective cycle; random
    micro-stops (MTBF/MTTR derived from availability) interrupt production."""
    rng = random.Random(p.seed)
    shift_s = 8 * 3600
    total_s = p.shifts * shift_s
    effective_cycle = p.cycle_time_s + p.index_time_s

    # Derive stop pattern: mean stop 4 min, MTBF chosen to hit target availability
    mttr = 240.0
    availability = min(0.999, max(0.5, p.availability))
    mtbf = mttr * availability / (1 - availability)

    t = 0.0
    bodies = 0
    next_stop = rng.expovariate(1 / mtbf)
    stops = 0
    stop_time = 0.0
    while t < total_s:
        if t >= next_stop:
            duration = rng.expovariate(1 / mttr)
            t += duration
            stop_time += duration
            stops += 1
            next_stop = t + rng.expovariate(1 / mtbf)
            continue
        t += effective_cycle
        bodies += 1

    hours = total_s / 3600
    return {
        "bodies": bodies,
        "bodies_per_hour": round(bodies / hours, 1),
        "stops": stops,
        "stop_minutes": round(stop_time / 60, 1),
        "effective_cycle_s": round(effective_cycle, 1),
        "hours": hours,
    }


@router.post("/whatif")
def what_if(body: WhatIfIn):
    baseline = _simulate_line(WhatIfIn())
    scenario = _simulate_line(body)
    delta = scenario["bodies"] - baseline["bodies"]
    return {
        "baseline": baseline,
        "scenario": scenario,
        "delta_bodies": delta,
        "delta_pct": round(delta / baseline["bodies"] * 100, 1) if baseline["bodies"] else 0,
        "note": (
            "Baseline: 8 stations, 75 s cycle + 6 s index, 88% availability, 2 shifts. "
            "Stations only matter via the cycle time of the slowest station in this "
            "indexing-line model."
        ),
    }
