"""API ordini materiali.

Estrae da N preventivi selezionati la lista dei materiali grezzi
aggregata per fornitore. Click "Esporta PDF" → 3 azioni atomiche:
1. crea record MaterialOrder + join sui quote
2. marca i quote con material_ordered_at + material_ordered_by_user_id
3. notifica a ufficio_tecnico + amministrazione

L'ordine NON è una transazione verso il fornitore — è un documento di
lavoro che poi viene inserito nel gestionale aziendale.

Conto lavoro: le parti con `customer_supplied_material=True` sono ESCLUSE
dall'aggregazione (il cliente porta il materiale, non si ordina).

Materiale a magazzino: le parti con `material_from_stock=True` sono INCLUSE
nell'aggregazione ma marcate con `from_stock=True` per render badge UI/PDF
(l'utente le vede comunque nella lista del fornitore abituale, ma marcate
come "Da magazzino" per non confonderle con materiale da ordinare).
"""
import asyncio
import logging
import math
import os
import tempfile
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db, utc_now
from app.core.security import get_current_user, require_permission
from app.models import (
    CompanySettings, MaterialOrder, MaterialOrderQuote,
    Part, Quote, User,
)
from app.schemas import (
    MaterialAggregateOut, MaterialAggregateBySupplier, MaterialItemAggregated,
    MaterialOrderCreate, MaterialOrderOut, QuoteOut,
)
from app.services.notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/orders/materials", tags=["orders"])

_can_orders = require_permission('orders.materials')


# ─── Aggregazione materiali ─────────────────────────────────────────────────

def _dim_signature(part: Part) -> Tuple:
    """Tupla normalizzata che identifica le dimensioni grezzo.

    Parti con stesse dimensioni e stesso materiale vengono aggregate in
    un'unica riga sull'ordine (es. 4 piastre 80×120×30 → "4 pz" sulla
    stessa voce).
    """
    if part.raw_diameter_mm:
        return ('round', round(part.raw_diameter_mm or 0, 2), round(part.raw_z_mm or 0, 2))
    return ('prism',
            round(part.raw_x_mm or 0, 2),
            round(part.raw_y_mm or 0, 2),
            round(part.raw_z_mm or 0, 2))


def _format_dim(part: Part) -> str:
    """Stringa human-readable delle dimensioni grezzo."""
    if part.raw_diameter_mm:
        l = part.raw_z_mm or 0
        if l:
            return f"Tondo Ø{part.raw_diameter_mm:g} × {l:g} mm"
        return f"Tondo Ø{part.raw_diameter_mm:g} mm"
    if part.raw_x_mm and part.raw_y_mm and part.raw_z_mm:
        return f"Prismatico {part.raw_x_mm:g} × {part.raw_y_mm:g} × {part.raw_z_mm:g} mm"
    return "—"


def _estimate_weight_kg(part: Part) -> float:
    """Peso stimato del grezzo della parte (1 pz × qty)."""
    if part.raw_weight_kg:
        return part.raw_weight_kg * (part.quantity or 1)
    mat = part.material
    if not mat or not mat.density_kg_dm3:
        return 0.0
    qty = part.quantity or 1
    if part.raw_diameter_mm:
        r = part.raw_diameter_mm / 2
        l = part.raw_z_mm or 0
        return (math.pi * r * r * l / 1_000_000) * mat.density_kg_dm3 * qty
    if part.raw_x_mm and part.raw_y_mm and part.raw_z_mm:
        return (part.raw_x_mm * part.raw_y_mm * part.raw_z_mm / 1_000_000) * mat.density_kg_dm3 * qty
    return 0.0


def aggregate_materials(quote_ids: List[int], db: Session) -> MaterialAggregateOut:
    """Aggrega i materiali grezzi delle parti dei quote selezionati.

    Esclude parti `customer_supplied_material=True` (cliente porta materiale).
    Le parti `material_from_stock=True` sono INCLUSE ma marcate con
    `from_stock=True` nell'entry aggregata, perché l'utente vuole comunque
    vederle nella lista del fornitore abituale (con badge "Da magazzino").
    Raggruppa per (supplier_id, material_id, dim_signature, from_stock).
    Le parti senza `material_id` vengono escluse (niente materiale = niente
    da ordinare).
    """
    parts = db.query(Part).options(
        joinedload(Part.material).joinedload(__import__('app.models', fromlist=['Material']).Material.material_supplier),
        joinedload(Part.quote),
    ).filter(Part.quote_id.in_(quote_ids)).all()

    # Aggregazione: key = (supplier_id, material_id, dim_sig, from_stock)
    aggr: Dict[Tuple, Dict[str, Any]] = defaultdict(lambda: {
        'material_id': None,
        'material_name': '',
        'family': None,
        'dim_str': '',
        'total_qty': 0,
        'total_weight_kg': 0.0,
        'supplier_id': None,
        'supplier_name': '',
        'from_stock': False,
        'quote_refs': defaultdict(int),  # quote_number → qty totale
    })

    for p in parts:
        if p.customer_supplied_material:
            continue
        if not p.material_id or not p.material:
            continue

        mat = p.material
        sup = mat.material_supplier
        sup_id = mat.supplier_id
        sup_name = sup.name if sup else 'Senza fornitore'

        # Key estesa con `from_stock`: una stessa combinazione
        # (supplier, material, dim) può avere 2 righe distinte se ci sono
        # parti normali E parti a magazzino → l'utente le vede separate.
        key = (sup_id, p.material_id, _dim_signature(p), bool(p.material_from_stock))
        slot = aggr[key]
        slot['material_id'] = p.material_id
        slot['material_name'] = mat.name
        slot['family'] = mat.family
        slot['dim_str'] = _format_dim(p)
        slot['supplier_id'] = sup_id
        slot['supplier_name'] = sup_name
        slot['from_stock'] = bool(p.material_from_stock)
        slot['total_qty'] += (p.quantity or 1)
        slot['total_weight_kg'] += _estimate_weight_kg(p)
        if p.quote:
            slot['quote_refs'][p.quote.quote_number] += (p.quantity or 1)

    # Raggruppo per supplier_id
    by_supplier: Dict[Optional[int], MaterialAggregateBySupplier] = {}
    for key, slot in aggr.items():
        sup_id = slot['supplier_id']
        if sup_id not in by_supplier:
            by_supplier[sup_id] = MaterialAggregateBySupplier(
                supplier_id=sup_id,
                supplier_name=slot['supplier_name'],
                items=[],
            )
        refs = [f"{qn} ×{qty}" for qn, qty in sorted(slot['quote_refs'].items())]
        by_supplier[sup_id].items.append(MaterialItemAggregated(
            material_id=slot['material_id'],
            material_name=slot['material_name'],
            family=slot['family'],
            dim_str=slot['dim_str'],
            total_qty=slot['total_qty'],
            total_weight_kg=round(slot['total_weight_kg'], 3),
            quote_refs=refs,
            from_stock=slot['from_stock'],
        ))

    # Ordina items dentro ogni gruppo per nome materiale; gruppi per nome fornitore.
    for g in by_supplier.values():
        g.items.sort(key=lambda i: (i.material_name, i.dim_str))
    groups = sorted(by_supplier.values(), key=lambda g: (g.supplier_id is None, g.supplier_name))

    return MaterialAggregateOut(groups=groups)


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _=_can_orders) -> Dict[str, Any]:
    """KPI mini-dashboard per /orders/materials.

    - `to_order`: preventivi completati senza material_ordered_at (= preview pronto)
    - `orders_this_month`: ordini creati nel mese corrente (UTC)
    - `orders_total`: ordini emessi all-time
    - `last_order_at`: timestamp ISO ultimo ordine (None se nessuno)
    """
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    to_order = db.query(Quote).filter(
        Quote.status == 'completato',
        Quote.material_ordered_at.is_(None),
    ).count()

    orders_total = db.query(MaterialOrder).count()
    orders_this_month = db.query(MaterialOrder).filter(
        MaterialOrder.created_at >= month_start
    ).count()

    last = db.query(MaterialOrder).order_by(MaterialOrder.created_at.desc()).first()
    last_order_at = last.created_at.isoformat() if last and last.created_at else None

    return {
        "to_order": to_order,
        "orders_this_month": orders_this_month,
        "orders_total": orders_total,
        "last_order_at": last_order_at,
    }


@router.get("/quotes-selectable", response_model=List[QuoteOut])
def list_selectable_quotes(
    status: Optional[str] = "completato",
    q: Optional[str] = None,
    only_unordered: bool = True,
    db: Session = Depends(get_db),
    _=_can_orders,
):
    """Preventivi selezionabili per creare un ordine materiali.

    Default: solo `completato`, solo quelli senza flag material_ordered_at.
    Toggle `only_unordered=false` per vedere anche quelli già ordinati.
    Toggle `status=null` per vedere tutti gli stati.
    """
    query = db.query(Quote).options(
        joinedload(Quote.parts).joinedload(Part.material),
        joinedload(Quote.material_ordered_by),
    )
    if status:
        query = query.filter(Quote.status == status)
    if only_unordered:
        query = query.filter(Quote.material_ordered_at.is_(None))
    if q:
        like = f"%{q.strip()}%"
        from sqlalchemy import or_
        query = query.filter(or_(
            Quote.quote_number.ilike(like),
            Quote.customer_name.ilike(like),
        ))
    return query.order_by(Quote.quote_date.desc().nullslast(), Quote.id.desc()).limit(200).all()


@router.post("/aggregate", response_model=MaterialAggregateOut)
def preview_aggregate(
    payload: MaterialOrderCreate,
    db: Session = Depends(get_db),
    _=_can_orders,
):
    """Preview senza side effect: ritorna la lista materiali aggregata."""
    return aggregate_materials(payload.quote_ids, db)


@router.post("", response_model=MaterialOrderOut)
def create_order(
    payload: MaterialOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_orders,
):
    """Crea un MaterialOrder + marca i quote + manda notifica.

    Il PDF si scarica separatamente via GET /{id}/pdf (così se serve il
    download mancante per qualche errore di rete, l'utente può ripetere
    senza generare un nuovo MaterialOrder).
    """
    # Verifica che i quote esistano
    quotes = db.query(Quote).filter(Quote.id.in_(payload.quote_ids)).all()
    if len(quotes) != len(payload.quote_ids):
        raise HTTPException(status_code=400, detail="Uno o più preventivi non esistono")

    now = utc_now()
    order = MaterialOrder(created_by_user_id=current_user.id)
    db.add(order)
    db.flush()

    for q in quotes:
        db.add(MaterialOrderQuote(material_order_id=order.id, quote_id=q.id))
        q.material_ordered_at = now
        q.material_ordered_by_user_id = current_user.id

    db.commit()
    db.refresh(order)

    # Notifica ufficio tecnico + amministrazione
    actor_name = current_user.full_name or current_user.username
    quote_numbers = [q.quote_number for q in quotes]
    quote_list = ', '.join(quote_numbers[:5])
    if len(quote_numbers) > 5:
        quote_list += f" e altri {len(quote_numbers) - 5}"
    create_notification(
        db,
        type='materials_ordered',
        title=f"Ordine materiali #{order.id}",
        body=f"{actor_name} ha ordinato il materiale per {len(quotes)} preventivi: {quote_list}",
        created_by_user_id=current_user.id,
        target_roles=['ufficio_tecnico', 'amministrazione'],
        data={'order_id': order.id, 'quote_ids': payload.quote_ids},
    )

    logger.info("Ordine materiali creato: id=%s by=%s n_quotes=%d",
                order.id, current_user.username, len(quotes))

    return _order_to_out(order, db)


@router.get("", response_model=List[MaterialOrderOut])
def list_orders(
    db: Session = Depends(get_db),
    _=_can_orders,
    limit: int = 50,
    q: Optional[str] = None,
):
    """Storico ordini, ultimi N in ordine cronologico desc.

    `q` (opzionale) cerca in:
    - numero ordine (es. "23" o "MO-0023" match l'id 23)
    - numero preventivo incluso (via join, es. "240-26A_010")
    - username o nome del creatore
    """
    query = db.query(MaterialOrder).options(
        joinedload(MaterialOrder.created_by),
        joinedload(MaterialOrder.quotes),
    )

    if q and q.strip():
        from sqlalchemy import or_
        term = q.strip()
        like = f"%{term}%"

        # Estrai eventuale id numerico (anche dopo "MO-")
        id_match: Optional[int] = None
        digits = term.replace('MO-', '').replace('mo-', '').lstrip('0')
        if digits.isdigit():
            id_match = int(digits)

        # JOIN espliciti su tabella associativa + Quote + User creatore.
        # Uso outer join per non escludere ordini senza quote (edge case) o
        # senza created_by_user_id (admin diretto su DB).
        query = (
            query
            .outerjoin(MaterialOrderQuote, MaterialOrderQuote.material_order_id == MaterialOrder.id)
            .outerjoin(Quote, Quote.id == MaterialOrderQuote.quote_id)
            .outerjoin(User, User.id == MaterialOrder.created_by_user_id)
        )
        conditions = [
            Quote.quote_number.ilike(like),
            User.username.ilike(like),
            User.full_name.ilike(like),
        ]
        if id_match is not None:
            conditions.append(MaterialOrder.id == id_match)
        query = query.filter(or_(*conditions)).distinct()

    orders = query.order_by(MaterialOrder.created_at.desc()).limit(limit).all()
    return [_order_to_out(o, db) for o in orders]


@router.get("/{order_id}/pdf")
async def get_order_pdf(
    order_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _=_can_orders,
):
    """Rigenera il PDF dell'ordine on-demand (niente file salvato su disco)."""
    order = db.query(MaterialOrder).options(joinedload(MaterialOrder.quotes)).filter(
        MaterialOrder.id == order_id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")

    from app.api.orders_pdf import generate_order_pdf
    path = await asyncio.to_thread(generate_order_pdf, order_id, db)
    background_tasks.add_task(os.unlink, path)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename=f"ordine_materiali_{order_id:04d}.pdf",
    )


@router.delete("/quote-flag/{quote_id}")
def remove_quote_flag(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_orders,
):
    """Admin-only: rimuove il flag material_ordered da un preventivo (errore umano).

    NON rimuove il MaterialOrder che lo aveva incluso: l'ordine resta nello
    storico (è un documento di lavoro fatto in passato). Solo il flag sul
    Quote viene resettato così quel preventivo torna selezionabile.
    """
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Solo admin può rimuovere il flag ordine")
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    quote.material_ordered_at = None
    quote.material_ordered_by_user_id = None
    db.commit()
    logger.info("Flag material_ordered rimosso: quote_id=%s by=%s", quote_id, current_user.username)
    return {"ok": True}


# ─── Helpers ────────────────────────────────────────────────────────────────

def _order_to_out(order: MaterialOrder, db: Session) -> MaterialOrderOut:
    """Serializza MaterialOrder con conteggio + lista quote numbers."""
    # quotes già caricato via relationship m2m
    quote_numbers = sorted([q.quote_number for q in order.quotes])
    cb = order.created_by
    return MaterialOrderOut(
        id=order.id,
        created_at=order.created_at,
        created_by={'id': cb.id, 'username': cb.username, 'full_name': cb.full_name} if cb else None,
        quote_count=len(order.quotes),
        quote_numbers=quote_numbers,
    )
