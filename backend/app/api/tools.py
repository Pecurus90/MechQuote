"""API gestione utensili + ordini utensili (low-stock).

Modello: catalogo utensili officina con `quantity` corrente e
`minimum_quantity` soglia low-stock. Quando `quantity < minimum_quantity`
l'utensile è in stato "low-stock" → entra automaticamente nell'ordine
PDF aggregato per fornitore.

Notifica settimanale: endpoint POST /notify-low-stock chiamato dal
Windows Task Scheduler (es. ogni martedì alle 8:00). Crea una
notifica `tools_low_stock_alert` per i ruoli ufficio_tecnico +
amministrazione, idempotente sullo stesso giorno.
"""
import asyncio
import logging
import os
import tempfile
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db, utc_now
from app.core.security import get_current_user, require_permission
from app.models import Notification, Supplier, Tool, User
from app.schemas import ToolCreate, ToolOut, ToolUpdate
from app.services.notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tools", tags=["tools"])

_can_tools = require_permission('tools')


# ─── CRUD ───────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ToolOut])
def list_tools(
    tool_type: Optional[str] = None,
    brand: Optional[str] = None,
    supplier_id: Optional[int] = None,
    low_stock_only: bool = False,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _=_can_tools,
):
    """Elenco utensili con filtri opzionali."""
    query = db.query(Tool).options(joinedload(Tool.supplier))
    if tool_type:
        query = query.filter(Tool.tool_type == tool_type)
    if brand:
        query = query.filter(Tool.brand == brand)
    if supplier_id is not None:
        query = query.filter(Tool.supplier_id == supplier_id)
    if low_stock_only:
        query = query.filter(Tool.quantity < Tool.minimum_quantity)
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
    return db.query(Tool).options(joinedload(Tool.supplier)).filter(Tool.id == tool.id).first()


@router.put("/{tool_id}", response_model=ToolOut)
def update_tool(tool_id: int, data: ToolUpdate, db: Session = Depends(get_db), _=_can_tools):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Utensile non trovato")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(tool, k, v)
    db.commit()
    return db.query(Tool).options(joinedload(Tool.supplier)).filter(Tool.id == tool_id).first()


@router.delete("/{tool_id}")
def delete_tool(tool_id: int, db: Session = Depends(get_db), _=_can_tools):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Utensile non trovato")
    db.delete(tool)
    db.commit()
    return {"ok": True}


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


@router.get("/low-stock/pdf")
async def low_stock_pdf(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _=_can_tools,
):
    """Rigenera on-demand il PDF dell'ordine utensili sotto-minimo.

    Niente file salvato su disco: ogni volta che lo scarichi rispecchia
    lo stato attuale del magazzino.
    """
    from app.api.tools_pdf import generate_tools_low_stock_pdf
    path = await asyncio.to_thread(generate_tools_low_stock_pdf, db)
    background_tasks.add_task(os.unlink, path)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename=f"ordine_utensili_{utc_now().strftime('%Y%m%d')}.pdf",
    )


@router.post("/notify-low-stock")
def notify_low_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_tools,
):
    """Crea una notifica `tools_low_stock_alert` se ci sono utensili sotto minimo.

    Idempotente per giorno: se c'è già una notifica dello stesso tipo
    creata oggi, no-op (evita spam se il Task Scheduler partisse più volte).
    """
    from sqlalchemy import func as sa_func
    count = db.query(Tool).filter(
        Tool.active == True,  # noqa: E712
        Tool.quantity < Tool.minimum_quantity,
        Tool.minimum_quantity > 0,
    ).count()
    if count == 0:
        return {"ok": True, "low_stock_count": 0, "notification_created": False, "reason": "no_low_stock"}

    # Dedup giornaliero
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
        body=f"{count} utensil{'e' if count == 1 else 'i'} sotto la quantità minima. Clicca per generare il PDF ordine.",
        created_by_user_id=current_user.id if current_user else None,
        target_roles=['ufficio_tecnico', 'amministrazione'],
        data={'low_stock_count': count, 'pdf_endpoint': '/api/tools/low-stock/pdf'},
    )
    logger.info("Notifica tools_low_stock_alert creata: %d utensili sotto minimo", count)
    return {"ok": True, "low_stock_count": count, "notification_created": True}
