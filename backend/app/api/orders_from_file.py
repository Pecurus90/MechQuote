"""Parse distinta CSV (SolidWorks) + alias materiali — a servizio delle
richieste materiale.

Flusso:
1. POST /from-file/parse — carica una distinta CSV (es. export SolidWorks),
   decodifica (utf-8/cp1252), ripulisce gli header sporchi, estrae le colonne
   utili, calcola le dimensioni GREZZO (larghezza/altezza +5 mm, spessore al
   multiplo di 5 per eccesso) e abbina il materiale al catalogo (+ alias).
   Ritorna le righe per la tabella editabile — NIENTE scrittura su DB. Le righe
   popolano l'editor di una richiesta materiale (vedi api/material_requests.py).
2. Alias: GET/POST /aliases — corrispondenze apprese nome-distinta → materiale.

`_REQUIRED_DIMS` / `_row_missing_dims` sono riusati da api/material_requests.py
(validazione righe all'invio).
"""
import csv
import io
import math
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.core.csv_import import _decode_csv_bytes, normalize_alias
from app.core.database import get_db
from app.core.security import require_any_permission
from app.models import Material, MaterialAlias
from app.schemas import (
    FileOrderParseOut, FileOrderRow, MaterialAliasCreate, MaterialAliasOut,
)

router = APIRouter(prefix="/api/orders/materials", tags=["orders"])
# Parse distinta + alias servono alla creazione della richiesta materiale:
# aperti anche all'officina (orders.materials.request), non solo a chi ordina.
_can_orders = require_any_permission('orders.materials', 'orders.materials.request')


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
