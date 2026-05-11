from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.catalog_protect import block_if_in_use
from app.core.database import get_db
from app.core.security import require_permission
from app.models import ManufacturingPhase, Supplier, Treatment
from app.schemas import (
    SupplierCreate, SupplierUpdate, SupplierOut,
    TreatmentCreate, TreatmentUpdate, TreatmentOut,
)

router = APIRouter(prefix="/api", tags=["treatments"])


# --- Suppliers ---
@router.get("/suppliers", response_model=List[SupplierOut])
def list_suppliers(db: Session = Depends(get_db)):
    return db.query(Supplier).order_by(Supplier.name).all()


@router.post("/suppliers", response_model=SupplierOut, dependencies=[require_permission('settings')])
def create_supplier(data: SupplierCreate, db: Session = Depends(get_db)):
    s = Supplier(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/suppliers/{sid}", response_model=SupplierOut, dependencies=[require_permission('settings')])
def update_supplier(sid: int, data: SupplierUpdate, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Fornitore trattamenti non trovato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/suppliers/{sid}", dependencies=[require_permission('settings')])
def delete_supplier(sid: int, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Fornitore trattamenti non trovato")
    block_if_in_use(
        db, f"Fornitore trattamenti '{s.name}'",
        (ManufacturingPhase, ManufacturingPhase.supplier_id == s.id, "fase", "fasi"),
        (Treatment, Treatment.supplier_id == s.id, "trattamento", "trattamenti"),
    )
    db.delete(s)
    db.commit()
    return {"ok": True}


# --- Treatments ---
@router.get("/treatments", response_model=List[TreatmentOut])
def list_treatments(db: Session = Depends(get_db)):
    return db.query(Treatment).options(joinedload(Treatment.supplier)).order_by(Treatment.name).all()


@router.post("/treatments", response_model=TreatmentOut, dependencies=[require_permission('settings')])
def create_treatment(data: TreatmentCreate, db: Session = Depends(get_db)):
    t = Treatment(**data.model_dump())
    db.add(t)
    db.commit()
    return db.query(Treatment).options(joinedload(Treatment.supplier)).filter(Treatment.id == t.id).first()


@router.put("/treatments/{tid}", response_model=TreatmentOut, dependencies=[require_permission('settings')])
def update_treatment(tid: int, data: TreatmentUpdate, db: Session = Depends(get_db)):
    t = db.query(Treatment).filter(Treatment.id == tid).first()
    if not t:
        raise HTTPException(404, "Trattamento non trovato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    return db.query(Treatment).options(joinedload(Treatment.supplier)).filter(Treatment.id == tid).first()


@router.delete("/treatments/{tid}", dependencies=[require_permission('settings')])
def delete_treatment(tid: int, db: Session = Depends(get_db)):
    t = db.query(Treatment).filter(Treatment.id == tid).first()
    if not t:
        raise HTTPException(404, "Trattamento non trovato")
    block_if_in_use(
        db, f"Trattamento '{t.name}'",
        (ManufacturingPhase, ManufacturingPhase.treatment_id == t.id, "fase", "fasi"),
    )
    db.delete(t)
    db.commit()
    return {"ok": True}
