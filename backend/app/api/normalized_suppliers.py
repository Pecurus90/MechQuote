"""API fornitori di componenti normalizzati (viti, bulloni, cuscinetti, etc.).

Quarto tipo di fornitore in MechQuote (oltre a MaterialSupplier, Supplier per
trattamenti, ToolSupplier). Domini distinti per scelta — un componente
normalizzato è una parte acquistata intera, non materiale grezzo né utensile.

Linkato opzionalmente a OfficinaDocument per cataloghi (es. Bossard, Würth).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.catalog_protect import block_if_in_use, check_duplicate_name
from app.core.database import get_db
from app.core.security import require_any_permission, require_permission
from app.models import NormalizedSupplier, OfficinaDocument
from app.schemas import (
    NormalizedSupplierCreate, NormalizedSupplierOut, NormalizedSupplierUpdate,
)

router = APIRouter(prefix="/api/normalized-suppliers", tags=["normalized_suppliers"])

_can_write = require_permission('settings')
# Lettura: catalogo normalizzati (settings) o Officina che linka i documenti ai
# fornitori (officina). Chiude il leak di recapiti fornitore a utenti senza
# permesso (B1 audit finale run "b").
_can_read = require_any_permission('settings', 'officina')


@router.get("", response_model=List[NormalizedSupplierOut], dependencies=[_can_read])
def list_normalized_suppliers(
    active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """Elenco fornitori normalizzati. `active` opzionale: se True/False
    filtra, se omesso restituisce tutto (default invariato). Pattern di
    `normalized_items.list_items`."""
    query = db.query(NormalizedSupplier)
    if active is not None:
        query = query.filter(NormalizedSupplier.active == active)
    return query.order_by(NormalizedSupplier.name).all()


@router.post("", response_model=NormalizedSupplierOut, dependencies=[_can_write])
def create_normalized_supplier(data: NormalizedSupplierCreate, db: Session = Depends(get_db)):
    check_duplicate_name(db, NormalizedSupplier, data.name, label="fornitore normalizzato")
    sup = NormalizedSupplier(**data.model_dump())
    db.add(sup)
    db.commit()
    db.refresh(sup)
    return sup


@router.put("/{sid}", response_model=NormalizedSupplierOut, dependencies=[_can_write])
def update_normalized_supplier(sid: int, data: NormalizedSupplierUpdate, db: Session = Depends(get_db)):
    sup = db.query(NormalizedSupplier).filter(NormalizedSupplier.id == sid).first()
    if not sup:
        raise HTTPException(404, "Fornitore normalizzati non trovato")
    if data.name is not None:
        check_duplicate_name(db, NormalizedSupplier, data.name, label="fornitore normalizzato", exclude_id=sid)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(sup, k, v)
    db.commit()
    db.refresh(sup)
    return sup


@router.delete("/{sid}", dependencies=[_can_write])
def delete_normalized_supplier(sid: int, db: Session = Depends(get_db)):
    sup = db.query(NormalizedSupplier).filter(NormalizedSupplier.id == sid).first()
    if not sup:
        raise HTTPException(404, "Fornitore normalizzati non trovato")
    block_if_in_use(
        db, f"Fornitore normalizzati '{sup.name}'",
        (OfficinaDocument, OfficinaDocument.normalized_supplier_id == sid, "documento", "documenti"),
    )
    db.delete(sup)
    db.commit()
    return {"ok": True}
