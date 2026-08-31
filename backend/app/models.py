from datetime import datetime

from sqlalchemy import Boolean, JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Naive local time — consistent across the whole single-machine demo."""
    return datetime.now()


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    timezone: Mapped[str] = mapped_column(String, default="UTC")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    nodes: Mapped[list["HierarchyNode"]] = relationship(back_populates="site")
    instances: Mapped[list["AssetInstance"]] = relationship(back_populates="site")


class HierarchyNode(Base):
    """ISA-95 tree: site > building > area > line > machine."""

    __tablename__ = "hierarchy_nodes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("hierarchy_nodes.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String)
    level: Mapped[str] = mapped_column(String)  # site|building|area|line|machine
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # Placement/geometry for building nodes (footprint, doors, shopType) — the
    # layout source of truth the 3D campus renders from.
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

    site: Mapped[Site] = relationship(back_populates="nodes")
    children: Mapped[list["HierarchyNode"]] = relationship(
        cascade="all, delete-orphan"
    )


class Asset(Base):
    """Catalog entry: a machine family the library knows how to render."""

    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String)  # robot|bodyline|trimline|press|...
    footprint_w: Mapped[float] = mapped_column(Float, default=2.0)
    footprint_d: Mapped[float] = mapped_column(Float, default=2.0)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    instances: Mapped[list["AssetInstance"]] = relationship(back_populates="asset")


class AssetInstance(Base):
    """A physical machine in a site. This table IS the twin (PRD 7.9)."""

    __tablename__ = "asset_instances"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    node_id: Mapped[str | None] = mapped_column(
        ForeignKey("hierarchy_nodes.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String)
    x: Mapped[float] = mapped_column(Float, default=0)
    y: Mapped[float] = mapped_column(Float, default=0)
    z: Mapped[float] = mapped_column(Float, default=0)
    rotation_y: Mapped[float] = mapped_column(Float, default=0)
    source: Mapped[str] = mapped_column(
        String, default="manual"
    )  # manual|imported|seeded|ai_reconstruction
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    site: Mapped[Site] = relationship(back_populates="instances")
    asset: Mapped[Asset] = relationship(back_populates="instances")
    node: Mapped[HierarchyNode | None] = relationship()


class MachineState(Base):
    """Current logged status of a machine (Ops Lite, PRD 7.11)."""

    __tablename__ = "machine_states"

    instance_id: Mapped[str] = mapped_column(
        ForeignKey("asset_instances.id"), primary_key=True
    )
    status: Mapped[str] = mapped_column(
        String, default="running"
    )  # running|idle|warning|down
    since: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    reason_code: Mapped[str | None] = mapped_column(String, nullable=True)
    note: Mapped[str] = mapped_column(String, default="")


class DowntimeEntry(Base):
    """One downtime period with a reason code; open until ended_at is set."""

    __tablename__ = "downtime_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    instance_id: Mapped[str] = mapped_column(ForeignKey("asset_instances.id"))
    reason_code: Mapped[str] = mapped_column(String)
    note: Mapped[str] = mapped_column(String, default="")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ProductionLog(Base):
    """Good/reject counts logged against a machine and shift."""

    __tablename__ = "production_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    instance_id: Mapped[str] = mapped_column(ForeignKey("asset_instances.id"))
    shift_date: Mapped[str] = mapped_column(String)  # YYYY-MM-DD
    shift: Mapped[str] = mapped_column(String)  # A|B|C
    good: Mapped[int] = mapped_column(Integer, default=0)
    reject: Mapped[int] = mapped_column(Integer, default=0)
    order_id: Mapped[str | None] = mapped_column(String, nullable=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Product(Base):
    """What the factory makes."""

    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sku: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)
    uom: Mapped[str] = mapped_column(String, default="pcs")


class ProductionOrder(Base):
    """A work order: make qty of product, tracked queued > running > qc > done."""

    __tablename__ = "production_orders"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    qty: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String, default="queued")
    machine_id: Mapped[str | None] = mapped_column(
        ForeignKey("asset_instances.id"), nullable=True
    )
    due_date: Mapped[str | None] = mapped_column(String, nullable=True)  # YYYY-MM-DD
    # Customer paint spec: the colour this order is built in. Drives the paint
    # shop and stays with the car through assembly to dispatch.
    color: Mapped[str | None] = mapped_column(String, nullable=True)  # hex
    color_name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class HandoverNote(Base):
    """Shift handover note, optionally linked to a machine."""

    __tablename__ = "handover_notes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    shift_date: Mapped[str] = mapped_column(String)
    shift: Mapped[str] = mapped_column(String)
    author: Mapped[str] = mapped_column(String, default="Operator")
    text: Mapped[str] = mapped_column(String)
    machine_id: Mapped[str | None] = mapped_column(
        ForeignKey("asset_instances.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class QualityLog(Base):
    """A defect record against a machine."""

    __tablename__ = "quality_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    instance_id: Mapped[str] = mapped_column(ForeignKey("asset_instances.id"))
    defect_code: Mapped[str] = mapped_column(String)
    qty: Mapped[int] = mapped_column(Integer, default=1)
    note: Mapped[str] = mapped_column(String, default="")
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class WorkOrder(Base):
    """CMMS-lite corrective/preventive work order."""

    __tablename__ = "work_orders"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    instance_id: Mapped[str] = mapped_column(ForeignKey("asset_instances.id"))
    type: Mapped[str] = mapped_column(String, default="corrective")  # corrective|preventive
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="open")  # open|in_progress|done
    priority: Mapped[str] = mapped_column(String, default="medium")  # low|medium|high
    downtime_entry_id: Mapped[str | None] = mapped_column(String, nullable=True)
    due_date: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PMSchedule(Base):
    """Preventive maintenance schedule: calendar and/or runtime-hours trigger."""

    __tablename__ = "pm_schedules"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    instance_id: Mapped[str] = mapped_column(ForeignKey("asset_instances.id"))
    title: Mapped[str] = mapped_column(String)
    interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interval_runtime_h: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_done: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SparePart(Base):
    """Spare part stock with a min-stock alert level."""

    __tablename__ = "spare_parts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sku: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    qty: Mapped[int] = mapped_column(Integer, default=0)
    min_qty: Mapped[int] = mapped_column(Integer, default=0)
    location: Mapped[str] = mapped_column(String, default="")
    instance_id: Mapped[str | None] = mapped_column(
        ForeignKey("asset_instances.id"), nullable=True
    )


class Notification(Base):
    """In-app alert (machine down too long, low stock, late order...)."""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    kind: Mapped[str] = mapped_column(String)
    ref_id: Mapped[str] = mapped_column(String, default="")
    message: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String, default="warning")  # info|warning|critical
    read: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class TagMapping(Base):
    """Binds a raw PLC tag name to an asset instance + semantic type."""

    __tablename__ = "tag_mappings"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    raw_tag: Mapped[str] = mapped_column(String, unique=True)
    instance_id: Mapped[str | None] = mapped_column(
        ForeignKey("asset_instances.id"), nullable=True
    )
    semantic: Mapped[str | None] = mapped_column(String, nullable=True)
    unit: Mapped[str] = mapped_column(String, default="")


class AlertRule(Base):
    """Threshold or state-duration alert rule on telemetry."""

    __tablename__ = "alert_rules"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    instance_id: Mapped[str | None] = mapped_column(
        ForeignKey("asset_instances.id"), nullable=True
    )  # None = applies to all machines
    semantic: Mapped[str] = mapped_column(String)  # temperature|current|state
    condition: Mapped[str] = mapped_column(String)  # gt|lt|eq
    threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    state_value: Mapped[str | None] = mapped_column(String, nullable=True)
    duration_s: Mapped[int] = mapped_column(Integer, default=0)
    severity: Mapped[str] = mapped_column(String, default="warning")
    enabled: Mapped[int] = mapped_column(Integer, default=1)


class Alarm(Base):
    """A raised alert instance, until acknowledged."""

    __tablename__ = "alarms"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    rule_id: Mapped[str] = mapped_column(ForeignKey("alert_rules.id"))
    instance_id: Mapped[str] = mapped_column(ForeignKey("asset_instances.id"))
    message: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String, default="warning")
    raised_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    acknowledged: Mapped[int] = mapped_column(Integer, default=0)
    ack_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Document(Base):
    """A file bound to an asset instance (manual, drawing, photo, report)."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    instance_id: Mapped[str] = mapped_column(ForeignKey("asset_instances.id"))
    filename: Mapped[str] = mapped_column(String)
    content_type: Mapped[str] = mapped_column(String, default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    path: Mapped[str] = mapped_column(String)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Component(Base):
    """Documented internals of a machine (component tree, PRD 7.12)."""

    __tablename__ = "components"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    instance_id: Mapped[str] = mapped_column(ForeignKey("asset_instances.id"))
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("components.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String)
    note: Mapped[str] = mapped_column(String, default="")


class Zone(Base):
    """A named floor zone drawn in the manual builder."""

    __tablename__ = "zones"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    name: Mapped[str] = mapped_column(String)
    x: Mapped[float] = mapped_column(Float)
    z: Mapped[float] = mapped_column(Float)
    w: Mapped[float] = mapped_column(Float)
    d: Mapped[float] = mapped_column(Float)
    color: Mapped[str] = mapped_column(String, default="#38bdf8")


class LayoutVersion(Base):
    """Immutable snapshot of a site's layout (PRD 7.9: never overwrite history)."""

    __tablename__ = "layout_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    label: Mapped[str] = mapped_column(String)
    snapshot: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ReconstructionJob(Base):
    """Persisted media-to-layout reconstruction and its editable scene proposal.

    The input manifest and JSON result deliberately form a provider-neutral boundary.
    A later photogrammetry, video, LiDAR, or CAD provider can use the same job model
    without changing the editable AssetInstance twin model.
    """

    __tablename__ = "reconstruction_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), index=True)
    source_kind: Mapped[str] = mapped_column(String, default="photo")
    original_filename: Mapped[str] = mapped_column(String)
    stored_filename: Mapped[str] = mapped_column(String)
    content_type: Mapped[str] = mapped_column(String)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String)
    width_px: Mapped[int] = mapped_column(Integer)
    height_px: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String, default="uploaded", index=True)
    provider: Mapped[str] = mapped_column(String, default="local-heuristic-photo-v1")
    approximate: Mapped[bool] = mapped_column(Boolean, default=True)
    input_manifest: Mapped[dict] = mapped_column(JSON, default=dict)
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    object_count: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_instance_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    applied_zone_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Annotation(Base):
    """A 3D pin with a comment, optionally bound to an asset instance."""

    __tablename__ = "annotations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    instance_id: Mapped[str | None] = mapped_column(
        ForeignKey("asset_instances.id"), nullable=True
    )
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    z: Mapped[float] = mapped_column(Float)
    text: Mapped[str] = mapped_column(String)
    author: Mapped[str] = mapped_column(String, default="Operator")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
