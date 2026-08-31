from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class CatalogAsset:
    id: str
    name: str
    category: str
    footprint_w: float
    footprint_d: float
    meta: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ReconstructionInput:
    job_id: str
    site_id: str
    source_kind: str
    file_path: Path
    original_filename: str
    content_type: str
    sha256: str
    width_px: int
    height_px: int


@dataclass(frozen=True)
class ReconstructionOptions:
    floor_width_m: float | None = None
    floor_depth_m: float | None = None
    max_objects: int = 12
    analysis_hint: str | None = None


class ReconstructionProvider(Protocol):
    """Stable boundary implemented by local or external reconstruction engines."""

    name: str
    supported_source_kinds: frozenset[str]

    def reconstruct(
        self,
        source: ReconstructionInput,
        catalog: list[CatalogAsset],
        options: ReconstructionOptions,
    ) -> dict:
        """Return a provider-neutral, editable scene proposal."""

