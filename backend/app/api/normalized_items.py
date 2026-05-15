"""API NormalizedItem — componenti commerciali (viti, perni, cuscinetti) aggiunti
ai preventivi stampi. Sub-resource di Part. Il CRUD è gated `dies.create`.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import require_permission
from app.models import NormalizedItem, Part
from app.schemas import NormalizedItemCreate, NormalizedItemUpdate, NormalizedItemOut
from app.services.calculation import recalculate_quote

router = APIRouter(prefix="/api", tags=["normalized-items"])

_can_edit = require_permission('dies.create')


def _part_die_quote_id(part_id: int, db: Session) -> int:
    part = db.query(Part).options(joinedload(Part.quote)).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(404, "Parte non trovata")
    if part.quote.quote_type != 'die':
        raise HTTPException(400, "NormalizedItem ammessi solo per preventivi stampi (quote_type='die')")
    return part.quote_id


@router.post("/parts/{part_id}/normalized-items", response_model=NormalizedItemOut, dependencies=[_can_edit])
def create_normalized_item(part_id: int, data: NormalizedItemCreate, db: Session = Depends(get_db)):
    quote_id = _part_die_quote_id(part_id, db)
    item = NormalizedItem(part_id=part_id, **data.model_dump())
    db.add(item)
    db.commit()
    recalculate_quote(quote_id, db)
    db.refresh(item)
    return item


@router.put("/normalized-items/{item_id}", response_model=NormalizedItemOut, dependencies=[_can_edit])
def update_normalized_item(item_id: int, data: NormalizedItemUpdate, db: Session = Depends(get_db)):
    item = db.query(NormalizedItem).filter(NormalizedItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Normalizzato non trovato")
    quote_id = _part_die_quote_id(item.part_id, db)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    recalculate_quote(quote_id, db)
    db.refresh(item)
    return item


@router.delete("/normalized-items/{item_id}", dependencies=[_can_edit])
def delete_normalized_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(NormalizedItem).filter(NormalizedItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Normalizzato non trovato")
    quote_id = _part_die_quote_id(item.part_id, db)
    db.delete(item)
    db.commit()
    recalculate_quote(quote_id, db)
    return {"ok": True}
