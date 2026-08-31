from __future__ import annotations

import hashlib
import math
import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Asset,
    AssetInstance,
    HierarchyNode,
    LayoutVersion,
    MachineState,
    ReconstructionJob,
    Site,
    Zone,
    utcnow,
)
from ..reconstruction import provider_registry
from ..reconstruction.contracts import (
    CatalogAsset,
    ReconstructionInput,
    ReconstructionOptions,
)
from ..reconstruction.media import (
    MAX_UPLOAD_BYTES,
    InvalidImage,
    inspect_image,
    safe_display_filename,
)
from ..reconstruction.schemas import (
    ReconstructionApplyOut,
    ReconstructionApplyRequest,
    ReconstructionGenerateRequest,
    ReconstructionJobOut,
    ReconstructionResultEnvelope,
)


router = APIRouter()
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "reconstructions"
ACCURACY_WARNING = (
    "This layout was inferred from non-metric media and requires manual review; "
    "do not use it as engineering, clearance, or safety evidence."
)


@router.get("/reconstruction/capabilities")
def reconstruction_capabilities():
    return {
        "providers": provider_registry.capabilities(),
        "accepted_now": {
            "source_kinds": ["photo"],
            "content_types": ["image/jpeg", "image/png", "image/webp"],
            "max_upload_bytes": MAX_UPLOAD_BYTES,
        },
        "architecture_ready_for": ["multiple_photos", "video", "lidar", "cad"],
        "accuracy_notice": ACCURACY_WARNING,
    }


@router.post(
    "/sites/{site_id}/reconstructions",
    response_model=ReconstructionJobOut,
    status_code=201,
)
async def upload_reconstruction_source(
    site_id: str,
    file: UploadFile = File(...),
    source_kind: str = Form("photo"),
    provider: str = Form("local-heuristic-photo-v1"),
    db: Session = Depends(get_db),
):
    if db.get(Site, site_id) is None:
        raise HTTPException(404, "site not found")
    source_kind = source_kind.strip().lower()
    try:
        provider_registry.get(provider, source_kind)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    data = bytearray()
    try:
        while chunk := await file.read(1024 * 1024):
            data.extend(chunk)
            if len(data) > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    413, f"image exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit"
                )
    finally:
        await file.close()
    if not data:
        raise HTTPException(400, "uploaded image is empty")

    try:
        image = inspect_image(bytes(data))
    except InvalidImage as exc:
        raise HTTPException(415, str(exc)) from exc

    job_id = f"rec-{uuid.uuid4().hex[:12]}"
    display_name = safe_display_filename(file.filename, image.extension)
    stored_filename = f"{job_id}.{image.extension}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    destination = UPLOAD_DIR / stored_filename
    try:
        destination.write_bytes(data)
    except OSError as exc:
        raise HTTPException(500, "could not store reconstruction source") from exc

    digest = hashlib.sha256(data).hexdigest()
    job = ReconstructionJob(
        id=job_id,
        site_id=site_id,
        source_kind=source_kind,
        original_filename=display_name,
        stored_filename=stored_filename,
        content_type=image.content_type,
        size_bytes=len(data),
        sha256=digest,
        width_px=image.width,
        height_px=image.height,
        status="uploaded",
        provider=provider,
        approximate=True,
        input_manifest={
            "schema_version": "1.0",
            "sources": [
                {
                    "kind": source_kind,
                    "filename": display_name,
                    "stored_filename": stored_filename,
                    "content_type": image.content_type,
                    "sha256": digest,
                    "width_px": image.width,
                    "height_px": image.height,
                }
            ],
        },
        applied_instance_ids=[],
    )
    try:
        db.add(job)
        db.commit()
        db.refresh(job)
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise
    return job


@router.get(
    "/sites/{site_id}/reconstructions", response_model=list[ReconstructionJobOut]
)
def list_reconstructions(
    site_id: str,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    if db.get(Site, site_id) is None:
        raise HTTPException(404, "site not found")
    query = db.query(ReconstructionJob).filter(ReconstructionJob.site_id == site_id)
    if status:
        query = query.filter(ReconstructionJob.status == status)
    return query.order_by(ReconstructionJob.created_at.desc()).limit(limit).all()


@router.get("/reconstructions/{job_id}", response_model=ReconstructionJobOut)
def get_reconstruction_job(job_id: str, db: Session = Depends(get_db)):
    return _get_job(db, job_id)


@router.get("/reconstructions/{job_id}/source")
def get_reconstruction_source(job_id: str, db: Session = Depends(get_db)):
    job = _get_job(db, job_id)
    path = _source_path(job)
    if not path.is_file():
        raise HTTPException(410, "reconstruction source is missing")
    return FileResponse(
        path,
        media_type=job.content_type,
        filename=job.original_filename,
        content_disposition_type="inline",
    )


@router.post(
    "/reconstructions/{job_id}/generate",
    response_model=ReconstructionResultEnvelope,
)
def generate_reconstruction(
    job_id: str,
    body: ReconstructionGenerateRequest | None = None,
    db: Session = Depends(get_db),
):
    job = _get_job(db, job_id)
    if job.status == "processing":
        raise HTTPException(409, "reconstruction is already processing")
    if job.status == "applied":
        raise HTTPException(
            409, "applied reconstruction cannot be regenerated; upload a new source"
        )
    source_path = _source_path(job)
    if not source_path.is_file():
        job.status = "failed"
        job.error = "source file missing"
        db.commit()
        raise HTTPException(410, "reconstruction source is missing")

    request = body or ReconstructionGenerateRequest()
    try:
        provider = provider_registry.get(job.provider, job.source_kind)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    job.status = "processing"
    job.started_at = utcnow()
    job.completed_at = None
    job.error = None
    job.options = request.model_dump()
    db.commit()

    catalog_rows = db.query(Asset).order_by(Asset.id).all()
    catalog = [
        CatalogAsset(
            id=item.id,
            name=item.name,
            category=item.category,
            footprint_w=item.footprint_w,
            footprint_d=item.footprint_d,
            meta=item.meta or {},
        )
        for item in catalog_rows
    ]
    source = ReconstructionInput(
        job_id=job.id,
        site_id=job.site_id,
        source_kind=job.source_kind,
        file_path=source_path,
        original_filename=job.original_filename,
        content_type=job.content_type,
        sha256=job.sha256,
        width_px=job.width_px,
        height_px=job.height_px,
    )
    options = ReconstructionOptions(**request.model_dump())
    try:
        result = provider.reconstruct(source, catalog, options)
        if not result.get("approximate") or result.get("engineering_accurate") is not False:
            raise ValueError("provider did not mark single-photo output as approximate")
        if not isinstance(result.get("objects"), list):
            raise ValueError("provider returned an invalid object collection")
    except Exception as exc:
        job.status = "failed"
        job.error = f"{type(exc).__name__}: {exc}"[:2000]
        job.completed_at = utcnow()
        db.commit()
        raise HTTPException(422, "reconstruction failed; inspect job status for details") from exc

    job.result = result
    job.object_count = len(result["objects"])
    job.status = "completed"
    job.completed_at = utcnow()
    job.error = None
    db.commit()
    db.refresh(job)
    return ReconstructionResultEnvelope(
        job=ReconstructionJobOut.model_validate(job), result=result
    )


@router.get(
    "/reconstructions/{job_id}/result", response_model=ReconstructionResultEnvelope
)
def get_reconstruction_result(job_id: str, db: Session = Depends(get_db)):
    job = _get_job(db, job_id)
    if job.result is None:
        if job.status == "failed":
            raise HTTPException(422, job.error or "reconstruction failed")
        raise HTTPException(409, f"reconstruction is {job.status}; no result is available")
    return ReconstructionResultEnvelope(
        job=ReconstructionJobOut.model_validate(job), result=job.result
    )


@router.post(
    "/reconstructions/{job_id}/apply", response_model=ReconstructionApplyOut
)
def apply_reconstruction(
    job_id: str,
    body: ReconstructionApplyRequest | None = None,
    db: Session = Depends(get_db),
):
    request = body or ReconstructionApplyRequest()
    job = _get_job(db, job_id)
    if job.result is None or job.status not in {"completed", "applied"}:
        raise HTTPException(409, "generate a successful reconstruction before applying it")

    parent = None
    if request.parent_node_id:
        parent = db.get(HierarchyNode, request.parent_node_id)
        if parent is None or parent.site_id != job.site_id:
            raise HTTPException(400, "parent_node_id is not part of this site")
        if parent.level == "machine":
            raise HTTPException(400, "a reconstructed machine cannot be nested under a machine")
    else:
        parent = (
            db.query(HierarchyNode)
            .filter(HierarchyNode.site_id == job.site_id, HierarchyNode.level == "line")
            .order_by(HierarchyNode.sort_order)
            .first()
        )

    previous_ids = list(job.applied_instance_ids or [])
    if previous_ids and not request.replace_previous:
        existing = (
            db.query(AssetInstance).filter(AssetInstance.id.in_(previous_ids)).all()
        )
        if len(existing) != len(previous_ids):
            raise HTTPException(
                409, "part of the applied layout was removed; use replace_previous=true"
            )
        zone = db.get(Zone, job.applied_zone_id) if job.applied_zone_id else None
        return ReconstructionApplyOut(
            job_id=job.id,
            approximate=True,
            warning=ACCURACY_WARNING,
            created_instance_ids=previous_ids,
            instances=existing,
            zone=zone,
            layout_version=None,
        )

    if request.replace_previous:
        _remove_previous_application(db, job)

    assets = {asset.id: asset for asset in db.query(Asset).all()}
    instances: list[AssetInstance] = []
    for index, proposal in enumerate(job.result.get("objects", [])):
        asset_id = proposal.get("asset_id")
        if not isinstance(asset_id, str) or asset_id not in assets:
            continue
        transform = proposal.get("transform") or {}
        position = transform.get("position") or {}
        rotation = transform.get("rotation") or {}
        instance_id = f"ai-{uuid.uuid4().hex[:10]}"
        name = str(proposal.get("name") or f"Reconstructed machine {index + 1}")[:160]
        node_id = None
        if parent is not None:
            node_id = f"nd-{instance_id}"
            db.add(
                HierarchyNode(
                    id=node_id,
                    site_id=job.site_id,
                    parent_id=parent.id,
                    name=name,
                    level="machine",
                    sort_order=900 + index,
                    meta={
                        "reconstruction_job_id": job.id,
                        "confidence": proposal.get("confidence"),
                        "approximate": True,
                    },
                )
            )
        instance = AssetInstance(
            id=instance_id,
            site_id=job.site_id,
            asset_id=asset_id,
            node_id=node_id,
            name=name,
            x=_finite(position.get("x"), 0.0),
            y=_finite(position.get("y"), 0.0),
            z=_finite(position.get("z"), 0.0),
            rotation_y=_finite(rotation.get("y"), 0.0),
            source="ai_reconstruction",
        )
        db.add(instance)
        db.add(
            MachineState(
                instance_id=instance_id,
                status="idle",
                note=f"Approximate placement from {job.id}; manual review required",
            )
        )
        instances.append(instance)

    if not instances:
        raise HTTPException(422, "result contains no proposals matched to the asset catalog")

    floor = job.result.get("floor") or {}
    dimensions = floor.get("dimensions") or {}
    zone = Zone(
        id=f"zn-{uuid.uuid4().hex[:10]}",
        site_id=job.site_id,
        name=f"Reconstructed floor — {job.original_filename}"[:160],
        x=0.0,
        z=0.0,
        w=max(1.0, _finite(dimensions.get("width"), 40.0)),
        d=max(1.0, _finite(dimensions.get("depth"), 25.0)),
        color="#64748b",
    )
    db.add(zone)
    db.flush()

    job.applied_instance_ids = [instance.id for instance in instances]
    job.applied_zone_id = zone.id
    job.applied_at = utcnow()
    job.status = "applied"

    layout_version = None
    if request.layout_label:
        layout_version = LayoutVersion(
            id=f"lv-{uuid.uuid4().hex[:10]}",
            site_id=job.site_id,
            label=request.layout_label.strip(),
            snapshot=_snapshot_site(db, job.site_id),
        )
        db.add(layout_version)

    db.commit()
    for instance in instances:
        db.refresh(instance)
    db.refresh(zone)
    if layout_version:
        db.refresh(layout_version)
    return ReconstructionApplyOut(
        job_id=job.id,
        approximate=True,
        warning=ACCURACY_WARNING,
        created_instance_ids=[instance.id for instance in instances],
        instances=instances,
        zone=zone,
        layout_version=layout_version,
    )


def _get_job(db: Session, job_id: str) -> ReconstructionJob:
    job = db.get(ReconstructionJob, job_id)
    if job is None:
        raise HTTPException(404, "reconstruction job not found")
    return job


def _source_path(job: ReconstructionJob) -> Path:
    root = UPLOAD_DIR.resolve()
    candidate = (root / job.stored_filename).resolve()
    if candidate.parent != root:
        raise HTTPException(410, "invalid reconstruction source path")
    return candidate


def _finite(value, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def _remove_previous_application(db: Session, job: ReconstructionJob) -> None:
    ids = list(job.applied_instance_ids or [])
    if ids:
        db.query(MachineState).filter(MachineState.instance_id.in_(ids)).delete(
            synchronize_session=False
        )
        instances = db.query(AssetInstance).filter(AssetInstance.id.in_(ids)).all()
        node_ids = [instance.node_id for instance in instances if instance.node_id]
        for instance in instances:
            db.delete(instance)
        db.flush()
        if node_ids:
            db.query(HierarchyNode).filter(HierarchyNode.id.in_(node_ids)).delete(
                synchronize_session=False
            )
    if job.applied_zone_id:
        zone = db.get(Zone, job.applied_zone_id)
        if zone is not None:
            db.delete(zone)
    job.applied_instance_ids = []
    job.applied_zone_id = None
    job.applied_at = None
    db.flush()


def _snapshot_site(db: Session, site_id: str) -> dict:
    instances = db.query(AssetInstance).filter(AssetInstance.site_id == site_id).all()
    zones = db.query(Zone).filter(Zone.site_id == site_id).all()
    nodes = (
        db.query(HierarchyNode)
        .filter(HierarchyNode.site_id == site_id, HierarchyNode.level == "machine")
        .all()
    )
    return {
        "instances": [
            {
                "id": item.id,
                "asset_id": item.asset_id,
                "node_id": item.node_id,
                "name": item.name,
                "x": item.x,
                "y": item.y,
                "z": item.z,
                "rotation_y": item.rotation_y,
                "source": item.source,
            }
            for item in instances
        ],
        "zones": [
            {
                "id": item.id,
                "name": item.name,
                "x": item.x,
                "z": item.z,
                "w": item.w,
                "d": item.d,
                "color": item.color,
            }
            for item in zones
        ],
        "machine_nodes": [
            {
                "id": node.id,
                "parent_id": node.parent_id,
                "name": node.name,
                "sort_order": node.sort_order,
            }
            for node in nodes
        ],
    }
