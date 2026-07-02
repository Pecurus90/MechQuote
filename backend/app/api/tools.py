"""API gestione utensili + scan barcode + notifica low-stock.

Il PDF ordine utensili è stato spostato in `api/orders_tools.py` (sezione
Ordini sidebar). Qui resta solo CRUD utensili + scan +/- + notifica.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import or_, text
from sqlalchemy.orm import Session, joinedload

from app.core.csv_import import (
    CsvImportConfig, CsvRowSkip,
    csv_template_response, import_catalog_csv, parse_decimal_it,
)
from app.core.catalog_protect import check_duplicate_name
from app.core.database import get_db, utc_now
from app.core.security import get_current_user, require_permission
from app.models import (
    Notification, Tool, ToolBrand, ToolLocation, ToolSupplier, ToolType, User,
)
from app.schemas import (
    ToolAttributeCreate, ToolAttributeOut, ToolAttributeUpdate,
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
    check_duplicate_name(db, ToolSupplier, data.name, label="fornitore utensili")
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
    if data.name is not None:
        check_duplicate_name(db, ToolSupplier, data.name, label="fornitore utensili", exclude_id=sid)
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


# ─── Import CSV Fornitori utensili ──────────────────────────────────────────

_TOOL_SUPPLIERS_CSV_COLUMNS = [
    'Nome', 'Indirizzo', 'Telefono', 'Email', 'Note',
]


def _tool_supplier_mapper(row: dict):
    name = (row.get('Nome') or '').strip()
    if not name:
        raise CsvRowSkip("Nome mancante")
    return name, {
        'name': name,
        'address': (row.get('Indirizzo') or '').strip() or None,
        'phone': (row.get('Telefono') or '').strip() or None,
        'email': (row.get('Email') or '').strip() or None,
        'notes': (row.get('Note') or '').strip() or None,
        'active': True,
    }


_TOOL_SUPPLIERS_IMPORT_CONFIG = CsvImportConfig(
    expected_columns=_TOOL_SUPPLIERS_CSV_COLUMNS,
    model=ToolSupplier,
    db_key_attr='name',
    mapper=_tool_supplier_mapper,
)


@router.post("/suppliers/import-csv")
async def import_tool_suppliers_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=_can_tools,
):
    """Importa un CSV di fornitori utensili. Match per `name` normalizzato:
    le voci già presenti vengono saltate (mai update)."""
    result = await import_catalog_csv(
        file=file, db=db, config=_TOOL_SUPPLIERS_IMPORT_CONFIG,
    )
    logger.info(
        "CSV fornitori utensili importato: created=%d skipped_existing=%d skipped_invalid=%d",
        result.created, result.skipped_existing, result.skipped_invalid,
    )
    return result.to_dict()


@router.get("/suppliers/csv-template")
def download_tool_suppliers_csv_template(_=_can_tools):
    """Modello CSV per l'import fornitori utensili (UTF-8 con BOM, ';')."""
    return csv_template_response(
        filename='fornitori_utensili_modello.csv',
        columns=_TOOL_SUPPLIERS_CSV_COLUMNS,
        examples=[
            ['Hypertools Srl', 'Via Industria 5, Padova', '049 1234567', 'info@hypertools.it', ''],
            ['OSG Italia',     'Via Test 8, Milano',      '',            'vendite@osg.it',     'Punte HSS-Co'],
        ],
    )


# ─── Attributi utensile (Tipo / Marchio / Posizione) ───────────────────────
#
# Stessa logica per le 3 risorse (tabelle catalogo semplici): factory
# che monta i 4 endpoint CRUD su un router secondario. Niente astrazioni
# fancy — solo evita di scrivere 3 volte lo stesso codice.

_ALLOWED_TOOL_COLUMNS = {"tool_type", "brand", "location"}


def _mount_tool_attribute_crud(prefix: str, model, label: str, tool_column: str):
    """Monta CRUD per una tabella attributi (Tipo / Marchio / Posizione).

    `tool_column` è il nome della colonna stringa su `tools` che usa
    questo attributo: rinominando una voce nel catalogo, propaghiamo
    il rename su tutti gli utensili che usavano il vecchio nome.
    Senza cascade i Tool diventerebbero "valori legacy" silenziosi.

    Whitelist su `tool_column`: interpolato in `text(f"...")` per cascade
    rename e count-in-use. Il valore è hardcoded dalle 3 chiamate sotto,
    ma il check blinda contro futuri usi che passassero input utente.
    """
    if tool_column not in _ALLOWED_TOOL_COLUMNS:
        raise ValueError(
            f"tool_column '{tool_column}' non in whitelist {_ALLOWED_TOOL_COLUMNS}"
        )
    @router.get(prefix, response_model=List[ToolAttributeOut])
    def _list(db: Session = Depends(get_db), _=_can_tools):
        return db.query(model).order_by(model.name).all()

    @router.post(prefix, response_model=ToolAttributeOut)
    def _create(data: ToolAttributeCreate, db: Session = Depends(get_db), _=_can_tools):
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nome obbligatorio")
        existing = db.query(model).filter(model.name.ilike(name)).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"{label} '{name}' già esistente")
        obj = model(name=name, active=data.active)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @router.put(prefix + "/{oid}", response_model=ToolAttributeOut)
    def _update(oid: int, data: ToolAttributeUpdate, db: Session = Depends(get_db), _=_can_tools):
        obj = db.query(model).filter(model.id == oid).first()
        if not obj:
            raise HTTPException(status_code=404, detail=f"{label} non trovato")
        old_name = obj.name
        payload = data.model_dump(exclude_unset=True)
        new_name = None
        if 'name' in payload and payload['name']:
            payload['name'] = payload['name'].strip()
            dup = db.query(model).filter(model.name.ilike(payload['name']), model.id != oid).first()
            if dup:
                raise HTTPException(status_code=400, detail=f"{label} '{payload['name']}' già esistente")
            new_name = payload['name']
        for k, v in payload.items():
            setattr(obj, k, v)
        # Cascade rename sugli utensili che usavano il vecchio nome.
        if new_name and new_name != old_name:
            res = db.execute(
                text(f"UPDATE tools SET {tool_column} = :new WHERE {tool_column} = :old"),
                {"new": new_name, "old": old_name},
            )
            logger.info("Cascade rename %s: '%s'→'%s' su %d utensili",
                        tool_column, old_name, new_name, res.rowcount)
        db.commit()
        db.refresh(obj)
        return obj

    @router.delete(prefix + "/{oid}")
    def _delete(oid: int, db: Session = Depends(get_db), _=_can_tools):
        obj = db.query(model).filter(model.id == oid).first()
        if not obj:
            raise HTTPException(status_code=404, detail=f"{label} non trovato")
        # Blocca eliminazione se in uso da utensili (evita "valori orfani" sui Tool).
        n = db.execute(
            text(f"SELECT COUNT(*) FROM tools WHERE {tool_column} = :name"),
            {"name": obj.name},
        ).scalar() or 0
        if n > 0:
            raise HTTPException(
                status_code=400,
                detail=f"{label} '{obj.name}' in uso da {n} utensili — rinominalo o riassegnali prima"
            )
        db.delete(obj)
        db.commit()
        return {"ok": True}


_mount_tool_attribute_crud("/types",     ToolType,     "Tipo",      "tool_type")
_mount_tool_attribute_crud("/brands",    ToolBrand,    "Marchio",   "brand")
_mount_tool_attribute_crud("/locations", ToolLocation, "Posizione", "location")


# ─── CRUD utensili ──────────────────────────────────────────────────────────

@router.get("", response_model=List[ToolOut])
def list_tools(
    tool_type: Optional[str] = None,
    brand: Optional[str] = None,
    tool_supplier_id: Optional[int] = None,
    low_stock_only: bool = False,
    active: Optional[bool] = None,
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
    if active is not None:
        query = query.filter(Tool.active == active)
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


# ─── Import CSV Utensili ────────────────────────────────────────────────────
#
# Strategia β (validazione stretta):
# - Chiave anti-duplicato = `code` (UNIQUE, già check al create).
# - Tipo/Marca/Locazione: stringhe libere sul model, MA al import devono
#   esistere nei rispettivi lookup (ToolType/ToolBrand/ToolLocation). Niente
#   auto-creazione: il typo nel CSV viene scartato con messaggio chiaro.
# - Fornitore: lookup su ToolSupplier per nome -> FK id (come per i materiali).

_TOOLS_CSV_COLUMNS = [
    'Codice', 'Tipo', 'Marca', 'Modello',
    'Diametro (mm)', 'Toroidale (mm)',
    'Quantità', 'Quantità minima',
    'Locazione', 'Fornitore', 'Note',
]


def _parse_int_or_zero(raw, label: str) -> int:
    """Quantità intera tollerante: vuoto -> 0, altrimenti int strict.

    Solleva CsvRowSkip se il valore non è interpretabile come intero
    (es. "3,5" o "abc"): le quantità sono pezzi conteggiati a unità,
    decimali non hanno senso.
    """
    text = (str(raw) if raw is not None else '').strip()
    if not text:
        return 0
    try:
        return int(text)
    except ValueError:
        raise CsvRowSkip(f"{label} non intera: {text!r}")


def _build_tool_mapper(
    type_names: set, brand_names: set, location_names: set,
    supplier_by_name: dict,
):
    """Closure mapper per l'import utensili.

    Riceve le mappe/insiemi pre-caricati dall'endpoint (una sola query
    per ognuna) per evitare N query per riga. Tutti i nomi sono già
    normalizzati con strip+lower al momento del pre-carico.
    """
    def mapper(row: dict):
        code = (row.get('Codice') or '').strip()
        if not code:
            raise CsvRowSkip("Codice mancante")

        def _lookup(raw_value: str, allowed: set, label: str, advice: str):
            v = (raw_value or '').strip()
            if not v:
                return None
            if v.lower() not in allowed:
                raise CsvRowSkip(
                    f"{label} {v!r} non in catalogo: aggiungilo da {advice}"
                )
            return v

        tool_type = _lookup(
            row.get('Tipo'), type_names,
            'Tipo', 'Attributi utensili',
        )
        brand = _lookup(
            row.get('Marca'), brand_names,
            'Marca', 'Attributi utensili',
        )
        location = _lookup(
            row.get('Locazione'), location_names,
            'Locazione', 'Attributi utensili',
        )

        supplier_id = None
        supplier_raw = (row.get('Fornitore') or '').strip()
        if supplier_raw:
            supplier_id = supplier_by_name.get(supplier_raw.lower())
            if supplier_id is None:
                raise CsvRowSkip(
                    f"Fornitore '{supplier_raw}' non trovato: "
                    "importa prima i fornitori utensili"
                )

        return code, {
            'code': code,
            'tool_type': tool_type,
            'brand': brand,
            'model': (row.get('Modello') or '').strip() or None,
            'diameter_mm': parse_decimal_it(
                row.get('Diametro (mm)'), 'Diametro', required=False,
            ),
            'toroidal_mm': parse_decimal_it(
                row.get('Toroidale (mm)'), 'Toroidale', required=False,
            ),
            'quantity': _parse_int_or_zero(row.get('Quantità'), 'Quantità'),
            'minimum_quantity': _parse_int_or_zero(
                row.get('Quantità minima'), 'Quantità minima',
            ),
            'location': location,
            'tool_supplier_id': supplier_id,
            'notes': (row.get('Note') or '').strip() or None,
            'active': True,
        }
    return mapper


@router.post("/import-csv")
async def import_tools_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=_can_tools,
):
    """Importa un CSV di utensili. Match per `code` (univoco): le voci
    già presenti vengono saltate (mai update). Tipo/Marca/Locazione e
    Fornitore devono già esistere nei rispettivi cataloghi (validazione
    stretta β: niente creazione al volo)."""
    type_names = {
        (t.name or '').strip().lower()
        for t in db.query(ToolType).all()
    }
    brand_names = {
        (b.name or '').strip().lower()
        for b in db.query(ToolBrand).all()
    }
    location_names = {
        (l.name or '').strip().lower()
        for l in db.query(ToolLocation).all()
    }
    supplier_by_name = {
        (s.name or '').strip().lower(): s.id
        for s in db.query(ToolSupplier).all()
    }
    config = CsvImportConfig(
        expected_columns=_TOOLS_CSV_COLUMNS,
        model=Tool,
        db_key_attr='code',
        mapper=_build_tool_mapper(
            type_names, brand_names, location_names, supplier_by_name,
        ),
    )
    result = await import_catalog_csv(file=file, db=db, config=config)
    logger.info(
        "CSV utensili importato: created=%d skipped_existing=%d skipped_invalid=%d",
        result.created, result.skipped_existing, result.skipped_invalid,
    )
    return result.to_dict()


@router.get("/csv-template")
def download_tools_csv_template(_=_can_tools):
    """Modello CSV per l'import utensili (UTF-8 con BOM, ';').

    Validazione stretta: `Tipo`, `Marca`, `Locazione` e `Fornitore` devono
    già esistere nei rispettivi cataloghi (Attributi utensili / Fornitori
    utensili). Celle vuote ammesse e mappate a NULL.
    """
    return csv_template_response(
        filename='utensili_modello.csv',
        columns=_TOOLS_CSV_COLUMNS,
        examples=[
            ['UT-001', 'Fresa', 'Sandvik', 'R390-12T308', '12',  '0.8', '5', '2', 'Armadio A', 'Hypertools Srl', ''],
            ['UT-002', 'Punta', 'OSG',     'HSS-Co Φ5',   '5',   '',    '0', '0', '',          '',                'In riordino'],
        ],
    )


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
