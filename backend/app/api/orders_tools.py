"""API ordini utensili: preview low-stock + crea ordine per fornitore + CSV.

Un ordine utensili = UN fornitore: il gestionale tratta ogni fornitore come
un ordine separato, quindi l'export genera un file CSV per fornitore.

- Preview: stato CORRENTE degli utensili sotto-minimo, raggruppato per fornitore
- Crea ordine: si sceglie un fornitore → snapshot dei suoi utensili sotto-minimo
  → record ToolOrder + N items + notifica a ufficio tecnico/amministrazione
- Storico: lista ToolOrder con conteggi
- CSV: rigenera dal snapshot del record (storico stabile), nome per-fornitore
"""
import logging
from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.csv_import import csv_export_response, sanitize_filename_part
from app.core.database import get_db, utc_now
from app.core.security import get_current_user, require_permission
from app.models import Tool, ToolOrder, ToolOrderItem, User
from app.schemas import ToolOrderCreate, ToolOrderDetailOut, ToolOrderOut
from app.services.notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/orders/tools", tags=["orders"])

_can_orders_tools = require_permission('orders.tools')

# Colonne del CSV ordine utensili (ordine fisso, allineato al gestionale).
_CSV_COLUMNS = ['Codice', 'Tipo', 'Marca', 'Modello', 'Ø (mm)', 'Qtà da ordinare']


def _low_stock_query(db: Session, supplier_id: Optional[int] = None):
    q = db.query(Tool).options(joinedload(Tool.tool_supplier)).filter(
        Tool.active == True,  # noqa: E712
        Tool.quantity < Tool.minimum_quantity,
        Tool.minimum_quantity > 0,
    )
    if supplier_id is not None:
        q = q.filter(Tool.tool_supplier_id == supplier_id)
    return q.order_by(Tool.code)


@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _=_can_orders_tools):
    """KPI mini-dashboard per /orders/tools.

    - `low_stock`: utensili sotto-minimo (= preview pronto)
    - `total_active`: utensili attivi nel catalogo
    - `orders_this_month`: ordini emessi nel mese corrente (UTC)
    - `orders_total`: ordini all-time
    - `last_order_at`: ISO timestamp ultimo ordine (None se nessuno)
    """
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    low_stock = db.query(Tool).filter(
        Tool.active == True,  # noqa: E712
        Tool.quantity < Tool.minimum_quantity,
        Tool.minimum_quantity > 0,
    ).count()

    total_active = db.query(Tool).filter(Tool.active == True).count()  # noqa: E712

    orders_total = db.query(ToolOrder).count()
    orders_this_month = db.query(ToolOrder).filter(
        ToolOrder.created_at >= month_start
    ).count()

    last = db.query(ToolOrder).order_by(ToolOrder.created_at.desc()).first()
    last_order_at = last.created_at.isoformat() if last and last.created_at else None

    return {
        "low_stock": low_stock,
        "total_active": total_active,
        "orders_this_month": orders_this_month,
        "orders_total": orders_total,
        "last_order_at": last_order_at,
    }


@router.get("/preview")
def preview_low_stock(db: Session = Depends(get_db), _=_can_orders_tools):
    """Preview live: utensili sotto-minimo raggruppati per fornitore.

    Niente side effect — pura read. Il frontend la usa per far scegliere il
    fornitore e mostrare cosa finirà nel CSV se si crea l'ordine.
    `supplier_id` è `None` per il gruppo "Senza fornitore" (non ordinabile).
    """
    tools = _low_stock_query(db).all()
    grouped: dict = defaultdict(list)
    names: dict = {}
    for t in tools:
        sid = t.tool_supplier_id if t.tool_supplier else None
        names[sid] = t.tool_supplier.name if t.tool_supplier else 'Senza fornitore'
        grouped[sid].append({
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
        {"supplier_id": sid, "supplier_name": names[sid], "items": grouped[sid]}
        for sid in sorted(grouped.keys(), key=lambda s: (s is None, names[s].lower()))
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
        "supplier_name": order.supplier_name,
        "item_count": len(order.items),
        "total_quantity": sum(it.quantity_to_order for it in order.items),
    }


@router.post("", response_model=ToolOrderOut)
def create_tool_order(
    payload: ToolOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_orders_tools,
):
    """Crea un ToolOrder per un fornitore dallo stato attuale dei suoi utensili.

    Snapshot dei dati (code, brand, qty al momento) per uno storico stabile:
    il CSV rigenerato in futuro rifletterà lo stato del momento dell'ordine.
    Manda notifica a ufficio tecnico + amministrazione.
    """
    tools = _low_stock_query(db, supplier_id=payload.supplier_id).all()
    if not tools:
        raise HTTPException(
            status_code=400,
            detail="Nessun utensile sotto la quantità minima per questo fornitore",
        )

    sup = tools[0].tool_supplier
    sup_name = sup.name if sup else 'Senza fornitore'

    order = ToolOrder(
        created_by_user_id=current_user.id,
        triggered_by='manual',
        supplier_name=sup_name,
    )
    db.add(order)
    db.flush()

    for t in tools:
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

    actor_name = current_user.full_name or current_user.username
    create_notification(
        db,
        type='tools_ordered',
        title=f"Ordine utensili UO-{order.id:04d}",
        body=f"{actor_name} ha creato un ordine utensili per {sup_name} "
             f"({len(tools)} utensil{'e' if len(tools) == 1 else 'i'})",
        created_by_user_id=current_user.id,
        target_roles=['ufficio_tecnico', 'amministrazione'],
        data={'order_id': order.id, 'supplier_name': sup_name, 'navigate_to': '/orders/history'},
    )

    logger.info("Ordine utensili creato: id=%s supplier=%s by=%s items=%d",
                order.id, sup_name, current_user.username, len(tools))
    return _order_to_out(order)


@router.get("", response_model=List[ToolOrderOut])
def list_tool_orders(
    q: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _=_can_orders_tools,
):
    """Storico ordini utensili, ordine desc.

    Filtro `q`: cerca su id ordine (UO-NNNN), username/full_name creatore,
    codice utensile contenuto, nome fornitore (dell'ordine o snapshot item).
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
            ToolOrder.supplier_name.ilike(like),
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
def get_tool_order_detail(order_id: int, db: Session = Depends(get_db), _=_can_orders_tools):
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


@router.delete("/{order_id}")
def delete_tool_order(order_id: int, db: Session = Depends(get_db), _=_can_orders_tools):
    """Cancella un ordine utensili dallo storico.

    L'ordine è uno snapshot puro (nessun flag vivo sugli utensili): la
    cancellazione rimuove il record e i suoi item in cascade, senza altri
    effetti collaterali.
    """
    order = db.query(ToolOrder).filter(ToolOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    db.delete(order)  # cascade all, delete-orphan sugli item
    db.commit()
    logger.info("Ordine utensili eliminato: id=%s", order_id)
    return {"ok": True}


@router.get("/{order_id}/csv")
def get_tool_order_csv(order_id: int, db: Session = Depends(get_db), _=_can_orders_tools):
    """Genera il CSV dell'ordine dal suo snapshot (un file per fornitore).

    Nome file `AAAAMMGG_HHmm_<fornitore>.csv`: il gestionale importa un
    ordine per fornitore. Formato `;` + UTF-8 con BOM (Excel italiano ok).
    """
    order = db.query(ToolOrder).options(
        joinedload(ToolOrder.items)
    ).filter(ToolOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")

    rows = [
        [
            it.code_snapshot,
            it.tool_type_snapshot or '',
            it.brand_snapshot or '',
            it.model_snapshot or '',
            f"{it.diameter_snapshot:g}" if it.diameter_snapshot is not None else '',
            it.quantity_to_order,
        ]
        for it in order.items
    ]

    ts = order.created_at.strftime('%Y%m%d_%H%M') if order.created_at else f"UO{order.id:04d}"
    filename = f"{ts}_{sanitize_filename_part(order.supplier_name)}.csv"
    return csv_export_response(filename=filename, columns=_CSV_COLUMNS, rows=rows)
