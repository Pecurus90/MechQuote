from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import ManufacturingPhase, Part, Quote, User
from app.schemas import PhaseCreate, PhaseUpdate, PhaseOut
from app.services.calculation import recalculate_part
from app.api.quotes import ensure_editable

_can_write = require_permission('quotes.create')


def _quote_for_part(part_id: int, db: Session) -> Quote:
    quote = db.query(Quote).join(Part, Part.quote_id == Quote.id).filter(Part.id == part_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Parte non trovata")
    return quote

router = APIRouter(prefix="/api", tags=["phases"])


@router.post("/parts/{part_id}/phases", response_model=PhaseOut)
def add_phase(
    part_id: int,
    data: PhaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    ensure_editable(_quote_for_part(part_id, db), current_user)
    phase = ManufacturingPhase(part_id=part_id, **data.model_dump(exclude_unset=True))
    db.add(phase)
    db.commit()
    db.refresh(phase)
    recalculate_part(part_id, db)
    db.refresh(phase)
    return phase


@router.put("/phases/{phase_id}", response_model=PhaseOut)
def update_phase(
    phase_id: int,
    data: PhaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    phase = db.query(ManufacturingPhase).filter(ManufacturingPhase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Fase non trovata")
    ensure_editable(_quote_for_part(phase.part_id, db), current_user)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(phase, key, value)
    db.commit()
    recalculate_part(phase.part_id, db)
    db.refresh(phase)
    return phase


@router.delete("/phases/{phase_id}")
def delete_phase(
    phase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    phase = db.query(ManufacturingPhase).filter(ManufacturingPhase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Fase non trovata")
    ensure_editable(_quote_for_part(phase.part_id, db), current_user)
    part_id = phase.part_id
    db.delete(phase)
    db.commit()
    recalculate_part(part_id, db)
    return {"ok": True}


@router.post("/parts/{part_id}/phases/reorder")
def reorder_phases(
    part_id: int,
    phase_ids: List[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    ensure_editable(_quote_for_part(part_id, db), current_user)
    for idx, pid in enumerate(phase_ids, start=1):
        phase = db.query(ManufacturingPhase).filter(
            ManufacturingPhase.id == pid, ManufacturingPhase.part_id == part_id
        ).first()
        if phase:
            phase.sequence_number = idx * 10
    db.commit()
    return {"ok": True}
