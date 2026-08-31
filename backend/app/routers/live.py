import math
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alarm, AlertRule, AssetInstance, TagMapping
from ..telemetry import CAMPUS_BOUNDS, plant

router = APIRouter()
ws_router = APIRouter()


@ws_router.websocket("/ws/telemetry")
async def telemetry_ws(ws: WebSocket):
    await ws.accept()
    plant.clients.add(ws)
    try:
        while True:
            await ws.receive_text()  # keepalive pings from client
    except WebSocketDisconnect:
        plant.clients.discard(ws)


@router.get("/telemetry/history/{instance_id}")
def telemetry_history(instance_id: str):
    hist = plant.history.get(instance_id, {})
    return {semantic: list(samples) for semantic, samples in hist.items()}


@router.get("/telemetry/state-log/{instance_id}")
def state_log(instance_id: str):
    return plant.state_log.get(instance_id, [])


# ---------- RTLS / logistics (positions, tracks, heatmap, replay frames) ----------


@router.get("/live/positions")
def live_positions():
    """Current snapshot of every movable tag + online/total counters."""
    tags = []
    for t in plant.trackers:
        hist = plant.pos_history.get(t.tag_id)
        if hist:
            last = hist[-1]
            x, z = last["x"], last["z"]
        else:
            x, z = t._pos_at(t.d)
        tags.append(
            {"id": t.tag_id, "kind": t.kind, "name": t.name,
             "x": x, "z": z, "online": t.online}
        )
    online = sum(1 for t in plant.trackers if t.online)
    return {"tags": tags, "online": online, "total": len(plant.trackers)}


def _cutoff_iso(minutes: int) -> str:
    return (datetime.now() - timedelta(minutes=minutes)).isoformat()


@router.get("/logistics/tracks")
def logistics_tracks(minutes: int = 15, kind: str | None = None):
    """Spaghetti chart: recent movement polyline per tag over the window."""
    cutoff = _cutoff_iso(minutes)
    out = []
    for t in plant.trackers:
        if kind and t.kind != kind:
            continue
        pts = [
            [p["x"], p["z"]]
            for p in plant.pos_history.get(t.tag_id, [])
            if p["ts"] >= cutoff and p["online"]
        ]
        if len(pts) > 140:
            step = len(pts) // 140
            pts = pts[::step]
        out.append({"id": t.tag_id, "kind": t.kind, "name": t.name, "points": pts})
    return {"tracks": out}


@router.get("/logistics/heatmap")
def logistics_heatmap(minutes: int = 30, cell: float = 4.0):
    """Occupancy density grid over the campus for the window."""
    min_x, min_z, max_x, max_z = CAMPUS_BOUNDS
    cols = int(math.ceil((max_x - min_x) / cell))
    rows = int(math.ceil((max_z - min_z) / cell))
    grid = [0] * (cols * rows)
    cutoff = _cutoff_iso(minutes)
    mx = 0
    for t in plant.trackers:
        for p in plant.pos_history.get(t.tag_id, []):
            if p["ts"] < cutoff or not p["online"]:
                continue
            c = int((p["x"] - min_x) / cell)
            r = int((p["z"] - min_z) / cell)
            if 0 <= c < cols and 0 <= r < rows:
                idx = r * cols + c
                grid[idx] += 1
                if grid[idx] > mx:
                    mx = grid[idx]
    cells = [
        {"c": i % cols, "r": i // cols, "v": v}
        for i, v in enumerate(grid)
        if v > 0
    ]
    return {"cell": cell, "minX": min_x, "minZ": min_z,
            "cols": cols, "rows": rows, "max": mx, "cells": cells}


@router.get("/logistics/frames")
def logistics_frames(minutes: int = 15):
    """Time-travel replay: aligned per-tick frames of all tag positions."""
    cutoff = _cutoff_iso(minutes)
    hists = {
        t.tag_id: [p for p in plant.pos_history.get(t.tag_id, []) if p["ts"] >= cutoff]
        for t in plant.trackers
    }
    lengths = [len(v) for v in hists.values() if v]
    if not lengths:
        return {"frames": []}
    fcount = min(lengths)
    idxs = list(range(fcount))
    if fcount > 200:
        step = fcount // 200
        idxs = idxs[::step]
    frames = []
    for i in idxs:
        tags = []
        ts = None
        for t in plant.trackers:
            h = hists[t.tag_id]
            off = len(h) - fcount
            p = h[i + off] if 0 <= i + off < len(h) else h[-1]
            ts = p["ts"]
            tags.append(
                {"id": t.tag_id, "kind": t.kind, "x": p["x"], "z": p["z"],
                 "online": p["online"]}
            )
        frames.append({"ts": ts, "tags": tags})
    return {"frames": frames}


# ---------- Tag mapper ----------


class TagBind(BaseModel):
    instance_id: str | None
    semantic: str | None
    unit: str = ""


@router.get("/tags")
def list_tags(db: Session = Depends(get_db)):
    names = {i.id: i.name for i in db.query(AssetInstance).all()}
    return [
        {
            "id": t.id,
            "raw_tag": t.raw_tag,
            "instance_id": t.instance_id,
            "machine_name": names.get(t.instance_id or ""),
            "semantic": t.semantic,
            "unit": t.unit,
            "mapped": t.instance_id is not None and t.semantic is not None,
        }
        for t in db.query(TagMapping).order_by(TagMapping.raw_tag).all()
    ]


@router.patch("/tags/{tag_id}")
def bind_tag(tag_id: str, body: TagBind, db: Session = Depends(get_db)):
    tag = db.get(TagMapping, tag_id)
    if tag is None:
        raise HTTPException(404, "tag not found")
    if body.instance_id and db.get(AssetInstance, body.instance_id) is None:
        raise HTTPException(400, "unknown instance_id")
    tag.instance_id = body.instance_id
    tag.semantic = body.semantic
    if body.unit:
        tag.unit = body.unit
    db.commit()
    return {"ok": True}


# ---------- Alert rules & alarms ----------


class RuleIn(BaseModel):
    name: str
    instance_id: str | None = None
    semantic: str
    condition: str = "gt"
    threshold: float | None = None
    state_value: str | None = None
    duration_s: int = 0
    severity: str = "warning"


class RulePatch(BaseModel):
    enabled: bool | None = None
    threshold: float | None = None
    duration_s: int | None = None


def rule_out(rule: AlertRule, names: dict[str, str]) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "instance_id": rule.instance_id,
        "machine_name": names.get(rule.instance_id or "") if rule.instance_id else "All machines",
        "semantic": rule.semantic,
        "condition": rule.condition,
        "threshold": rule.threshold,
        "state_value": rule.state_value,
        "duration_s": rule.duration_s,
        "severity": rule.severity,
        "enabled": bool(rule.enabled),
    }


@router.get("/alert-rules")
def list_rules(db: Session = Depends(get_db)):
    names = {i.id: i.name for i in db.query(AssetInstance).all()}
    return [rule_out(r, names) for r in db.query(AlertRule).all()]


@router.post("/alert-rules")
def create_rule(body: RuleIn, db: Session = Depends(get_db)):
    rule = AlertRule(id=f"ar-{uuid.uuid4().hex[:10]}", **body.model_dump())
    db.add(rule)
    db.commit()
    names = {i.id: i.name for i in db.query(AssetInstance).all()}
    return rule_out(rule, names)


@router.patch("/alert-rules/{rule_id}")
def patch_rule(rule_id: str, body: RulePatch, db: Session = Depends(get_db)):
    rule = db.get(AlertRule, rule_id)
    if rule is None:
        raise HTTPException(404, "rule not found")
    data = body.model_dump(exclude_unset=True)
    if "enabled" in data:
        rule.enabled = 1 if data.pop("enabled") else 0
    for field, value in data.items():
        setattr(rule, field, value)
    db.commit()
    return {"ok": True}


@router.delete("/alert-rules/{rule_id}", status_code=204)
def delete_rule(rule_id: str, db: Session = Depends(get_db)):
    rule = db.get(AlertRule, rule_id)
    if rule is None:
        raise HTTPException(404, "rule not found")
    db.delete(rule)
    db.commit()


@router.get("/alarms")
def list_alarms(active_only: bool = False, db: Session = Depends(get_db)):
    names = {i.id: i.name for i in db.query(AssetInstance).all()}
    query = db.query(Alarm).order_by(Alarm.raised_at.desc())
    if active_only:
        query = query.filter(Alarm.acknowledged == 0)
    return [
        {
            "id": a.id,
            "instance_id": a.instance_id,
            "machine_name": names.get(a.instance_id, "?"),
            "message": a.message,
            "severity": a.severity,
            "raised_at": a.raised_at.isoformat(),
            "acknowledged": bool(a.acknowledged),
        }
        for a in query.limit(100).all()
    ]


@router.post("/alarms/{alarm_id}/ack")
def ack_alarm(alarm_id: str, db: Session = Depends(get_db)):
    alarm = db.get(Alarm, alarm_id)
    if alarm is None:
        raise HTTPException(404, "alarm not found")
    alarm.acknowledged = 1
    alarm.ack_at = datetime.now()
    db.commit()
    return {"ok": True}
