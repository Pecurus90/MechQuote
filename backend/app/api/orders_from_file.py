"""Ordini materiale "da file" (distinta CSV / manuale, non legati ai preventivi).

Flusso:
1. POST /from-file/parse — carica una distinta CSV (es. export SolidWorks),
   decodifica (utf-8/cp1252), ripulisce gli header sporchi, estrae le colonne
   utili, calcola le dimensioni GREZZO (larghezza/altezza +5 mm, spessore al
   multiplo di 5 per eccesso) e abbina il materiale al catalogo (+ alias).
   Ritorna le righe per la tabella editabile — NIENTE scrittura su DB.
2. Alias: GET/POST /aliases — corrispondenze apprese nome-distinta → materiale.
3. POST /from-file — dalle righe (editate) crea UN ordine per fornitore
   (source='file') con le sue righe (MaterialOrderItem) e lo mette nello storico.

Il CSV per-fornitore si scarica dallo stesso GET /{id}/csv di orders.py
(esteso per gli ordini da file).
"""
import csv
import io
import math
import re
from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.core.csv_import import _decode_csv_bytes, normalize_alias
from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models import (
    Material, MaterialAlias, MaterialOrder, MaterialOrderItem, MaterialSupplier, User,
)
from app.schemas import (
    FileOrderCreate, FileOrderParseOut, FileOrderRow,
    MaterialAliasCreate, MaterialAliasOut, MaterialOrderOut,
)
from app.services.notifications import create_notification

router = APIRouter(prefix="/api/orders/materials", tags=["orders"])
_can_orders = require_permission('orders.materials')


# ─── Helpers ────────────────────────────────────────────────────────────────

# Normalizzazione alias/nome condivisa con la pagina Materiali (DRY): unica
# fonte in app.core.csv_import, così il match distinta→materiale resta coerente.
_norm = normalize_alias


def _clean_header(cell: Optional[str]) -> str:
    """Ripulisce una cella-header dagli artefatti SolidWorks (<FONT ...>, <ITOL-F>)."""
    return re.sub(r'<[^>]+>', '', cell or '').strip()


def _num(raw: Optional[str]) -> Optional[float]:
    """Numero tollerante (virgola IT), None se vuoto/non numerico (non scarta)."""
    s = (raw or '').strip().replace(',', '.')
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _grezzo(height: Optional[float], width: Optional[float], thickness: Optional[float]):
    """Dimensioni grezzo: altezza/larghezza +5 mm, spessore al multiplo di 5 per
    eccesso (13→15, 16→20). None resta None (dimensione mancante)."""
    h = height + 5 if height else None
    w = width + 5 if width else None
    t = math.ceil(thickness / 5) * 5 if thickness else None
    return h, w, t


def _column_map(header: List[str]) -> dict:
    """Mappa nome-colonna → indice per le colonne che ci servono (fuzzy sul nome
    già ripulito). Tollera header sporchi/ordine diverso."""
    idx: dict = {}
    for i, h in enumerate(header):
        hl = h.lower()
        if 'num. parte' in hl or 'num parte' in hl:
            idx.setdefault('code', i)
        elif 'descrizione' in hl:
            idx.setdefault('desc', i)
        elif 'materiale' in hl:
            idx.setdefault('material', i)
        elif 'altezza' in hl:
            idx.setdefault('height', i)
        elif 'larghezza' in hl:
            idx.setdefault('width', i)
        elif 'spessore' in hl:
            idx.setdefault('thickness', i)
        elif 'quantit' in hl:      # "Quantità" spesso sporco di <FONT>
            idx.setdefault('qty', i)
    return idx


# Misure obbligatorie per forma (già il grezzo). Devono essere valorizzate
# prima di creare l'ordine, altrimenti il CSV stampa '?' al posto della misura.
# Speculare a SHAPE_FIELDS/isRowInvalid del frontend (MaterialsFileView.tsx).
_REQUIRED_DIMS = {
    'prismatico': ('width_mm', 'height_mm', 'thickness_mm'),
    'tondo': ('diameter_mm', 'length_mm'),
    'tubo': ('diameter_mm', 'thickness_mm', 'length_mm'),
}


def _row_missing_dims(row) -> bool:
    req = _REQUIRED_DIMS.get(row.shape or 'prismatico', ())
    return any(getattr(row, f, None) is None for f in req)


def _match_material(csv_material: str, name_map: dict, alias_map: dict):
    """Abbina un nome materiale del CSV a un materiale catalogo (alias poi nome).
    Ritorna (material_id, material_name, supplier_id, supplier_name) o Nones."""
    key = _norm(csv_material)
    mat = alias_map.get(key) or name_map.get(key)
    if not mat:
        return None, None, None, None
    sup = mat.material_supplier
    return mat.id, mat.name, (sup.id if sup else None), (sup.name if sup else None)


# ─── Parse distinta ─────────────────────────────────────────────────────────

@router.post("/from-file/parse", response_model=FileOrderParseOut)
async def parse_distinta(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=_can_orders,
):
    """Legge una distinta CSV e restituisce le righe per la tabella editabile.
    Nessun ordine viene creato: è solo il parse + grezzo + abbinamento materiali.
    """
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Il file deve essere un .csv")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File vuoto")

    text = _decode_csv_bytes(content)
    raw_rows = list(csv.reader(io.StringIO(text), delimiter=';', quotechar='"'))

    # Trova l'header: la prima riga (tra le prime) che contiene "Num. parte" o
    # "Materiale" dopo la ripulitura dai tag.
    header_idx = None
    header: List[str] = []
    for i, raw in enumerate(raw_rows[:8]):
        cleaned = [_clean_header(c) for c in raw]
        lowered = [c.lower() for c in cleaned]
        if any('num. parte' in c or 'materiale' in c for c in lowered):
            header_idx, header = i, cleaned
            break
    if header_idx is None:
        raise HTTPException(
            status_code=400,
            detail="Header non riconosciuto. Atteso un CSV distinta con almeno "
                   "le colonne Num. parte / Materiale.",
        )

    cmap = _column_map(header)
    # Delimitatore errato (es. CSV separato da ',') → l'header collassa in una
    # cella unica e quasi nulla viene mappato: meglio un errore chiaro che
    # importare righe spazzatura (tutte le colonne sull'indice 0).
    if len(header) < 2 or len(cmap) < 2:
        raise HTTPException(
            status_code=400,
            detail="Colonne non riconosciute. Atteso un CSV separato da ';' con "
                   "le colonne Num. parte / Materiale / dimensioni.",
        )

    # Cataloghi per l'abbinamento (nome catalogo + alias appresi).
    materials = db.query(Material).options(joinedload(Material.material_supplier)).all()
    name_map = {_norm(m.name): m for m in materials}
    by_id = {m.id: m for m in materials}
    alias_map = {
        a.csv_name: by_id[a.material_id]
        for a in db.query(MaterialAlias).all() if a.material_id in by_id
    }

    def cell(raw, key):
        i = cmap.get(key)
        return (raw[i] if (i is not None and i < len(raw)) else '').strip()

    out_rows: List[FileOrderRow] = []
    for raw in raw_rows[header_idx + 1:]:
        if not raw or all(not (c or '').strip() for c in raw):
            continue
        code = cell(raw, 'code')
        material_csv = cell(raw, 'material')
        if not code and not material_csv:
            continue  # riga vuota/assieme senza dati utili

        h, w, t = _grezzo(_num(cell(raw, 'height')), _num(cell(raw, 'width')), _num(cell(raw, 'thickness')))
        qty_raw = _num(cell(raw, 'qty'))
        qty = int(qty_raw) if qty_raw and qty_raw >= 1 else 1

        mat_id, mat_name, sup_id, sup_name = _match_material(material_csv, name_map, alias_map)
        out_rows.append(FileOrderRow(
            part_code=code,
            description=cell(raw, 'desc'),
            csv_material=material_csv,
            material_id=mat_id,
            material_name=mat_name or material_csv,
            supplier_id=sup_id,
            supplier_name=sup_name,
            shape='prismatico',  # la distinta SolidWorks porta L/A/S
            width_mm=w, height_mm=h, thickness_mm=t,
            quantity=qty,
            needs_dimensions=not (h and w and t),
            needs_material=mat_id is None,
        ))

    return FileOrderParseOut(rows=out_rows)


# ─── Alias materiali ────────────────────────────────────────────────────────

@router.get("/aliases", response_model=List[MaterialAliasOut])
def list_aliases(db: Session = Depends(get_db), _=_can_orders):
    aliases = db.query(MaterialAlias).options(joinedload(MaterialAlias.material)).all()
    return [
        MaterialAliasOut(
            id=a.id, csv_name=a.csv_name, material_id=a.material_id,
            material_name=a.material.name if a.material else '',
        )
        for a in aliases
    ]


@router.post("/aliases", response_model=MaterialAliasOut)
def create_alias(
    payload: MaterialAliasCreate,
    db: Session = Depends(get_db),
    _=_can_orders,
):
    """Salva/aggiorna la corrispondenza nome-distinta → materiale catalogo."""
    mat = db.query(Material).filter(Material.id == payload.material_id).first()
    if not mat:
        raise HTTPException(status_code=404, detail="Materiale non trovato")
    key = _norm(payload.csv_name)
    alias = db.query(MaterialAlias).filter(MaterialAlias.csv_name == key).first()
    if alias:
        alias.material_id = mat.id
    else:
        alias = MaterialAlias(csv_name=key, material_id=mat.id)
        db.add(alias)
    db.commit()
    db.refresh(alias)
    return MaterialAliasOut(id=alias.id, csv_name=key, material_id=mat.id, material_name=mat.name)


@router.delete("/aliases/{alias_id}")
def delete_alias(alias_id: int, db: Session = Depends(get_db), _=_can_orders):
    """Rimuove un alias appreso (correzione di un abbinamento sbagliato)."""
    alias = db.query(MaterialAlias).filter(MaterialAlias.id == alias_id).first()
    if not alias:
        raise HTTPException(status_code=404, detail="Alias non trovato")
    db.delete(alias)
    db.commit()
    return {"ok": True}


# ─── Creazione ordine/i da file ─────────────────────────────────────────────

@router.post("/from-file", response_model=List[MaterialOrderOut])
def create_file_orders(
    payload: FileOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_orders,
):
    """Crea UN ordine per fornitore (source='file') dalle righe editate, con le
    sue righe (MaterialOrderItem). Nessun legame con i preventivi.
    """
    from app.api.orders import _order_to_out

    rows = payload.rows
    if not rows:
        raise HTTPException(status_code=400, detail="Nessuna riga da ordinare")

    def _label(r) -> str:
        return r.part_code or r.material_name or r.csv_material or '(riga senza codice)'

    missing_sup = [_label(r) for r in rows if not r.supplier_id]
    if missing_sup:
        raise HTTPException(
            status_code=400,
            detail="Assegna un materiale con fornitore a: " + ', '.join(missing_sup[:5]),
        )
    # Difesa in profondità: senza le misure il CSV stamperebbe '?'. Il frontend
    # già disabilita "Crea ordine", ma un payload stantio/craftato passerebbe.
    missing_dim = [_label(r) for r in rows if _row_missing_dims(r)]
    if missing_dim:
        raise HTTPException(
            status_code=400,
            detail="Completa le misure grezzo di: " + ', '.join(missing_dim[:5]),
        )

    # AUD-26: gli id materiale arrivano dal payload client. Validali contro il
    # catalogo PRIMA di scriverli negli order item e negli alias appresi: un
    # payload stantio/craftato con un material_id inesistente creerebbe item
    # orfani e — peggio — un alias avvelenato che sbaglia i match CSV futuri.
    # Coerente col check `missing_dim` poco sopra.
    ref_mat_ids = {r.material_id for r in rows if r.material_id}
    if ref_mat_ids:
        known = {row.id for row in db.query(Material.id).filter(Material.id.in_(ref_mat_ids)).all()}
        if ref_mat_ids - known:
            raise HTTPException(
                status_code=400,
                detail="Uno o più materiali abbinati non esistono più a catalogo. "
                       "Ricontrolla gli abbinamenti prima di creare l'ordine.",
            )

    by_supplier: dict = defaultdict(list)
    for r in rows:
        by_supplier[r.supplier_id].append(r)

    created: List[MaterialOrder] = []
    for sup_id, items in by_supplier.items():
        sup = db.query(MaterialSupplier).filter(MaterialSupplier.id == sup_id).first()
        if not sup:
            raise HTTPException(status_code=404, detail=f"Fornitore id={sup_id} non trovato")
        order = MaterialOrder(
            created_by_user_id=current_user.id,
            material_supplier_id=sup.id,
            supplier_name=sup.name,
            source='file',
        )
        db.add(order)
        db.flush()
        for r in items:
            db.add(MaterialOrderItem(
                material_order_id=order.id,
                material_id=r.material_id,
                material_name=r.material_name or r.csv_material,
                part_code=r.part_code,
                description=r.description,
                shape=r.shape or 'prismatico',
                width_mm=r.width_mm, height_mm=r.height_mm, thickness_mm=r.thickness_mm,
                diameter_mm=r.diameter_mm, inner_diameter_mm=r.inner_diameter_mm, length_mm=r.length_mm,
                quantity=r.quantity,
            ))
        created.append(order)

    # Impara gli alias SOLO ora, dagli abbinamenti confermati con la creazione
    # dell'ordine (nome-distinta → materiale): niente più apprendimento da click
    # transitori/errati durante l'editing. Upsert idempotente per csv_name.
    learned: dict = {}
    for r in rows:
        key = _norm(r.csv_material)
        if key and r.material_id:
            learned[key] = r.material_id
    if learned:
        existing = {
            a.csv_name: a
            for a in db.query(MaterialAlias).filter(MaterialAlias.csv_name.in_(list(learned))).all()
        }
        for key, mat_id in learned.items():
            alias = existing.get(key)
            if alias:
                alias.material_id = mat_id
            else:
                db.add(MaterialAlias(csv_name=key, material_id=mat_id))

    db.commit()

    actor = current_user.full_name or current_user.username
    for order in created:
        db.refresh(order)
        create_notification(
            db,
            type='materials_ordered',
            title=f"Ordine materiali MO-{order.id:04d} (da file)",
            body=f"{actor} ha creato l'ordine materiali da file per {order.supplier_name}",
            created_by_user_id=current_user.id,
            target_roles=['ufficio_tecnico', 'amministrazione'],
            data={'order_id': order.id, 'navigate_to': '/orders/history'},
        )

    return [_order_to_out(o, db) for o in created]
