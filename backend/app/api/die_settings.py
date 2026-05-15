"""API DieSettings + DieDimensionBracket — configurazione del modulo Stampi.

DieSettings: singleton id=1 (tariffe orarie, costi feature, moltiplicatori).
DieDimensionBracket: fasce dimensionali castello (S/M/L/XL) con coeff L3.

Permesso `dies.settings` (admin only).
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.catalog_protect import block_if_in_use
from app.core.database import get_db
from app.core.security import require_permission
from app.models import DieSettings, DieDimensionBracket
from app.schemas import (
    DieSettingsOut, DieSettingsUpdate,
    DieDimensionBracketCreate, DieDimensionBracketUpdate, DieDimensionBracketOut,
)

router = APIRouter(prefix="/api", tags=["die-settings"])

_can_edit = require_permission('dies.settings')


# ─── DieSettings (singleton id=1) ─────────────────────────────────────────────

@router.get("/die-settings", response_model=DieSettingsOut)
def get_die_settings(db: Session = Depends(get_db)):
    """Lettura aperta — chi può creare preventivi stampi vede le tariffe.
    Write gated `dies.settings` (admin)."""
    s = db.query(DieSettings).filter(DieSettings.id == 1).first()
    if not s:
        raise HTTPException(404, "DieSettings non inizializzato (singleton id=1 mancante)")
    return s


@router.put("/die-settings", response_model=DieSettingsOut, dependencies=[_can_edit])
def update_die_settings(data: DieSettingsUpdate, db: Session = Depends(get_db)):
    s = db.query(DieSettings).filter(DieSettings.id == 1).first()
    if not s:
        raise HTTPException(404, "DieSettings non inizializzato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


# ─── DieDimensionBracket (CRUD fasce dimensionali castello) ───────────────────

@router.get("/die-dimension-brackets", response_model=List[DieDimensionBracketOut])
def list_brackets(db: Session = Depends(get_db)):
    return db.query(DieDimensionBracket).order_by(DieDimensionBracket.sort_order).all()


@router.post("/die-dimension-brackets", response_model=DieDimensionBracketOut, dependencies=[_can_edit])
def create_bracket(data: DieDimensionBracketCreate, db: Session = Depends(get_db)):
    b = DieDimensionBracket(**data.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@router.put("/die-dimension-brackets/{bid}", response_model=DieDimensionBracketOut, dependencies=[_can_edit])
def update_bracket(bid: int, data: DieDimensionBracketUpdate, db: Session = Depends(get_db)):
    b = db.query(DieDimensionBracket).filter(DieDimensionBracket.id == bid).first()
    if not b:
        raise HTTPException(404, "Fascia dimensionale non trovata")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return b


@router.delete("/die-dimension-brackets/{bid}", dependencies=[_can_edit])
def delete_bracket(bid: int, db: Session = Depends(get_db)):
    b = db.query(DieDimensionBracket).filter(DieDimensionBracket.id == bid).first()
    if not b:
        raise HTTPException(404, "Fascia dimensionale non trovata")
    # Lookup consultativo: nessuna FK formale, segnaposto coerente col pattern catalog.
    block_if_in_use(db, f"Fascia '{b.label}'")
    db.delete(b)
    db.commit()
    return {"ok": True}
