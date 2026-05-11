"""API gestione utensili + scan barcode + notifica low-stock.

Il PDF ordine utensili è stato spostato in `api/orders_tools.py` (sezione
Ordini sidebar). Qui resta solo CRUD utensili + scan +/- + notifica.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db, utc_now
from app.core.security import get_current_user, require_permission
from app.models import Notification, Tool, ToolSupplier, User
from app.schemas import (
    ToolCreate, ToolOut, ToolScanRequest, ToolUpdate,
    ToolSupplierCreate, ToolSupplierOut, ToolSupplierUpdate,
)
from app.services.notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])

_can_tools = require_permission('tools')


# ─── Tool suppliers (CRUD separato) ─────────────────────────────────────────

@router.get("/suppliers", response_model=List[ToolSupplierOut])
def list_tool_suppliers(db: Session = Depends(get_db), _=_can_tools):
    return db.query(ToolSupplier).order_by(ToolSupplier.name).all()


@router.post("/suppliers", response_model=ToolSupplierOut)
def create_tool_supplier(data: ToolSupplierCreate, db: Session = Depends(get_db), _=_can_tools):
    sup = ToolSupplier(**data.model_dump())
    db.add(sup)
    db.commit()
    db.refresh(sup)
    return sup


@router.put("/suppliers/{sid}", response_model=ToolSupplierOut)
def update_tool_supplier(sid: int, data: ToolSupplierUpdate, db: Session = Depends(get_db), _=_can_tools):
    sup = db.query(ToolSupplier).filter(ToolSupplier.id == sid).first()
    if not sup:
        raise HTTPException(status_code=404, detail="Fornitore non trovato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(sup, k, v)
    db.commit()
    db.refresh(sup)
    return sup


@router.delete("/suppliers/{sid}")
def delete_tool_supplier(sid: int, db: Session = Depends(get_db), _=_can_tools):
    sup = db.query(ToolSupplier).filter(ToolSupplier.id == sid).first()
    if not sup:
        raise HTTPException(status_code=404, detail="Fornitore non trovato")
    # Check FK reverse: blocca delete se referenziato da utensili
    n = db.query(Tool).filter(Tool.tool_supplier_id == sid).count()
    if n > 0:
        raise HTTPException(status_code=400, detail=f"Fornitore in uso da {n} utensili — riassegnali prima")
    db.delete(sup)
    db.commit()
    return {"ok": True}


# ─── CRUD utensili ──────────────────────────────────────────────────────────

@router.get("", response_model=List[ToolOut])
def list_tools(
    tool_type: Optional[str] = None,
    brand: Optional[str] = None,
    tool_supplier_id: Optional[int] = None,
    low_stock_only: bool = False,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _=_can_tools,
):
    """Elenco utensili con filtri opzionali."""
    query = db.query(Tool).options(joinedload(Tool.tool_supplier))
    if tool_type:
        query = query.filter(Tool.tool_type == tool_type)
    if brand:
        query = query.filter(Tool.brand == brand)
    if tool_supplier_id is not None:
        query = query.filter(Tool.tool_supplier_id == tool_supplier_id)
    if low_stock_only:
        query = query.filter(Tool.quantity < Tool.minimum_quantity, Tool.minimum_quantity > 0)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            Tool.code.ilike(like),
            Tool.brand.ilike(like),
            Tool.model.ilike(like),
            Tool.tool_type.ilike(like),
        ))
    return query.order_by(Tool.code).limit(500).all()


@router.post("", response_model=ToolOut)
def create_tool(data: ToolCreate, db: Session = Depends(get_db), _=_can_tools):
    existing = db.query(Tool).filter(Tool.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Codice utensile '{data.code}' già esistente")
    tool = Tool(**data.model_dump())
    db.add(tool)
    db.commit()
    return db.query(Tool).options(joinedload(Tool.tool_supplier)).filter(Tool.id == tool.id).first()


@router.put("/{tool_id}", response_model=ToolOut)
def update_tool(tool_id: int, data: ToolUpdate, db: Session = Depends(get_db), _=_can_tools):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Utensile non trovato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(tool, k, v)
    db.commit()
    return db.query(Tool).options(joinedload(Tool.tool_supplier)).filter(Tool.id == tool_id).first()


@router.delete("/{tool_id}")
def delete_tool(tool_id: int, db: Session = Depends(get_db), _=_can_tools):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Utensile non trovato")
    db.delete(tool)
    db.commit()
    return {"ok": True}


# ─── Scan barcode (workflow officina) ────────────────────────────────────────

@router.post("/scan", response_model=ToolOut)
def scan_tool(
    data: ToolScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_tools,
):
    """Scan barcode utensile: +N (load) o -N (unload) sulla quantità.

    Ottimizzato per pistola barcode in officina: input rapido, niente
    conferma. La quantità non può scendere sotto 0. Ritorna il record
    aggiornato con il nuovo stato.
    """
    code = data.code.strip().upper()
    tool = db.query(Tool).options(joinedload(Tool.tool_supplier)).filter(
        Tool.code == code
    ).first()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Codice '{code}' non trovato")

    delta = data.quantity if data.mode == 'load' else -data.quantity
    new_qty = max(tool.quantity + delta, 0)
    tool.quantity = new_qty
    db.commit()
    db.refresh(tool)
    logger.info("Scan %s: %s qty %d→%d (by %s)",
                data.mode, code, new_qty - delta, new_qty, current_user.username)
    return tool


# ─── Low-stock ──────────────────────────────────────────────────────────────

@router.get("/low-stock-count")
def low_stock_count(db: Session = Depends(get_db), _=_can_tools):
    """Conteggio utensili sotto la quantità minima (per badge dashboard)."""
    n = db.query(Tool).filter(
        Tool.active == True,  # noqa: E712
        Tool.quantity < Tool.minimum_quantity,
        Tool.minimum_quantity > 0,
    ).count()
    return {"count": n}


@router.post("/notify-low-stock")
def notify_low_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_tools,
):
    """Crea notifica `tools_low_stock_alert` se ci sono utensili sotto minimo.

    Idempotente per giorno (no spam se il Task Scheduler partisse più volte).
    Chiamato dal Windows Task Scheduler settimanalmente (vedi INSTALLAZIONE.md).
    """
    count = db.query(Tool).filter(
        Tool.active == True,  # noqa: E712
        Tool.quantity < Tool.minimum_quantity,
        Tool.minimum_quantity > 0,
    ).count()
    if count == 0:
        return {"ok": True, "low_stock_count": 0, "notification_created": False, "reason": "no_low_stock"}

    today_start = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    existing = db.query(Notification).filter(
        Notification.type == 'tools_low_stock_alert',
        Notification.created_at >= today_start,
    ).first()
    if existing:
        return {"ok": True, "low_stock_count": count, "notification_created": False, "reason": "already_today"}

    create_notification(
        db,
        type='tools_low_stock_alert',
        title="Ordinare utensili",
        body=f"{count} utensil{'e' if count == 1 else 'i'} sotto la quantità minima. Apri Ordini utensili per generare il PDF.",
        created_by_user_id=current_user.id if current_user else None,
        target_roles=['ufficio_tecnico', 'amministrazione'],
        data={'low_stock_count': count, 'navigate_to': '/orders/tools'},
    )
    logger.info("Notifica tools_low_stock_alert creata: %d utensili sotto minimo", count)
    return {"ok": True, "low_stock_count": count, "notification_created": True}
