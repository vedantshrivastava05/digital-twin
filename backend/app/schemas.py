from datetime import datetime

from pydantic import BaseModel, ConfigDict


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SiteOut(OrmModel):
    id: str
    name: str
    timezone: str


class HierarchyNodeOut(OrmModel):
    id: str
    site_id: str
    parent_id: str | None
    name: str
    level: str
    sort_order: int
    meta: dict | None = None


class AssetOut(OrmModel):
    id: str
    name: str
    category: str
    footprint_w: float
    footprint_d: float
    meta: dict


class AssetInstanceOut(OrmModel):
    id: str
    site_id: str
    asset_id: str
    node_id: str | None
    name: str
    x: float
    y: float
    z: float
    rotation_y: float
    source: str


class AssetInstanceCreate(BaseModel):
    asset_id: str
    node_id: str | None = None
    name: str
    x: float = 0
    y: float = 0
    z: float = 0
    rotation_y: float = 0
    source: str = "manual"
    # If set, a machine-level hierarchy node is created under this parent
    parent_node_id: str | None = None


class AssetInstanceUpdate(BaseModel):
    name: str | None = None
    asset_id: str | None = None
    node_id: str | None = None
    x: float | None = None
    y: float | None = None
    z: float | None = None
    rotation_y: float | None = None


class ZoneOut(OrmModel):
    id: str
    site_id: str
    name: str
    x: float
    z: float
    w: float
    d: float
    color: str


class ZoneCreate(BaseModel):
    name: str
    x: float
    z: float
    w: float
    d: float
    color: str = "#38bdf8"


class LayoutVersionOut(OrmModel):
    id: str
    site_id: str
    label: str
    created_at: datetime


class LayoutVersionCreate(BaseModel):
    label: str


class TwinOut(BaseModel):
    """Everything the viewer needs to render a site in one call."""

    site: SiteOut
    nodes: list[HierarchyNodeOut]
    assets: list[AssetOut]
    instances: list[AssetInstanceOut]
    zones: list[ZoneOut]


class MachineStateOut(OrmModel):
    instance_id: str
    status: str
    since: datetime
    reason_code: str | None
    note: str


class DowntimeEntryOut(OrmModel):
    id: str
    instance_id: str
    reason_code: str
    note: str
    started_at: datetime
    ended_at: datetime | None


class ProductionLogOut(OrmModel):
    id: str
    instance_id: str
    shift_date: str
    shift: str
    good: int
    reject: int
    order_id: str | None
    logged_at: datetime


class OeeOut(BaseModel):
    instance_id: str
    window_hours: int
    availability: float
    performance: float
    quality: float
    oee: float
    good: int
    reject: int
    downtime_minutes: float


class DocumentOut(OrmModel):
    id: str
    site_id: str
    instance_id: str
    filename: str
    content_type: str
    size: int
    uploaded_at: datetime


class DocumentSearchHit(BaseModel):
    document: DocumentOut
    instance_id: str
    instance_name: str
    snippet: str | None = None


class ComponentOut(OrmModel):
    id: str
    instance_id: str
    parent_id: str | None
    name: str
    note: str


class ComponentCreate(BaseModel):
    name: str
    note: str = ""
    parent_id: str | None = None


class AnnotationOut(OrmModel):
    id: str
    site_id: str
    instance_id: str | None
    x: float
    y: float
    z: float
    text: str
    author: str
    created_at: datetime


class AnnotationCreate(BaseModel):
    instance_id: str | None = None
    x: float
    y: float
    z: float
    text: str
    author: str = "Operator"
