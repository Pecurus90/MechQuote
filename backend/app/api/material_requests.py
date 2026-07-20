"""API richieste materiale manuali (gemello del preventivo per il materiale).

Una richiesta materiale è un ordine "a mano"/da distinta che NON passa da un
preventivo. Ciclo di vita:

    bozza ──[POST /{id}/send]──> inviato ──[ordine emesso dal pool]──> (righe evase)

- `bozza`: modificabile liberamente (righe da aggiungere/correggere).
- `inviato`: entra nel pool di /orders/materials INSIEME ai preventivi da
  ordinare; parte la notifica "materiale da ordinare". Resta modificabile
  (matita nel pool) sulle righe ancora aperte.
- L'evasione è per riga (`MaterialRequestItem.material_order_id`): quando la
  riga confluisce in un `MaterialOrder` emesso è "evasa" e si blocca. La
  fusione col materiale dei preventivi per fornitore avviene nel router
  `orders.py` (step 3), non qui.

Le righe hanno la stessa forma di quelle ordine-da-file (`FileOrderRow`): il
parse della distinta SolidWorks (orders_from_file) le produce già pronte.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.orders_from_file import _row_missing_dims
from app.core.database import get_db, utc_now
from app.core.security import get_current_user, require_permission
from app.models import (
    Material, MaterialRequest, MaterialRequestItem, MaterialSupplier, User,
)
from app.schemas import (
    FileOrderRow, MaterialRequestCreate, MaterialRequestItemOut,
    MaterialRequestOut, MaterialRequestUpdate,
)
from app.services.notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/orders/material-requests", tags=["orders"])
_can_orders = require_permission('orders.materials')


# ─── Serializzazione ────────────────────────────────────────────────────────

def _item_out(it: MaterialRequestItem) -> MaterialRequestItemOut:
    return MaterialRequestItemOut(
        id=it.id, material_id=it.material_id, material_name=it.material_name,
        part_code=it.part_code or "", description=it.description or "",
        shape=it.shape or "prismatico",
        width_mm=it.width_mm, height_mm=it.height_mm, thickness_mm=it.thickness_mm,
        diameter_mm=it.diameter_mm, inner_diameter_mm=it.inner_diameter_mm,
        length_mm=it.length_mm, quantity=it.quantity or 1,
        supplier_id=it.supplier_id, supplier_name=it.supplier_name,
        evaso=it.material_order_id is not None,
        material_order_id=it.material_order_id,
    )


def _request_out(req: MaterialRequest, include_items: bool = True) -> MaterialRequestOut:
    open_items = [it for it in req.items if it.material_order_id is None]
    supplier_names = sorted({it.supplier_name for it in open_items if it.supplier_name})
    cb = req.created_by
    return MaterialRequestOut(
        id=req.id,
        created_at=req.created_at,
        created_by={'id': cb.id, 'username': cb.username, 'full_name': cb.full_name} if cb else None,
        status=req.status or "bozza",
        sent_at=req.sent_at,
        title=req.title,
        items=[_item_out(it) for it in req.items] if include_items else [],
        item_count=len(req.items),
        open_count=len(open_items),
        supplier_names=supplier_names,
    )


# ─── Validazione righe ──────────────────────────────────────────────────────

def _row_label(r) -> str:
    return r.part_code or r.material_name or r.csv_material or '(riga senza codice)'


def _validate_catalog_ids(rows: List[FileOrderRow], db: Session) -> None:
    """AUD-26: gli id materiale/fornitore arrivano dal client. Validali contro
    il catalogo PRIMA di scriverli, o si creano righe orfane."""
    mat_ids = {r.material_id for r in rows if r.material_id}
    if mat_ids:
        known = {row.id for row in db.query(Material.id).filter(Material.id.in_(mat_ids)).all()}
        if mat_ids - known:
            raise HTTPException(status_code=400, detail=(
                "Uno o più materiali abbinati non esistono più a catalogo. "
                "Ricontrolla gli abbinamenti."))
    sup_ids = {r.supplier_id for r in rows if r.supplier_id}
    if sup_ids:
        known = {row.id for row in db.query(MaterialSupplier.id).filter(MaterialSupplier.id.in_(sup_ids)).all()}
        if sup_ids - known:
            raise HTTPException(status_code=400, detail=(
                "Uno o più fornitori abbinati non esistono più a catalogo."))


def _rows_to_items(rows: List[FileOrderRow], db: Session) -> List[MaterialRequestItem]:
    """Costruisce le righe DB da FileOrderRow, snapshottando il nome fornitore."""
    sup_names = {
        s.id: s.name for s in db.query(MaterialSupplier.id, MaterialSupplier.name).all()
    } if any(r.supplier_id for r in rows) else {}
    items: List[MaterialRequestItem] = []
    for r in rows:
        items.append(MaterialRequestItem(
            material_id=r.material_id,
            material_name=r.material_name or r.csv_material or "",
            part_code=r.part_code or "",
            description=r.description or "",
            shape=r.shape or "prismatico",
            width_mm=r.width_mm, height_mm=r.height_mm, thickness_mm=r.thickness_mm,
            diameter_mm=r.diameter_mm, inner_diameter_mm=r.inner_diameter_mm,
            length_mm=r.length_mm,
            quantity=r.quantity or 1,
            supplier_id=r.supplier_id,
            supplier_name=sup_names.get(r.supplier_id) if r.supplier_id else None,
        ))
    return items


def _assert_sendable(req: MaterialRequest) -> None:
    """Prima dell'invio ogni riga aperta deve avere fornitore e misure grezzo,
    altrimenti l'ordine/CSV stamperebbe righe incomplete."""
    open_items = [it for it in req.items if it.material_order_id is None]
    if not open_items:
        raise HTTPException(status_code=400, detail="La richiesta non ha righe da ordinare")
    no_sup = [_row_label(it) for it in open_items if not it.supplier_id]
    if no_sup:
        raise HTTPException(status_code=400, detail=(
            "Assegna un materiale con fornitore a: " + ', '.join(no_sup[:5])))
    no_dim = [_row_label(it) for it in open_items if _row_missing_dims(it)]
    if no_dim:
        raise HTTPException(status_code=400, detail=(
            "Completa le misure grezzo di: " + ', '.join(no_dim[:5])))


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[MaterialRequestOut])
def list_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _=_can_orders,
):
    """Elenco richieste, più recenti prima. `status` opzionale ('bozza'|'inviato')."""
    query = db.query(MaterialRequest).options(
        joinedload(MaterialRequest.items),
        joinedload(MaterialRequest.created_by),
    )
    if status:
        query = query.filter(MaterialRequest.status == status)
    reqs = query.order_by(MaterialRequest.created_at.desc()).limit(200).all()
    # Lista sintetica: niente righe (le carica il detail), ma supplier_names/conteggi sì.
    return [_request_out(r, include_items=False) for r in reqs]


@router.get("/{req_id}", response_model=MaterialRequestOut)
def get_request(req_id: int, db: Session = Depends(get_db), _=_can_orders):
    req = db.query(MaterialRequest).options(
        joinedload(MaterialRequest.items), joinedload(MaterialRequest.created_by),
    ).filter(MaterialRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    return _request_out(req)


@router.post("", response_model=MaterialRequestOut)
def create_request(
    payload: MaterialRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_orders,
):
    """Crea una richiesta in bozza (righe anche incomplete: si completano prima
    dell'invio). Le righe possono venire dalla distinta o inserite a mano."""
    _validate_catalog_ids(payload.rows, db)
    req = MaterialRequest(
        created_by_user_id=current_user.id,
        status="bozza",
        title=(payload.title or "").strip() or None,
    )
    req.items = _rows_to_items(payload.rows, db)
    db.add(req)
    db.commit()
    db.refresh(req)
    logger.info("Richiesta materiale creata: id=%s by=%s n_righe=%d",
                req.id, current_user.username, len(req.items))
    return _request_out(req)


@router.put("/{req_id}", response_model=MaterialRequestOut)
def update_request(
    req_id: int,
    payload: MaterialRequestUpdate,
    db: Session = Depends(get_db),
    _=_can_orders,
):
    """Aggiorna titolo e/o righe. Le righe già evase (ordinate) restano
    intoccabili: `rows` sostituisce solo quelle ancora aperte."""
    req = db.query(MaterialRequest).options(joinedload(MaterialRequest.items)).filter(
        MaterialRequest.id == req_id
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")

    if payload.title is not None:
        req.title = payload.title.strip() or None

    if payload.rows is not None:
        _validate_catalog_ids(payload.rows, db)
        # Rimuovo solo le righe aperte; le evase (con material_order_id) restano.
        for it in list(req.items):
            if it.material_order_id is None:
                req.items.remove(it)
        for it in _rows_to_items(payload.rows, db):
            req.items.append(it)

    db.commit()
    db.refresh(req)
    return _request_out(req)


@router.post("/{req_id}/send", response_model=MaterialRequestOut)
def send_request(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_orders,
):
    """Invia la richiesta: bozza → inviato, entra nel pool e notifica
    "materiale da ordinare" ad amministrazione + ufficio tecnico."""
    req = db.query(MaterialRequest).options(
        joinedload(MaterialRequest.items), joinedload(MaterialRequest.created_by),
    ).filter(MaterialRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    if req.status == "inviato":
        raise HTTPException(status_code=400, detail="Richiesta già inviata")
    _assert_sendable(req)

    req.status = "inviato"
    req.sent_at = utc_now()

    open_items = [it for it in req.items if it.material_order_id is None]
    n_sup = len({it.supplier_id for it in open_items})
    actor = current_user.full_name or current_user.username
    label = req.title or f"RM-{req.id:04d}"
    create_notification(
        db,
        type='material_to_order',
        title=f"Materiale da ordinare — {label}",
        body=f"{actor} ha inviato una richiesta materiale ({len(open_items)} righe, "
             f"{n_sup} fornitor{'e' if n_sup == 1 else 'i'})",
        created_by_user_id=current_user.id,
        target_roles=['ufficio_tecnico', 'amministrazione'],
        data={'material_request_id': req.id, 'navigate_to': '/orders/materials'},
        commit=False,
    )
    db.commit()
    db.refresh(req)
    logger.info("Richiesta materiale inviata: id=%s by=%s", req.id, current_user.username)
    return _request_out(req)


@router.delete("/{req_id}")
def delete_request(req_id: int, db: Session = Depends(get_db), _=_can_orders):
    """Elimina una richiesta. Bloccata se ha righe già ordinate (evase): quelle
    vivono ormai in un ordine emesso e vanno gestite da lì."""
    req = db.query(MaterialRequest).options(joinedload(MaterialRequest.items)).filter(
        MaterialRequest.id == req_id
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    if any(it.material_order_id is not None for it in req.items):
        raise HTTPException(status_code=400, detail=(
            "Richiesta non eliminabile: ha righe già ordinate. "
            "Elimina prima l'ordine materiali collegato."))
    db.delete(req)  # cascade delete-orphan sulle righe
    db.commit()
    return {"ok": True}
