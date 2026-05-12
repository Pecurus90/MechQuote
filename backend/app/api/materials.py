import logging
import os
import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.catalog_protect import block_if_in_use
from app.core.database import get_db
from app.core.security import require_permission
from app.models import Material, MaterialSupplier, Part
from app.schemas import (
    MaterialCreate, MaterialUpdate, MaterialOut,
    MaterialSupplierCreate, MaterialSupplierUpdate, MaterialSupplierOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["materials"])

# Scheda tecnica PDF: stesse regole del modulo officina documents
DATASHEET_DIR = "uploads/officina/materiali"
DATASHEET_MAX_BYTES = 50 * 1024 * 1024
_can_datasheet_write = require_permission('officina.write')
_can_datasheet_read = require_permission('officina')


# --- Material Suppliers ---
@router.get("/material-suppliers", response_model=List[MaterialSupplierOut])
def list_material_suppliers(db: Session = Depends(get_db)):
    return db.query(MaterialSupplier).order_by(MaterialSupplier.name).all()


@router.post("/material-suppliers", response_model=MaterialSupplierOut, dependencies=[require_permission('settings')])
def create_material_supplier(data: MaterialSupplierCreate, db: Session = Depends(get_db)):
    s = MaterialSupplier(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/material-suppliers/{sid}", response_model=MaterialSupplierOut, dependencies=[require_permission('settings')])
def update_material_supplier(sid: int, data: MaterialSupplierUpdate, db: Session = Depends(get_db)):
    s = db.query(MaterialSupplier).filter(MaterialSupplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Fornitore materiali non trovato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/material-suppliers/{sid}", dependencies=[require_permission('settings')])
def delete_material_supplier(sid: int, db: Session = Depends(get_db)):
    s = db.query(MaterialSupplier).filter(MaterialSupplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Fornitore materiali non trovato")
    block_if_in_use(
        db, f"Fornitore materiali '{s.name}'",
        (Material, Material.supplier_id == s.id, "materiale", "materiali"),
    )
    db.delete(s)
    db.commit()
    return {"ok": True}


# --- Materials ---
@router.get("/materials", response_model=List[MaterialOut])
def list_materials(db: Session = Depends(get_db)):
    return db.query(Material).options(joinedload(Material.material_supplier)).order_by(Material.name).all()


@router.post("/materials", response_model=MaterialOut, dependencies=[require_permission('settings')])
def create_material(data: MaterialCreate, db: Session = Depends(get_db)):
    m = Material(**data.model_dump())
    db.add(m)
    db.commit()
    return db.query(Material).options(joinedload(Material.material_supplier)).filter(Material.id == m.id).first()


@router.put("/materials/{mid}", response_model=MaterialOut, dependencies=[require_permission('settings')])
def update_material(mid: int, data: MaterialUpdate, db: Session = Depends(get_db)):
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    return db.query(Material).options(joinedload(Material.material_supplier)).filter(Material.id == mid).first()


@router.delete("/materials/{mid}", dependencies=[require_permission('settings')])
def delete_material(mid: int, db: Session = Depends(get_db)):
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    block_if_in_use(
        db, f"Materiale '{m.name}'",
        (Part, Part.material_id == m.id, "parte", "parti"),
    )
    # Cleanup datasheet blob se presente (no listener globale, pulizia inline)
    if m.datasheet_path and os.path.exists(m.datasheet_path):
        try:
            os.remove(m.datasheet_path)
        except OSError as e:
            logger.warning("Cleanup datasheet blob %s fallito: %s", m.datasheet_path, e)
    db.delete(m)
    db.commit()
    return {"ok": True}


# --- Datasheet PDF allegato al material -------------------------------------

@router.post("/materials/{mid}/datasheet", response_model=MaterialOut)
def upload_datasheet(
    mid: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=_can_datasheet_write,
):
    """Upload PDF scheda tecnica per il materiale. Sostituisce eventuale
    file precedente (rimuove vecchio blob). Solo PDF, max 50 MB."""
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")

    safe_filename = os.path.basename(file.filename or "scheda.pdf").replace("..", "").strip("/\\")
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext != '.pdf':
        raise HTTPException(400, "Solo file PDF accettati")
    if file.content_type and file.content_type != 'application/pdf':
        raise HTTPException(400, f"MIME non supportato: {file.content_type}")

    os.makedirs(DATASHEET_DIR, exist_ok=True)
    unique_name = f"mat_{mid}_{int(time.time())}_{safe_filename}"
    new_path = os.path.join(DATASHEET_DIR, unique_name)

    bytes_written = 0
    with open(new_path, "wb") as buf:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > DATASHEET_MAX_BYTES:
                buf.close()
                try:
                    os.remove(new_path)
                except OSError:
                    pass
                raise HTTPException(413, "File troppo grande (max 50 MB)")
            buf.write(chunk)

    # Rimuovi vecchio datasheet se sostituiamo
    old_path = m.datasheet_path
    m.datasheet_path = new_path
    db.commit()
    if old_path and old_path != new_path and os.path.exists(old_path):
        try:
            os.remove(old_path)
        except OSError as e:
            logger.warning("Cleanup vecchio datasheet %s fallito: %s", old_path, e)

    return db.query(Material).options(joinedload(Material.material_supplier)).filter(Material.id == mid).first()


@router.get("/materials/{mid}/datasheet")
def download_datasheet(mid: int, db: Session = Depends(get_db), _=_can_datasheet_read):
    """Streaming download PDF scheda tecnica. 404 se non allegato."""
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    if not m.datasheet_path:
        raise HTTPException(404, "Nessuna scheda tecnica allegata")
    if not os.path.exists(m.datasheet_path):
        raise HTTPException(404, "Scheda non trovata su disco")
    return FileResponse(
        m.datasheet_path,
        media_type="application/pdf",
        filename=f"scheda_{m.name}.pdf",
    )


@router.delete("/materials/{mid}/datasheet", response_model=MaterialOut)
def delete_datasheet(mid: int, db: Session = Depends(get_db), _=_can_datasheet_write):
    """Rimuove scheda tecnica (record + blob su disco)."""
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    if not m.datasheet_path:
        raise HTTPException(404, "Nessuna scheda tecnica allegata")
    blob = m.datasheet_path
    m.datasheet_path = None
    db.commit()
    if blob and os.path.exists(blob):
        try:
            os.remove(blob)
        except OSError as e:
            logger.warning("Cleanup datasheet on delete %s fallito: %s", blob, e)
    return db.query(Material).options(joinedload(Material.material_supplier)).filter(Material.id == mid).first()
