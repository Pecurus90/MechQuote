"""CRUD Vendite dirette (extra-preventivo).

Vendite di componenti NON passate da un preventivo (ricambi, vendite dirette):
codice, prezzo di vendita e costo (unitari) + quantità. Il totale
(unit × quantity) confluisce nel 'venduto'/'costo' annuo della dashboard
insieme ai preventivi completati (vedi api/dashboard.get_monthly).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models import DirectSale, Quote, User
from app.schemas import DirectSaleCreate, DirectSaleOut, DirectSaleUpdate
from app.services.notifications import emit_activity

router = APIRouter(prefix="/api/direct-sales", tags=["direct-sales"])
_can = require_permission('sales.direct')


def _ensure_code_free(code: str, db: Session, exclude_id: Optional[int] = None) -> None:
    """Il codice generato deve essere univoco anche rispetto ai preventivi:
    non deve collidere né con un'altra vendita diretta né con un quote_number."""
    q = db.query(DirectSale).filter(DirectSale.code == code)
    if exclude_id is not None:
        q = q.filter(DirectSale.id != exclude_id)
    if q.first():
        raise HTTPException(status_code=400, detail=f"Codice '{code}' già usato da un'altra vendita diretta")
    if db.query(Quote).filter(Quote.quote_number == code).first():
        raise HTTPException(status_code=400, detail=f"Codice '{code}' già usato da un preventivo")


def _reload(sale_id: int, db: Session) -> DirectSale:
    return db.query(DirectSale).options(
        joinedload(DirectSale.created_by)
    ).filter(DirectSale.id == sale_id).first()


@router.get("", response_model=List[DirectSaleOut])
def list_sales(year: Optional[int] = None, db: Session = Depends(get_db), _=_can):
    """Elenco vendite dirette, più recenti prima. `year` opzionale filtra per anno."""
    query = db.query(DirectSale).options(joinedload(DirectSale.created_by))
    if year is not None:
        query = query.filter(func.strftime('%Y', DirectSale.sale_date) == str(year))
    return query.order_by(DirectSale.sale_date.desc(), DirectSale.id.desc()).limit(500).all()


@router.post("", response_model=DirectSaleOut)
def create_sale(
    data: DirectSaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can,
):
    _ensure_code_free(data.code, db)
    sale = DirectSale(**data.model_dump(), created_by_user_id=current_user.id)
    db.add(sale)
    db.commit()
    # Traccia nel feed Attività del team (solo feed, non nell'inbox: sentinella).
    total = (sale.unit_price or 0) * (sale.quantity or 1)
    importo = f"{total:.2f}".replace(".", ",")
    emit_activity(
        db,
        type="direct_sale_created",
        title=f"Vendita diretta {sale.code} registrata",
        body=f"{sale.customer_name or '—'} · € {importo}",
        created_by_user_id=current_user.id,
    )
    return _reload(sale.id, db)


@router.put("/{sale_id}", response_model=DirectSaleOut)
def update_sale(sale_id: int, data: DirectSaleUpdate, db: Session = Depends(get_db), _=_can):
    sale = db.query(DirectSale).filter(DirectSale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Vendita non trovata")
    if data.code is not None and data.code != sale.code:
        _ensure_code_free(data.code, db, exclude_id=sale_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(sale, k, v)
    db.commit()
    return _reload(sale_id, db)


@router.delete("/{sale_id}")
def delete_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can,
):
    sale = db.query(DirectSale).filter(DirectSale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Vendita non trovata")
    code, cliente = sale.code, sale.customer_name or "—"
    db.delete(sale)
    db.commit()
    # Feed team: tracciamo le sparizioni (una vendita eliminata è un evento).
    emit_activity(
        db,
        type="direct_sale_deleted",
        title=f"Vendita diretta {code} eliminata",
        body=cliente,
        created_by_user_id=current_user.id,
    )
    return {"ok": True}
