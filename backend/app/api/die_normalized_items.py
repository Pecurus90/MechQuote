"""CRUD DieNormalizedItem — normalizzati di un preventivo stampo (livello Quote)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.core.quote_types import is_die
from app.models import Quote, DieNormalizedItem, NormalizedItem, User
from app.schemas import (
    DieNormalizedItemCreate, DieNormalizedItemUpdate, DieNormalizedItemOut,
)
from app.services.calculation import recalculate_die_quote
from app.api.quotes import ensure_editable, ensure_quote_visible

_can_write = require_permission('dies.create')

router = APIRouter(prefix="/api/dies", tags=["dies"])


def _die_quote_or_404(quote_id: int, db: Session) -> Quote:
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote or not is_die(quote):
        raise HTTPException(status_code=404, detail="Preventivo stampo non trovato")
    return quote


def _validate_catalog_ref(normalized_item_id, db: Session) -> None:
    """D1: se la riga dichiara una provenienza dal catalogo, la voce deve esistere."""
    if normalized_item_id is not None:
        if not db.query(NormalizedItem).filter(NormalizedItem.id == normalized_item_id).first():
            raise HTTPException(status_code=400, detail="Voce normalizzata (catalogo) non trovata")


@router.get("/{quote_id}/normalized-items", response_model=List[DieNormalizedItemOut])
def list_items(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # AUD-49: ACL di proprietà — non esporre la BoM/prezzi di stampi altrui per id.
    ensure_quote_visible(_die_quote_or_404(quote_id, db), current_user)
    return db.query(DieNormalizedItem).options(
        joinedload(DieNormalizedItem.supplier)
    ).filter(DieNormalizedItem.quote_id == quote_id).all()


@router.post("/{quote_id}/normalized-items", response_model=DieNormalizedItemOut)
def add_item(
    quote_id: int,
    data: DieNormalizedItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    quote = _die_quote_or_404(quote_id, db)
    ensure_editable(quote, current_user)
    _validate_catalog_ref(data.normalized_item_id, db)
    item = DieNormalizedItem(quote_id=quote_id, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    recalculate_die_quote(quote_id, db)
    return db.query(DieNormalizedItem).options(
        joinedload(DieNormalizedItem.supplier)
    ).filter(DieNormalizedItem.id == item.id).first()


@router.put("/{quote_id}/normalized-items/{item_id}", response_model=DieNormalizedItemOut)
def update_item(
    quote_id: int,
    item_id: int,
    data: DieNormalizedItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    quote = _die_quote_or_404(quote_id, db)
    ensure_editable(quote, current_user)
    item = db.query(DieNormalizedItem).filter(
        DieNormalizedItem.id == item_id,
        DieNormalizedItem.quote_id == quote_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Normalizzato non trovato")
    _validate_catalog_ref(data.normalized_item_id, db)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    recalculate_die_quote(quote_id, db)
    return db.query(DieNormalizedItem).options(
        joinedload(DieNormalizedItem.supplier)
    ).filter(DieNormalizedItem.id == item_id).first()


@router.delete("/{quote_id}/normalized-items/{item_id}")
def delete_item(
    quote_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    quote = _die_quote_or_404(quote_id, db)
    ensure_editable(quote, current_user)
    item = db.query(DieNormalizedItem).filter(
        DieNormalizedItem.id == item_id,
        DieNormalizedItem.quote_id == quote_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Normalizzato non trovato")
    db.delete(item)
    db.commit()
    recalculate_die_quote(quote_id, db)
    return {"ok": True}
