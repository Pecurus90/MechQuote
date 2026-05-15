"""API Preventivatore Stampi (MVP1).

Endpoint principali:
- POST /api/dies                       — crea quote_type='die' + DieQuoteSpec + N Part piastre
- GET  /api/dies/{quote_id}             — riusa quotes.get_quote (qui solo per simmetria URL)
- PUT  /api/dies/{quote_id}/spec        — update parametri stampo
- POST /api/dies/{quote_id}/recalculate — forza ricalcolo

I preventivi stampi sono Quote esteso con quote_type='die'; il CRUD del Quote
(GET/PUT) e delle Part/Phase vive nei router esistenti — qui solo le operazioni
specifiche del modulo Stampi.
"""
from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
import re

from app.models import (
    Quote, Part, ManufacturingPhase, DieQuoteSpec, DieSettings,
    DieTemplate, DieTemplatePlate, NormalizedItem, User, CompanySettings,
)
from app.schemas import (
    DieQuoteCreate, DieQuoteSpecUpdate, DieQuoteSpecOut, QuoteOut,
)
from app.services.calculation import recalculate_quote

router = APIRouter(prefix="/api/dies", tags=["dies"])

_can_create = require_permission('dies.create')


def _load_die_quote(quote_id: int, db: Session) -> Quote:
    q = db.query(Quote).options(
        joinedload(Quote.parts).joinedload(Part.material),
        joinedload(Quote.parts).joinedload(Part.normalized_items),
        joinedload(Quote.die_spec),
        joinedload(Quote.customer),
    ).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(404, "Preventivo stampo non trovato")
    if q.quote_type != 'die':
        raise HTTPException(400, f"Preventivo {q.quote_number} non è uno stampo (quote_type={q.quote_type})")
    return q


@router.post("", response_model=QuoteOut)
def create_die_quote(
    data: DieQuoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_create,
):
    """Crea un nuovo preventivo stampo:
    1. Quote con quote_type='die'
    2. DieQuoteSpec (1:1) con die_subtype + default da DieSettings (castle_offset)
    3. N Part (piastre) vuote, con plate_role pre-impostato
    """
    if db.query(Quote).filter(Quote.quote_number == data.quote_number).first():
        raise HTTPException(400, f"Numero preventivo '{data.quote_number}' già esistente")

    die_settings = db.query(DieSettings).filter(DieSettings.id == 1).first()
    # Default castle offset da DieSettings (può essere None se non seedato)
    default_offset_x = die_settings.default_castle_offset_x_mm if die_settings else 80.0
    default_offset_y = die_settings.default_castle_offset_y_mm if die_settings else 80.0
    default_margin = die_settings.default_margin_percent if die_settings else 30.0

    # Margine: usa default die_settings (non quello globale CompanySettings)
    quote = Quote(
        quote_number=data.quote_number,
        quote_type='die',
        customer_id=data.customer_id,
        customer_name=data.customer_name,
        quote_date=data.quote_date or date_type.today(),
        global_margin_percent=default_margin,
        created_by_user_id=current_user.id,
    )
    # Trasport/packaging da CompanySettings come per quote standard
    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    if cs:
        quote.transport_cost = cs.default_transport_cost or 0.0
        quote.packaging_cost = cs.default_packaging_cost or 0.0

    db.add(quote)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, f"Numero preventivo '{data.quote_number}' già esistente")

    # Risolvi template (se richiesto) — ignorato in modalità Rapida.
    tpl: Optional[DieTemplate] = None
    if data.template_id and not data.quick_mode:
        tpl = db.query(DieTemplate).options(
            joinedload(DieTemplate.plates),
        ).filter(DieTemplate.id == data.template_id).first()
        if not tpl:
            raise HTTPException(404, f"Template id={data.template_id} non trovato")

    # DieQuoteSpec 1:1 — pre-popola da template se presente (override su die_subtype
    # del template; l'utente nel wizard l'ha già scelto coerentemente).
    spec_kwargs = dict(
        quote_id=quote.id,
        die_subtype=data.die_subtype,
        difficulty=data.difficulty or 'base',
        castle_offset_x_mm=default_offset_x,
        castle_offset_y_mm=default_offset_y,
        bbox_x_mm=data.bbox_x_mm or 0.0,
        bbox_y_mm=data.bbox_y_mm or 0.0,
        sheet_thickness_mm=data.sheet_thickness_mm or 0.0,
        quick_mode=bool(data.quick_mode),
    )
    if data.quick_mode and data.n_bends_total:
        # In Rapida concentro tutto su "complex" (più conservativo) — l'utente
        # può poi affinare passando in Dettagliata.
        spec_kwargs['n_bends_complex'] = data.n_bends_total
    if data.quick_mode and data.n_punches_total:
        spec_kwargs['n_punches_complex'] = data.n_punches_total
    if tpl:
        spec_kwargs.update(
            difficulty=tpl.default_difficulty or 'base',
            n_stations=tpl.suggested_stations,
            pitch_mm=tpl.suggested_pitch_mm,
            n_bends_simple=tpl.suggested_n_bends_simple,
            n_bends_medium=tpl.suggested_n_bends_medium,
            n_bends_complex=tpl.suggested_n_bends_complex,
            n_punches_simple=tpl.suggested_n_punches_simple,
            n_punches_medium=tpl.suggested_n_punches_medium,
            n_punches_complex=tpl.suggested_n_punches_complex,
        )
    spec = DieQuoteSpec(**spec_kwargs)
    db.add(spec)

    # Crea le piastre dal template (con default thickness/material/treatment)
    # oppure dai ruoli standard se nessun template. In Rapida saltiamo la
    # creazione piastre — il cost engine usa la formula peso × €/kg che non
    # richiede Part fisiche.
    if data.quick_mode:
        # In Rapida niente piastre concrete; il calcolo Rapida usa direttamente
        # bbox + quick_n_plates_avg. Se main_material_id, lo conserviamo come
        # "materiale dominante" creando 1 Part "fittizia" che fornisce density
        # al `_recalculate_die_quick` (cerca density nel primo material trovato).
        if data.main_material_id:
            db.add(Part(
                quote_id=quote.id,
                part_code=f"{data.quote_number}_quick",
                description="Materiale dominante (Rapida)",
                quantity=1,
                quote_mode='die_quick',
                material_id=data.main_material_id,
            ))
    elif tpl and tpl.plates:
        for tp in tpl.plates:
            plate = Part(
                quote_id=quote.id,
                part_code=f"{data.quote_number}_{tp.plate_role}",
                description=tp.plate_role.replace('_', ' ').title(),
                quantity=1,
                quote_mode='die_plate',
                plate_role=tp.plate_role,
                raw_z_mm=tp.default_thickness_mm or None,
                material_id=tp.default_material_id,
            )
            db.add(plate)
            db.flush()
            # Se il template suggerisce un trattamento, crea fase trattamento
            # come "fase suggerita" della piastra (sequence_number 10).
            if tp.default_treatment_id:
                db.add(ManufacturingPhase(
                    part_id=plate.id,
                    sequence_number=10,
                    phase_type='',
                    description=f'Trattamento da template',
                    treatment_id=tp.default_treatment_id,
                ))
    else:
        for role in data.plate_roles:
            plate = Part(
                quote_id=quote.id,
                part_code=f"{data.quote_number}_{role}",
                description=role.replace('_', ' ').title(),
                quantity=1,
                quote_mode='die_plate',
                plate_role=role,
            )
            db.add(plate)

    db.commit()
    recalculate_quote(quote.id, db)
    db.refresh(quote)
    return _load_die_quote(quote.id, db)


@router.post("/{quote_id}/apply-template/{template_id}", response_model=QuoteOut)
def apply_template(
    quote_id: int,
    template_id: int,
    db: Session = Depends(get_db),
    _=_can_create,
):
    """Sostituisce clean-slate le piastre di un preventivo stampo esistente
    con quelle del template scelto. Usato dall'editor (in MVP1.5/2 → MVP2)
    quando l'utente cambia idea sul template di partenza."""
    quote = _load_die_quote(quote_id, db)
    if quote.status != 'bozza':
        raise HTTPException(403, f"Preventivo non più modificabile (stato: {quote.status})")
    tpl = db.query(DieTemplate).options(
        joinedload(DieTemplate.plates),
    ).filter(DieTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(404, "Template non trovato")

    # Clean-slate: cancella Part esistenti del Quote.
    db.query(Part).filter(Part.quote_id == quote_id).delete()
    db.flush()

    # Aggiorna DieQuoteSpec coi suggerimenti del template (sovrascrive — è una
    # scelta esplicita dell'utente).
    spec = quote.die_spec
    if spec:
        spec.die_subtype = tpl.die_subtype
        spec.difficulty = tpl.default_difficulty or 'base'
        spec.n_stations = tpl.suggested_stations
        spec.pitch_mm = tpl.suggested_pitch_mm
        spec.n_bends_simple = tpl.suggested_n_bends_simple
        spec.n_bends_medium = tpl.suggested_n_bends_medium
        spec.n_bends_complex = tpl.suggested_n_bends_complex
        spec.n_punches_simple = tpl.suggested_n_punches_simple
        spec.n_punches_medium = tpl.suggested_n_punches_medium
        spec.n_punches_complex = tpl.suggested_n_punches_complex

    # Crea nuove piastre dal template.
    for tp in tpl.plates:
        plate = Part(
            quote_id=quote_id,
            part_code=f"{quote.quote_number}_{tp.plate_role}",
            description=tp.plate_role.replace('_', ' ').title(),
            quantity=1,
            quote_mode='die_plate',
            plate_role=tp.plate_role,
            raw_z_mm=tp.default_thickness_mm or None,
            material_id=tp.default_material_id,
        )
        db.add(plate)
        db.flush()
        if tp.default_treatment_id:
            db.add(ManufacturingPhase(
                part_id=plate.id,
                sequence_number=10,
                phase_type='',
                description='Trattamento da template',
                treatment_id=tp.default_treatment_id,
            ))

    db.commit()
    recalculate_quote(quote_id, db)
    return _load_die_quote(quote_id, db)


@router.get("/{quote_id}", response_model=QuoteOut)
def get_die_quote(quote_id: int, db: Session = Depends(get_db), _=_can_create):
    return _load_die_quote(quote_id, db)


@router.put("/{quote_id}/spec", response_model=DieQuoteSpecOut)
def update_die_spec(
    quote_id: int,
    data: DieQuoteSpecUpdate,
    db: Session = Depends(get_db),
    _=_can_create,
):
    quote = _load_die_quote(quote_id, db)
    if quote.status != 'bozza':
        raise HTTPException(403, f"Preventivo non più modificabile (stato: {quote.status})")
    spec = quote.die_spec
    if not spec:
        raise HTTPException(404, "DieQuoteSpec non trovato (preventivo corrotto)")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(spec, k, v)
    db.commit()
    recalculate_quote(quote_id, db)
    db.refresh(spec)
    return spec


@router.post("/{quote_id}/recalculate", response_model=QuoteOut)
def force_recalculate(quote_id: int, db: Session = Depends(get_db), _=_can_create):
    quote = _load_die_quote(quote_id, db)
    recalculate_quote(quote_id, db)
    return _load_die_quote(quote_id, db)


def _next_revision_number(base_number: str, db: Session) -> str:
    """Calcola il prossimo `_revN` libero per un quote_number.

    Pattern: '240-26A_001' → '240-26A_001_rev2'. Se già '...,_rev3', → '_rev4'.
    Cerca tutti i Quote con prefix matching, prende il max rev + 1.
    """
    m = re.match(r'^(.+?)(_rev\d+)?$', base_number)
    base = m.group(1) if m else base_number
    # Cerca tutti i Quote con quote_number = base OR base + _revN
    candidates = db.query(Quote.quote_number).filter(
        Quote.quote_number.like(f"{base}%")
    ).all()
    max_rev = 1
    for (qn,) in candidates:
        if qn == base:
            max_rev = max(max_rev, 1)
        else:
            mm = re.match(rf'^{re.escape(base)}_rev(\d+)$', qn)
            if mm:
                max_rev = max(max_rev, int(mm.group(1)))
    return f"{base}_rev{max_rev + 1}"


@router.get("/find-similar/{quote_id}")
def find_similar_dies(
    quote_id: int,
    tol: float = 0.20,
    limit: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_create,
):
    """Cerca preventivi stampo simili al `quote_id`. Match per:
    - Area castello (max raw_x × max raw_y) ±`tol`% (default ±20%)
    - n_pieghe + n_punzoni totali ±2
    - Stesso die_subtype (passo vs blocco)

    Esclude il quote stesso e le sue revisioni (`quote_number_base` derivato
    via regex). Ritorna ordinato per similarity score (1 / Σ diff relativa)
    ascendente. Output compatto per pannello laterale UI.
    """
    src = _load_die_quote(quote_id, db)
    src_spec = src.die_spec
    if not src_spec:
        return []

    # Area castello sorgente
    parts_q = db.query(Part).filter(Part.quote_id == src.id).all()
    src_max_x = max((p.raw_x_mm or 0.0 for p in parts_q), default=0.0)
    src_max_y = max((p.raw_y_mm or 0.0 for p in parts_q), default=0.0)
    src_area = src_max_x * src_max_y / 10000.0  # dm²
    src_bends = (src_spec.n_bends_simple or 0) + (src_spec.n_bends_medium or 0) + (src_spec.n_bends_complex or 0)
    src_punches = (src_spec.n_punches_simple or 0) + (src_spec.n_punches_medium or 0) + (src_spec.n_punches_complex or 0)

    # Quote_number base (rimuovi suffisso _revN) per escludere le revisioni della
    # stessa "famiglia" — un preventivo non è simile a sé stesso o alle sue rev.
    m = re.match(r'^(.+?)(_rev\d+)?$', src.quote_number)
    base_number = m.group(1) if m else src.quote_number

    candidates = db.query(Quote).options(
        joinedload(Quote.parts),
        joinedload(Quote.die_spec),
    ).filter(
        Quote.quote_type == 'die',
        Quote.id != src.id,
        ~Quote.quote_number.like(f"{base_number}%"),  # esclude tutte le rev
    ).all()

    results = []
    for q in candidates:
        if not q.die_spec or q.die_spec.die_subtype != src_spec.die_subtype:
            continue
        max_x = max((p.raw_x_mm or 0.0 for p in q.parts), default=0.0)
        max_y = max((p.raw_y_mm or 0.0 for p in q.parts), default=0.0)
        area = max_x * max_y / 10000.0
        bends = (q.die_spec.n_bends_simple or 0) + (q.die_spec.n_bends_medium or 0) + (q.die_spec.n_bends_complex or 0)
        punches = (q.die_spec.n_punches_simple or 0) + (q.die_spec.n_punches_medium or 0) + (q.die_spec.n_punches_complex or 0)

        # Filtri di similarity
        if src_area > 0:
            area_diff_rel = abs(area - src_area) / src_area
            if area_diff_rel > tol:
                continue
        if abs(bends - src_bends) > 2:
            continue
        if abs(punches - src_punches) > 2:
            continue

        # Score: somma diff relative (più bassa = più simile). Usiamo +0.01
        # per evitare divisione per zero in casi identici.
        score = (
            (abs(area - src_area) / max(src_area, 1.0))
            + (abs(bends - src_bends) / max(src_bends, 1) * 0.5)
            + (abs(punches - src_punches) / max(src_punches, 1) * 0.5)
        )
        results.append({
            "id": q.id,
            "quote_number": q.quote_number,
            "customer_name": q.customer_name,
            "die_subtype": q.die_spec.die_subtype,
            "area_dm2": round(area, 1),
            "n_bends": bends,
            "n_punches": punches,
            "cost_industrial": q.die_spec.cost_industrial or 0.0,
            "final_price": round((q.die_spec.cost_industrial or 0.0) * (1 + (q.global_margin_percent or 0) / 100) * (1 - (q.global_discount_percent or 0) / 100), 2),
            "quote_date": q.quote_date.isoformat() if q.quote_date else None,
            "score": round(score, 4),
        })

    results.sort(key=lambda r: r["score"])
    return results[:limit]


@router.post("/{quote_id}/clone", response_model=QuoteOut)
def clone_die_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_create,
):
    """Duplica un preventivo stampo come nuova revisione (`_revN`).

    Clone profondo: Quote + DieQuoteSpec + Part (piastre) + ManufacturingPhase
    + NormalizedItem. Status reset a 'bozza', `created_by_user_id` aggiornato
    all'utente corrente. Lo snapshot costi viene ricalcolato post-clone.
    """
    src = _load_die_quote(quote_id, db)

    new_number = _next_revision_number(src.quote_number, db)
    new_quote = Quote(
        quote_number=new_number,
        quote_type='die',
        customer_id=src.customer_id,
        customer_name=src.customer_name,
        customer_reference=src.customer_reference,
        quote_date=date_type.today(),
        validity_days=src.validity_days,
        currency=src.currency,
        global_margin_percent=src.global_margin_percent,
        global_discount_percent=src.global_discount_percent,
        transport_cost=src.transport_cost,
        packaging_cost=src.packaging_cost,
        notes_customer=src.notes_customer,
        notes_internal=src.notes_internal,
        status='bozza',
        created_by_user_id=current_user.id,
    )
    db.add(new_quote)
    db.flush()

    # Clona DieQuoteSpec
    if src.die_spec:
        s = src.die_spec
        db.add(DieQuoteSpec(
            quote_id=new_quote.id,
            die_subtype=s.die_subtype,
            bbox_x_mm=s.bbox_x_mm, bbox_y_mm=s.bbox_y_mm, sheet_thickness_mm=s.sheet_thickness_mm,
            n_stations=s.n_stations, pitch_mm=s.pitch_mm, strip_offset_y_mm=s.strip_offset_y_mm,
            n_operations=s.n_operations,
            castle_offset_x_mm=s.castle_offset_x_mm, castle_offset_y_mm=s.castle_offset_y_mm,
            difficulty=s.difficulty,
            n_bends_simple=s.n_bends_simple, n_bends_medium=s.n_bends_medium, n_bends_complex=s.n_bends_complex,
            n_punches_simple=s.n_punches_simple, n_punches_medium=s.n_punches_medium, n_punches_complex=s.n_punches_complex,
            delivery_days=s.delivery_days, technical_notes=s.technical_notes,
            extras_amount=s.extras_amount, extras_description=s.extras_description,
        ))

    # Clona Part + ManufacturingPhase + NormalizedItem
    for src_part in src.parts:
        new_part_code = src_part.part_code.replace(src.quote_number, new_number)
        new_part = Part(
            quote_id=new_quote.id,
            part_code=new_part_code,
            revision=src_part.revision,
            description=src_part.description,
            quantity=src_part.quantity,
            quote_mode=src_part.quote_mode,
            material_id=src_part.material_id,
            raw_x_mm=src_part.raw_x_mm, raw_y_mm=src_part.raw_y_mm, raw_z_mm=src_part.raw_z_mm,
            raw_diameter_mm=src_part.raw_diameter_mm,
            finished_weight_kg=src_part.finished_weight_kg,
            customer_supplied_material=src_part.customer_supplied_material,
            material_from_stock=src_part.material_from_stock,
            margin_percent=src_part.margin_percent,
            minimum_price=src_part.minimum_price,
            customer_notes=src_part.customer_notes,
            internal_notes=src_part.internal_notes,
            plate_role=src_part.plate_role,
        )
        db.add(new_part)
        db.flush()
        # Clona phases
        for ph in src_part.phases:
            db.add(ManufacturingPhase(
                part_id=new_part.id,
                sequence_number=ph.sequence_number,
                phase_type=ph.phase_type,
                operation_id=ph.operation_id,
                description=ph.description,
                machine_id=ph.machine_id,
                treatment_id=ph.treatment_id,
                supplier_id=ph.supplier_id,
                setup_hours=ph.setup_hours,
                cycle_hours_per_part=ph.cycle_hours_per_part,
                fixed_cost=ph.fixed_cost,
                variable_cost_per_part=ph.variable_cost_per_part,
                hourly_rate_override=ph.hourly_rate_override,
                cut_length_mm=ph.cut_length_mm, cut_height_mm=ph.cut_height_mm,
                cutting_cycle_id=ph.cutting_cycle_id, n_pierce=ph.n_pierce,
                dxf_profile_ids=ph.dxf_profile_ids,
            ))
        # Clona normalized_items
        for ni in (src_part.normalized_items or []):
            db.add(NormalizedItem(
                part_id=new_part.id,
                normalized_supplier_id=ni.normalized_supplier_id,
                description=ni.description,
                quantity=ni.quantity,
                unit_price=ni.unit_price,
                notes=ni.notes,
            ))

    db.commit()
    recalculate_quote(new_quote.id, db)
    return _load_die_quote(new_quote.id, db)
