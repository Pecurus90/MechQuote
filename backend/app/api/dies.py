"""API per il modulo Preventivatore Stampi.

Endpoint:
  POST   /api/dies                       — crea Quote(quote_type='die') + DieSpec
                                            (+ Part piastre se template_id)
  GET    /api/dies/{quote_id}            — alias GET /api/quotes/{id} con
                                            joinedload mirato (die_spec, normalized).
  PUT    /api/dies/{quote_id}/spec       — aggiorna DieSpec (incluso override matita)
  POST   /api/dies/{quote_id}/recalculate — ricalcola e ritorna lo snapshot DieSpec
  POST   /api/dies/{quote_id}/clone      — duplica come revisione (_rev2, _rev3, …)
  POST   /api/dies/{quote_id}/apply-template/{template_id}
                                          — applica template clean-slate (drop parts
                                            esistenti, crea nuove piastre)
  GET    /api/dies/{quote_id}/find-similar — top-5 stampi simili (subtype + area)
"""
import logging
import os
import shutil
from datetime import date as date_type
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import (
    Quote, Part, PartFile, DieSpec, DieTemplate,
    DieNormalizedItem, DieSettings,
    CompanySettings, User,
)
from app.schemas import (
    DieQuoteCreate, DieSpecOut, DieSpecUpdate, QuoteOut,
)
from app.services.calculation import (
    recalculate_die_quote, _compute_castle_dimensions,
)
from app.core.expression_eval import evaluate_quantity_formula
from app.api.quotes import ensure_editable, _load_quote

logger = logging.getLogger(__name__)
_can_write = require_permission('dies.create')

router = APIRouter(prefix="/api/dies", tags=["dies"])


def _formula_variables(spec: DieSpec) -> dict:
    """Costruisce il dict di variabili passate al valutatore di
    `quantity_formula`. Mantieni la whitelist coerente con
    `evaluate_quantity_formula` documentazione (UI + test)."""
    castle_x, castle_y = _compute_castle_dimensions(spec)
    return {
        'n_stations':         spec.n_stations or 1,
        'n_bends_total':      ((spec.n_bends_simple or 0) + (spec.n_bends_medium or 0) + (spec.n_bends_complex or 0)),
        'n_punches_total':    ((spec.n_punches_simple or 0) + (spec.n_punches_medium or 0) + (spec.n_punches_complex or 0)),
        'area_castello_dm2':  round((castle_x * castle_y) / 10_000.0, 4),
        'castle_x_mm':        castle_x,
        'castle_y_mm':        castle_y,
        'bbox_x_mm':          spec.bbox_x_mm or 0.0,
        'bbox_y_mm':          spec.bbox_y_mm or 0.0,
    }


def _create_normalized_from_template(
    quote: Quote, template: DieTemplate, spec: DieSpec, db: Session,
) -> None:
    """Sprint C — auto-genera DieNormalizedItem dal template BoM scalabile.

    Per ogni DieTemplateNormalized del template, valuta `quantity_formula`
    nel contesto della spec corrente e crea un item nel preventivo.
    **Skip-if-exists** sulla `description`: se l'utente ha già un item con
    quella descrizione (es. dopo apply-template successivo a edit manuale),
    non lo sovrascrive.
    """
    variables = _formula_variables(spec)
    existing_descriptions = {
        it.description for it in db.query(DieNormalizedItem).filter(
            DieNormalizedItem.quote_id == quote.id
        ).all()
    }
    for tpl_norm in template.normalized_items:
        if tpl_norm.description in existing_descriptions:
            continue
        qty = evaluate_quantity_formula(tpl_norm.quantity_formula or '1', variables)
        if qty <= 0:
            continue
        db.add(DieNormalizedItem(
            quote_id=quote.id,
            normalized_supplier_id=tpl_norm.normalized_supplier_id,
            description=tpl_norm.description,
            quantity=qty,
            unit_price=tpl_norm.unit_price_default or 0.0,
        ))


def _create_plates_from_template(quote: Quote, template: DieTemplate, db: Session) -> None:
    """Crea le Part-piastre del castello a partire dalle righe del template.

    raw_x/raw_y restano None: verranno auto-compilate da `recalculate_die_quote`
    leggendo le dimensioni castello dalla DieSpec. raw_z = thickness del template.

    Sprint B: i 5 parametri produttività (setup_h, n_milled, n_ground, n_drilled,
    station_bonus_h) vengono copiati come snapshot su Part. Così il preventivo
    resta ricalcolabile identico anche se il template di partenza cambia.
    L'utente può modificarli per il singolo preventivo senza toccare il template.
    """
    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    default_min = (cs.default_minimum_part_price if cs else 0.0) or 0.0
    for tpl_plate in template.plates:
        part = Part(
            quote_id=quote.id,
            part_code=f"{quote.quote_number}_{tpl_plate.plate_role}",
            quantity=1,
            quote_mode="manual",
            plate_role=tpl_plate.plate_role,
            raw_z_mm=tpl_plate.default_thickness_mm,
            material_id=tpl_plate.default_material_id,
            minimum_price=default_min,
            # Snapshot Sprint B
            die_setup_h=tpl_plate.setup_hours_fixed,
            die_n_milled_faces=tpl_plate.n_milled_faces,
            die_n_ground_faces=tpl_plate.n_ground_faces,
            die_n_drilled_faces=tpl_plate.n_drilled_faces,
            die_station_bonus_h=tpl_plate.station_bonus_hours,
        )
        db.add(part)


@router.post("", response_model=QuoteOut)
def create_die_quote(
    data: DieQuoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    if db.query(Quote).filter(Quote.quote_number == data.quote_number).first():
        raise HTTPException(status_code=400, detail=f"Numero preventivo '{data.quote_number}' già esistente")

    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    die_settings = db.query(DieSettings).filter(DieSettings.id == 1).first()

    quote = Quote(
        quote_number=data.quote_number,
        quote_type='die',
        customer_id=data.customer_id,
        customer_name=data.customer_name,
        customer_reference=data.customer_reference,
        quote_date=date_type.today(),
        notes_customer=data.notes_customer,
        notes_internal=data.notes_internal,
        created_by_user_id=current_user.id,
    )
    if die_settings:
        quote.global_margin_percent = die_settings.default_margin_percent
    elif cs:
        quote.global_margin_percent = cs.default_margin_percent
    if cs:
        quote.transport_cost = cs.default_transport_cost
        quote.packaging_cost = cs.default_packaging_cost

    db.add(quote)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Numero preventivo '{data.quote_number}' già esistente",
        )
    db.refresh(quote)

    spec_data = data.spec.model_dump(exclude_unset=True)
    # Default castle offset da DieSettings se l'utente non li ha specificati.
    if die_settings:
        if spec_data.get('castle_offset_x_mm') is None:
            spec_data['castle_offset_x_mm'] = die_settings.default_castle_offset_x_mm
        if spec_data.get('castle_offset_y_mm') is None:
            spec_data['castle_offset_y_mm'] = die_settings.default_castle_offset_y_mm
    spec = DieSpec(quote_id=quote.id, **spec_data)
    db.add(spec)
    db.commit()

    if data.template_id:
        template = db.query(DieTemplate).options(
            joinedload(DieTemplate.plates),
            joinedload(DieTemplate.normalized_items),
        ).filter(DieTemplate.id == data.template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template non trovato")
        _create_plates_from_template(quote, template, db)
        # Sprint C — BoM normalizzati auto-popolata.
        _create_normalized_from_template(quote, template, spec, db)
        db.commit()

    # Recalc per popolare snapshot DieSpec + auto-fill X/Y piastre.
    recalculate_die_quote(quote.id, db)
    logger.info("Stampo creato: id=%s number=%r by=%s template_id=%s",
                quote.id, quote.quote_number, current_user.username, data.template_id)
    return _load_quote(quote.id, db)


@router.get("/{quote_id}", response_model=QuoteOut)
def get_die_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quote = _load_quote(quote_id, db)
    if not quote or quote.quote_type != 'die':
        raise HTTPException(status_code=404, detail="Preventivo stampo non trovato")
    return quote


@router.put("/{quote_id}/spec", response_model=DieSpecOut)
def update_die_spec(
    quote_id: int,
    data: DieSpecUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote or quote.quote_type != 'die':
        raise HTTPException(status_code=404, detail="Preventivo stampo non trovato")
    ensure_editable(quote, current_user)
    spec = db.query(DieSpec).filter(DieSpec.quote_id == quote_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Spec stampo non trovata")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(spec, k, v)
    db.commit()
    recalculate_die_quote(quote_id, db)
    db.refresh(spec)
    return spec


@router.post("/{quote_id}/recalculate", response_model=DieSpecOut)
def recalculate_endpoint(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote or quote.quote_type != 'die':
        raise HTTPException(status_code=404, detail="Preventivo stampo non trovato")
    ensure_editable(quote, current_user)
    recalculate_die_quote(quote_id, db)
    spec = db.query(DieSpec).filter(DieSpec.quote_id == quote_id).first()
    return spec


@router.post("/{quote_id}/clone", response_model=QuoteOut)
def clone_die_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    """Duplica come revisione: aggiunge suffisso `_rev2`, `_rev3`, … al quote_number.

    Copia spec + piastre. Status reset a 'bozza'. Costi snapshot ricalcolati.
    """
    src = _load_quote(quote_id, db)
    if not src or src.quote_type != 'die':
        raise HTTPException(status_code=404, detail="Preventivo stampo non trovato")

    # Determina suffisso revisione successivo: scansiona quote_number tipo
    # 'BASE_revN' con N max esistente + 1; se non c'è suffisso, _rev2.
    base_number = src.quote_number
    rev = 2
    if '_rev' in base_number:
        base_number, _, n = base_number.rpartition('_rev')
        try:
            rev = int(n) + 1
        except ValueError:
            rev = 2
    new_number = f"{base_number}_rev{rev}"
    while db.query(Quote).filter(Quote.quote_number == new_number).first():
        rev += 1
        new_number = f"{base_number}_rev{rev}"

    new_quote = Quote(
        quote_number=new_number,
        quote_type='die',
        customer_id=src.customer_id,
        customer_name=src.customer_name,
        customer_reference=src.customer_reference,
        quote_date=date_type.today(),
        global_margin_percent=src.global_margin_percent,
        global_discount_percent=src.global_discount_percent,
        transport_cost=src.transport_cost,
        packaging_cost=src.packaging_cost,
        notes_customer=src.notes_customer,
        notes_internal=src.notes_internal,
        created_by_user_id=current_user.id,
        status='bozza',
    )
    db.add(new_quote)
    db.commit()
    db.refresh(new_quote)

    if src.die_spec:
        spec_copy = {c.name: getattr(src.die_spec, c.name)
                     for c in src.die_spec.__table__.columns
                     if c.name != 'quote_id'}
        # Snapshot costi resettati: verranno ricalcolati.
        for k in ('cost_material', 'cost_normalized', 'cost_machining',
                  'cost_machining_edm', 'cost_machining_mech',
                  'cost_accessories', 'cost_industrial'):
            spec_copy[k] = 0.0
        db.add(DieSpec(quote_id=new_quote.id, **spec_copy))

    for src_part in src.parts:
        new_part = Part(
            quote_id=new_quote.id,
            part_code=src_part.part_code,
            quantity=src_part.quantity,
            plate_role=src_part.plate_role,
            material_id=src_part.material_id,
            raw_z_mm=src_part.raw_z_mm,
            minimum_price=src_part.minimum_price,
            margin_percent=src_part.margin_percent,
            # Snapshot Sprint B — propaga la configurazione di lavorazione piastra
            die_setup_h=src_part.die_setup_h,
            die_n_milled_faces=src_part.die_n_milled_faces,
            die_n_ground_faces=src_part.die_n_ground_faces,
            die_n_drilled_faces=src_part.die_n_drilled_faces,
            die_station_bonus_h=src_part.die_station_bonus_h,
        )
        db.add(new_part)
        db.flush()  # serve new_part.id per il nuovo path file

        # Copia i PartFile (tipicamente il DXF della piastra): clone blob
        # fisico per evitare che il delete del src cancelli anche il file
        # della revisione (listener PartFile.before_delete in models.py).
        for src_file in src_part.files:
            if not src_file.path or not os.path.exists(src_file.path):
                continue
            new_path = f"uploads/part_{new_part.id}_{src_file.filename}"
            try:
                os.makedirs("uploads", exist_ok=True)
                shutil.copyfile(src_file.path, new_path)
            except OSError as e:
                logger.warning(
                    "Clone stampo: copia file fallita src=%s → %s: %s",
                    src_file.path, new_path, e,
                )
                continue
            db.add(PartFile(
                part_id=new_part.id,
                file_type=src_file.file_type,
                filename=src_file.filename,
                path=new_path,
            ))

    db.commit()
    recalculate_die_quote(new_quote.id, db)
    logger.info("Stampo clonato: src=%s → new=%s by=%s", quote_id, new_quote.id, current_user.username)
    return _load_quote(new_quote.id, db)


@router.post("/{quote_id}/apply-template/{template_id}", response_model=QuoteOut)
def apply_template(
    quote_id: int,
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    """Applica template clean-slate: drop tutte le Part esistenti e crea le piastre
    del template. La BoM normalizzati (Sprint C) viene aggiunta in modalità
    skip-if-exists: l'utente non perde gli item già editati manualmente."""
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote or quote.quote_type != 'die':
        raise HTTPException(status_code=404, detail="Preventivo stampo non trovato")
    ensure_editable(quote, current_user)
    template = db.query(DieTemplate).options(
        joinedload(DieTemplate.plates),
        joinedload(DieTemplate.normalized_items),
    ).filter(DieTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template non trovato")

    db.query(Part).filter(Part.quote_id == quote_id).delete()
    db.commit()

    _create_plates_from_template(quote, template, db)
    # Sprint C — aggiungi BoM normalizzati mancanti (skip su description esistenti).
    spec = db.query(DieSpec).filter(DieSpec.quote_id == quote_id).first()
    if spec:
        _create_normalized_from_template(quote, template, spec, db)
    db.commit()
    recalculate_die_quote(quote_id, db)
    return _load_quote(quote_id, db)


def _find_similar_quotes(
    target_subtype: str,
    target_area_dm2: float,
    target_bends: int,
    target_punches: int,
    exclude_quote_id: Optional[int],
    db: Session,
) -> Tuple[List[Quote], dict]:
    """Helper riusabile: ritorna top-5 stampi simili + stats ratio.
    Criteri matching:
      - stesso die_subtype
      - area castello entro ±30%
      - n. pieghe totali entro ±2
      - n. punzoni totali entro ±2
    Stats calcolate sui matches che hanno popolato `sold_price`/`actual_cost`.
    """
    others_query = db.query(Quote).options(joinedload(Quote.die_spec)).filter(
        Quote.quote_type == 'die',
    )
    if exclude_quote_id is not None:
        others_query = others_query.filter(Quote.id != exclude_quote_id)
    others = others_query.all()

    def _matches(q: Quote) -> bool:
        if not q.die_spec or q.die_spec.die_subtype != target_subtype:
            return False
        cx, cy = _compute_castle_dimensions(q.die_spec)
        a = (cx * cy) / 10_000.0
        if target_area_dm2 == 0:
            if a != 0:
                return False
        elif not (0.7 <= (a / target_area_dm2) <= 1.3):
            return False
        bends = (
            (q.die_spec.n_bends_simple or 0)
            + (q.die_spec.n_bends_medium or 0)
            + (q.die_spec.n_bends_complex or 0)
        )
        if abs(bends - target_bends) > 2:
            return False
        punches = (
            (q.die_spec.n_punches_simple or 0)
            + (q.die_spec.n_punches_medium or 0)
            + (q.die_spec.n_punches_complex or 0)
        )
        if abs(punches - target_punches) > 2:
            return False
        return True

    matches = sorted(
        (q for q in others if _matches(q)),
        key=lambda q: q.created_at,
        reverse=True,
    )[:5]

    # Sprint G — stats ratio sui matches con dati di chiusura commessa.
    sold_ratios = [
        q.sold_price / q.die_spec.cost_industrial
        for q in matches
        if q.sold_price and q.die_spec and q.die_spec.cost_industrial
    ]
    cost_ratios = [
        q.actual_cost / q.die_spec.cost_industrial
        for q in matches
        if q.actual_cost and q.die_spec and q.die_spec.cost_industrial
    ]
    stats = {
        'n_with_sold_price': len(sold_ratios),
        'avg_sold_to_quoted_ratio': round(sum(sold_ratios) / len(sold_ratios), 3) if sold_ratios else None,
        'n_with_actual_cost': len(cost_ratios),
        'avg_cost_to_quoted_ratio': round(sum(cost_ratios) / len(cost_ratios), 3) if cost_ratios else None,
    }
    return matches, stats


@router.get("/{quote_id}/find-similar")
def find_similar(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Top-5 preventivi stampo simili al `quote_id` (per area castello ±30%,
    pieghe ±2, punzoni ±2, stesso subtype) + stats ratio venduto/consuntivo
    sui simili che hanno dati di chiusura commessa popolati.

    Risposta: `{ similar: List[QuoteOut], stats: {...} }`.
    """
    spec = db.query(DieSpec).filter(DieSpec.quote_id == quote_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Spec stampo non trovata")

    castle_x, castle_y = _compute_castle_dimensions(spec)
    area = (castle_x * castle_y) / 10_000.0
    bends_target = (
        (spec.n_bends_simple or 0) + (spec.n_bends_medium or 0) + (spec.n_bends_complex or 0)
    )
    punches_target = (
        (spec.n_punches_simple or 0) + (spec.n_punches_medium or 0) + (spec.n_punches_complex or 0)
    )

    matches, stats = _find_similar_quotes(
        spec.die_subtype, area, bends_target, punches_target, quote_id, db,
    )
    return {
        'similar': [_load_quote(q.id, db) for q in matches],
        'stats': stats,
    }


@router.get("/find-similar-by-params")
def find_similar_by_params(
    die_subtype: str,
    castle_x_mm: float,
    castle_y_mm: float,
    n_bends_total: int = 0,
    n_punches_total: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sprint G — find-similar usato dal wizard step 2 PRIMA della creazione
    del preventivo (no quote_id). Accetta i parametri spec correnti via query
    string e ritorna gli stessi top-5 simili + stats.

    Tipicamente chiamato live dal wizard quando l'utente compila dimensioni
    e feature, per suggerire stampi storici a cui ispirarsi.
    """
    if die_subtype not in ('passo', 'blocco'):
        raise HTTPException(status_code=400, detail="die_subtype deve essere 'passo' o 'blocco'")
    area = (castle_x_mm * castle_y_mm) / 10_000.0
    matches, stats = _find_similar_quotes(
        die_subtype, area, n_bends_total, n_punches_total, None, db,
    )
    return {
        'similar': [_load_quote(q.id, db) for q in matches],
        'stats': stats,
    }
