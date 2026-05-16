from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from typing import List
import logging
import os

from app.core.database import get_db
from app.core.security import require_permission, require_any_permission, get_current_user
from app.models import Part, ManufacturingPhase, PartFile, Quote, User, CompanySettings
from app.schemas import PartCreate, PartUpdate, PartOut
from app.services.calculation import recalculate_part, recalculate_quote
from app.api.quotes import ensure_editable

logger = logging.getLogger(__name__)
# Endpoint condiviso tra preventivi standard e stampi: chi modifica una Part
# può avere `quotes.create` (standard) OPPURE `dies.create` (stampi).
_can_write = require_any_permission('quotes.create', 'dies.create')


def _quote_for_part(part_id: int, db: Session) -> Quote:
    quote = db.query(Quote).join(Part, Part.quote_id == Quote.id).filter(Part.id == part_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Parte non trovata")
    return quote

router = APIRouter(prefix="/api", tags=["parts"])


@router.post("/quotes/{quote_id}/parts", response_model=PartOut)
def add_part(
    quote_id: int,
    data: PartCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_editable(quote, current_user)
    part_data = data.model_dump(exclude_unset=True)
    # Applica default_minimum_part_price se non specificato
    if "minimum_price" not in part_data:
        cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
        if cs:
            part_data["minimum_price"] = cs.default_minimum_part_price
    part = Part(quote_id=quote_id, **part_data)
    db.add(part)
    db.commit()
    db.refresh(part)
    recalculate_part(part.id, db)
    return db.query(Part).options(
        joinedload(Part.phases),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == part.id).first()


@router.get("/parts/{part_id}", response_model=PartOut)
def get_part(part_id: int, db: Session = Depends(get_db)):
    part = db.query(Part).options(
        joinedload(Part.phases),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Parte non trovata")
    return part


@router.put("/parts/{part_id}", response_model=PartOut)
def update_part(
    part_id: int,
    data: PartUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Parte non trovata")
    ensure_editable(_quote_for_part(part_id, db), current_user)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(part, key, value)
    db.commit()
    recalculate_part(part_id, db)
    part = db.query(Part).options(
        joinedload(Part.phases),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == part_id).first()
    return part


@router.delete("/parts/{part_id}")
def delete_part(
    part_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Parte non trovata")
    ensure_editable(_quote_for_part(part_id, db), current_user)
    # Salvo quote_id PRIMA del delete: dopo db.delete() la part esce dal DB
    # e non si può più leggere part.quote_id. Serve per ricalcolare le siblings.
    quote_id = part.quote_id
    db.delete(part)
    db.commit()
    # Ricalcolo dell'intero preventivo: senza, le siblings con stesso supplier
    # materiale o stesso trattamento batch restano con quote/batch vecchi
    # (la parte cancellata era contata nel Σ pesi).
    recalculate_quote(quote_id, db)
    return {"ok": True}


@router.post("/parts/{part_id}/duplicate", response_model=PartOut)
def duplicate_part(
    part_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    part = db.query(Part).options(joinedload(Part.phases)).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Parte non trovata")
    ensure_editable(_quote_for_part(part_id, db), current_user)

    new_part = Part(
        quote_id=part.quote_id,
        part_code=part.part_code + "_copia",
        revision=part.revision,
        description=part.description,
        quantity=part.quantity,
        quote_mode=part.quote_mode,
        material_id=part.material_id,
        raw_x_mm=part.raw_x_mm,
        raw_y_mm=part.raw_y_mm,
        raw_z_mm=part.raw_z_mm,
        raw_diameter_mm=part.raw_diameter_mm,
        raw_weight_kg=part.raw_weight_kg,
        finished_weight_kg=part.finished_weight_kg,
        material_cost=part.material_cost,
        material_delivery_cost=part.material_delivery_cost,
        margin_percent=part.margin_percent,
        minimum_price=part.minimum_price,
        customer_notes=part.customer_notes,
        internal_notes=part.internal_notes,
    )
    db.add(new_part)
    db.commit()
    db.refresh(new_part)

    # Copy phases
    for ph in part.phases:
        new_ph = ManufacturingPhase(
            part_id=new_part.id,
            sequence_number=ph.sequence_number,
            phase_type=ph.phase_type,           # legacy DB col, NOT NULL
            operation_id=ph.operation_id,        # FK Lavorazione (catalogo utente)
            description=ph.description,
            machine_id=ph.machine_id,
            supplier_id=ph.supplier_id,
            treatment_id=ph.treatment_id,
            setup_hours=ph.setup_hours,
            cycle_hours_per_part=ph.cycle_hours_per_part,
            fixed_cost=ph.fixed_cost,
            variable_cost_per_part=ph.variable_cost_per_part,
            hourly_rate_override=ph.hourly_rate_override,
            # is_shared rimosso dal modello
            internal_notes=ph.internal_notes,
            customer_notes=ph.customer_notes,
            # Wire EDM: parametri trigger autocalc. Senza questi il duplicate
            # perde l'autocalc e i tempi tornano a 0.
            cut_length_mm=ph.cut_length_mm,
            cut_height_mm=ph.cut_height_mm,
            cutting_cycle_id=ph.cutting_cycle_id,
            n_pierce=ph.n_pierce,
            dxf_profile_ids=ph.dxf_profile_ids,
        )
        db.add(new_ph)

    db.commit()
    recalculate_part(new_part.id, db)

    return db.query(Part).options(
        joinedload(Part.phases),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == new_part.id).first()


@router.post("/parts/{part_id}/files")
def upload_file(
    part_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Parte non trovata")
    ensure_editable(_quote_for_part(part_id, db), current_user)

    safe_filename = os.path.basename(file.filename or "upload").replace("..", "").strip("/\\")
    if not safe_filename:
        safe_filename = "upload"
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext == '.dxf':
        file_type = 'dxf'
    elif ext in ('.step', '.stp'):
        file_type = 'step'
    elif ext == '.pdf':
        file_type = 'pdf'
    elif ext in ('.png', '.jpg', '.jpeg', '.gif', '.bmp'):
        file_type = 'image'
    else:
        file_type = 'other'

    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/part_{part_id}_{safe_filename}"
    MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
    bytes_written = 0
    with open(file_path, "wb") as buffer:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > MAX_UPLOAD_BYTES:
                buffer.close()
                try:
                    os.remove(file_path)
                except OSError as e:
                    logger.warning("Cleanup oversize upload fallito: %s — %s", file_path, e)
                raise HTTPException(status_code=413, detail="File troppo grande (max 50 MB)")
            buffer.write(chunk)

    part_file = PartFile(
        part_id=part_id,
        file_type=file_type,
        filename=safe_filename,
        path=file_path,
    )
    db.add(part_file)
    db.commit()
    db.refresh(part_file)

    # NOTA: l'analisi DXF "vera" avviene via POST /api/dxf/analyze (services.dxf_parser)
    # invocato dal wizard "Nuovo Preventivo 2D". L'upload qui è solo persistenza file:
    # niente mini-parser inline, evita drift con il parser principale.

    return {"ok": True, "file_id": part_file.id, "path": file_path}


@router.delete("/files/{file_id}")
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    pf = db.query(PartFile).filter(PartFile.id == file_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="File non trovato")
    ensure_editable(_quote_for_part(pf.part_id, db), current_user)
    # Il blob fisico viene rimosso dal listener `before_delete` su PartFile (vedi models.py).
    db.delete(pf)
    db.commit()
    return {"ok": True}
