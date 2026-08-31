from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from ..schemas import AssetInstanceOut, LayoutVersionOut, ZoneOut


class ReconstructionJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    source_kind: str
    original_filename: str
    content_type: str
    size_bytes: int
    width_px: int
    height_px: int
    status: str
    provider: str
    approximate: bool
    object_count: int
    error: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    applied_at: datetime | None


class ReconstructionGenerateRequest(BaseModel):
    floor_width_m: float | None = Field(default=None, ge=4, le=500)
    floor_depth_m: float | None = Field(default=None, ge=4, le=500)
    max_objects: int = Field(default=12, ge=1, le=100)
    analysis_hint: str | None = Field(default=None, max_length=500)


class ReconstructionResultEnvelope(BaseModel):
    job: ReconstructionJobOut
    result: dict


class ReconstructionApplyRequest(BaseModel):
    parent_node_id: str | None = None
    replace_previous: bool = False
    layout_label: str | None = Field(default=None, min_length=1, max_length=120)


class ReconstructionApplyOut(BaseModel):
    job_id: str
    approximate: bool
    warning: str
    created_instance_ids: list[str]
    instances: list[AssetInstanceOut]
    zone: ZoneOut | None = None
    layout_version: LayoutVersionOut | None = None
