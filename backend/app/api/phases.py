from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models import ManufacturingPhase
from app.schemas import PhaseCreate, PhaseUpdate, PhaseOut
from app.services.calculation import recalculate_part

router = APIRouter(prefix="/api", tags=["phases"])


@router.post("/parts/{part_id}/phases", response_model=PhaseOut)
def add_phase(part_id: int, data: PhaseCreate, db: Session = Depends(get_db)):
    phase = ManufacturingPhase(part_id=part_id, **data.model_dump(exclude_unset=True))
    db.add(phase)
    db.commit()
    db.refresh(phase)
    recalculate_part(part_id, db)
    db.refresh(phase)
    return phase


@router.put("/phases/{phase_id}", response_model=PhaseOut)
def update_phase(phase_id: int, data: PhaseUpdate, db: Session = Depends(get_db)):
    phase = db.query(ManufacturingPhase).filter(ManufacturingPhase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(phase, key, value)
    db.commit()
    recalculate_part(phase.part_id, db)
    db.refresh(phase)
    return phase


@router.delete("/phases/{phase_id}")
def delete_phase(phase_id: int, db: Session = Depends(get_db)):
    phase = db.query(ManufacturingPhase).filter(ManufacturingPhase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    part_id = phase.part_id
    db.delete(phase)
    db.commit()
    recalculate_part(part_id, db)
    return {"ok": True}


@router.post("/parts/{part_id}/phases/reorder")
def reorder_phases(part_id: int, phase_ids: List[int], db: Session = Depends(get_db)):
    for idx, pid in enumerate(phase_ids, start=1):
        phase = db.query(ManufacturingPhase).filter(
            ManufacturingPhase.id == pid, ManufacturingPhase.part_id == part_id
        ).first()
        if phase:
            phase.sequence_number = idx * 10
    db.commit()
    return {"ok": True}
