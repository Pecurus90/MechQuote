from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import logging
import mimetypes
import os
import uuid

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.core.upload_validation import content_matches_ext
from app.models import Part, ManufacturingPhase, PartFile, Quote, User, CompanySettings
from app.schemas import PartCreate, PartUpdate, PartOut, PartCloneRequest, ApplyMarginRequest
from app.services.calculation import recalculate_part, recalculate_quote
from app.services.material_status import unassigned_supplier_parts
from app.services import quote_workflow as wf
from app.services.notifications import create_notification, emit_activity
from app.api.quotes import ensure_editable, ensure_quote_visible

logger = logging.getLogger(__name__)
_can_write = require_permission('quotes.create')


def _quote_for_part(part_id: int, db: Session) -> Quote:
    quote = db.query(Quote).join(Part, Part.quote_id == Quote.id).filter(Part.id == part_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Parte non trovata")
    return quote

router = APIRouter(prefix="/api", tags=["parts"])


def _load_part_full(part_id: int, db: Session) -> Optional[Part]:
    """Carica una Part con tutte le relazioni per `PartOut` (fasi + catalogo
    machine/operation/treatment/supplier, materiale, file) — fonte unica del
    blocco `joinedload`, prima ripetuto in add/get/update/duplicate.

    CAT-1 Fase 2: PhaseOut espone machine/operation/treatment/supplier per
    costruire l'option "ritirato" nelle dropdown del preventivatore; joinedload
    mirato per evitare N+1 (stesso pattern in `quotes._load_quote`).
    """
    return db.query(Part).options(
        joinedload(Part.phases).options(
            joinedload(ManufacturingPhase.machine),
            joinedload(ManufacturingPhase.operation),
            joinedload(ManufacturingPhase.treatment),
            joinedload(ManufacturingPhase.supplier),
        ),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == part_id).first()


def _assert_material_supplier_ok(db: Session, quote: Quote) -> None:
    """Guard spec 18 §2 esteso agli edit su preventivi ordinabili (confermato/
    completo): non lasciare materiale "da ordinare" senza fornitore, altrimenti
    il preventivo non potrebbe mai essere evaso e resterebbe bloccato in
    'confermato'. Chiamare dopo `db.flush()` e PRIMA del commit: se invalido,
    rollback della modifica + 400. No-op sui preventivi non ancora ordinabili
    (lì la guardia scatta alla Conferma).
    """
    if quote.status not in wf.ORDERABLE_STATUSES:
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
    # B-1: notifica atomica col cambio stato (un solo commit). Prima era su un
    # secondo commit → una morte del processo fra i due lasciava il preventivo
    # riaperto senza avviso. `quote_reopened` non ha dedupe UNIQUE → commit=False
    # è sicuro.
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
            commit=False,
        )
    db.commit()
    if was_completo and quote.status == wf.STATUS_CONFERMATO:
        emit_activity(
            db,
            type='quote_reopened',
            title=f"Preventivo {quote.quote_number} riaperto",
            body=f"Una modifica ha reso il materiale di nuovo da ordinare ({user.full_name or user.username})",
            created_by_user_id=user.id,
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
    # Margine materializzato (Blocco A): la parte nasce col margine esplicito del
    # preventivo, non NULL-che-eredita. Override per-parte poi via PUT /parts.
    if "margin_percent" not in part_data:
        part_data["margin_percent"] = quote.global_margin_percent
    part = Part(quote_id=quote_id, **part_data)
    db.add(part)
    db.flush()
    _assert_material_supplier_ok(db, quote)   # #3: guard su preventivo ordinabile
    db.commit()
    db.refresh(part)
    recalculate_part(part.id, db)
    _reconcile_after_write(db, quote, current_user)   # #2: riconcilia stato
    return _load_part_full(part.id, db)


@router.get("/parts/{part_id}", response_model=PartOut)
def get_part(
    part_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    part = _load_part_full(part_id, db)
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
    return _load_part_full(part_id, db)


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
        # Provenienza materiale: senza questi due flag la copia tornava
        # "fornitore normale" e il cost engine riaddebitava materiale/
        # spedizione/taglio, alzando il prezzo salvato (audit A1).
        customer_supplied_material=part.customer_supplied_material,
        material_from_stock=part.material_from_stock,
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

    # Copy phases via _clone_phase (stessa "ricetta" di clone-onto). H1/H3:
    # `dxf_profile_ids` NON si copia — i profili vivono sul file DXF della
    # sorgente, che il duplicate non trasferisce → copiarli lascerebbe un
    # riferimento dangling sul nuovo articolo. Il costo resta invariato:
    # `cut_length_mm`/`cut_height_mm` (trigger autocalc EDM) vengono copiati.
    for ph in part.phases:
        db.add(_clone_phase(ph, new_part.id))

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

    return _load_part_full(new_part.id, db)


# Campi "ricetta" copiati dalla sorgente sul target. NON include l'identità del
# target (part_code, revision, description, quantity, note, quote_mode, file).
_RECIPE_FIELDS = (
    'material_id', 'raw_x_mm', 'raw_y_mm', 'raw_z_mm', 'raw_diameter_mm',
    'raw_weight_kg', 'finished_weight_kg', 'material_cost', 'material_delivery_cost',
    'margin_percent', 'minimum_price', 'customer_supplied_material', 'material_from_stock',
)


def _clone_phase(src: ManufacturingPhase, target_part_id: int) -> ManufacturingPhase:
    return ManufacturingPhase(
        part_id=target_part_id,
        sequence_number=src.sequence_number,
        phase_type=src.phase_type,            # legacy DB col, NOT NULL
        operation_id=src.operation_id,
        description=src.description,
        machine_id=src.machine_id,
        supplier_id=src.supplier_id,
        treatment_id=src.treatment_id,
        setup_hours=src.setup_hours,
        cycle_hours_per_part=src.cycle_hours_per_part,
        fixed_cost=src.fixed_cost,
        variable_cost_per_part=src.variable_cost_per_part,
        hourly_rate_override=src.hourly_rate_override,
        internal_notes=src.internal_notes,
        customer_notes=src.customer_notes,
        # EDM: i campi numerici trigger dell'autocalc si copiano (il COSTO è
        # preservato). `dxf_profile_ids` NO: i profili vivono sul file DXF della
        # sorgente, non trasferibile → dangling reference sul target.
        cut_length_mm=src.cut_length_mm,
        cut_height_mm=src.cut_height_mm,
        cutting_cycle_id=src.cutting_cycle_id,
        n_pierce=src.n_pierce,
        dxf_profile_ids=None,
    )


@router.post("/parts/{source_id}/clone-onto")
def clone_part_onto(
    source_id: int,
    req: PartCloneRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    """Clona la RICETTA tecnica di una parte su altri articoli dello stesso
    preventivo (commessa), tenendo del target il codice, la quantità, la
    descrizione (la sua identità).

    Copiati: materiale + dimensioni grezzo + provenienza + pesi + costi
    materiale + margine/minimo + TUTTE le fasi (che SOSTITUISCONO quelle
    esistenti del target — clean-slate). Il ricalcolo usa la quantità del
    target, quindi i totali scalano correttamente.
    """
    source = db.query(Part).options(joinedload(Part.phases)).filter(Part.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Parte sorgente non trovata")
    quote = _quote_for_part(source_id, db)
    ensure_editable(quote, current_user)

    ids = list(dict.fromkeys(req.target_ids))   # dedup preservando l'ordine
    if not ids:
        raise HTTPException(status_code=400, detail="Nessun articolo di destinazione selezionato")
    if source_id in ids:
        raise HTTPException(status_code=400, detail="La sorgente non può essere anche destinazione")
    targets = db.query(Part).filter(Part.id.in_(ids)).all()
    if len(targets) != len(ids):
        raise HTTPException(status_code=404, detail="Un articolo di destinazione non esiste")
    for t in targets:
        if t.quote_id != source.quote_id:
            raise HTTPException(status_code=400, detail="Gli articoli devono essere dello stesso preventivo")

    for t in targets:
        for f in _RECIPE_FIELDS:
            setattr(t, f, getattr(source, f))
        db.query(ManufacturingPhase).filter(ManufacturingPhase.part_id == t.id).delete()
        db.flush()
        for ph in source.phases:
            db.add(_clone_phase(ph, t.id))
    db.commit()

    # Un solo recalcolo: recalculate_part ricalcola l'INTERO preventivo
    # (aggregazioni trattamenti/spedizioni + final_total).
    recalculate_part(targets[0].id, db)
    _reconcile_after_write(db, quote, current_user)

    return {"ok": True, "cloned": len(targets)}


@router.post("/quotes/{quote_id}/apply-margin")
def apply_margin_to_all(
    quote_id: int,
    req: ApplyMarginRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    """Imposta lo stesso margine su TUTTE le parti del preventivo (bulk esplicito
    — Blocco A). Aggiorna anche il default del preventivo, così le parti aggiunte
    dopo partono dallo stesso valore. Ogni parte resta poi sovrascrivibile."""
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_editable(quote, current_user)
    quote.global_margin_percent = req.margin_percent
    parts = db.query(Part).filter(Part.quote_id == quote_id).all()
    for p in parts:
        p.margin_percent = req.margin_percent
    db.commit()
    recalculate_quote(quote_id, db)
    return {"ok": True, "updated": len(parts), "margin_percent": req.margin_percent}


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
    # Validazione contenuto (magic bytes): il contenuto deve corrispondere
    # all'estensione dichiarata (difesa in profondità oltre alla whitelist).
    head = file.file.read(4096)
    if not content_matches_ext(head, ext):
        raise HTTPException(status_code=400, detail="Il contenuto del file non corrisponde all'estensione dichiarata.")
    bytes_written = len(head)
    with open(file_path, "wb") as buffer:
        buffer.write(head)
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


@router.get("/files/{file_id}")
def get_part_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serve un allegato di parte (disegno/documento) con AUTENTICAZIONE + ACL
    del preventivo. Inline (il browser apre PDF/immagini in tab); il download
    forzato lo fa il frontend via blob. Volutamente NON usa il mount statico
    /uploads (che è senza auth). Basta poter VEDERE il preventivo — nessun
    permesso di scrittura richiesto."""
    pf = db.query(PartFile).filter(PartFile.id == file_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="File non trovato")
    ensure_quote_visible(_quote_for_part(pf.part_id, db), current_user)
    if not os.path.exists(pf.path):
        raise HTTPException(status_code=404, detail="File non presente su disco")
    media = mimetypes.guess_type(pf.filename)[0] or "application/octet-stream"
    return FileResponse(pf.path, media_type=media, filename=pf.filename)
