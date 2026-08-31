import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Annotation,
    Asset,
    AssetInstance,
    HierarchyNode,
    LayoutVersion,
    Site,
    Zone,
)
from ..schemas import (
    AnnotationCreate,
    AnnotationOut,
    AssetInstanceCreate,
    AssetInstanceOut,
    AssetInstanceUpdate,
    AssetOut,
    LayoutVersionCreate,
    LayoutVersionOut,
    SiteOut,
    TwinOut,
    ZoneCreate,
    ZoneOut,
)

router = APIRouter()


@router.get("/sites", response_model=list[SiteOut])
def list_sites(db: Session = Depends(get_db)):
    return db.query(Site).all()


@router.get("/assets", response_model=list[AssetOut])
def list_assets(db: Session = Depends(get_db)):
    return db.query(Asset).all()


@router.get("/sites/{site_id}/twin", response_model=TwinOut)
def get_twin(site_id: str, db: Session = Depends(get_db)):
    site = db.get(Site, site_id)
    if site is None:
        raise HTTPException(404, "site not found")
    nodes = (
        db.query(HierarchyNode)
        .filter(HierarchyNode.site_id == site_id)
        .order_by(HierarchyNode.sort_order)
        .all()
    )
    instances = (
        db.query(AssetInstance).filter(AssetInstance.site_id == site_id).all()
    )
    zones = db.query(Zone).filter(Zone.site_id == site_id).all()
    assets = db.query(Asset).all()
    return TwinOut(
        site=SiteOut.model_validate(site),
        nodes=nodes,
        assets=assets,
        instances=instances,
        zones=zones,
    )


# ---------- Instances (manual builder) ----------


@router.post("/sites/{site_id}/instances", response_model=AssetInstanceOut)
def create_instance(
    site_id: str, body: AssetInstanceCreate, db: Session = Depends(get_db)
):
    if db.get(Site, site_id) is None:
        raise HTTPException(404, "site not found")
    if db.get(Asset, body.asset_id) is None:
        raise HTTPException(400, "unknown asset_id")

    data = body.model_dump()
    parent_node_id = data.pop("parent_node_id", None)
    inst_id = f"ai-{uuid.uuid4().hex[:10]}"

    if parent_node_id is not None and data.get("node_id") is None:
        if db.get(HierarchyNode, parent_node_id) is None:
            raise HTTPException(400, "unknown parent_node_id")
        node = HierarchyNode(
            id=f"nd-{inst_id}",
            site_id=site_id,
            parent_id=parent_node_id,
            name=data["name"],
            level="machine",
            sort_order=999,
        )
        db.add(node)
        data["node_id"] = node.id

    inst = AssetInstance(id=inst_id, site_id=site_id, **data)
    db.add(inst)
    db.commit()
    return inst


@router.patch("/instances/{instance_id}", response_model=AssetInstanceOut)
def update_instance(
    instance_id: str, body: AssetInstanceUpdate, db: Session = Depends(get_db)
):
    inst = db.get(AssetInstance, instance_id)
    if inst is None:
        raise HTTPException(404, "instance not found")
    if body.asset_id is not None and db.get(Asset, body.asset_id) is None:
        raise HTTPException(400, "unknown asset_id")
    if body.node_id is not None:
        node = db.get(HierarchyNode, body.node_id)
        if node is None or node.site_id != inst.site_id:
            raise HTTPException(400, "node_id is not part of this site")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(inst, field, value)
    if body.name is not None and inst.node_id:
        node = db.get(HierarchyNode, inst.node_id)
        if node is not None and node.level == "machine":
            node.name = body.name
    db.commit()
    return inst


@router.delete("/instances/{instance_id}", status_code=204)
def delete_instance(instance_id: str, db: Session = Depends(get_db)):
    inst = db.get(AssetInstance, instance_id)
    if inst is None:
        raise HTTPException(404, "instance not found")
    node = db.get(HierarchyNode, inst.node_id) if inst.node_id else None
    db.query(Annotation).filter(Annotation.instance_id == instance_id).delete()
    db.delete(inst)
    if node is not None and node.level == "machine":
        db.delete(node)
    db.commit()


# ---------- Zones ----------


@router.post("/sites/{site_id}/zones", response_model=ZoneOut)
def create_zone(site_id: str, body: ZoneCreate, db: Session = Depends(get_db)):
    if db.get(Site, site_id) is None:
        raise HTTPException(404, "site not found")
    zone = Zone(id=f"zn-{uuid.uuid4().hex[:10]}", site_id=site_id, **body.model_dump())
    db.add(zone)
    db.commit()
    return zone


@router.delete("/zones/{zone_id}", status_code=204)
def delete_zone(zone_id: str, db: Session = Depends(get_db)):
    zone = db.get(Zone, zone_id)
    if zone is None:
        raise HTTPException(404, "zone not found")
    db.delete(zone)
    db.commit()


# ---------- Layout versions (PRD 7.9) ----------


def _snapshot(db: Session, site_id: str) -> dict:
    instances = db.query(AssetInstance).filter(AssetInstance.site_id == site_id).all()
    zones = db.query(Zone).filter(Zone.site_id == site_id).all()
    machine_nodes = (
        db.query(HierarchyNode)
        .filter(HierarchyNode.site_id == site_id, HierarchyNode.level == "machine")
        .all()
    )
    return {
        "instances": [
            {
                "id": i.id,
                "asset_id": i.asset_id,
                "node_id": i.node_id,
                "name": i.name,
                "x": i.x,
                "y": i.y,
                "z": i.z,
                "rotation_y": i.rotation_y,
                "source": i.source,
            }
            for i in instances
        ],
        "zones": [
            {
                "id": z.id,
                "name": z.name,
                "x": z.x,
                "z": z.z,
                "w": z.w,
                "d": z.d,
                "color": z.color,
            }
            for z in zones
        ],
        "machine_nodes": [
            {
                "id": n.id,
                "parent_id": n.parent_id,
                "name": n.name,
                "sort_order": n.sort_order,
            }
            for n in machine_nodes
        ],
    }


@router.get("/sites/{site_id}/layout-versions", response_model=list[LayoutVersionOut])
def list_layout_versions(site_id: str, db: Session = Depends(get_db)):
    return (
        db.query(LayoutVersion)
        .filter(LayoutVersion.site_id == site_id)
        .order_by(LayoutVersion.created_at.desc())
        .all()
    )


@router.post("/sites/{site_id}/layout-versions", response_model=LayoutVersionOut)
def save_layout_version(
    site_id: str, body: LayoutVersionCreate, db: Session = Depends(get_db)
):
    if db.get(Site, site_id) is None:
        raise HTTPException(404, "site not found")
    version = LayoutVersion(
        id=f"lv-{uuid.uuid4().hex[:10]}",
        site_id=site_id,
        label=body.label,
        snapshot=_snapshot(db, site_id),
    )
    db.add(version)
    db.commit()
    return version


@router.post("/layout-versions/{version_id}/restore", response_model=LayoutVersionOut)
def restore_layout_version(version_id: str, db: Session = Depends(get_db)):
    version = db.get(LayoutVersion, version_id)
    if version is None:
        raise HTTPException(404, "version not found")
    site_id = version.site_id
    snap = version.snapshot

    # Wipe current layout (annotations on removed instances go too)
    db.query(Annotation).filter(Annotation.site_id == site_id).delete()
    db.query(AssetInstance).filter(AssetInstance.site_id == site_id).delete()
    db.query(Zone).filter(Zone.site_id == site_id).delete()
    db.query(HierarchyNode).filter(
        HierarchyNode.site_id == site_id, HierarchyNode.level == "machine"
    ).delete()
    db.flush()

    for n in snap.get("machine_nodes", []):
        db.add(
            HierarchyNode(
                id=n["id"],
                site_id=site_id,
                parent_id=n["parent_id"],
                name=n["name"],
                level="machine",
                sort_order=n.get("sort_order", 0),
            )
        )
    for i in snap.get("instances", []):
        db.add(AssetInstance(site_id=site_id, **i))
    for z in snap.get("zones", []):
        db.add(Zone(site_id=site_id, **z))
    db.commit()
    return version


# ---------- Annotations ----------


@router.get("/sites/{site_id}/annotations", response_model=list[AnnotationOut])
def list_annotations(site_id: str, db: Session = Depends(get_db)):
    return (
        db.query(Annotation)
        .filter(Annotation.site_id == site_id)
        .order_by(Annotation.created_at.desc())
        .all()
    )


@router.post("/sites/{site_id}/annotations", response_model=AnnotationOut)
def create_annotation(
    site_id: str, body: AnnotationCreate, db: Session = Depends(get_db)
):
    if db.get(Site, site_id) is None:
        raise HTTPException(404, "site not found")
    ann = Annotation(id=f"ann-{uuid.uuid4().hex[:10]}", site_id=site_id, **body.model_dump())
    db.add(ann)
    db.commit()
    return ann


@router.delete("/annotations/{annotation_id}", status_code=204)
def delete_annotation(annotation_id: str, db: Session = Depends(get_db)):
    ann = db.get(Annotation, annotation_id)
    if ann is None:
        raise HTTPException(404, "annotation not found")
    db.delete(ann)
    db.commit()
