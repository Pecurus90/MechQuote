from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from typing import List
import logging
import os
import uuid

from app.core.database import get_db
from app.core.security import require_any_permission, get_current_user
from app.models import Part, ManufacturingPhase, PartFile, Quote, User, CompanySettings
from app.schemas import PartCreate, PartUpdate, PartOut
from app.core.quote_types import is_die
from app.services.calculation import recalculate_part, recalculate_quote
from app.services.material_status import unassigned_supplier_parts
from app.services import quote_workflow as wf
from app.services.notifications import create_notification
from app.api.quotes import ensure_editable, ensure_quote_visible

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


def _assert_material_supplier_ok(db: Session, quote: Quote) -> None:
    """Guard spec 18 §2 esteso agli edit su preventivi ordinabili (confermato/
    completo): non lasciare materiale "da ordinare" senza fornitore, altrimenti
    il preventivo non potrebbe mai essere evaso e resterebbe bloccato in
    'confermato'. Chiamare dopo `db.flush()` e PRIMA del commit: se invalido,
    rollback della modifica + 400. No-op sui preventivi non ancora ordinabili
    (lì la guardia scatta alla Conferma) e sugli stampi (materiale fuori scope).
    """
    if quote.status not in wf.ORDERABLE_STATUSES or is_die(quote):
        return
    parts = db.query(Part).options(joinedload(Part.material)).filter(
        Part.quote_id == quote.id
    ).all()
    missing = unassigned_supplier_parts(parts)
    if missing:
        db.rollback()
        codes = ', '.join(sorted(p.part_code for p in missing if p.part_code)) or f"{len(missing)} parti"
        raise HTTPException(
            status_code=400,
            detail=f"Preventivo confermato: il materiale di {codes} è senza fornitore. "
                   "Assegna un fornitore a quel materiale (catalogo Materiali) prima di salvare.",
        )


def _reconcile_after_write(db: Session, quote: Quote, user: User) -> None:
    """Riallinea flag materiale + stato lavorazione dopo un write su Part di un
    preventivo ordinabile (spec 18): un edit può aver reso il materiale risolto
    (confermato → completo) o non più risolto (completo → riapre a confermato).
    No-op sui preventivi non ordinabili. Vedi `wf.reconcile_material_state`.

    Se la modifica RIAPRE un preventivo completo (demote), avvisa il creatore:
    altrimenti il cambio di stato sarebbe silenzioso (allineato a delete_order).
    """
    was_completo = quote.status == wf.STATUS_COMPLETO
    if not wf.reconcile_material_state(db, quote, user.id):
        return
    db.commit()
    if was_completo and quote.status == wf.STATUS_CONFERMATO and quote.created_by_user_id:
        actor = user.full_name or user.username
        create_notification(
            db,
            type='quote_reopened',
            title=f"Preventivo {quote.quote_number} riaperto",
            body=f"Una modifica ha reso il materiale di nuovo da ordinare ({actor})",
            created_by_user_id=user.id,
            target_user_id=quote.created_by_user_id,
            data={'quote_id': quote.id, 'quote_number': quote.quote_number},
        )


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
    db.flush()
    _assert_material_supplier_ok(db, quote)   # #3: guard su preventivo ordinabile
    db.commit()
    db.refresh(part)
    recalculate_part(part.id, db)
    _reconcile_after_write(db, quote, current_user)   # #2: riconcilia stato
    return db.query(Part).options(
        joinedload(Part.phases).options(
            # CAT-1 Fase 2: PhaseOut espone machine/operation/treatment/
            # supplier per costruire l'option "ritirato" nelle dropdown
            # del preventivatore. Joinedload mirato per evitare N+1 nella
            # serializzazione (stesso pattern in `quotes._load_quote`).
            joinedload(ManufacturingPhase.machine),
            joinedload(ManufacturingPhase.operation),
            joinedload(ManufacturingPhase.treatment),
            joinedload(ManufacturingPhase.supplier),
        ),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == part.id).first()


@router.get("/parts/{part_id}", response_model=PartOut)
def get_part(
    part_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    part = db.query(Part).options(
        joinedload(Part.phases).options(
            # CAT-1 Fase 2: PhaseOut espone machine/operation/treatment/
            # supplier per costruire l'option "ritirato" nelle dropdown
            # del preventivatore. Joinedload mirato per evitare N+1 nella
            # serializzazione (stesso pattern in `quotes._load_quote`).
            joinedload(ManufacturingPhase.machine),
            joinedload(ManufacturingPhase.operation),
            joinedload(ManufacturingPhase.treatment),
            joinedload(ManufacturingPhase.supplier),
        ),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Parte non trovata")
    # AUD-23: ACL di proprietà, come le scritture di questo file. Senza,
    # chiunque leggeva costi/fasi/materiale di parti altrui iterando l'id.
    ensure_quote_visible(_quote_for_part(part_id, db), current_user)
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
    quote = _quote_for_part(part_id, db)
    ensure_editable(quote, current_user)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(part, key, value)
    db.flush()
    _assert_material_supplier_ok(db, quote)   # #3: guard su preventivo ordinabile
    db.commit()
    recalculate_part(part_id, db)
    _reconcile_after_write(db, quote, current_user)   # #2: riconcilia stato
    part = db.query(Part).options(
        joinedload(Part.phases).options(
            # CAT-1 Fase 2: PhaseOut espone machine/operation/treatment/
            # supplier per costruire l'option "ritirato" nelle dropdown
            # del preventivatore. Joinedload mirato per evitare N+1 nella
            # serializzazione (stesso pattern in `quotes._load_quote`).
            joinedload(ManufacturingPhase.machine),
            joinedload(ManufacturingPhase.operation),
            joinedload(ManufacturingPhase.treatment),
            joinedload(ManufacturingPhase.supplier),
        ),
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
    quote = _quote_for_part(part_id, db)
    ensure_editable(quote, current_user)
    # Salvo quote_id PRIMA del delete: dopo db.delete() la part esce dal DB
    # e non si può più leggere part.quote_id. Serve per ricalcolare le siblings.
    quote_id = part.quote_id
    db.delete(part)
    db.commit()
    # Ricalcolo dell'intero preventivo: senza, le siblings con stesso supplier
    # materiale o stesso trattamento batch restano con quote/batch vecchi
    # (la parte cancellata era contata nel Σ pesi).
    recalculate_quote(quote_id, db)
    # Eliminare una parte può risolvere il materiale (→ completo) o rimuoverne
    # l'ultima parte da ordinare: riconcilia lo stato del preventivo.
    _reconcile_after_write(db, quote, current_user)   # #2
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
    quote = _quote_for_part(part_id, db)
    ensure_editable(quote, current_user)

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
    db.flush()   # id senza commit: serve per copiare le fasi e per il guard #6

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

    db.flush()
    # NB: nessun _assert_material_supplier_ok qui (a differenza degli altri
    # edit). Duplicare copia una parte esistente con lo STESSO materiale/
    # fornitore dell'originale: non introduce una nuova parte "da ordinare senza
    # fornitore". Se l'originale era già senza fornitore è una condizione
    # preesistente (materiale che ha perso il fornitore in catalogo), non
    # causata dalla copia — bloccare la duplicazione manderebbe l'utente
    # (edit_locked) in un vicolo cieco. Lo stato materiale lo riallinea il
    # _reconcile_after_write sotto.
    db.commit()
    db.refresh(new_part)
    recalculate_part(new_part.id, db)
    _reconcile_after_write(db, quote, current_user)   # #2: riconcilia stato

    return db.query(Part).options(
        joinedload(Part.phases).options(
            # CAT-1 Fase 2: PhaseOut espone machine/operation/treatment/
            # supplier per costruire l'option "ritirato" nelle dropdown
            # del preventivatore. Joinedload mirato per evitare N+1 nella
            # serializzazione (stesso pattern in `quotes._load_quote`).
            joinedload(ManufacturingPhase.machine),
            joinedload(ManufacturingPhase.operation),
            joinedload(ManufacturingPhase.treatment),
            joinedload(ManufacturingPhase.supplier),
        ),
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
        # AUD-24: whitelist estensioni (come officina.py/materials.py). Il
        # catch-all 'other' accettava qualsiasi tipo → un .html/.svg servito
        # same-origin dal mount statico /uploads era stored XSS. Rifiuta.
        # NB: niente .svg (immagine ma eseguibile come markup).
        raise HTTPException(
            status_code=400,
            detail=f"Estensione non supportata: {ext or '(nessuna)'}. "
                   "Accettati: DXF, STEP/STP, PDF, immagini (PNG/JPG/GIF/BMP)",
        )

    os.makedirs("uploads", exist_ok=True)
    # Prefisso uuid nel path su disco: due upload con lo stesso nome non si
    # sovrascrivono più a vicenda (il nome originale resta come display in DB).
    file_path = f"uploads/part_{part_id}_{uuid.uuid4().hex[:8]}_{safe_filename}"
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
