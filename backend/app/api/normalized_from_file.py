"""API "Ordini normalizzati da file".

Gemello di `orders_from_file.py` ma per i componenti NORMALIZZATI
(viti/bulloni/cuscinetti…): niente forma/misure grezzo. Il valore centrale è
la NORMALIZZAZIONE dell'articolo: la designazione grezza della distinta (es.
"Vite TCEI M8x100") viene ricondotta a una voce di catalogo `NormalizedItem`
(il "tipo", es. "Viti TCEI") via alias appresi; la spec specifica finisce in
descrizione. Stesso CSV SolidWorks in ingresso, ordine per fornitore in uscita.

Flusso (speculare ai materiali):
1. POST /from-file/parse — parse distinta → righe editabili (nessuna scrittura).
2. POST /from-file — crea UN ordine per fornitore + impara gli alias dagli
   abbinamenti confermati.
3. GET /{id}/csv — CSV dell'ordine (Articolo, Descrizione, Riferimento, Q.tà).
4. GET "" / DELETE /{id} — storico + eliminazione.
"""
import csv
import io
import logging
from collections import defaultdict
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.core.csv_import import (
    _decode_csv_bytes, csv_export_response, normalize_alias, sanitize_filename_part,
)
from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models import (
    NormalizedAlias, NormalizedItem, NormalizedOrder, NormalizedOrderItem,
    NormalizedSupplier, User,
)
from app.schemas import (
    NormalizedFileAliasOut, NormalizedFileOrderCreate, NormalizedFileParseOut,
    NormalizedFileRow, NormalizedOrderOut,
)
# Parsing distinta condiviso col flusso materiali (stesso CSV SolidWorks): DRY.
from app.api.orders_from_file import _clean_header, _column_map, _num

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/orders/normalized", tags=["orders-normalized"])
_can_orders = require_permission('orders.normalized')

_CSV_COLUMNS = ['Articolo', 'Descrizione', 'Riferimento', 'Quantità']


def _order_to_out(order: NormalizedOrder) -> NormalizedOrderOut:
    cb = order.created_by
    return NormalizedOrderOut(
        id=order.id,
        created_at=order.created_at,
        created_by={'id': cb.id, 'username': cb.username, 'full_name': cb.full_name} if cb else None,
        supplier_name=order.supplier_name,
        item_count=len(order.items),
    )


# ─── Parse distinta ─────────────────────────────────────────────────────────

@router.post("/from-file/parse", response_model=NormalizedFileParseOut)
async def parse_distinta(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=_can_orders,
):
    """Legge la distinta CSV e normalizza ogni riga: la designazione grezza
    (colonna Descrizione, fallback Materiale) → voce `NormalizedItem` via alias
    appresi. Nessun ordine creato: solo parse + abbinamento tipo."""
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Il file deve essere un .csv")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File vuoto")

    text = _decode_csv_bytes(content)
    raw_rows = list(csv.reader(io.StringIO(text), delimiter=';', quotechar='"'))

    header_idx, header = None, []
    for i, raw in enumerate(raw_rows[:8]):
        cleaned = [_clean_header(c) for c in raw]
        lowered = [c.lower() for c in cleaned]
        if any('num. parte' in c or 'materiale' in c or 'descrizione' in c for c in lowered):
            header_idx, header = i, cleaned
            break
    if header_idx is None:
        raise HTTPException(
            status_code=400,
            detail="Header non riconosciuto. Atteso un CSV distinta con Num. parte / "
                   "Descrizione.",
        )

    cmap = _column_map(header)
    if len(header) < 2 or len(cmap) < 2:
        raise HTTPException(
            status_code=400,
            detail="Colonne non riconosciute. Atteso un CSV separato da ';'.",
        )

    items = db.query(NormalizedItem).options(joinedload(NormalizedItem.supplier)).all()
    by_id = {it.id: it for it in items}
    alias_map = {
        a.csv_name: by_id[a.normalized_item_id]
        for a in db.query(NormalizedAlias).all() if a.normalized_item_id in by_id
    }

    def cell(raw, key):
        i = cmap.get(key)
        return (raw[i] if (i is not None and i < len(raw)) else '').strip()

    out_rows: List[NormalizedFileRow] = []
    for raw in raw_rows[header_idx + 1:]:
        if not raw or all(not (c or '').strip() for c in raw):
            continue
        code = cell(raw, 'code')
        designation = cell(raw, 'desc') or cell(raw, 'material')
        if not code and not designation:
            continue
        qty_raw = _num(cell(raw, 'qty'))
        qty = int(qty_raw) if qty_raw and qty_raw >= 1 else 1

        item = alias_map.get(normalize_alias(designation))
        out_rows.append(NormalizedFileRow(
            reference=code,
            csv_raw=designation,
            normalized_item_id=item.id if item else None,
            article=item.description if item else '',
            description=designation,
            supplier_id=item.supplier_id if item else None,
            supplier_name=(item.supplier.name if item and item.supplier else None),
            quantity=qty,
            needs_type=item is None,
        ))
    return NormalizedFileParseOut(rows=out_rows)


# ─── Alias appresi (pannello nella pagina) ──────────────────────────────────

@router.get("/aliases", response_model=List[NormalizedFileAliasOut])
def list_aliases(db: Session = Depends(get_db), _=_can_orders):
    aliases = db.query(NormalizedAlias).options(joinedload(NormalizedAlias.normalized_item)).all()
    return [
        NormalizedFileAliasOut(
            id=a.id, csv_name=a.csv_name,
            item_code=a.normalized_item.code if a.normalized_item else '',
        )
        for a in aliases
    ]


@router.delete("/aliases/{alias_id}")
def delete_alias(alias_id: int, db: Session = Depends(get_db), _=_can_orders):
    """Rimuove un alias appreso (correzione di un abbinamento sbagliato)."""
    alias = db.query(NormalizedAlias).filter(NormalizedAlias.id == alias_id).first()
    if not alias:
        raise HTTPException(status_code=404, detail="Alias non trovato")
    db.delete(alias)
    db.commit()
    return {"ok": True}


# ─── Creazione ordine/i da file ─────────────────────────────────────────────

@router.post("/from-file", response_model=List[NormalizedOrderOut])
def create_file_orders(
    payload: NormalizedFileOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_orders,
):
    """Crea UN ordine per fornitore dalle righe editate, e IMPARA gli alias
    (designazione grezza → voce normalizzata) dagli abbinamenti confermati."""
    rows = payload.rows
    if not rows:
        raise HTTPException(status_code=400, detail="Nessuna riga da ordinare")

    def _label(r) -> str:
        return r.reference or r.article or r.csv_raw or '(riga senza dati)'

    missing = [_label(r) for r in rows if not r.supplier_id]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="Assegna un tipo (con fornitore) a: " + ', '.join(missing[:5]),
        )

    # AUD-26: valida gli id normalizzato dal payload prima di scriverli negli
    # order item e negli alias appresi (evita item orfani + alias avvelenati).
    ref_item_ids = {r.normalized_item_id for r in rows if r.normalized_item_id}
    if ref_item_ids:
        known = {row.id for row in db.query(NormalizedItem.id).filter(NormalizedItem.id.in_(ref_item_ids)).all()}
        if ref_item_ids - known:
            raise HTTPException(
                status_code=400,
                detail="Uno o più articoli normalizzati abbinati non esistono più a "
                       "catalogo. Ricontrolla gli abbinamenti prima di creare l'ordine.",
            )

    by_sup: dict = defaultdict(list)
    for r in rows:
        by_sup[r.supplier_id].append(r)

    created: List[NormalizedOrder] = []
    for sup_id, items in by_sup.items():
        sup = db.query(NormalizedSupplier).filter(NormalizedSupplier.id == sup_id).first()
        if not sup:
            raise HTTPException(status_code=404, detail=f"Fornitore id={sup_id} non trovato")
        order = NormalizedOrder(
            created_by_user_id=current_user.id,
            normalized_supplier_id=sup.id,
            supplier_name=sup.name,
            source='file',
        )
        db.add(order)
        db.flush()
        for r in items:
            db.add(NormalizedOrderItem(
                normalized_order_id=order.id,
                normalized_item_id=r.normalized_item_id,
                article=r.article or r.csv_raw,
                description=r.description or r.csv_raw,
                reference=r.reference,
                quantity=r.quantity,
            ))
        created.append(order)

    # Impara gli alias dagli abbinamenti confermati (upsert idempotente).
    learned: dict = {}
    for r in rows:
        key = normalize_alias(r.csv_raw)
        if key and r.normalized_item_id:
            learned[key] = r.normalized_item_id
    if learned:
        existing = {
            a.csv_name: a
            for a in db.query(NormalizedAlias).filter(NormalizedAlias.csv_name.in_(list(learned))).all()
        }
        for key, item_id in learned.items():
            alias = existing.get(key)
            if alias:
                alias.normalized_item_id = item_id
            else:
                db.add(NormalizedAlias(csv_name=key, normalized_item_id=item_id))

    db.commit()
    for o in created:
        db.refresh(o)
    logger.info("Ordini normalizzati da file creati: n=%d by=%s", len(created), current_user.username)
    return [_order_to_out(o) for o in created]


# ─── Storico + CSV ──────────────────────────────────────────────────────────

@router.get("", response_model=List[NormalizedOrderOut])
def list_orders(db: Session = Depends(get_db), _=_can_orders, limit: int = 50):
    """Storico ordini normalizzati, ultimi N in ordine cronologico desc."""
    orders = db.query(NormalizedOrder).options(
        joinedload(NormalizedOrder.created_by), joinedload(NormalizedOrder.items),
    ).order_by(NormalizedOrder.created_at.desc()).limit(limit).all()
    return [_order_to_out(o) for o in orders]


@router.get("/{order_id}/csv")
def get_order_csv(order_id: int, db: Session = Depends(get_db), _=_can_orders):
    """CSV dell'ordine normalizzati (Articolo, Descrizione, Riferimento, Q.tà)."""
    order = db.query(NormalizedOrder).options(
        joinedload(NormalizedOrder.items)
    ).filter(NormalizedOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    rows = [
        [it.article, it.description, it.reference or '', it.quantity]
        for it in order.items
    ]
    fname = f"ordine_normalizzati_{sanitize_filename_part(order.supplier_name)}_{order_id}.csv"
    return csv_export_response(filename=fname, columns=_CSV_COLUMNS, rows=rows)


@router.get("/{order_id}/items")
def get_normalized_order_items(order_id: int, db: Session = Depends(get_db), _=_can_orders):
    """Righe di un ordine normalizzati per il dettaglio espandibile dello storico.
    Riferimento/articolo/descrizione/quantità dallo snapshot; costo = prezzo
    unitario a catalogo (se abbinato) × quantità."""
    order = db.query(NormalizedOrder).options(
        joinedload(NormalizedOrder.items)
    ).filter(NormalizedOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    item_ids = {it.normalized_item_id for it in order.items if it.normalized_item_id}
    prices = {n.id: n.unit_price for n in db.query(NormalizedItem).filter(
        NormalizedItem.id.in_(item_ids)).all()} if item_ids else {}
    items = []
    for it in order.items:
        unit = prices.get(it.normalized_item_id)
        qty = it.quantity or 1
        items.append({
            "reference": it.reference or "",
            "article": it.article or "",
            "description": it.description or "",
            "quantity": qty,
            "unit_price": round(unit, 4) if unit else None,
            "cost": round(unit * qty, 2) if unit else None,
        })
    return {"order_id": order.id, "supplier_name": order.supplier_name, "items": items}


@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user), _=_can_orders):
    """Elimina un ordine normalizzati dallo storico (con le sue righe, cascade)."""
    order = db.query(NormalizedOrder).filter(NormalizedOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    db.delete(order)
    db.commit()
    logger.info("Ordine normalizzati eliminato: id=%s by=%s", order_id, current_user.username)
    return {"ok": True}
