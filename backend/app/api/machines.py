from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models import Machine
from app.schemas import MachineCreate, MachineUpdate, MachineOut

router = APIRouter(prefix="/api", tags=["machines"])


@router.get("/machines", response_model=List[MachineOut])
def list_machines(db: Session = Depends(get_db)):
    return db.query(Machine).order_by(Machine.name).all()


@router.post("/machines", response_model=MachineOut)
def create_machine(data: MachineCreate, db: Session = Depends(get_db)):
    m = Machine(**data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.put("/machines/{mid}", response_model=MachineOut)
def update_machine(mid: int, data: MachineUpdate, db: Session = Depends(get_db)):
    m = db.query(Machine).filter(Machine.id == mid).first()
    if not m:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/machines/{mid}")
def delete_machine(mid: int, db: Session = Depends(get_db)):
    m = db.query(Machine).filter(Machine.id == mid).first()
    if not m:
        raise HTTPException(404, "Not found")
    db.delete(m)
    db.commit()
    return {"ok": True}
