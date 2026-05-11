from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.catalog_protect import block_if_in_use
from app.core.database import get_db
from app.core.security import require_permission
from app.models import Material, MaterialSupplier, Part
from app.schemas import (
    MaterialCreate, MaterialUpdate, MaterialOut,
    MaterialSupplierCreate, MaterialSupplierUpdate, MaterialSupplierOut,
)

router = APIRouter(prefix="/api", tags=["materials"])


# --- Material Suppliers ---
@router.get("/material-suppliers", response_model=List[MaterialSupplierOut])
def list_material_suppliers(db: Session = Depends(get_db)):
    return db.query(MaterialSupplier).order_by(MaterialSupplier.name).all()


@router.post("/material-suppliers", response_model=MaterialSupplierOut, dependencies=[require_permission('settings')])
def create_material_supplier(data: MaterialSupplierCreate, db: Session = Depends(get_db)):
    s = MaterialSupplier(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/material-suppliers/{sid}", response_model=MaterialSupplierOut, dependencies=[require_permission('settings')])
def update_material_supplier(sid: int, data: MaterialSupplierUpdate, db: Session = Depends(get_db)):
    s = db.query(MaterialSupplier).filter(MaterialSupplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Fornitore materiali non trovato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/material-suppliers/{sid}", dependencies=[require_permission('settings')])
def delete_material_supplier(sid: int, db: Session = Depends(get_db)):
    s = db.query(MaterialSupplier).filter(MaterialSupplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Fornitore materiali non trovato")
    block_if_in_use(
        db, f"Fornitore materiali '{s.name}'",
        (Material, Material.supplier_id == s.id, "materiale", "materiali"),
    )
    db.delete(s)
    db.commit()
    return {"ok": True}


# --- Materials ---
@router.get("/materials", response_model=List[MaterialOut])
def list_materials(db: Session = Depends(get_db)):
    return db.query(Material).options(joinedload(Material.material_supplier)).order_by(Material.name).all()


@router.post("/materials", response_model=MaterialOut, dependencies=[require_permission('settings')])
def create_material(data: MaterialCreate, db: Session = Depends(get_db)):
    m = Material(**data.model_dump())
    db.add(m)
    db.commit()
    return db.query(Material).options(joinedload(Material.material_supplier)).filter(Material.id == m.id).first()


@router.put("/materials/{mid}", response_model=MaterialOut, dependencies=[require_permission('settings')])
def update_material(mid: int, data: MaterialUpdate, db: Session = Depends(get_db)):
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    return db.query(Material).options(joinedload(Material.material_supplier)).filter(Material.id == mid).first()


@router.delete("/materials/{mid}", dependencies=[require_permission('settings')])
def delete_material(mid: int, db: Session = Depends(get_db)):
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    block_if_in_use(
        db, f"Materiale '{m.name}'",
        (Part, Part.material_id == m.id, "parte", "parti"),
    )
    db.delete(m)
    db.commit()
    return {"ok": True}
