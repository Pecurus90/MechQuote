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
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import (
    Quote, Part, DieQuoteSpec, DieSettings, User, CompanySettings,
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

    # DieQuoteSpec 1:1
    spec = DieQuoteSpec(
        quote_id=quote.id,
        die_subtype=data.die_subtype,
        difficulty='base',
        castle_offset_x_mm=default_offset_x,
        castle_offset_y_mm=default_offset_y,
    )
    db.add(spec)

    # N Part piastre (default 5 ruoli). Ognuna nasce con part_code unique.
    for i, role in enumerate(data.plate_roles):
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
