"""API Risultati tempra (Officina): registro misure pre/post trattamento.

CRUD su `HeatTreatmentResult`, una riga per pezzo trattato compilata a mano
dall'operatore. Gating coerente con il resto dell'Officina:
- lettura lista/dettaglio → permesso `officina`
- create/update/delete → permesso `officina.write`

Le deformazioni (delta post-pre) NON sono calcolate qui: si derivano in UI
dalle misure (gemello DRY in `frontend/.../tempra/tempraCalc.ts`).
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models import HeatTreatmentResult, User
from app.schemas import (
    HeatTreatmentResultCreate,
    HeatTreatmentResultOut,
    HeatTreatmentResultUpdate,
)

router = APIRouter(prefix="/api/officina/heat-treatments", tags=["officina"])

_can_read = require_permission('officina')
_can_write = require_permission('officina.write')


@router.get("", response_model=List[HeatTreatmentResultOut])
def list_results(db: Session = Depends(get_db), _=_can_read):
    """Lista risultati tempra, più recenti in cima."""
    return (
        db.query(HeatTreatmentResult)
        .options(joinedload(HeatTreatmentResult.created_by))
        .order_by(HeatTreatmentResult.created_at.desc(), HeatTreatmentResult.id.desc())
        .limit(1000)
        .all()
    )


@router.post("", response_model=HeatTreatmentResultOut)
def create_result(
    data: HeatTreatmentResultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    """Crea una nuova riga del registro tempra."""
    row = HeatTreatmentResult(
        **data.model_dump(),
        created_by_user_id=current_user.id if current_user else None,
    )
    db.add(row)
    db.commit()
    return (
        db.query(HeatTreatmentResult)
        .options(joinedload(HeatTreatmentResult.created_by))
        .filter(HeatTreatmentResult.id == row.id)
        .first()
    )


@router.put("/{result_id}", response_model=HeatTreatmentResultOut)
def update_result(
    result_id: int,
    data: HeatTreatmentResultUpdate,
    db: Session = Depends(get_db),
    _=_can_write,
):
    """Modifica una riga esistente del registro tempra."""
    row = db.query(HeatTreatmentResult).filter(HeatTreatmentResult.id == result_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Risultato tempra non trovato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    return (
        db.query(HeatTreatmentResult)
        .options(joinedload(HeatTreatmentResult.created_by))
        .filter(HeatTreatmentResult.id == row.id)
        .first()
    )


@router.delete("/{result_id}")
def delete_result(result_id: int, db: Session = Depends(get_db), _=_can_write):
    """Elimina una riga del registro tempra."""
    row = db.query(HeatTreatmentResult).filter(HeatTreatmentResult.id == result_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Risultato tempra non trovato")
    db.delete(row)
    db.commit()
    return {"ok": True}
