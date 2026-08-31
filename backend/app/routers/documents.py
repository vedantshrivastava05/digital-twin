import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Asset, AssetInstance, Component, Document
from ..schemas import (
    ComponentCreate,
    ComponentOut,
    DocumentOut,
    DocumentSearchHit,
)

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".log", ".json", ".xml", ".yaml", ".yml"}
MAX_SEARCH_BYTES = 2_000_000


@router.post("/instances/{instance_id}/documents", response_model=DocumentOut)
def upload_document(
    instance_id: str, file: UploadFile, db: Session = Depends(get_db)
):
    inst = db.get(AssetInstance, instance_id)
    if inst is None:
        raise HTTPException(404, "instance not found")
    UPLOAD_DIR.mkdir(exist_ok=True)
    doc_id = f"doc-{uuid.uuid4().hex[:10]}"
    safe_name = Path(file.filename or "file").name
    dest = UPLOAD_DIR / f"{doc_id}_{safe_name}"
    content = file.file.read()
    dest.write_bytes(content)
    doc = Document(
        id=doc_id,
        site_id=inst.site_id,
        instance_id=instance_id,
        filename=safe_name,
        content_type=file.content_type or "application/octet-stream",
        size=len(content),
        path=str(dest),
    )
    db.add(doc)
    db.commit()
    return doc


@router.get("/instances/{instance_id}/documents", response_model=list[DocumentOut])
def list_documents(instance_id: str, db: Session = Depends(get_db)):
    return (
        db.query(Document)
        .filter(Document.instance_id == instance_id)
        .order_by(Document.uploaded_at.desc())
        .all()
    )


@router.get("/documents/{document_id}/download")
def download_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "document not found")
    path = Path(doc.path)
    if not path.exists():
        raise HTTPException(410, "file missing on disk")
    return FileResponse(path, filename=doc.filename, media_type=doc.content_type)


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "document not found")
    Path(doc.path).unlink(missing_ok=True)
    db.delete(doc)
    db.commit()


@router.get("/sites/{site_id}/documents/search", response_model=list[DocumentSearchHit])
def search_documents(site_id: str, q: str, db: Session = Depends(get_db)):
    """Search document filenames and the content of text files."""
    needle = q.strip().lower()
    if not needle:
        return []
    docs = db.query(Document).filter(Document.site_id == site_id).all()
    instances = {i.id: i for i in db.query(AssetInstance).all()}
    hits: list[DocumentSearchHit] = []
    for doc in docs:
        snippet = None
        matched = needle in doc.filename.lower()
        path = Path(doc.path)
        if (
            not matched
            and path.suffix.lower() in TEXT_EXTENSIONS
            and path.exists()
            and doc.size <= MAX_SEARCH_BYTES
        ):
            try:
                text = path.read_text(errors="ignore")
            except OSError:
                text = ""
            idx = text.lower().find(needle)
            if idx >= 0:
                matched = True
                start = max(0, idx - 60)
                snippet = text[start : idx + 90].replace("\n", " ").strip()
        if matched:
            inst = instances.get(doc.instance_id)
            hits.append(
                DocumentSearchHit(
                    document=DocumentOut.model_validate(doc),
                    instance_id=doc.instance_id,
                    instance_name=inst.name if inst else doc.instance_id,
                    snippet=snippet,
                )
            )
    return hits


# ---------- Component tree ----------


@router.get("/instances/{instance_id}/components", response_model=list[ComponentOut])
def list_components(instance_id: str, db: Session = Depends(get_db)):
    return db.query(Component).filter(Component.instance_id == instance_id).all()


@router.post("/instances/{instance_id}/components", response_model=ComponentOut)
def create_component(
    instance_id: str, body: ComponentCreate, db: Session = Depends(get_db)
):
    if db.get(AssetInstance, instance_id) is None:
        raise HTTPException(404, "instance not found")
    comp = Component(
        id=f"cmp-{uuid.uuid4().hex[:10]}",
        instance_id=instance_id,
        **body.model_dump(),
    )
    db.add(comp)
    db.commit()
    return comp


@router.delete("/components/{component_id}", status_code=204)
def delete_component(component_id: str, db: Session = Depends(get_db)):
    comp = db.get(Component, component_id)
    if comp is None:
        raise HTTPException(404, "component not found")

    def collect(target_id: str) -> list[Component]:
        children = db.query(Component).filter(Component.parent_id == target_id).all()
        result = []
        for child in children:
            result.extend(collect(child.id))
            result.append(child)
        return result

    for child in collect(component_id):
        db.delete(child)
    db.delete(comp)
    db.commit()


# ---------- QR label data ----------


@router.get("/sites/{site_id}/labels")
def label_sheet_data(site_id: str, db: Session = Depends(get_db)):
    instances = (
        db.query(AssetInstance).filter(AssetInstance.site_id == site_id).all()
    )
    assets = {a.id: a for a in db.query(Asset).all()}
    return [
        {
            "id": i.id,
            "name": i.name,
            "asset_name": assets[i.asset_id].name if i.asset_id in assets else "",
            "category": assets[i.asset_id].category if i.asset_id in assets else "",
        }
        for i in instances
    ]
