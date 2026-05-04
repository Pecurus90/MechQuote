from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models import Part, ManufacturingPhase
from app.schemas import PartCreate, PartUpdate, PartOut

router = APIRouter(prefix="/api", tags=["parts"])


@router.post("/quotes/{quote_id}/parts", response_model=PartOut)
def add_part(quote_id: int, data: PartCreate, db: Session = Depends(get_db)):
    part = Part(quote_id=quote_id, **data.model_dump(exclude_unset=True))
    db.add(part)
    db.commit()
    db.refresh(part)
    return part


@router.get("/parts/{part_id}", response_model=PartOut)
def get_part(part_id: int, db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    return part


@router.put("/parts/{part_id}", response_model=PartOut)
def update_part(part_id: int, data: PartUpdate, db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(part, key, value)
    db.commit()
    db.refresh(part)
    return part


@router.delete("/parts/{part_id}")
def delete_part(part_id: int, db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    db.delete(part)
    db.commit()
    return {"ok": True}


@router.post("/parts/{part_id}/duplicate", response_model=PartOut)
def duplicate_part(part_id: int, db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    new_part = Part(
        quote_id=part.quote_id,
        part_code=part.part_code + "_copy",
        revision=part.revision,
        description=part.description,
        quantity=part.quantity,
        quote_mode=part.quote_mode,
        material_id=part.material_id,
        raw_x_mm=part.raw_x_mm,
        raw_y_mm=part.raw_y_mm,
        raw_z_mm=part.raw_z_mm,
        raw_diameter_mm=part.raw_diameter_mm,
        finished_weight_kg=part.finished_weight_kg,
        raw_weight_kg=part.raw_weight_kg,
        material_cost=part.material_cost,
        margin_percent=part.margin_percent,
        minimum_price=part.minimum_price,
        rounding_rule=part.rounding_rule,
        confidence_level=part.confidence_level,
        customer_notes=part.customer_notes,
        internal_notes=part.internal_notes,
        total_cost=part.total_cost,
        unit_price=part.unit_price,
        total_price=part.total_price,
    )
    db.add(new_part)
    db.commit()
    db.refresh(new_part)
    return new_part
