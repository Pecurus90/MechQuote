"""API ordini materiali.

Estrae da N preventivi selezionati la lista dei materiali grezzi
aggregata per fornitore. Creazione ordine (per fornitore) → 3 azioni atomiche:
1. crea record MaterialOrder + join sui quote
2. marca i quote con material_ordered_at + material_ordered_by_user_id
3. notifica a ufficio_tecnico + amministrazione

L'ordine NON è una transazione verso il fornitore — è un documento di
lavoro che poi viene inserito nel gestionale aziendale.

Conto lavoro: le parti con `customer_supplied_material=True` sono ESCLUSE
dall'aggregazione (il cliente porta il materiale, non si ordina).

Materiale a magazzino: le parti con `material_from_stock=True` sono INCLUSE
nell'aggregazione ma marcate con `from_stock=True` per render badge UI
(l'utente le vede comunque nella lista del fornitore abituale, ma marcate
come "Da magazzino" per non confonderle con materiale da ordinare).
"""
import logging
import math
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.csv_import import csv_export_response, sanitize_filename_part
from app.core.database import get_db, utc_now
from app.core.security import get_current_user, require_permission
from app.models import (
    CompanySettings, MaterialOrder, MaterialOrderItem, MaterialOrderQuote,
    MaterialSupplier, Part, Quote, QuoteSupplierOrder, User,
)
from app.schemas import (
    MaterialAggregateOut, MaterialAggregateBySupplier, MaterialItemAggregated,
    MaterialOrderCreate, MaterialOrderOut, ArchiveQuoteOut,
)
from app.services import quote_workflow as wf
from app.services.material_status import (
    part_needs_ordering, quote_material_status,
)
from app.services.notifications import create_notification

# Colonne CSV ordine materiali. Il "codice articolo" per il gestionale è il
# materiale stesso; forma e dimensioni sono colonne separate; il riferimento è
# la commessa (numero preventivo) — una riga per commessa.
_MAT_CSV_COLUMNS = ['Materiale', 'Forma', 'Dimensioni', 'Riferimento', 'Quantità']
# CSV rapido del singolo preventivo: il riferimento (numero) è unico, quindi al
# suo posto il fornitore (un preventivo può coprire più fornitori).
_QUOTE_MAT_CSV_COLUMNS = ['Materiale', 'Forma', 'Dimensioni', 'Fornitore', 'Quantità']

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


def _shape_label(part: Part) -> str:
    """Forma del grezzo per il CSV ordine: Tondo / Prismatico."""
    if part.raw_diameter_mm:
        return "Tondo"
    if part.raw_x_mm and part.raw_y_mm and part.raw_z_mm:
        return "Prismatico"
    return "—"


def _dims_only(part: Part) -> str:
    """Dimensioni grezzo senza la parola-forma (colonna separata nel CSV)."""
    if part.raw_diameter_mm:
        l = part.raw_z_mm or 0
        return f"Ø{part.raw_diameter_mm:g} × {l:g} mm" if l else f"Ø{part.raw_diameter_mm:g} mm"
    if part.raw_x_mm and part.raw_y_mm and part.raw_z_mm:
        return f"{part.raw_x_mm:g} × {part.raw_y_mm:g} × {part.raw_z_mm:g} mm"
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


# ─── Evasione per fornitore (spec 18) ───────────────────────────────────────

def _supplier_order_data(quote_ids: List[int], supplier_id: int, db: Session):
    """Per un fornitore: preventivi coinvolti + righe CSV (una per commessa).

    Considera solo le parti "da ordinare" (materiale reale, non conto lavoro,
    non da magazzino) il cui materiale ha `supplier_id`. Le righe sono una per
    commessa: parti con stesso materiale+dimensioni nello STESSO preventivo si
    sommano; lo stesso materiale su preventivi diversi resta su righe distinte
    (il riferimento è singolo). Ritorna `(set(quote_id coinvolti),
    [[materiale, forma, dimensioni, riferimento, qty], ...])`.
    """
    parts = db.query(Part).options(
        joinedload(Part.material),
        joinedload(Part.quote),
    ).filter(Part.quote_id.in_(quote_ids)).all()
    involved: set = set()
    aggr: Dict[Tuple, Dict[str, Any]] = {}
    for p in parts:
        if not part_needs_ordering(p):
            continue
        if not p.material or p.material.supplier_id != supplier_id:
            continue
        involved.add(p.quote_id)
        key = (p.material_id, _dim_signature(p), p.quote_id)
        slot = aggr.setdefault(key, {
            'name': p.material.name,
            'forma': _shape_label(p),
            'dim': _dims_only(p),
            'ref': p.quote.quote_number if p.quote else '',
            'qty': 0,
        })
        slot['qty'] += (p.quantity or 1)
    rows = [
        [s['name'], s['forma'], s['dim'], s['ref'], s['qty']]
        for s in sorted(aggr.values(), key=lambda s: (s['name'], s['dim'], s['ref']))
    ]
    return involved, rows


def _persist_order_snapshot(order: MaterialOrder, quote_ids: List[int],
                            supplier_id: int, db: Session) -> None:
    """B6 — congela le righe dell'ordine 'quotes' all'emissione.

    Crea una `MaterialOrderItem` per riga (materiale + dimensioni grezzo +
    riferimento commessa + qty), così il CSV storico resta FEDELE all'ordine
    emesso anche se i preventivi vengono modificati dopo (prima `get_order_csv`
    ri-aggregava dal vivo → documento diverso alla ristampa). Stessa
    aggregazione di `_supplier_order_data`: parti con stesso materiale +
    dimensioni nello STESSO preventivo sommate, preventivi distinti su righe
    distinte. Il riferimento (numero preventivo) va in `part_code`, la colonna
    'Riferimento' del CSV (come gli ordini da file usano il codice parte)."""
    parts = db.query(Part).options(
        joinedload(Part.material), joinedload(Part.quote),
    ).filter(Part.quote_id.in_(quote_ids)).all()
    aggr: Dict[Tuple, Dict[str, Any]] = {}
    for p in parts:
        if not part_needs_ordering(p):
            continue
        if not p.material or p.material.supplier_id != supplier_id:
            continue
        key = (p.material_id, _dim_signature(p), p.quote_id)
        slot = aggr.setdefault(key, {
            'material_id': p.material_id,
            'name': p.material.name,
            'is_round': bool(p.raw_diameter_mm),
            'diameter_mm': p.raw_diameter_mm,
            'x_mm': p.raw_x_mm, 'y_mm': p.raw_y_mm, 'z_mm': p.raw_z_mm,
            'ref': p.quote.quote_number if p.quote else '',
            'qty': 0,
        })
        slot['qty'] += (p.quantity or 1)
    # Ordine di inserimento = ordine del CSV (materiale, riferimento): coerente
    # con l'ordinamento della vecchia aggregazione live.
    for s in sorted(aggr.values(), key=lambda s: (s['name'], s['ref'])):
        if s['is_round']:
            db.add(MaterialOrderItem(
                material_order_id=order.id, material_id=s['material_id'],
                material_name=s['name'], part_code=s['ref'], shape='tondo',
                diameter_mm=s['diameter_mm'], length_mm=s['z_mm'], quantity=s['qty'],
            ))
        else:
            db.add(MaterialOrderItem(
                material_order_id=order.id, material_id=s['material_id'],
                material_name=s['name'], part_code=s['ref'], shape='prismatico',
                width_mm=s['x_mm'], height_mm=s['y_mm'], thickness_mm=s['z_mm'],
                quantity=s['qty'],
            ))


def _quote_material_rows(quote_id: int, db: Session):
    """Righe CSV dei materiali da ordinare di UN preventivo (tutti i fornitori).

    Solo parti "da ordinare" (materiale reale, non conto lavoro, non da
    magazzino). Parti con stesso materiale+dimensioni sommate. Colonne:
    [materiale, forma, dimensioni, fornitore, qty]. Nessun side effect.
    """
    parts = db.query(Part).options(joinedload(Part.material)).filter(
        Part.quote_id == quote_id
    ).all()
    aggr: Dict[Tuple, Dict[str, Any]] = {}
    for p in parts:
        if not part_needs_ordering(p) or not p.material:
            continue
        sup = p.material.material_supplier
        key = (p.material_id, _dim_signature(p))
        slot = aggr.setdefault(key, {
            'name': p.material.name,
            'forma': _shape_label(p),
            'dim': _dims_only(p),
            'sup': sup.name if sup else 'Senza fornitore',
            'qty': 0,
        })
        slot['qty'] += (p.quantity or 1)
    return [
        [s['name'], s['forma'], s['dim'], s['sup'], s['qty']]
        for s in sorted(aggr.values(), key=lambda s: (s['sup'], s['name'], s['dim']))
    ]


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _=_can_orders) -> Dict[str, Any]:
    """KPI mini-dashboard per /orders/materials.

    - `to_order`: preventivi confermati col materiale ancora da ordinare
      (status 'confermato' + material_ordered_at NULL). Il flag si alza solo a
      evasione totale, che porta subito a 'completo' → questi sono esattamente
      i preventivi con residuo materiale reale (stessa base della rail
      dashboard 'awaiting-materials').
    - `orders_this_month`: ordini creati nel mese corrente (UTC)
    - `orders_total`: ordini emessi all-time
    - `last_order_at`: timestamp ISO ultimo ordine (None se nessuno)
    """
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    to_order = db.query(Quote).filter(
        Quote.status == 'confermato',
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


@router.get("/quotes-selectable", response_model=List[ArchiveQuoteOut])
def list_selectable_quotes(
    status: Optional[str] = "confermato",
    q: Optional[str] = None,
    only_unordered: bool = True,
    db: Session = Depends(get_db),
    _=_can_orders,
):
    """Preventivi selezionabili per creare un ordine materiali.

    Default: solo `confermato` (spec 18: si ordina dopo la Conferma), solo
    quelli senza flag material_ordered_at. Toggle `only_unordered=false` per
    vedere anche quelli già ordinati. Toggle `status=null` per tutti gli stati.
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
    results = query.order_by(Quote.quote_date.desc().nullslast(), Quote.id.desc()).limit(200).all()

    # Stato materiale derivato (spec 18) per il badge "Stato materiale", batch
    # anti-N+1: una sola query sui fornitori ordinati dei preventivi di questa
    # pagina. Stessa logica dell'archivio (quotes_archive). Senza questo il
    # campo restava None → il frontend mostrava sempre "non_ordinato".
    quote_ids = [r.id for r in results]
    ordered_map: Dict[int, set] = {}
    if quote_ids:
        rows = db.query(
            QuoteSupplierOrder.quote_id, QuoteSupplierOrder.material_supplier_id
        ).filter(QuoteSupplierOrder.quote_id.in_(quote_ids)).all()
        for qid, sid in rows:
            ordered_map.setdefault(qid, set()).add(sid)
    for r in results:
        ordered = ordered_map.get(r.id, set()) if r.status in wf.ORDERABLE_STATUSES else set()
        r.material_status = quote_material_status(r.parts, ordered)
    return results


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
    """Crea un ordine materiali PER FORNITORE (spec 18).

    Dai preventivi selezionati prende le parti da ordinare del fornitore
    scelto, marca le coppie (preventivo, fornitore) come ordinate, ricalcola
    lo stato materiale e notifica. Idempotente: i preventivi già ordinati per
    quel fornitore vengono saltati; se sono tutti già ordinati → 400.
    Il CSV si scarica separatamente via GET /{id}/csv.
    """
    if payload.material_supplier_id is None:
        raise HTTPException(status_code=400, detail="Fornitore mancante per l'ordine")
    supplier = db.query(MaterialSupplier).filter(
        MaterialSupplier.id == payload.material_supplier_id
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Fornitore non trovato")

    quotes = db.query(Quote).filter(Quote.id.in_(payload.quote_ids)).all()
    if len(quotes) != len(set(payload.quote_ids)):
        raise HTTPException(status_code=400, detail="Uno o più preventivi non esistono")
    quote_by_id = {q.id: q for q in quotes}

    involved, _rows = _supplier_order_data(payload.quote_ids, supplier.id, db)
    if not involved:
        raise HTTPException(
            status_code=400,
            detail=f"Nessun materiale da ordinare per {supplier.name} nei preventivi selezionati",
        )

    # Salta i preventivi già ordinati per questo fornitore (idempotenza).
    existing = {
        r.quote_id for r in db.query(QuoteSupplierOrder).filter(
            QuoteSupplierOrder.material_supplier_id == supplier.id,
            QuoteSupplierOrder.quote_id.in_(list(involved)),
        ).all()
    }
    new_ids = involved - existing
    if not new_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Materiale già ordinato per {supplier.name} in questi preventivi",
        )
    # Spec 18: il materiale si ordina solo dopo la Conferma del preventivo.
    new_ids = {qid for qid in new_ids if quote_by_id[qid].status in wf.ORDERABLE_STATUSES}
    if not new_ids:
        raise HTTPException(
            status_code=400,
            detail="Solo i preventivi confermati possono essere ordinati",
        )

    now = utc_now()
    order = MaterialOrder(
        created_by_user_id=current_user.id,
        material_supplier_id=supplier.id,
        supplier_name=supplier.name,
    )
    db.add(order)
    db.flush()

    for qid in new_ids:
        db.add(MaterialOrderQuote(material_order_id=order.id, quote_id=qid))
        db.add(QuoteSupplierOrder(
            quote_id=qid,
            material_supplier_id=supplier.id,
            material_order_id=order.id,
            ordered_at=now,
            ordered_by_user_id=current_user.id,
        ))
    # B6 — congela lo snapshot delle righe ordinate (fedeltà alla ristampa CSV).
    _persist_order_snapshot(order, list(new_ids), supplier.id, db)
    # AUD-25: il check di idempotenza sopra (legge `existing`) non è atomico —
    # due POST concorrenti per (preventivo × fornitore) lo superano entrambi.
    # Il vincolo UNIQUE(quote_id, material_supplier_id) impedisce il doppio
    # ordine a livello DB; qui traduciamo l'IntegrityError del perdente in un
    # 409 pulito invece di un 500 opaco.
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Materiale già ordinato per {supplier.name} (ordine concorrente)",
        )

    completed_quotes = []
    for qid in new_ids:
        q = quote_by_id[qid]
        # Riconcilia flag materiale + stato: l'ultimo fornitore che evade il
        # materiale porta il preventivo a completo.
        if wf.reconcile_material_state(db, q, current_user.id) and q.status == wf.STATUS_COMPLETO:
            completed_quotes.append(q)

    db.commit()
    db.refresh(order)

    for q in completed_quotes:
        from app.api.quotes import notify_quote_completed
        notify_quote_completed(db, q, current_user)

    actor_name = current_user.full_name or current_user.username
    nums = sorted(quote_by_id[qid].quote_number for qid in new_ids)
    quote_list = ', '.join(nums[:5])
    if len(nums) > 5:
        quote_list += f" e altri {len(nums) - 5}"
    create_notification(
        db,
        type='materials_ordered',
        title=f"Ordine materiali MO-{order.id:04d}",
        body=f"{actor_name} ha creato l'ordine materiali per {supplier.name} (prev. {quote_list})",
        created_by_user_id=current_user.id,
        target_roles=['ufficio_tecnico', 'amministrazione'],
        data={'order_id': order.id, 'material_supplier_id': supplier.id, 'navigate_to': '/orders/history'},
    )

    logger.info("Ordine materiali creato: id=%s supplier=%s by=%s n_quotes=%d",
                order.id, supplier.name, current_user.username, len(new_ids))

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


@router.get("/{order_id}/csv")
def get_order_csv(order_id: int, db: Session = Depends(get_db), _=_can_orders):
    """CSV dell'ordine materiali di quel fornitore (un file = un ordine gestionale).

    Nome file `AAAAMMGG_HHmm_<fornitore>.csv`, formato `;` + UTF-8/BOM. Le
    righe sono ri-aggregate dai preventivi dell'ordine per il suo fornitore
    (ri-scarico idempotente: nessun side effect).
    """
    order = db.query(MaterialOrder).options(
        joinedload(MaterialOrder.quotes), joinedload(MaterialOrder.items),
    ).filter(MaterialOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")

    if order.items:
        # Snapshot congelato all'emissione (B6): fedele all'ordine emesso anche
        # se il preventivo è cambiato dopo. Vale sia per gli ordini da distinta
        # ('file') sia per quelli da preventivo ('quotes') creati dopo B6.
        # Riferimento = part_code (codice parte per i file, numero preventivo
        # per lo snapshot dei quotes).
        rows = [
            [it.material_name, _shape_label_it(it.shape), _file_item_dim(it), it.part_code, it.quantity]
            for it in order.items
        ]
    else:
        # Ordini 'quotes' storici pre-snapshot (nessuna MaterialOrderItem): ri-
        # aggregazione live dai preventivi. Può divergere dall'emesso se il
        # preventivo è stato modificato dopo l'ordine — limite noto dei soli
        # ordini vecchi, non più dei nuovi.
        if order.material_supplier_id is None:
            raise HTTPException(
                status_code=400,
                detail="Ordine storico senza fornitore: CSV non disponibile per questo ordine.",
            )
        quote_ids = [q.id for q in order.quotes]
        _involved, rows = _supplier_order_data(quote_ids, order.material_supplier_id, db)

    ts = order.created_at.strftime('%Y%m%d_%H%M') if order.created_at else f"MO{order.id:04d}"
    filename = f"{ts}_{sanitize_filename_part(order.supplier_name)}.csv"
    return csv_export_response(filename=filename, columns=_MAT_CSV_COLUMNS, rows=rows)


def _shape_label_it(shape: Optional[str]) -> str:
    return {'tondo': 'Tondo', 'tubo': 'Tubo'}.get(shape or '', 'Prismatico')


def _file_item_dim(it) -> str:
    """Dimensioni grezzo di una riga ordine-da-file, formattate per forma."""
    def g(v):
        return f"{v:g}" if v else '?'
    shape = it.shape or 'prismatico'
    if shape == 'tondo':
        core = f"Ø{g(it.diameter_mm)}"
        if it.inner_diameter_mm:
            core += f"/Øint{g(it.inner_diameter_mm)}"   # tondo cavo
        return f"{core} × {g(it.length_mm)} mm"
    if shape == 'tubo':
        return f"Ø{g(it.diameter_mm)} × sp.{g(it.thickness_mm)} × {g(it.length_mm)} mm"
    vals = [v for v in (it.width_mm, it.height_mm, it.thickness_mm) if v]
    return (' × '.join(f"{v:g}" for v in vals) + ' mm') if vals else '—'


@router.get("/quote/{quote_id}/csv")
def get_quote_material_csv(quote_id: int, db: Session = Depends(get_db), _=_can_orders):
    """CSV dei materiali da ordinare di UN singolo preventivo (tutti i
    fornitori). Sola lettura: nessun ordine creato, nessun flag toccato —
    comodità per lo scarico rapido da "Preventivi in corso".
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    rows = _quote_material_rows(quote_id, db)
    if not rows:
        raise HTTPException(
            status_code=400,
            detail="Nessun materiale da ordinare per questo preventivo "
                   "(conto lavoro, da magazzino o senza materiale configurato).",
        )
    filename = f"materiali_{sanitize_filename_part(quote.quote_number)}.csv"
    return csv_export_response(filename=filename, columns=_QUOTE_MAT_CSV_COLUMNS, rows=rows)


@router.delete("/{order_id}")
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_orders,
):
    """Cancella un ordine materiali dallo storico (reversibile).

    Rimuove le righe di evasione (`QuoteSupplierOrder`) create da QUESTO ordine
    per ogni preventivo coinvolto, poi elimina il record dell'ordine (le righe
    di join `material_order_quotes` le rimuove il unit-of-work) e riconcilia
    ogni preventivo (`reconcile_material_state`):
    - un `confermato` torna con il materiale "da ordinare" e riselezionabile;
    - un `completo` che perde la risoluzione del materiale viene RIAPERTO a
      `confermato` (auto-demote; il consuntivo venduto/costo è preservato).
    Risponde con il riepilogo (`reverted` / `reopened`) per l'avviso lato UI.
    """
    order = db.query(MaterialOrder).options(joinedload(MaterialOrder.quotes)).filter(
        MaterialOrder.id == order_id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")

    quotes = list(order.quotes)
    # Rimuovo le evasioni (coppie preventivo-fornitore) create da QUESTO ordine
    # per tutti i preventivi coinvolti: l'ordine sparisce → le sue evasioni con
    # lui. La riconciliazione poi ricalcola stato materiale e flag.
    for q in quotes:
        db.query(QuoteSupplierOrder).filter(
            QuoteSupplierOrder.material_order_id == order.id,
            QuoteSupplierOrder.quote_id == q.id,
        ).delete(synchronize_session=False)

    # Le righe di join material_order_quotes vengono rimosse da SQLAlchemy con
    # la cancellazione dell'ordine (relazione m2m): NON eliminarle a mano, o il
    # unit-of-work prova a ricancellarle → StaleDataError.
    db.delete(order)
    db.flush()

    # Riconcilia ogni preventivo (dopo aver rimosso le evasioni): un 'completo'
    # che perde la risoluzione del materiale torna 'confermato' (riaperto); un
    # 'confermato' resta tale, col materiale di nuovo da ordinare.
    reverted: List[str] = []
    reopened: List[str] = []
    for q in quotes:
        was_completo = q.status == wf.STATUS_COMPLETO
        wf.reconcile_material_state(db, q, current_user.id)
        if was_completo and q.status != wf.STATUS_COMPLETO:
            reopened.append(q.quote_number)
        else:
            reverted.append(q.quote_number)

    db.commit()
    logger.info("Ordine materiali eliminato: id=%s by=%s reverted=%d reopened=%d",
                order_id, current_user.username, len(reverted), len(reopened))
    return {"ok": True, "reverted": reverted, "reopened": reopened}


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
        supplier_name=order.supplier_name,
        quote_count=len(order.quotes),
        quote_numbers=quote_numbers,
        source=order.source or 'quotes',
        item_count=len(order.items),
    )
