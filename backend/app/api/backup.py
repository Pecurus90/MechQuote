"""Backup / Restore — export e import JSON di tutto lo stato persistente.

Cosa entra nel backup:
- Anagrafica/catalogo: User, Role, RolePermission, QuoteCategory,
  MaterialSupplier, Material, Supplier, Machine, Treatment, Operation,
  StepColorRule, CompanySettings, Customer, NormalizedSupplier.
- Workflow: WorkflowTemplate, WorkflowTemplateStep.
- Wire EDM: EdmConfig, EdmCutSpeed, CuttingCycle, CuttingPass, DrillingTime.
- Operativo: Quote, Part, ManufacturingPhase, PartFile.

Cosa NON entra (volutamente):
- Notification/NotificationRead: ephemeral, rigenerati dal workflow.
- File fisici in uploads/: PartFile contiene solo il record DB (filename, path).
  Ripristinare i file fisici è responsabilità separata — documenta in UI.

Pattern di import:
- Payload validato via Pydantic (BackupPayload).
- Per ogni riga: filtro le chiavi via column introspection (whitelist colonne
  del modello) → ignora campi obsoleti / impossibili da injectare.
- Date/datetime ISO → oggetti Python.
- Mantiene gli ID originali per preservare le FK references.
- DELETE in ordine reverse (children prima), INSERT in ordine forward (parent prima).
"""
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column
from sqlalchemy.orm import Session

from app.core.database import get_db, utc_now
from app.core.security import get_current_user
from app.models import (
    User, Role, RolePermission, QuoteCategory,
    MaterialSupplier, Material, Supplier, Machine, Treatment,
    Operation, WorkflowTemplate, WorkflowTemplateStep,
    StepColorRule, CompanySettings, Customer, NormalizedSupplier,
    EdmConfig, EdmCutSpeed, CuttingCycle, CuttingPass, DrillingTime,
    Quote, Part, ManufacturingPhase, PartFile,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backup", tags=["backup"])


BACKUP_VERSION = "2.0"

# Hard cap per tabella su export. Protezione DoS interno: evita di caricare
# milioni di righe in RAM e materializzare un JSON gigabyte. Valore alto
# rispetto al carico attuale (top: ~325 customers, ~300 tools); quando una
# tabella si avvicina al cap serve un export tool dedicato (chunked / per
# data range / streaming verso file). Solo admin (gating: 'backup').
MAX_ROWS_PER_TABLE = 500_000


# Ordine parent → child. Usato in forward order per INSERT, reverse per DELETE.
# Ogni modello dichiara le sue dipendenze FK: tutti i parent compaiono prima.
EXPORT_ORDER: List[Type] = [
    # Configurazione globale (nessuna FK)
    CompanySettings,
    # Ruoli e utenti
    Role,
    User,                   # FK soft a roles.name (non FK reale)
    RolePermission,         # FK Role.id
    # Catalogo statico
    QuoteCategory,
    MaterialSupplier,
    Material,               # FK MaterialSupplier
    Supplier,
    Machine,
    Treatment,              # FK Supplier
    Operation,              # catalogo Lavorazioni
    WorkflowTemplate,
    WorkflowTemplateStep,   # FK WorkflowTemplate, Machine, Operation
    StepColorRule,
    NormalizedSupplier,     # nessuna FK
    # Wire EDM
    EdmConfig,
    CuttingCycle,
    CuttingPass,            # FK CuttingCycle
    DrillingTime,
    EdmCutSpeed,
    # Anagrafica clienti
    Customer,
    # Operativo
    Quote,                  # FK Customer, User
    Part,                   # FK Quote, Material
    ManufacturingPhase,     # FK Part, Machine, Supplier, Treatment, CuttingCycle
    PartFile,               # FK Part
]

TABLE_TO_MODEL: Dict[str, Type] = {m.__tablename__: m for m in EXPORT_ORDER}


def _serialize_value(val: Any) -> Any:
    """Converte valori Python in tipi JSON-serializzabili."""
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, date):
        return val.isoformat()
    return val


def _serialize_record(record: Any) -> Dict[str, Any]:
    """Converte una riga ORM in dict, una colonna alla volta.

    Usa il nome di colonna nel DB (`col.name`) come chiave per coerenza con
    il payload importato. Per leggere il valore usa il mapper SQLAlchemy
    (che conosce eventuali alias attribute←→colonna, es. `speed_mm_per_min`
    su `speed_mm2_min`); fallback su `getattr` per casi dove l'attribute
    coincide col nome di colonna.
    """
    from sqlalchemy import inspect as sa_inspect
    mapper = sa_inspect(type(record))
    # Mappa nome colonna DB → chiave attribute Python
    col_to_attr = {c.name: prop.key for prop in mapper.column_attrs for c in prop.columns}
    out: Dict[str, Any] = {}
    for col in record.__table__.columns:
        attr = col_to_attr.get(col.name, col.name)
        out[col.name] = _serialize_value(getattr(record, attr, None))
    return out


def _deserialize_value(col: Column, val: Any) -> Any:
    """Converte un valore JSON al tipo Python atteso dalla colonna."""
    if val is None:
        return None
    py_type = getattr(col.type, "python_type", None)
    try:
        if py_type is datetime and isinstance(val, str):
            return datetime.fromisoformat(val)
        if py_type is date and isinstance(val, str):
            return date.fromisoformat(val)
    except (TypeError, ValueError):
        # tipo non noto o stringa non parsabile: lascia il valore raw, SQLAlchemy
        # solleverà a tempo di insert se incompatibile
        pass
    return val


def _filter_to_columns(model_class: Type, record: Dict[str, Any]) -> Dict[str, Any]:
    """Whitelist: tiene solo le chiavi che esistono come colonne del modello.
    Rifiuta campi extra o legacy → previene injection di campi inattesi.

    Le chiavi del dict di output sono gli attribute Python (necessari per il
    costruttore SQLAlchemy `Model(**cleaned)`). Quando un attribute ha alias
    diverso dal nome colonna in DB (es. `speed_mm_per_min` su colonna
    `speed_mm2_min`), il payload arriva con la chiave nome-colonna ma va
    rimappata sull'attribute.
    """
    from sqlalchemy import inspect as sa_inspect
    mapper = sa_inspect(model_class)
    col_to_attr = {c.name: prop.key for prop in mapper.column_attrs for c in prop.columns}
    cols = {c.name: c for c in model_class.__table__.columns}
    cleaned: Dict[str, Any] = {}
    for key, val in record.items():
        col = cols.get(key)
        if col is None:
            continue
        attr = col_to_attr.get(key, key)
        cleaned[attr] = _deserialize_value(col, val)
    return cleaned


# ─── Pydantic ───────────────────────────────────────────────────────────────

class BackupPayload(BaseModel):
    """Payload accettato dall'endpoint import.

    Supporta due formati:
    - Nuovo (v2.0): {"version": "...", "exported_at": "...", "tables": {<table>: [<rows>]}}
    - Legacy (v1, audit pre-fix): {<table>: [<rows>]} flat — accettato ma sconsigliato.
    """
    version: Optional[str] = None
    exported_at: Optional[str] = None
    tables: Optional[Dict[str, List[Dict[str, Any]]]] = None

    class Config:
        extra = "allow"  # consente formato legacy (chiavi extra = nomi tabella)

    def normalized_tables(self) -> Dict[str, List[Dict[str, Any]]]:
        """Ritorna le tabelle a prescindere dal formato (nuovo o legacy)."""
        if self.tables is not None:
            return self.tables
        # Legacy: tutte le chiavi extra che corrispondono a un nome tabella noto
        out: Dict[str, List[Dict[str, Any]]] = {}
        for key, val in self.model_extra.items() if self.model_extra else []:
            if key in TABLE_TO_MODEL and isinstance(val, list):
                out[key] = val
        return out


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/export")
def export_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Esporta tutto lo stato persistente. Permission gating: 'backup' (vedi main.py).

    Streaming: `yield_per(1000)` riduce il picco RAM SQLAlchemy (carica 1000
    record alla volta dalla connection). Hard cap MAX_ROWS_PER_TABLE per
    tabella: oltre, abort esplicito invece di OOM. Un backup truncato non
    sarebbe restorable, quindi l'errore è preferibile.
    """
    tables: Dict[str, List[Dict[str, Any]]] = {}
    for model_class in EXPORT_ORDER:
        rows: List[Dict[str, Any]] = []
        for record in db.query(model_class).yield_per(1000):
            rows.append(_serialize_record(record))
            if len(rows) > MAX_ROWS_PER_TABLE:
                logger.error(
                    "Backup export ABORT: tabella %s supera %d righe (cap)",
                    model_class.__tablename__, MAX_ROWS_PER_TABLE,
                )
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"Tabella '{model_class.__tablename__}' supera il cap "
                        f"di {MAX_ROWS_PER_TABLE} righe. Un backup troncato non "
                        f"sarebbe ripristinabile — usare un export incrementale."
                    ),
                )
        tables[model_class.__tablename__] = rows
    total_rows = sum(len(rows) for rows in tables.values())
    logger.info("Backup export: by=%s tabelle=%d righe=%d",
                current_user.username, len(tables), total_rows)
    return {
        "version": BACKUP_VERSION,
        "exported_at": utc_now().isoformat(),
        "tables": tables,
    }


@router.post("/import")
def import_data(
    payload: BackupPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Sovrascrive lo stato persistente con il contenuto del backup.

    ⚠️  ENDPOINT DISTRUTTIVO — CLAUDE.md §2.E:
    Prima di chiamare questo endpoint (UI Settings → Backup, oppure
    curl/test), FARE SEMPRE backup file SQLite:
        cp backend/mechquote.db backend/mechquote.db.bak-$(date +%Y%m%d-%H%M%S)
    SQLite non enforce FK di default: un payload con FK violate passa il
    check e svuota il DB senza recovery. Non idempotente: lanciare 2 volte
    lo stesso payload sovrascrive ogni volta (corretto by design).

    DELETE + INSERT in **transazione unica**: se l'INSERT fallisce a metà
    (riga corrotta, FK violata, schema obsoleto…), rollback completo e
    DB integro al pre-import. Senza questo wrapping un commit intermedio
    lasciava il DB svuotato e non ripopolato in caso di errore.
    """
    tables = payload.normalized_tables()
    if not tables:
        raise HTTPException(status_code=400, detail="Backup vuoto o formato non riconosciuto")

    # Guard distruttivo: il payload deve contenere righe in almeno una tabella nota.
    # Senza questo check, un payload con solo chiavi sconosciute o liste vuote
    # passerebbe il guard `if not tables` ma poi il DELETE successivo svuoterebbe
    # tutto il DB senza reimportare nulla (incidente del 2026-05-09: chiamata di
    # test con tables={'unknown_table': [...], 'users': []} ha cancellato 326
    # customers + 5 users + materials senza recovery possibile).
    known_with_data = [
        t for t, rows in tables.items()
        if t in TABLE_TO_MODEL and isinstance(rows, list) and len(rows) > 0
    ]
    if not known_with_data:
        raise HTTPException(
            status_code=400,
            detail="Backup non contiene dati per nessuna tabella riconosciuta — "
                   "import abortito per evitare DELETE distruttivo del DB attuale.",
        )

    counts: Dict[str, int] = {}
    try:
        # 1. Cancella in ordine reverse (children prima dei parent), no commit.
        for model_class in reversed(EXPORT_ORDER):
            db.query(model_class).delete(synchronize_session=False)

        # 2. Inserisce in ordine forward (parent prima dei children), no commit.
        for model_class in EXPORT_ORDER:
            table = model_class.__tablename__
            rows = tables.get(table, [])
            if not rows:
                continue
            for raw in rows:
                cleaned = _filter_to_columns(model_class, raw)
                # F1b: una qty < 1 reimportata creerebbe una parte che poi manda
                # in 500 la lista preventivi (validazione PartOut). L'import salta
                # lo schema Pydantic, quindi clamp difensivo qui.
                if model_class is Part and cleaned.get("quantity") is not None:
                    try:
                        cleaned["quantity"] = max(1, int(cleaned["quantity"]))
                    except (TypeError, ValueError):
                        cleaned["quantity"] = 1
                db.add(model_class(**cleaned))
            counts[table] = len(rows)

        # Unico commit: o tutto o niente.
        db.commit()
    except Exception as e:
        db.rollback()
        # Log completo dell'eccezione (incluso traceback via exc_info) per il
        # sysadmin. Il client riceve solo un messaggio generico: l'eccezione
        # SQL può citare nomi di tabelle, vincoli FK o ID di record (info
        # disclosure se esposta a frontend). L'admin che fa l'import può
        # comunque consultare i log server per debugging.
        logger.error(
            "Backup import FALLITO: by=%s error_type=%s",
            current_user.username, type(e).__name__,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Import fallito — rollback eseguito, DB integro al pre-import. "
                   "Vedi log server per dettagli sull'errore.",
        )

    total_rows = sum(counts.values())
    logger.info("Backup import OK: by=%s tabelle=%d righe=%d",
                current_user.username, len(counts), total_rows)
    return {
        "ok": True,
        "imported": counts,
        "message": f"Ripristinate {total_rows} righe in {len(counts)} tabelle. "
                   f"I file fisici in uploads/ vanno ripristinati separatamente.",
    }
