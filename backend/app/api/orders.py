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
    CompanySettings, Material, MaterialOrder, MaterialOrderItem, MaterialOrderQuote,
    MaterialRequest, MaterialRequestItem, MaterialSupplier, Part, Quote,
    QuoteSupplierOrder, User,
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


def _request_item_weight_kg(it: MaterialRequestItem, mat: Optional[Material]) -> float:
    """Peso stimato del grezzo di una riga richiesta (volume × densità × qty).
    0 se manca il materiale a catalogo o la densità (→ "—" in UI)."""
    if not mat or not mat.density_kg_dm3:
        return 0.0
    qty = it.quantity or 1
    shape = it.shape or 'prismatico'
    if shape == 'tondo':
        r = (it.diameter_mm or 0) / 2
        vol = math.pi * r * r * (it.length_mm or 0)
    elif shape == 'tubo':
        ro = (it.diameter_mm or 0) / 2
        ri = max(ro - (it.thickness_mm or 0), 0)
        vol = math.pi * (ro * ro - ri * ri) * (it.length_mm or 0)
    else:
        vol = (it.width_mm or 0) * (it.height_mm or 0) * (it.thickness_mm or 0)
    return (vol / 1_000_000) * mat.density_kg_dm3 * qty


def aggregate_materials(quote_ids: List[int], db: Session,
                        request_ids: Optional[List[int]] = None) -> MaterialAggregateOut:
    """Aggrega i materiali grezzi da preventivi + richieste materiale manuali.

    Preventivi: esclude parti `customer_supplied_material=True` (cliente porta
    materiale). Le parti `material_from_stock=True` sono INCLUSE ma marcate con
    `from_stock=True` (badge "Da magazzino"). Raggruppa per
    (supplier_id, material_id, dim_signature, from_stock). Le parti senza
    `material_id` sono escluse.

    Richieste (`request_ids`): le righe ancora aperte (non evase) entrano nel
    gruppo del loro fornitore come voci proprie (riferimento = codice riga o
    `RM-xxxx`), NON fuse con le righe da preventivo — la tracciabilità del
    riferimento resta distinta.
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

    # ─ Righe da richieste materiale manuali (aperte) ─
    # Entrano nel gruppo del loro fornitore come voci proprie (ref = codice riga
    # o RM-xxxx), aggregate per (fornitore, materiale, dimensioni).
    if request_ids:
        req_items = db.query(MaterialRequestItem).options(
            joinedload(MaterialRequestItem.request),
        ).filter(
            MaterialRequestItem.material_request_id.in_(request_ids),
            MaterialRequestItem.material_order_id.is_(None),
        ).all()
        mat_ids = {it.material_id for it in req_items if it.material_id}
        mat_map = ({m.id: m for m in db.query(Material).filter(Material.id.in_(mat_ids)).all()}
                   if mat_ids else {})
        raggr: Dict[Tuple, Dict[str, Any]] = {}
        for it in req_items:
            dim_str = f"{_shape_label_it(it.shape)} {_file_item_dim(it)}".strip()
            # B-3: stesso riferimento che finirà nel CSV/snapshot (codice → titolo
            # → vuoto). NIENTE fallback RM-xxxx qui: mostrava in anteprima un
            # riferimento fabbricato che poi nel CSV emesso era vuoto.
            ref = _req_ref(it)
            key = (it.supplier_id, it.material_name, dim_str)
            slot = raggr.setdefault(key, {
                'supplier_id': it.supplier_id,
                'supplier_name': it.supplier_name or 'Senza fornitore',
                'material_id': it.material_id,
                'material_name': it.material_name,
                'dim_str': dim_str,
                'total_qty': 0,
                'total_weight_kg': 0.0,
                'refs': defaultdict(int),
            })
            slot['total_qty'] += (it.quantity or 1)
            slot['total_weight_kg'] += _request_item_weight_kg(it, mat_map.get(it.material_id))
            slot['refs'][ref] += (it.quantity or 1)
        for slot in raggr.values():
            sup_id = slot['supplier_id']
            if sup_id not in by_supplier:
                by_supplier[sup_id] = MaterialAggregateBySupplier(
                    supplier_id=sup_id, supplier_name=slot['supplier_name'], items=[],
                )
            refs = [f"{r or '—'} ×{q}" for r, q in sorted(slot['refs'].items())]
            by_supplier[sup_id].items.append(MaterialItemAggregated(
                material_id=slot['material_id'],
                material_name=slot['material_name'],
                family=None,
                dim_str=slot['dim_str'],
                total_qty=slot['total_qty'],
                total_weight_kg=round(slot['total_weight_kg'], 3),
                quote_refs=refs,
                from_stock=False,
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


def _req_ref(it: MaterialRequestItem) -> str:
    """Riferimento CSV/preview di una riga richiesta = il CODICE ARTICOLO (campo
    'Codice' della riga). Se non compilato, ripiega sul titolo dell'ordine;
    altrimenti stringa vuota. NON usa il numero RM (che non è un riferimento
    utile per il gestionale)."""
    if it.part_code:
        return it.part_code
    return it.request.title if (it.request and it.request.title) else ''


def _supplier_request_items(request_ids: List[int], supplier_id: int,
                            db: Session) -> List[MaterialRequestItem]:
    """Righe-richiesta APERTE (non evase) di un fornitore, dai request_ids dati."""
    if not request_ids:
        return []
    return db.query(MaterialRequestItem).options(
        joinedload(MaterialRequestItem.request),
    ).filter(
        MaterialRequestItem.material_request_id.in_(request_ids),
        MaterialRequestItem.supplier_id == supplier_id,
        MaterialRequestItem.material_order_id.is_(None),
    ).all()


def _persist_request_snapshot(order: MaterialOrder,
                              req_items: List[MaterialRequestItem],
                              now, db: Session) -> None:
    """Congela le righe-richiesta nell'ordine emesso (MaterialOrderItem) e le
    marca evase (material_order_id/evaso_at). Il riferimento CSV = codice articolo,
    poi titolo dell'ordine, poi vuoto (`_req_ref`). Stessa struttura degli item
    ordine-da-file."""
    for it in req_items:
        db.add(MaterialOrderItem(
            material_order_id=order.id, material_id=it.material_id,
            material_name=it.material_name,
            part_code=_req_ref(it),   # riferimento = codice articolo (non RM)
            description=it.description or "",
            shape=it.shape or 'prismatico',
            width_mm=it.width_mm, height_mm=it.height_mm, thickness_mm=it.thickness_mm,
            diameter_mm=it.diameter_mm, inner_diameter_mm=it.inner_diameter_mm,
            length_mm=it.length_mm, quantity=it.quantity or 1,
        ))
        it.material_order_id = order.id
        it.evaso_at = now


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

    - `to_order`: preventivi confermati col materiale ancora da ordinare.
      Derivato dallo stato materiale reale (`material_is_resolved`, fonte unica
      spec 18): conta i `confermato` il cui materiale NON è risolto (parziale o
      non ordinato). Robusto anche se un `confermato` con materiale già risolto
      restasse tale per un reconcile mancato (non lo conterebbe), a differenza
      del vecchio conteggio basato sul flag legacy `material_ordered_at`.
      Include anche le RICHIESTE materiale inviate con righe ancora aperte
      (stesso pool: entrambe le sorgenti sono "materiale da ordinare").
    - `orders_this_month`: ordini creati nel mese corrente (UTC)
    - `orders_total`: ordini emessi all-time
    - `last_order_at`: timestamp ISO ultimo ordine (None se nessuno)
    """
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    confirmed = db.query(Quote).filter(Quote.status == wf.STATUS_CONFERMATO).all()
    to_order = sum(1 for q in confirmed if not wf.material_is_resolved(db, q))
    # Richieste inviate con almeno una riga aperta (non evasa).
    open_request_ids = {
        rid for (rid,) in db.query(MaterialRequestItem.material_request_id)
        .join(MaterialRequest, MaterialRequest.id == MaterialRequestItem.material_request_id)
        .filter(MaterialRequest.status == 'inviato',
                MaterialRequestItem.material_order_id.is_(None))
        .distinct().all()
    }
    to_order += len(open_request_ids)

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
    """Preview senza side effect: ritorna la lista materiali aggregata
    (preventivi + richieste materiale selezionati)."""
    return aggregate_materials(payload.quote_ids, db, payload.request_ids)


@router.post("", response_model=MaterialOrderOut)
def create_order(
    payload: MaterialOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_orders,
):
    """Crea un ordine materiali PER FORNITORE dal pool unificato (spec 18).

    Combina, per il fornitore scelto:
    - le parti da ordinare dei PREVENTIVI selezionati (marca le coppie
      preventivo×fornitore come evase, riconcilia lo stato, può completare il
      preventivo);
    - le righe aperte delle RICHIESTE materiale manuali selezionate (le marca
      evase).
    Snapshotta tutte le righe in MaterialOrderItem (CSV fedele). Idempotente
    sui preventivi già ordinati per quel fornitore (saltati) e sulle righe
    richiesta già evase (escluse). Il CSV si scarica via GET /{id}/csv.
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

    # ─ Lato preventivi: coinvolti per questo fornitore, non ancora ordinati
    #   (idempotenza) e solo confermati (spec 18) ─
    involved, _rows = _supplier_order_data(payload.quote_ids, supplier.id, db)
    existing = {
        r.quote_id for r in db.query(QuoteSupplierOrder).filter(
            QuoteSupplierOrder.material_supplier_id == supplier.id,
            QuoteSupplierOrder.quote_id.in_(list(involved)),
        ).all()
    } if involved else set()
    new_ids = {qid for qid in (involved - existing)
               if quote_by_id[qid].status in wf.ORDERABLE_STATUSES}

    # ─ Lato richieste: righe aperte del fornitore ─
    req_items = _supplier_request_items(payload.request_ids, supplier.id, db)

    if not new_ids and not req_items:
        raise HTTPException(
            status_code=400,
            detail=f"Nessun materiale da ordinare per {supplier.name} nei selezionati "
                   "(già ordinato, non confermato, o senza righe per questo fornitore)",
        )

    now = utc_now()
    # Sorgente per lo storico: solo preventivi / solo richieste / misto.
    source = 'mixed' if (new_ids and req_items) else ('quotes' if new_ids else 'request')
    order = MaterialOrder(
        created_by_user_id=current_user.id,
        material_supplier_id=supplier.id,
        supplier_name=supplier.name,
        source=source,
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
    if new_ids:
        # B6 — congela lo snapshot delle righe da preventivo (fedeltà ristampa CSV).
        _persist_order_snapshot(order, list(new_ids), supplier.id, db)
    if req_items:
        # Snapshot righe da richiesta + evasione (material_order_id/evaso_at).
        _persist_request_snapshot(order, req_items, now, db)
    # AUD-25: il check di idempotenza preventivi non è atomico — due POST
    # concorrenti lo superano entrambi. Il vincolo UNIQUE(quote_id,
    # material_supplier_id) impedisce il doppio ordine a livello DB; qui
    # traduciamo l'IntegrityError del perdente in un 409 pulito.
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

    # F7: materials_ordered nella stessa transazione di ordine + reconcile
    # (commit=False) → un solo commit atomico. Riepilogo = preventivi + richieste.
    actor_name = current_user.full_name or current_user.username
    refs = sorted(quote_by_id[qid].quote_number for qid in new_ids)
    if req_items:
        refs += sorted({f"RM-{it.material_request_id:04d}" for it in req_items})
    ref_list = ', '.join(refs[:5])
    if len(refs) > 5:
        ref_list += f" e altri {len(refs) - 5}"
    create_notification(
        db,
        type='materials_ordered',
        title=f"Ordine materiali MO-{order.id:04d}",
        body=f"{actor_name} ha creato l'ordine materiali per {supplier.name}"
             + (f" ({ref_list})" if ref_list else ""),
        created_by_user_id=current_user.id,
        target_roles=['ufficio_tecnico', 'amministrazione'],
        data={'order_id': order.id, 'material_supplier_id': supplier.id, 'navigate_to': '/orders/history'},
        commit=False,
    )

    db.commit()
    db.refresh(order)

    for q in completed_quotes:
        from app.api.quotes import notify_quote_completed
        notify_quote_completed(db, q, current_user)

    logger.info("Ordine materiali creato: id=%s supplier=%s by=%s n_quotes=%d n_req_items=%d",
                order.id, supplier.name, current_user.username, len(new_ids), len(req_items))

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

    Riapre anche le righe delle RICHIESTE materiale evase da questo ordine
    (azzera `material_order_id`/`evaso_at`): tornano nel pool selezionabili.
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

    # Riapri le righe-richiesta evase da questo ordine (tornano nel pool). Va
    # fatto PRIMA di db.delete(order): su SQLite le FK non sono enforce, quindi
    # senza questo resterebbero puntate a un ordine inesistente.
    db.query(MaterialRequestItem).filter(
        MaterialRequestItem.material_order_id == order.id,
    ).update(
        {MaterialRequestItem.material_order_id: None, MaterialRequestItem.evaso_at: None},
        synchronize_session=False,
    )

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
    actor = current_user.full_name or current_user.username
    for q in quotes:
        was_completo = q.status == wf.STATUS_COMPLETO
        wf.reconcile_material_state(db, q, current_user.id)
        if was_completo and q.status != wf.STATUS_COMPLETO:
            reopened.append(q.quote_number)
            # M-3: la riapertura da eliminazione ordine era silenziosa. Avvisa il
            # creatore, come già fa _reconcile_after_write in parts.py. commit=False
            # → notifica atomica col cambio stato (unico db.commit() qui sotto).
            if q.created_by_user_id:
                create_notification(
                    db,
                    type='quote_reopened',
                    title=f"Preventivo {q.quote_number} riaperto",
                    body=f"L'eliminazione di un ordine ha reso il materiale di nuovo da ordinare ({actor})",
                    created_by_user_id=current_user.id,
                    target_user_id=q.created_by_user_id,
                    data={'quote_id': q.id, 'quote_number': q.quote_number},
                    commit=False,
                )
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
