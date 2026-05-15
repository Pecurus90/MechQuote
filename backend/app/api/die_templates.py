"""API DieTemplate — template stampi preconfigurati.

Riusabili dal wizard creazione preventivo stampo per precompilare le piastre
(ruolo, spessore, materiale, trattamento) + i suggerimenti feature
(stazioni, pieghe, punzoni, difficoltà).
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.catalog_protect import block_if_in_use
from app.core.database import get_db
from app.core.security import require_permission
from app.models import DieTemplate, DieTemplatePlate
from app.schemas import (
    DieTemplateCreate, DieTemplateUpdate, DieTemplateOut,
)

router = APIRouter(prefix="/api/die-templates", tags=["die-templates"])

_can_edit = require_permission('dies.settings')


@router.get("", response_model=List[DieTemplateOut])
def list_templates(db: Session = Depends(get_db)):
    """Lettura aperta — chi crea preventivi stampo deve vedere i template."""
    return db.query(DieTemplate).options(
        joinedload(DieTemplate.plates),
    ).filter(DieTemplate.active == True).order_by(DieTemplate.name).all()  # noqa: E712


@router.post("", response_model=DieTemplateOut, dependencies=[_can_edit])
def create_template(data: DieTemplateCreate, db: Session = Depends(get_db)):
    payload = data.model_dump(exclude={'plates'})
    tpl = DieTemplate(**payload)
    db.add(tpl)
    db.flush()
    for p in data.plates:
        db.add(DieTemplatePlate(template_id=tpl.id, **p.model_dump()))
    db.commit()
    db.refresh(tpl)
    return tpl


@router.put("/{tid}", response_model=DieTemplateOut, dependencies=[_can_edit])
def update_template(tid: int, data: DieTemplateUpdate, db: Session = Depends(get_db)):
    tpl = db.query(DieTemplate).filter(DieTemplate.id == tid).first()
    if not tpl:
        raise HTTPException(404, "Template non trovato")
    payload = data.model_dump(exclude_unset=True, exclude={'plates'})
    for k, v in payload.items():
        setattr(tpl, k, v)
    # Plates: se presente nel payload (anche come []), sostituisce clean-slate.
    if data.plates is not None:
        db.query(DieTemplatePlate).filter(DieTemplatePlate.template_id == tid).delete()
        for p in data.plates:
            db.add(DieTemplatePlate(template_id=tid, **p.model_dump()))
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete("/{tid}", dependencies=[_can_edit])
def delete_template(tid: int, db: Session = Depends(get_db)):
    tpl = db.query(DieTemplate).filter(DieTemplate.id == tid).first()
    if not tpl:
        raise HTTPException(404, "Template non trovato")
    # No FK in arrivo (Quote/Part copiano dal template ma non lo referenziano).
    # block_if_in_use segnaposto coerente col pattern catalog.
    block_if_in_use(db, f"Template '{tpl.name}'")
    db.delete(tpl)
    db.commit()
    return {"ok": True}
