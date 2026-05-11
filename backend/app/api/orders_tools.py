"""API ordini utensili: preview low-stock + crea ordine (snapshot) + storico + PDF.

Analogo a `api/orders.py` per i materiali, ma per utensili:
- Preview: stato CORRENTE degli utensili sotto-minimo, raggruppato per fornitore
- Crea ordine: snapshot dello stato attuale → record ToolOrder + N items
- Storico: lista ToolOrder con conteggi
- PDF: rigenera dal snapshot del record (storico stabile)
"""
import asyncio
import logging
import os
from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db, utc_now
from app.core.security import get_current_user, require_permission
from app.models import (
    Tool, ToolOrder, ToolOrderItem, ToolSupplier, User,
)
from app.schemas import ToolOrderDetailOut, ToolOrderOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/orders/tools", tags=["orders"])

_can_tools = require_permission('tools')


def _low_stock_query(db: Session):
    return db.query(Tool).options(joinedload(Tool.tool_supplier)).filter(
        Tool.active == True,  # noqa: E712
        Tool.quantity < Tool.minimum_quantity,
        Tool.minimum_quantity > 0,
    ).order_by(Tool.code)


@router.get("/preview")
def preview_low_stock(db: Session = Depends(get_db), _=_can_tools):
    """Preview live: utensili sotto-minimo raggruppati per fornitore.

    Niente side effect — pura read. Il frontend la usa per mostrare
    cosa finirà nel PDF se l'utente clicca "Genera ordine".
    """
    tools = _low_stock_query(db).all()
    grouped: dict = defaultdict(list)
    for t in tools:
        name = t.tool_supplier.name if t.tool_supplier else 'Senza fornitore'
        grouped[name].append({
            "tool_id": t.id,
            "code": t.code,
            "tool_type": t.tool_type,
            "brand": t.brand,
            "model": t.model,
            "diameter_mm": t.diameter_mm,
            "quantity": t.quantity,
            "minimum_quantity": t.minimum_quantity,
            "quantity_to_order": max(t.minimum_quantity - t.quantity, 1),
        })
    groups = [
        {"supplier_name": name, "items": grouped[name]}
        for name in sorted(grouped.keys(), key=lambda s: (s == 'Senza fornitore', s.lower()))
    ]
    return {
        "groups": groups,
        "total_tools": len(tools),
        "total_quantity": sum(max(t.minimum_quantity - t.quantity, 1) for t in tools),
    }


def _order_to_out(order: ToolOrder) -> dict:
    cb = order.created_by
    return {
        "id": order.id,
        "created_at": order.created_at,
        "created_by": {
            "id": cb.id, "username": cb.username, "full_name": cb.full_name,
        } if cb else None,
        "triggered_by": order.triggered_by or 'manual',
        "item_count": len(order.items),
        "total_quantity": sum(it.quantity_to_order for it in order.items),
    }


@router.post("", response_model=ToolOrderOut)
def create_tool_order(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_tools,
):
    """Crea un ToolOrder dallo stato attuale degli utensili low-stock.

    Snapshot dei dati (code, brand, supplier name, qty al momento) per
    avere uno storico stabile: il PDF rigenerato in futuro rifletterà
    sempre lo stato del momento dell'ordine.
    """
    tools = _low_stock_query(db).all()
    if not tools:
        raise HTTPException(status_code=400, detail="Nessun utensile sotto la quantità minima")

    order = ToolOrder(
        created_by_user_id=current_user.id,
        triggered_by='manual',
    )
    db.add(order)
    db.flush()

    for t in tools:
        sup_name = t.tool_supplier.name if t.tool_supplier else None
        qty_to_order = max(t.minimum_quantity - t.quantity, 1)
        db.add(ToolOrderItem(
            tool_order_id=order.id,
            tool_id=t.id,
            code_snapshot=t.code,
            tool_type_snapshot=t.tool_type,
            brand_snapshot=t.brand,
            model_snapshot=t.model,
            diameter_snapshot=t.diameter_mm,
            supplier_name_snapshot=sup_name,
            quantity_at_time=t.quantity,
            minimum_at_time=t.minimum_quantity,
            quantity_to_order=qty_to_order,
        ))

    db.commit()
    db.refresh(order)
    logger.info("Ordine utensili creato: id=%s by=%s items=%d",
                order.id, current_user.username, len(tools))
    return _order_to_out(order)


@router.get("", response_model=List[ToolOrderOut])
def list_tool_orders(
    q: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _=_can_tools,
):
    """Storico ordini utensili, ordine desc.

    Filtro `q`: cerca su id ordine (UO-NNNN), username/full_name
    creatore, codice utensile contenuto, nome fornitore snapshot.
    """
    query = db.query(ToolOrder).options(
        joinedload(ToolOrder.created_by),
        joinedload(ToolOrder.items),
    )

    if q and q.strip():
        term = q.strip()
        like = f"%{term}%"
        id_match: Optional[int] = None
        digits = term.replace('UO-', '').replace('uo-', '').lstrip('0')
        if digits.isdigit():
            id_match = int(digits)

        query = (
            query
            .outerjoin(ToolOrderItem, ToolOrderItem.tool_order_id == ToolOrder.id)
            .outerjoin(User, User.id == ToolOrder.created_by_user_id)
        )
        conds = [
            ToolOrderItem.code_snapshot.ilike(like),
            ToolOrderItem.supplier_name_snapshot.ilike(like),
            User.username.ilike(like),
            User.full_name.ilike(like),
        ]
        if id_match is not None:
            conds.append(ToolOrder.id == id_match)
        query = query.filter(or_(*conds)).distinct()

    orders = query.order_by(ToolOrder.created_at.desc()).limit(limit).all()
    return [_order_to_out(o) for o in orders]


@router.get("/{order_id}", response_model=ToolOrderDetailOut)
def get_tool_order_detail(order_id: int, db: Session = Depends(get_db), _=_can_tools):
    order = db.query(ToolOrder).options(
        joinedload(ToolOrder.created_by),
        joinedload(ToolOrder.items),
    ).filter(ToolOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    base = _order_to_out(order)
    base["items"] = [
        {
            "id": it.id,
            "tool_id": it.tool_id,
            "code_snapshot": it.code_snapshot,
            "tool_type_snapshot": it.tool_type_snapshot,
            "brand_snapshot": it.brand_snapshot,
            "model_snapshot": it.model_snapshot,
            "diameter_snapshot": it.diameter_snapshot,
            "supplier_name_snapshot": it.supplier_name_snapshot,
            "quantity_at_time": it.quantity_at_time,
            "minimum_at_time": it.minimum_at_time,
            "quantity_to_order": it.quantity_to_order,
        }
        for it in order.items
    ]
    return base


@router.get("/{order_id}/pdf")
async def get_tool_order_pdf(
    order_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _=_can_tools,
):
    """Rigenera il PDF dell'ordine dal suo snapshot."""
    from app.api.tools_pdf import generate_tool_order_pdf
    path = await asyncio.to_thread(generate_tool_order_pdf, order_id, db)
    background_tasks.add_task(os.unlink, path)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename=f"ordine_utensili_UO{order_id:04d}.pdf",
    )
