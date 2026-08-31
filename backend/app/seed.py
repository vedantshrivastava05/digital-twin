import math
import uuid

from sqlalchemy.orm import Session

from .models import Asset, AssetInstance, Component, HierarchyNode, Site, Zone

SITE_ID = "site-plant-1"
STATION_XS = [-24, -16, -8, 0, 8, 16, 24]

CATALOG = [
    Asset(
        id="AST-ROBOT-WELD-6X",
        name="6-Axis Weld Robot",
        category="robot",
        footprint_w=2.4,
        footprint_d=2.4,
        meta={"power_kw": 7.5, "service_interval_h": 2000},
    ),
    Asset(
        id="AST-LINE-BODY-INDEX",
        name="Indexing Body Line",
        category="bodyline",
        footprint_w=66,
        footprint_d=3.4,
        meta={"stations": len(STATION_XS), "cycle_sec": 7},
    ),
    Asset(
        id="AST-LINE-TRIM-CONV",
        name="Trim Conveyor Line",
        category="trimline",
        footprint_w=60,
        footprint_d=3.2,
        meta={"speed_m_min": 2.5},
    ),
    Asset(
        id="AST-PRESS-HYD-200T",
        name="Hydraulic Press 200T",
        category="press",
        footprint_w=2.8,
        footprint_d=2.2,
        meta={"power_kw": 22, "service_interval_h": 1500},
    ),
    Asset(
        id="AST-CNC-MILL-3X",
        name="CNC Milling Machine",
        category="cnc",
        footprint_w=3.2,
        footprint_d=2.8,
        meta={"power_kw": 15, "service_interval_h": 1800},
    ),
    Asset(
        id="AST-CONV-BELT-4M",
        name="Belt Conveyor 4m",
        category="conveyor",
        footprint_w=4.5,
        footprint_d=1.6,
        meta={"power_kw": 1.5, "service_interval_h": 4000},
    ),
    Asset(
        id="AST-RACK-PALLET-3L",
        name="Pallet Rack",
        category="rack",
        footprint_w=4.0,
        footprint_d=1.3,
        meta={},
    ),
    Asset(
        id="AST-TANK-VERT-5KL",
        name="Storage Tank 5kL",
        category="tank",
        footprint_w=2.6,
        footprint_d=2.6,
        meta={"service_interval_h": 8000},
    ),
    Asset(
        id="AST-PANEL-MCC-1",
        name="MCC Electrical Panel",
        category="panel",
        footprint_w=1.4,
        footprint_d=0.8,
        meta={"power_kw": 0},
    ),
    # ---- campus shop families ----
    Asset(
        id="AST-STAMP-PRESS-1000T",
        name="Stamping Press 1000T",
        category="stamping",
        footprint_w=3.6,
        footprint_d=2.8,
        meta={"power_kw": 160, "service_interval_h": 1200, "tonnage": 1000},
    ),
    Asset(
        id="AST-CONV-LINE-12M",
        name="Transfer Conveyor 12m",
        category="conveyor",
        footprint_w=12,
        footprint_d=1.6,
        meta={"power_kw": 3.0, "service_interval_h": 4000},
    ),
    Asset(
        id="AST-AGV-1T",
        name="AGV 1T Load Carrier",
        category="agv",
        footprint_w=1.8,
        footprint_d=1.1,
        meta={"power_kw": 1.2, "battery_kwh": 8},
    ),
    Asset(
        id="AST-DIP-TANK-ECOAT",
        name="E-Coat Dip Tank",
        category="diptank",
        footprint_w=8,
        footprint_d=4,
        meta={"power_kw": 30, "volume_kl": 40},
    ),
    Asset(
        id="AST-PAINT-ROBOT-BELL",
        name="Bell Paint Robot",
        category="paintrobot",
        footprint_w=2.4,
        footprint_d=2.4,
        meta={"power_kw": 6, "service_interval_h": 1500},
    ),
    Asset(
        id="AST-PAINT-LINE-OVH",
        name="Overhead Paint Monorail",
        category="paintline",
        footprint_w=46,
        footprint_d=2.4,
        meta={"power_kw": 24, "carriers": 5, "colour": "black"},
    ),
    Asset(
        id="AST-OVEN-CURE-TUNNEL",
        name="Paint Cure Oven",
        category="oven",
        footprint_w=20,
        footprint_d=5,
        meta={"power_kw": 220, "temp_c": 160},
    ),
    Asset(
        id="AST-CNC-CENTER-5X",
        name="5-Axis CNC Centre",
        category="cncmill",
        footprint_w=3.6,
        footprint_d=3.0,
        meta={"power_kw": 25, "service_interval_h": 1600},
    ),
    Asset(
        id="AST-ASRS-CRANE",
        name="AS/RS Rack + Stacker Crane",
        category="asrs",
        footprint_w=14,
        footprint_d=6,
        meta={"power_kw": 12, "levels": 5},
    ),
    Asset(
        id="AST-FORKLIFT-2T5",
        name="Counterbalance Forklift 2.5T",
        category="forklift",
        footprint_w=2.8,
        footprint_d=1.3,
        meta={"power_kw": 18, "capacity_kg": 2500, "service_interval_h": 500},
    ),
    Asset(
        id="AST-INBOUND-RAIL",
        name="Inbound Delivery Rail",
        category="inboundrail",
        footprint_w=3.2,
        footprint_d=18,
        meta={"power_kw": 6, "throughput_per_h": 240},
    ),
    Asset(
        id="AST-COIL-BLANKING",
        name="Coil Blanking Line",
        category="blanking",
        footprint_w=13,
        footprint_d=3.4,
        meta={"power_kw": 45, "service_interval_h": 2000, "throughput_per_h": 700},
    ),
    Asset(
        id="AST-TRANSFER-ROBOT",
        name="Press Transfer Robot",
        category="transferrobot",
        footprint_w=1.8,
        footprint_d=1.8,
        meta={"power_kw": 12, "service_interval_h": 1800},
    ),
    Asset(
        id="AST-DIE-CRANE",
        name="Die-Change Bridge Crane",
        category="diecrane",
        footprint_w=2,
        footprint_d=2,
        meta={"power_kw": 30, "span_m": 40, "capacity_t": 30},
    ),
    Asset(
        id="AST-PANEL-RACK",
        name="Stamped Panel Stillage",
        category="panelrack",
        footprint_w=3.2,
        footprint_d=2.4,
        meta={"power_kw": 0},
    ),
    Asset(
        id="AST-SCRAP-CONV",
        name="Scrap Conveyor + Baler",
        category="scrapconv",
        footprint_w=10,
        footprint_d=1.6,
        meta={"power_kw": 5, "service_interval_h": 3000},
    ),
    Asset(
        id="AST-COIL-CRANE",
        name="Coil-Handling Gantry Crane",
        category="coilcrane",
        footprint_w=9,
        footprint_d=9,
        meta={"power_kw": 22, "capacity_t": 25, "service_interval_h": 2500},
    ),
    Asset(
        id="AST-GA-LINE",
        name="Final Assembly Carrier Line",
        category="galine",
        footprint_w=60,
        footprint_d=4,
        meta={"power_kw": 40, "service_interval_h": 1500, "throughput_per_h": 55},
    ),
    Asset(
        id="AST-MARRIAGE-DECK",
        name="Engine Marriage Decking Station",
        category="marriage",
        footprint_w=6,
        footprint_d=5,
        meta={"power_kw": 16, "service_interval_h": 1800, "throughput_per_h": 55},
    ),
    Asset(
        id="AST-QC-GATE",
        name="Body QC Inspection Gate",
        category="qcgate",
        footprint_w=6,
        footprint_d=6,
        meta={"power_kw": 4, "service_interval_h": 4000},
    ),
    Asset(
        id="AST-FRAMING-STN",
        name="Body Framing / Respot Station",
        category="framing",
        footprint_w=5,
        footprint_d=6,
        meta={"power_kw": 20, "service_interval_h": 2000, "throughput_per_h": 60},
    ),
    Asset(
        id="AST-BODY-FRAMING",
        name="Body Framing Cell",
        category="framecell",
        footprint_w=16,
        footprint_d=10,
        meta={"power_kw": 60, "service_interval_h": 1500, "throughput_per_h": 55},
    ),
    # ---- general-assembly fitment stations ----
    Asset(
        id="AST-DOOR-LINE",
        name="Door-Off Monorail Line",
        category="doorline",
        footprint_w=54,
        footprint_d=3,
        meta={"power_kw": 12, "service_interval_h": 2500, "throughput_per_h": 55},
    ),
    Asset(
        id="AST-WHEEL-STN",
        name="Wheel Fitting Station",
        category="wheelstn",
        footprint_w=8,
        footprint_d=8,
        meta={"power_kw": 14, "service_interval_h": 1500, "throughput_per_h": 55},
    ),
    Asset(
        id="AST-GLASS-STN",
        name="Glass Setting Robot Cell",
        category="glassstn",
        footprint_w=9,
        footprint_d=9,
        meta={"power_kw": 18, "service_interval_h": 1800, "throughput_per_h": 55},
    ),
    Asset(
        id="AST-SEAT-STN",
        name="Seat Installation Station",
        category="seatstn",
        footprint_w=9,
        footprint_d=10,
        meta={"power_kw": 16, "service_interval_h": 1800, "throughput_per_h": 55},
    ),
    Asset(
        id="AST-FLUID-FILL",
        name="Fluid Fill Station",
        category="fluidfill",
        footprint_w=7,
        footprint_d=8,
        meta={"power_kw": 6, "service_interval_h": 2000, "fluids": "brake, coolant, screenwash"},
    ),
    # ---- final check / inspection shop ----
    Asset(
        id="AST-ROLLER-TEST",
        name="Roller Test Bed",
        category="rollertest",
        footprint_w=10,
        footprint_d=6,
        meta={"power_kw": 30, "service_interval_h": 2000, "tests": "speedometer, brake"},
    ),
    Asset(
        id="AST-LAMP-AIM",
        name="Headlamp Aim Rig",
        category="lampaim",
        footprint_w=9,
        footprint_d=5,
        meta={"power_kw": 3, "service_interval_h": 4000},
    ),
    Asset(
        id="AST-INSPECT-DECK",
        name="Underbody Inspection Deck",
        category="inspectpit",
        footprint_w=14,
        footprint_d=5,
        meta={"power_kw": 2, "service_interval_h": 6000},
    ),
    Asset(
        id="AST-SHOWER-TEST",
        name="Water Leak Test Booth",
        category="showertest",
        footprint_w=12,
        footprint_d=7,
        meta={"power_kw": 18, "service_interval_h": 1500, "water_lpm": 900},
    ),
    Asset(
        id="AST-LIGHT-TUNNEL",
        name="Final Visual Inspection Tunnel",
        category="lighttunnel",
        footprint_w=12,
        footprint_d=8,
        meta={"power_kw": 8, "service_interval_h": 4000},
    ),
]


# ---- campus building placement (mirrors frontend src/scene/campusLayout.ts) ----

def _bmeta(shop, x, z, half_x, half_d, eaves, ridge, doors):
    return {
        "shopType": shop,
        "x": x,
        "z": z,
        "rotationY": 0,
        "halfX": half_x,
        "halfD": half_d,
        "eavesY": eaves,
        "ridgeY": ridge,
        "doors": doors,
    }


BUILDINGS = {
    # Press shop runs tall: coil cranes and die changes need the headroom.
    "nd-hall-stamp": ("Stamping Shop", _bmeta("stamping", -150, 0, 42, 26, 14, 16.5, {"east": True, "west": True, "office": "south"})),
    "nd-hall-a": ("Hall A — Body / Weld", _bmeta("body", 0, 0, 49, 29, 9, 13.5, {"east": True, "west": True, "office": "south"})),
    "nd-hall-paint": ("Paint Shop", _bmeta("paint", 150, 0, 44, 27, 9, 13, {"east": True, "west": True, "office": "south"})),
    "nd-hall-power": ("Powertrain / Machining", _bmeta("powertrain", 285, 0, 42, 26, 8.5, 12.5, {"east": True, "west": True, "office": "south"})),
    "nd-hall-wh": ("Warehouse / Logistics", _bmeta("warehouse", 0, 105, 60, 32, 11, 15, {"north": True, "south": True, "office": None})),
    "nd-hall-ga": ("General / Final Assembly", _bmeta("assembly", 420, 0, 46, 28, 9, 13.5, {"east": True, "west": True, "office": "south"})),
    "nd-hall-check": ("Final Check / Inspection", _bmeta("finalcheck", 555, 0, 44, 24, 8, 11.5, {"east": True, "west": True, "office": "south"})),
}


def ensure_catalog(db: Session) -> None:
    """Insert any catalog assets missing from an existing database."""
    existing = {a.id for a in db.query(Asset).all()}
    for asset in CATALOG:
        if asset.id not in existing:
            db.merge(asset)
    db.commit()


def _mk_machine(instances, nodes, *, inst_id, asset_id, name, parent, x, z, rot=0.0, sort=0):
    node = HierarchyNode(
        id=f"nd-{inst_id}",
        site_id=SITE_ID,
        parent_id=parent,
        name=name,
        level="machine",
        sort_order=sort,
    )
    nodes.append(node)
    instances.append(
        AssetInstance(
            id=inst_id,
            site_id=SITE_ID,
            asset_id=asset_id,
            node_id=node.id,
            name=name,
            x=x,
            y=0,
            z=z,
            rotation_y=rot,
            source="seeded",
        )
    )


def seed(db: Session) -> None:
    """Seed Factory Memory with the full automotive campus demo site."""
    site = Site(id=SITE_ID, name="Plant 1 — Pune", timezone="Asia/Kolkata")
    db.add(site)
    db.add_all(CATALOG)

    nd_site = HierarchyNode(id="nd-site", site_id=SITE_ID, parent_id=None, name="Plant 1", level="site", sort_order=0)
    db.add(nd_site)

    # Building nodes carry placement meta (layout source of truth).
    for i, (bid, (bname, bmeta)) in enumerate(BUILDINGS.items()):
        db.add(
            HierarchyNode(
                id=bid, site_id=SITE_ID, parent_id="nd-site", name=bname,
                level="building", sort_order=i, meta=bmeta,
            )
        )

    instances: list[AssetInstance] = []
    nodes: list[HierarchyNode] = []

    # ---------------- Body / Weld shop (Hall A, at origin) ----------------
    nd_weld = HierarchyNode(id="nd-weld", site_id=SITE_ID, parent_id="nd-hall-a", name="Weld Shop", level="area", sort_order=0)
    nd_trim = HierarchyNode(id="nd-trim", site_id=SITE_ID, parent_id="nd-hall-a", name="Trim Shop", level="area", sort_order=1)
    nd_line_body = HierarchyNode(id="nd-line-body", site_id=SITE_ID, parent_id="nd-weld", name="Body Line 1", level="line", sort_order=0)
    nd_line_trim = HierarchyNode(id="nd-line-trim", site_id=SITE_ID, parent_id="nd-trim", name="Trim Line 1", level="line", sort_order=0)
    db.add_all([nd_weld, nd_trim, nd_line_body, nd_line_trim])

    for i, x in enumerate(STATION_XS):
        for suffix, z, rot in (("l", 2.8, math.pi / 2), ("r", -2.8, -math.pi / 2)):
            _mk_machine(
                instances, nodes,
                inst_id=f"robot-s{i + 1}{suffix}",
                asset_id="AST-ROBOT-WELD-6X",
                name=f"Weld Robot {i + 1}{suffix.upper()}",
                parent="nd-line-body",
                x=x, z=z, rot=rot,
                sort=i * 2 + (0 if suffix == "l" else 1),
            )

    instances.append(
        AssetInstance(id="line-body-1", site_id=SITE_ID, asset_id="AST-LINE-BODY-INDEX", node_id="nd-line-body", name="Body Line 1", x=0, y=0, z=0, rotation_y=0, source="seeded")
    )
    instances.append(
        AssetInstance(id="line-trim-1", site_id=SITE_ID, asset_id="AST-LINE-TRIM-CONV", node_id="nd-line-trim", name="Trim Line 1", x=0, y=0, z=16, rotation_y=0, source="seeded")
    )
    # Framing / respot stations: side-frame geo clamps close on the floorpan at
    # the front of the body line (structures assembled together).
    _mk_machine(instances, nodes, inst_id="framing-1", asset_id="AST-FRAMING-STN", name="Framing Station 1", parent="nd-line-body", x=-20, z=0, sort=100)
    _mk_machine(instances, nodes, inst_id="framing-2", asset_id="AST-FRAMING-STN", name="Framing Station 2", parent="nd-line-body", x=-12, z=0, sort=101)
    # QC inspection gate at the body-hall exit toward paint (east door).
    _mk_machine(instances, nodes, inst_id="qc-1", asset_id="AST-QC-GATE", name="Body QC Gate", parent="nd-line-body", x=42, z=0, sort=102)

    # ---------------- Stamping shop (centre x=-150) ----------------
    nd_area_stamp = HierarchyNode(id="nd-area-stamp", site_id=SITE_ID, parent_id="nd-hall-stamp", name="Press Shop", level="area", sort_order=0)
    nd_line_stamp = HierarchyNode(id="nd-line-stamp", site_id=SITE_ID, parent_id="nd-area-stamp", name="Press Line 1", level="line", sort_order=0)
    db.add_all([nd_area_stamp, nd_line_stamp])
    # Blanking / coil line feeds the press line from the far west (raw in).
    _mk_machine(instances, nodes, inst_id="blank-stamp-1", asset_id="AST-COIL-BLANKING", name="Blanking Line", parent="nd-line-stamp", x=-184, z=-7, sort=0)
    # Press line: draw -> trim -> flange.
    for i, x in enumerate([-168, -150, -132]):
        _mk_machine(instances, nodes, inst_id=f"press-{i + 1}", asset_id="AST-STAMP-PRESS-1000T", name=f"Stamping Press {i + 1}", parent="nd-line-stamp", x=x, z=-7, sort=1 + i)
    # Transfer robots hand the panel station-to-station.
    for i, x in enumerate([-159, -141, -123]):
        _mk_machine(instances, nodes, inst_id=f"xfer-stamp-{i + 1}", asset_id="AST-TRANSFER-ROBOT", name=f"Transfer Robot {i + 1}", parent="nd-line-stamp", x=x, z=-7, sort=5 + i)
    # Exit shuttle conveyor carries finished panels toward the framing cell.
    _mk_machine(instances, nodes, inst_id="conv-stamp-1", asset_id="AST-CONV-LINE-12M", name="Exit Shuttle Conveyor", parent="nd-line-stamp", x=-134, z=-7, sort=9)
    # Finished-panel stillages staged along the south wall (feed the framing cell).
    for i, x in enumerate([-118, -124]):
        _mk_machine(instances, nodes, inst_id=f"rack-stamp-{i + 1}", asset_id="AST-PANEL-RACK", name=f"Panel Rack {i + 1}", parent="nd-area-stamp", x=x, z=-16, sort=10 + i)
    # Body-framing / underbody build cell at the east end: three loader arms set
    # the centre floor + left/right sides, a join press strokes them together,
    # then the framed body-in-white indexes east on the rail to the weld shop.
    _mk_machine(instances, nodes, inst_id="framecell-1", asset_id="AST-BODY-FRAMING", name="Body Framing Cell", parent="nd-line-stamp", x=-120, z=0, sort=8)
    # Scrap conveyor + baler behind the press line.
    _mk_machine(instances, nodes, inst_id="scrap-stamp-1", asset_id="AST-SCRAP-CONV", name="Scrap Conveyor", parent="nd-area-stamp", x=-176, z=-14, sort=12)
    # Overhead die-change bridge crane spanning the bay.
    _mk_machine(instances, nodes, inst_id="crane-stamp-1", asset_id="AST-DIE-CRANE", name="Die-Change Bridge Crane", parent="nd-area-stamp", x=-150, z=0, sort=13)
    # Coil-handling gantry over the NW coil yard, feeding the blanking uncoiler.
    _mk_machine(instances, nodes, inst_id="coilcrane-stamp-1", asset_id="AST-COIL-CRANE", name="Coil-Handling Gantry", parent="nd-area-stamp", x=-178, z=12, sort=16)
    # AGVs run the coil-in (north staging) and panel-out (east door) routes.
    _mk_machine(instances, nodes, inst_id="agv-stamp-1", asset_id="AST-AGV-1T", name="Stamping AGV 1", parent="nd-area-stamp", x=-170, z=16, rot=math.pi / 2, sort=14)
    _mk_machine(instances, nodes, inst_id="agv-stamp-2", asset_id="AST-AGV-1T", name="Stamping AGV 2", parent="nd-area-stamp", x=-116, z=8, sort=15)

    # ---------------- Paint shop (centre x=150) ----------------
    nd_area_paint = HierarchyNode(id="nd-area-paint", site_id=SITE_ID, parent_id="nd-hall-paint", name="Paint Shop", level="area", sort_order=0)
    nd_line_paint = HierarchyNode(id="nd-line-paint", site_id=SITE_ID, parent_id="nd-area-paint", name="Paint Line 1", level="line", sort_order=0)
    db.add_all([nd_area_paint, nd_line_paint])
    _mk_machine(instances, nodes, inst_id="dip-1", asset_id="AST-DIP-TANK-ECOAT", name="E-Coat Dip Tank", parent="nd-line-paint", x=118, z=0, sort=0)
    # Overhead paint monorail running down the aisle between the robots (z=9.5),
    # carrying bodies white -> black straight through the booth.
    _mk_machine(instances, nodes, inst_id="paintline-1", asset_id="AST-PAINT-LINE-OVH", name="Paint Monorail", parent="nd-line-paint", x=143, z=9.5, sort=1)
    for i, (x, z) in enumerate([(136, 7), (150, 7), (136, 12), (150, 12)]):
        _mk_machine(instances, nodes, inst_id=f"probot-{i + 1}", asset_id="AST-PAINT-ROBOT-BELL", name=f"Paint Robot {i + 1}", parent="nd-line-paint", x=x, z=z, sort=2 + i)
    _mk_machine(instances, nodes, inst_id="oven-1", asset_id="AST-OVEN-CURE-TUNNEL", name="Paint Cure Oven", parent="nd-line-paint", x=170, z=-8, sort=5)
    _mk_machine(instances, nodes, inst_id="conv-paint-1", asset_id="AST-CONV-LINE-12M", name="Paint Carrier Conveyor", parent="nd-line-paint", x=150, z=-16, sort=6)

    # ---------------- Powertrain / machining (centre x=285) ----------------
    nd_area_power = HierarchyNode(id="nd-area-power", site_id=SITE_ID, parent_id="nd-hall-power", name="Machining Shop", level="area", sort_order=0)
    nd_line_power = HierarchyNode(id="nd-line-power", site_id=SITE_ID, parent_id="nd-area-power", name="Machining Cell 1", level="line", sort_order=0)
    db.add_all([nd_area_power, nd_line_power])
    idx = 0
    for z in (-7, 7):
        for x in (268, 285, 302):
            idx += 1
            _mk_machine(instances, nodes, inst_id=f"cnc-{idx}", asset_id="AST-CNC-CENTER-5X", name=f"CNC Centre {idx}", parent="nd-line-power", x=x, z=z, sort=idx)
    _mk_machine(instances, nodes, inst_id="conv-power-1", asset_id="AST-CONV-LINE-12M", name="Machining Transfer Conveyor", parent="nd-line-power", x=285, z=0, sort=idx + 1)
    _mk_machine(instances, nodes, inst_id="agv-power-1", asset_id="AST-AGV-1T", name="Powertrain AGV 1", parent="nd-area-power", x=252, z=0, sort=idx + 2)

    # ---------------- General / Final Assembly (centre x=420) ----------------
    nd_area_ga = HierarchyNode(id="nd-area-ga", site_id=SITE_ID, parent_id="nd-hall-ga", name="Final Assembly", level="area", sort_order=0)
    nd_line_ga = HierarchyNode(id="nd-line-ga", site_id=SITE_ID, parent_id="nd-area-ga", name="Trim / Final Line 1", level="line", sort_order=0)
    db.add_all([nd_area_ga, nd_line_ga])
    # Overhead carrier line runs the painted body down the hall past fitment.
    # Bodies dwell every 7 m from x=392 to x=441; each station below sits on one
    # of those dwell points so it works on a real body, in build sequence:
    # trim (glass, seats) -> chassis (engine marriage) -> final (wheels, fluids).
    _mk_machine(instances, nodes, inst_id="galine-1", asset_id="AST-GA-LINE", name="Final Assembly Line", parent="nd-line-ga", x=420, z=6, sort=0)
    _mk_machine(instances, nodes, inst_id="glass-1", asset_id="AST-GLASS-STN", name="Glass Setting Cell", parent="nd-line-ga", x=392, z=6, sort=1)
    _mk_machine(instances, nodes, inst_id="seat-1", asset_id="AST-SEAT-STN", name="Seat Installation", parent="nd-line-ga", x=406, z=6, sort=2)
    # Engine-marriage decking station mid-line (engine rises to meet the body).
    _mk_machine(instances, nodes, inst_id="marriage-1", asset_id="AST-MARRIAGE-DECK", name="Engine Marriage Station", parent="nd-line-ga", x=420, z=6, sort=3)
    _mk_machine(instances, nodes, inst_id="wheel-1", asset_id="AST-WHEEL-STN", name="Wheel Fitting Station", parent="nd-line-ga", x=434, z=6, sort=4)
    _mk_machine(instances, nodes, inst_id="fluid-1", asset_id="AST-FLUID-FILL", name="Fluid Fill Station", parent="nd-line-ga", x=441, z=6, sort=5)
    # Doors come off at the head of the line and travel their own monorail.
    _mk_machine(instances, nodes, inst_id="doorline-1", asset_id="AST-DOOR-LINE", name="Door-Off Monorail", parent="nd-line-ga", x=420, z=14, sort=6)
    # Finished-car roll-out conveyor at the east end.
    _mk_machine(instances, nodes, inst_id="conv-ga-1", asset_id="AST-CONV-LINE-12M", name="Final Roll-out Conveyor", parent="nd-line-ga", x=452, z=-12, sort=7)
    # Parts-feed AGVs bringing doors / wheels / bumpers to the line side.
    _mk_machine(instances, nodes, inst_id="agv-ga-1", asset_id="AST-AGV-1T", name="Assembly AGV 1", parent="nd-area-ga", x=390, z=16, rot=math.pi / 2, sort=8)
    _mk_machine(instances, nodes, inst_id="agv-ga-2", asset_id="AST-AGV-1T", name="Assembly AGV 2", parent="nd-area-ga", x=448, z=16, rot=math.pi / 2, sort=9)

    # ---------------- Final check / inspection (centre x=555) ----------------
    # Cars leave assembly under their own wheels and drive west-to-east through
    # four stations before they are released to the yard.
    nd_area_check = HierarchyNode(id="nd-area-check", site_id=SITE_ID, parent_id="nd-hall-check", name="Final Check", level="area", sort_order=0)
    nd_line_check = HierarchyNode(id="nd-line-check", site_id=SITE_ID, parent_id="nd-area-check", name="Inspection Line 1", level="line", sort_order=0)
    db.add_all([nd_area_check, nd_line_check])
    _mk_machine(instances, nodes, inst_id="roller-1", asset_id="AST-ROLLER-TEST", name="Roller Test Bed", parent="nd-line-check", x=525, z=0, sort=0)
    _mk_machine(instances, nodes, inst_id="lampaim-1", asset_id="AST-LAMP-AIM", name="Headlamp Aim Rig", parent="nd-line-check", x=543, z=0, sort=1)
    _mk_machine(instances, nodes, inst_id="pit-1", asset_id="AST-INSPECT-DECK", name="Underbody Inspection Deck", parent="nd-line-check", x=561, z=0, sort=2)
    _mk_machine(instances, nodes, inst_id="tunnel-1", asset_id="AST-LIGHT-TUNNEL", name="Final Visual Inspection", parent="nd-line-check", x=578, z=0, sort=3)
    # Last gate before shipping: hosed down and checked for leaks, then the car
    # drives out of the east door to the marshalling yard.
    _mk_machine(instances, nodes, inst_id="shower-1", asset_id="AST-SHOWER-TEST", name="Water Leak Test Booth", parent="nd-line-check", x=592, z=0, sort=4)

    # ---------------- Warehouse / logistics (centre x=0, z=105) ----------------
    nd_area_wh = HierarchyNode(id="nd-area-wh", site_id=SITE_ID, parent_id="nd-hall-wh", name="Logistics", level="area", sort_order=0)
    nd_line_wh = HierarchyNode(id="nd-line-wh", site_id=SITE_ID, parent_id="nd-area-wh", name="Put / Pick Aisle 1", level="line", sort_order=0)
    db.add_all([nd_area_wh, nd_line_wh])
    # AS/RS storage racks down the middle of the hall (shelves at z=100).
    for i, x in enumerate([-38, 0, 38]):
        _mk_machine(instances, nodes, inst_id=f"asrs-{i + 1}", asset_id="AST-ASRS-CRANE", name=f"AS/RS Aisle {i + 1}", parent="nd-line-wh", x=x, z=100, sort=i)
    # Inbound delivery rail entering through the north dock door, feeding the
    # receiving pile (a truck is parked outside the door on the rail).
    _mk_machine(instances, nodes, inst_id="rail-in-1", asset_id="AST-INBOUND-RAIL", name="Inbound Delivery Rail", parent="nd-area-wh", x=0, z=128, sort=3)
    # Dispatch conveyor on the south apron, feeding finished parts to the body shop.
    _mk_machine(instances, nodes, inst_id="conv-wh-1", asset_id="AST-CONV-LINE-12M", name="Dispatch Conveyor", parent="nd-area-wh", x=-12, z=84, sort=4)
    # Warehouse AGVs shuttling on the south dispatch apron (clear of the forklifts).
    for i, x in enumerate([-24, 4, 26]):
        _mk_machine(instances, nodes, inst_id=f"agv-wh-{i + 1}", asset_id="AST-AGV-1T", name=f"Warehouse AGV {i + 1}", parent="nd-area-wh", x=x, z=88, sort=5 + i)
    # Four forklifts running the receiving -> put-away -> retrieval flow. Roles are
    # assigned on the frontend by their sorted order: 1=receiving, 2/3=put-away,
    # 4=retrieval. Seeds are near each leg so labels/edit-drag stay sensible.
    _mk_machine(instances, nodes, inst_id="fork-wh-1", asset_id="AST-FORKLIFT-2T5", name="Forklift 1 · Receiving", parent="nd-area-wh", x=0, z=114, rot=math.pi / 2, sort=9)
    _mk_machine(instances, nodes, inst_id="fork-wh-2", asset_id="AST-FORKLIFT-2T5", name="Forklift 2 · Put-away L", parent="nd-area-wh", x=-18, z=108, rot=math.pi, sort=10)
    _mk_machine(instances, nodes, inst_id="fork-wh-3", asset_id="AST-FORKLIFT-2T5", name="Forklift 3 · Put-away R", parent="nd-area-wh", x=18, z=108, rot=0.0, sort=11)
    _mk_machine(instances, nodes, inst_id="fork-wh-4", asset_id="AST-FORKLIFT-2T5", name="Forklift 4 · Retrieval", parent="nd-area-wh", x=0, z=90, rot=math.pi / 2, sort=12)

    db.add_all(nodes)
    db.add_all(instances)

    # Per-shop floor zones (labelled areas on the shop floor).
    db.add_all([
        Zone(id="zn-press", site_id=SITE_ID, name="Press Line", x=-150, z=-7, w=44, d=8, color="#38bdf8"),
        Zone(id="zn-ecoat", site_id=SITE_ID, name="E-Coat", x=118, z=0, w=10, d=6, color="#0ea5a4"),
        Zone(id="zn-paint", site_id=SITE_ID, name="Paint Booth", x=143, z=9, w=28, d=10, color="#3b82f6"),
        Zone(id="zn-mach", site_id=SITE_ID, name="Machining", x=285, z=0, w=46, d=18, color="#a78bfa"),
        Zone(id="zn-store", site_id=SITE_ID, name="Storage", x=0, z=105, w=100, d=22, color="#f59e0b"),
        Zone(id="zn-check", site_id=SITE_ID, name="Final Check", x=553, z=0, w=76, d=10, color="#22d3ee"),
    ])

    # Default component trees for the weld robots (documented internals, PRD 7.12)
    robot_components = [
        ("Controller cabinet", "KRC5, firmware 8.7"),
        ("Axis 1-3 drive pack", "Check backlash at 2000 h service"),
        ("Axis 4-6 wrist unit", ""),
        ("Weld gun", "X-type servo gun"),
        ("Gun tip dresser", "Dress every 400 welds"),
        ("Dress pack / cabling", "Inspect for chafing monthly"),
    ]
    for inst in instances:
        if inst.asset_id != "AST-ROBOT-WELD-6X":
            continue
        gun_id = None
        for name, note in robot_components:
            comp_id = f"cmp-{uuid.uuid4().hex[:10]}"
            parent = gun_id if name == "Gun tip dresser" else None
            db.add(
                Component(
                    id=comp_id,
                    instance_id=inst.id,
                    parent_id=parent,
                    name=name,
                    note=note,
                )
            )
            if name == "Weld gun":
                gun_id = comp_id

    db.commit()


def seed_if_empty(db: Session) -> bool:
    if db.query(Site).first() is not None:
        return False
    seed(db)
    return True
