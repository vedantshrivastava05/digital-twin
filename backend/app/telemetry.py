"""Virtual plant: simulated PLC telemetry that stands in for real sensors.

Generates per-machine tags (state, temperature, current, cycle count, energy),
streams them over WebSocket, evaluates alert rules, and auto-creates downtime
entries on state changes — the software stand-in for PRD phase 3 (Twin Live).
"""

import asyncio
import math
import random
import uuid
from collections import deque
from datetime import datetime, timedelta

from fastapi import WebSocket

from .database import SessionLocal
from .models import (
    Alarm,
    AlertRule,
    Asset,
    AssetInstance,
    DowntimeEntry,
    MachineState,
    TagMapping,
)

TICK_SEC = 2.0
HISTORY_LEN = 240  # ~8 minutes of samples per tag

SEMANTICS = ["state", "temperature", "current", "cycle_count", "energy"]

# ---------------------------------------------------------------------------
# RTLS / indoor localization (the "Devices 31/78" tags + spaghetti/heatmap).
#
# A set of movable tags (forklifts, tuggers, AGVs, operators) patrol closed-loop
# routes across the campus. Every tick we advance each tag, record its (x,z) in a
# rolling per-tag history, and stream a positions snapshot on the same WebSocket
# as machine telemetry. History powers logistics analysis (tracks + heatmap) and
# time-travel replay. This is the software stand-in for a real UWB/BLE RTLS feed.
# ---------------------------------------------------------------------------

POS_HISTORY_LEN = 1200  # ~40 min of position samples per tag at TICK_SEC

# minX, minZ, maxX, maxZ — bounds used for the logistics heatmap grid.
CAMPUS_BOUNDS = (-205.0, -48.0, 340.0, 150.0)

# Closed-loop routes (world x, z) the movable tags patrol. Keyed by area.
_ROUTES: dict[str, list[tuple[float, float]]] = {
    "spine": [(-188, 5), (300, 5), (300, 9), (-188, 9)],   # main cross-shop aisle
    "spur": [(-5, 98), (-5, 12), (5, 12), (5, 98)],          # warehouse <-> body
    "stamp": [(-170, -12), (-130, -12), (-130, 14), (-170, 14)],
    "body": [(-42, -14), (42, -14), (42, 16), (-42, 16)],
    "paint": [(118, -12), (178, -12), (178, 18), (118, 18)],
    "power": [(256, -12), (316, -12), (316, 14), (256, 14)],
    "wh": [(-48, 90), (48, 90), (48, 122), (-48, 122)],
}

# (kind, display name, route key, speed in units/sec)
_TAG_DEFS: list[tuple[str, str, str, float]] = [
    ("forklift", "Forklift FL-01", "wh", 3.2),
    ("forklift", "Forklift FL-02", "spur", 3.0),
    ("forklift", "Forklift FL-03", "spine", 4.2),
    ("tugger", "Tugger TG-01", "spine", 3.6),
    ("tugger", "Tugger TG-02", "spine", 3.2),
    ("agv", "AGV-11", "body", 1.8),
    ("agv", "AGV-12", "paint", 1.8),
    ("agv", "AGV-13", "power", 1.6),
    ("agv", "AGV-14", "wh", 2.0),
    ("operator", "Operator · Stamping", "stamp", 1.2),
    ("operator", "Operator · Body A", "body", 1.1),
    ("operator", "Operator · Body B", "body", 1.0),
    ("operator", "Operator · Paint", "paint", 1.1),
    ("operator", "Operator · Powertrain", "power", 1.2),
    ("operator", "Operator · Warehouse", "wh", 1.3),
    ("operator", "Operator · Logistics", "spur", 1.2),
]


class Tracker:
    """One RTLS tag patrolling a closed-loop route with a little organic jitter."""

    def __init__(self, tag_id: str, kind: str, name: str,
                 route: list[tuple[float, float]], speed: float):
        self.tag_id = tag_id
        self.kind = kind
        self.name = name
        self.route = route
        self.speed = speed
        n = len(route)
        self._segs = [
            math.hypot(route[(i + 1) % n][0] - route[i][0],
                       route[(i + 1) % n][1] - route[i][1])
            for i in range(n)
        ]
        self.total = sum(self._segs) or 1.0
        self.d = random.uniform(0, self.total)
        self.online = True

    def _pos_at(self, d: float) -> tuple[float, float]:
        rem = d % self.total
        n = len(self.route)
        for i in range(n):
            seg = self._segs[i]
            if rem <= seg:
                ax, az = self.route[i]
                bx, bz = self.route[(i + 1) % n]
                f = rem / seg if seg > 0 else 0.0
                return ax + (bx - ax) * f, az + (bz - az) * f
            rem -= seg
        return self.route[0]

    def advance(self, dt: float) -> tuple[float, float]:
        if self.online:
            self.d += self.speed * dt
        x, z = self._pos_at(self.d)
        return x + random.gauss(0, 0.25), z + random.gauss(0, 0.25)


class MachineSim:
    def __init__(self, instance_id: str, category: str):
        self.instance_id = instance_id
        self.category = category
        self.temp = random.uniform(38, 48)
        self.current = 0.0
        self.cycle_count = 0
        self.energy = round(random.uniform(100, 900), 1)
        # One machine gets a slow bearing-heating fault for the Brain to find
        self.temp_drift = 0.0
        # EWMA state for anomaly detection (mean, variance, sample count)
        self.ewma: dict[str, dict[str, float]] = {
            "temperature": {"mean": 0.0, "var": 1.0, "n": 0},
            "current": {"mean": 0.0, "var": 1.0, "n": 0},
        }
        self.zscores: dict[str, float] = {"temperature": 0.0, "current": 0.0}
        self.last_status: str | None = None
        self.status_changed_at: datetime = datetime.now()

    def update_ewma(self, semantic: str, value: float, alpha: float = 0.03) -> float:
        state = self.ewma[semantic]
        if state["n"] < 10:
            # Warm-up: build the baseline
            state["mean"] = (state["mean"] * state["n"] + value) / (state["n"] + 1)
            state["n"] += 1
            self.zscores[semantic] = 0.0
            return 0.0
        diff = value - state["mean"]
        std = max(0.4, state["var"] ** 0.5)
        z = diff / std
        state["mean"] += alpha * diff
        state["var"] = (1 - alpha) * (state["var"] + alpha * diff * diff)
        state["n"] += 1
        self.zscores[semantic] = z
        return z

    def step(self, status: str) -> dict[str, float | str]:
        # Warning means degraded-but-operating. Keep cycles/energy flowing and do
        # not collapse it into the down branch used for real downtime.
        warning = status == "warning"
        running = status in ("running", "warning")
        idle = status == "idle"
        base_current = {
            "robot": 14.0,
            "bodyline": 22.0,
            "trimline": 18.0,
            "press": 40.0,
            "stamping": 55.0,
            "cnc": 18.0,
            "cncmill": 20.0,
            "conveyor": 6.0,
            "paintrobot": 9.0,
            "diptank": 12.0,
            "oven": 30.0,
            "asrs": 8.0,
            "agv": 3.0,
            "forklift": 4.0,
            "paintline": 9.0,
            "inboundrail": 6.0,
            "blanking": 42.0,
            "transferrobot": 11.0,
            "diecrane": 20.0,
            "scrapconv": 5.0,
            "panelrack": 0.5,
            "coilcrane": 18.0,
            "galine": 24.0,
            "marriage": 16.0,
            "qcgate": 4.0,
            "framing": 20.0,
            "framecell": 26.0,
            "doorline": 9.0,
        "wheelstn": 11.0,
        "glassstn": 14.0,
        "seatstn": 12.0,
        "fluidfill": 5.0,
        "rollertest": 12.0,
            "lampaim": 3.0,
            "inspectpit": 2.0,
            "lighttunnel": 6.0,
        "showertest": 14.0,
            "rack": 0.5,
            "tank": 1.0,
            "panel": 0.5,
        }.get(self.category, 10.0)
        target_current = (
            base_current * (0.82 if warning else 1.0)
            if running
            else (base_current * 0.25 if idle else 0.5)
        )
        self.current += (target_current - self.current) * 0.35
        self.current = max(0.0, self.current + random.gauss(0, 0.6))

        target_temp = 67 if warning else 62 if running else 45 if idle else 38
        target_temp += self.temp_drift
        self.temp += (target_temp - self.temp) * 0.06 + random.gauss(0, 0.35)

        if running:
            self.cycle_count += random.choice([0, 0, 1] if warning else [0, 1, 1])
            self.energy += self.current * 0.4 * TICK_SEC / 3600  # kWh-ish

        return {
            "state": status,
            "temperature": round(self.temp, 2),
            "current": round(self.current, 2),
            "cycle_count": self.cycle_count,
            "energy": round(self.energy, 3),
        }


class VirtualPlant:
    def __init__(self) -> None:
        self.sims: dict[str, MachineSim] = {}
        self.clients: set[WebSocket] = set()
        self.history: dict[str, dict[str, deque]] = {}
        self.state_log: dict[str, list[dict]] = {}
        self.rule_pending: dict[tuple[str, str], datetime] = {}
        self.unmapped_seen: dict[str, float] = {}
        self.anomaly_log: deque = deque(maxlen=300)
        self.last_anomaly: dict[tuple[str, str], datetime] = {}
        self.task: asyncio.Task | None = None
        # RTLS tags + rolling position history
        self.trackers: list[Tracker] = []
        self.pos_history: dict[str, deque] = {}
        self._init_trackers()

    # ---------- RTLS ----------

    def _init_trackers(self) -> None:
        for i, (kind, name, rkey, speed) in enumerate(_TAG_DEFS):
            t = Tracker(f"tag-{i + 1:02d}", kind, name, _ROUTES[rkey], speed)
            self.trackers.append(t)
            self.pos_history[t.tag_id] = deque(maxlen=POS_HISTORY_LEN)
        self._prefill_positions()

    def _prefill_positions(self) -> None:
        """Seed each tag's history so tracks/heatmap/replay have data immediately."""
        now = datetime.now()
        for k in range(POS_HISTORY_LEN):
            ts = (now - timedelta(seconds=(POS_HISTORY_LEN - k) * TICK_SEC)).isoformat()
            for t in self.trackers:
                x, z = t.advance(TICK_SEC)
                self.pos_history[t.tag_id].append(
                    {"ts": ts, "x": round(x, 2), "z": round(z, 2), "online": t.online}
                )

    def _step_positions(self, now: datetime) -> list[dict]:
        now_iso = now.isoformat()
        positions = []
        for t in self.trackers:
            r = random.random()
            if t.online and r < 0.0015:
                t.online = False
            elif not t.online and r < 0.05:
                t.online = True
            x, z = t.advance(TICK_SEC)
            self.pos_history[t.tag_id].append(
                {"ts": now_iso, "x": round(x, 2), "z": round(z, 2), "online": t.online}
            )
            positions.append(
                {"id": t.tag_id, "kind": t.kind, "name": t.name,
                 "x": round(x, 2), "z": round(z, 2), "online": t.online}
            )
        return positions

    # ---------- lifecycle ----------

    def ensure_started(self) -> None:
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self.run())

    async def run(self) -> None:
        while True:
            try:
                self.tick()
            except Exception as exc:  # keep the plant alive
                print("virtual plant tick failed:", exc)
            await asyncio.sleep(TICK_SEC)

    # ---------- core tick ----------

    def tick(self) -> None:
        now = datetime.now()
        with SessionLocal() as db:
            instances = db.query(AssetInstance).all()
            asset_category = {a.id: a.category for a in db.query(Asset).all()}
            mappings = db.query(TagMapping).all()
            by_instance: dict[str, list[TagMapping]] = {}
            for m in mappings:
                if m.instance_id:
                    by_instance.setdefault(m.instance_id, []).append(m)

            states = {s.instance_id: s for s in db.query(MachineState).all()}
            mapped_payload = []
            raw_payload = []

            for inst in instances:
                sim = self.sims.get(inst.id)
                if sim is None:
                    category = asset_category.get(inst.asset_id, "robot")
                    sim = MachineSim(inst.id, category)
                    self.sims[inst.id] = sim

                # One robot develops a slow bearing-heating fault (for Factory Brain)
                if inst.id == "robot-s5r" and sim.temp_drift < 18:
                    sim.temp_drift += 0.01

                state_row = states.get(inst.id)
                status = state_row.status if state_row else "running"

                # Auto state transitions only for machines whose state tag is mapped
                tag_semantics = {m.semantic for m in by_instance.get(inst.id, [])}
                if "state" in tag_semantics and state_row is not None:
                    new_status = self._auto_transition(status)
                    if new_status != status:
                        self._apply_state_change(db, state_row, new_status, now)
                        status = new_status

                values = sim.step(status)
                self._record_state_segment(inst.id, status, now)
                self._detect_anomalies(inst.id, sim, values, now)

                for m in by_instance.get(inst.id, []):
                    if m.semantic in values:
                        mapped_payload.append(
                            {
                                "instance_id": inst.id,
                                "semantic": m.semantic,
                                "tag": m.raw_tag,
                                "value": values[m.semantic],
                            }
                        )
                        if m.semantic != "state":
                            hist = self.history.setdefault(inst.id, {}).setdefault(
                                m.semantic, deque(maxlen=HISTORY_LEN)
                            )
                            hist.append({"ts": now.isoformat(), "value": values[m.semantic]})

                # Unmapped raw tags still stream (for the Tag Mapper to discover)
                suffix_semantics = {
                    "STATE": "state",
                    "TEMP": "temperature",
                    "CURR": "current",
                    "CYCLE_COUNT": "cycle_count",
                    "ENERGY": "energy",
                }
                for m in mappings:
                    if m.instance_id is None and m.raw_tag.startswith(f"SIM.{inst.id}"):
                        semantic = suffix_semantics.get(m.raw_tag.rsplit(".", 1)[-1])
                        if semantic and semantic in values:
                            raw_payload.append({"tag": m.raw_tag, "value": values[semantic]})
                            self.unmapped_seen[m.raw_tag] = now.timestamp()

            self._evaluate_rules(db, now)
            db.commit()

        positions = self._step_positions(now)

        asyncio.ensure_future(
            self.broadcast(
                {
                    "ts": now.isoformat(),
                    "mapped": mapped_payload,
                    "unmapped": raw_payload,
                    "positions": positions,
                }
            )
        )

    def _auto_transition(self, status: str) -> str:
        roll = random.random()
        if status == "running":
            if roll < 0.0006:
                return "down"
            if roll < 0.004:
                return "idle"
        elif status == "idle":
            if roll < 0.03:
                return "running"
        elif status == "down":
            if roll < 0.012:
                return "running"
        return status

    def _apply_state_change(
        self, db, state_row: MachineState, new_status: str, now: datetime
    ) -> None:
        # Close open auto downtime when recovering
        if state_row.status == "down" and new_status != "down":
            open_entry = (
                db.query(DowntimeEntry)
                .filter(
                    DowntimeEntry.instance_id == state_row.instance_id,
                    DowntimeEntry.ended_at.is_(None),
                )
                .first()
            )
            if open_entry is not None:
                open_entry.ended_at = now
        if new_status == "down" and state_row.status != "down":
            db.add(
                DowntimeEntry(
                    id=f"dt-{uuid.uuid4().hex[:10]}",
                    instance_id=state_row.instance_id,
                    reason_code="AUTO",
                    note="auto-detected from telemetry state change",
                    started_at=now,
                )
            )
        state_row.status = new_status
        state_row.since = now
        state_row.reason_code = "AUTO" if new_status == "down" else None

    def _detect_anomalies(
        self, instance_id: str, sim: MachineSim, values: dict, now: datetime
    ) -> None:
        """EWMA z-score anomaly detection on temperature and current streams."""
        status = str(values["state"])
        if status != sim.last_status:
            sim.last_status = status
            sim.status_changed_at = now
        settling = (now - sim.status_changed_at) < timedelta(seconds=120)
        for semantic in ("temperature", "current"):
            z = sim.update_ewma(semantic, float(values[semantic]))
            # State transitions legitimately shift both signals — don't flag those
            if settling:
                sim.zscores[semantic] = 0.0
                continue
            if abs(z) < 3.0:
                continue
            key = (instance_id, semantic)
            last = self.last_anomaly.get(key)
            if last is not None and (now - last) < timedelta(minutes=5):
                continue
            self.last_anomaly[key] = now
            self.anomaly_log.appendleft(
                {
                    "id": f"an-{uuid.uuid4().hex[:8]}",
                    "instance_id": instance_id,
                    "semantic": semantic,
                    "value": float(values[semantic]),
                    "zscore": round(z, 2),
                    "baseline": round(sim.ewma[semantic]["mean"], 2),
                    "ts": now.isoformat(),
                }
            )

    def _record_state_segment(self, instance_id: str, status: str, now: datetime) -> None:
        log = self.state_log.setdefault(instance_id, [])
        if log and log[-1]["state"] == status:
            log[-1]["until"] = now.isoformat()
        else:
            log.append({"state": status, "from": now.isoformat(), "until": now.isoformat()})
        if len(log) > 500:
            del log[: len(log) - 500]

    # ---------- alert rules ----------

    def _evaluate_rules(self, db, now: datetime) -> None:
        rules = db.query(AlertRule).filter(AlertRule.enabled == 1).all()
        states = {s.instance_id: s for s in db.query(MachineState).all()}
        for rule in rules:
            targets = (
                [rule.instance_id] if rule.instance_id else list(self.sims.keys())
            )
            for iid in targets:
                sim = self.sims.get(iid)
                if sim is None:
                    continue
                if rule.semantic == "state":
                    current = states[iid].status if iid in states else "running"
                    active = current == (rule.state_value or "down")
                else:
                    value = {
                        "temperature": sim.temp,
                        "current": sim.current,
                    }.get(rule.semantic)
                    if value is None:
                        continue
                    active = (
                        value > (rule.threshold or 0)
                        if rule.condition == "gt"
                        else value < (rule.threshold or 0)
                    )

                key = (rule.id, iid)
                if not active:
                    self.rule_pending.pop(key, None)
                    continue
                started = self.rule_pending.setdefault(key, now)
                if (now - started).total_seconds() < rule.duration_s:
                    continue
                # Fire (dedupe on unacknowledged alarm)
                exists = (
                    db.query(Alarm)
                    .filter(
                        Alarm.rule_id == rule.id,
                        Alarm.instance_id == iid,
                        Alarm.acknowledged == 0,
                    )
                    .first()
                )
                if exists is None:
                    name = db.get(AssetInstance, iid)
                    if rule.semantic == "state":
                        detail = f"state '{rule.state_value}' for over {rule.duration_s}s"
                    else:
                        detail = (
                            f"{rule.semantic} {'>' if rule.condition == 'gt' else '<'} "
                            f"{rule.threshold}"
                        )
                    db.add(
                        Alarm(
                            id=f"al-{uuid.uuid4().hex[:10]}",
                            rule_id=rule.id,
                            instance_id=iid,
                            message=f"{name.name if name else iid}: {rule.name} ({detail})",
                            severity=rule.severity,
                        )
                    )

    # ---------- websocket ----------

    async def broadcast(self, message: dict) -> None:
        dead = []
        for ws in self.clients:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


plant = VirtualPlant()


def seed_tag_mappings() -> None:
    """Create raw tags for every machine; most bound, a few left for the mapper UI."""
    with SessionLocal() as db:
        if db.query(TagMapping).count() > 0:
            return
        instances = db.query(AssetInstance).all()
        unmapped_leave = {"robot-s7l", "robot-s7r"}
        for idx, inst in enumerate(instances):
            plc = f"PLC{(idx // 4) + 1:02d}"
            for semantic, suffix, unit in (
                ("state", "STATE", ""),
                ("temperature", "TEMP", "°C"),
                ("current", "CURR", "A"),
                ("cycle_count", "CYCLE_COUNT", "cycles"),
                ("energy", "ENERGY", "kWh"),
            ):
                raw = f"{plc}.DB{idx + 10}.{suffix}"
                leave_unmapped = inst.id in unmapped_leave and semantic in (
                    "temperature",
                    "current",
                )
                db.add(
                    TagMapping(
                        id=f"tag-{uuid.uuid4().hex[:10]}",
                        raw_tag=raw if not leave_unmapped else f"SIM.{inst.id}.{suffix}",
                        instance_id=None if leave_unmapped else inst.id,
                        semantic=None if leave_unmapped else semantic,
                        unit=unit,
                    )
                )
        db.commit()


def seed_alert_rules() -> None:
    with SessionLocal() as db:
        if db.query(AlertRule).count() > 0:
            return
        db.add_all(
            [
                AlertRule(
                    id=f"ar-{uuid.uuid4().hex[:10]}",
                    name="Overtemperature",
                    semantic="temperature",
                    condition="gt",
                    threshold=75,
                    duration_s=10,
                    severity="warning",
                ),
                AlertRule(
                    id=f"ar-{uuid.uuid4().hex[:10]}",
                    name="Current spike",
                    semantic="current",
                    condition="gt",
                    threshold=35,
                    duration_s=6,
                    severity="warning",
                ),
                AlertRule(
                    id=f"ar-{uuid.uuid4().hex[:10]}",
                    name="Down too long",
                    semantic="state",
                    condition="eq",
                    state_value="down",
                    duration_s=600,
                    severity="critical",
                ),
            ]
        )
        db.commit()
