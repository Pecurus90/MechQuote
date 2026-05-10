"""API CRUD per Operation (catalogo Lavorazioni utente).

Etichette libere usate dal Workflow per popolare le fasi del preventivo.
phase_type è la categoria sottostante (uno degli slug PHASE_TYPES) che
guida il cost engine (autocalc EDM, riconoscimento treatment, ecc.).
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models import Operation
from app.schemas import OperationCreate, OperationUpdate, OperationOut

router = APIRouter(prefix="/api", tags=["operations"])


@router.get("/operations", response_model=List[OperationOut])
def list_operations(db: Session = Depends(get_db)):
    return db.query(Operation).order_by(Operation.name).all()


@router.post("/operations", response_model=OperationOut, dependencies=[require_permission('settings')])
def create_operation(data: OperationCreate, db: Session = Depends(get_db)):
    op = Operation(**data.model_dump())
    db.add(op)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Esiste già una lavorazione con questo nome")
    db.refresh(op)
    return op


@router.put("/operations/{oid}", response_model=OperationOut, dependencies=[require_permission('settings')])
def update_operation(oid: int, data: OperationUpdate, db: Session = Depends(get_db)):
    op = db.query(Operation).filter(Operation.id == oid).first()
    if not op:
        raise HTTPException(404, "Lavorazione non trovata")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(op, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Esiste già una lavorazione con questo nome")
    db.refresh(op)
    return op


@router.delete("/operations/{oid}", dependencies=[require_permission('settings')])
def delete_operation(oid: int, db: Session = Depends(get_db)):
    op = db.query(Operation).filter(Operation.id == oid).first()
    if not op:
        raise HTTPException(404, "Lavorazione non trovata")
    db.delete(op)
    db.commit()
    return {"ok": True}
