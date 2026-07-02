import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from app.core.catalog_protect import block_if_in_use, check_duplicate_name
from app.core.csv_import import (
    CsvImportConfig, CsvRowSkip,
    csv_template_response, import_catalog_csv, parse_decimal_it,
)
from app.core.database import get_db
from app.core.security import require_permission
from app.models import ManufacturingPhase, Supplier, Treatment
from app.schemas import (
    SupplierCreate, SupplierUpdate, SupplierOut,
    TreatmentCreate, TreatmentUpdate, TreatmentOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["treatments"])


# --- Suppliers ---
@router.get("/suppliers", response_model=List[SupplierOut])
def list_suppliers(
    active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """Elenco fornitori esterni / trattamenti. `active` opzionale: se
    True/False filtra, se omesso restituisce tutto (default invariato).
    Pattern di `normalized_items.list_items`."""
    query = db.query(Supplier)
    if active is not None:
        query = query.filter(Supplier.active == active)
    return query.order_by(Supplier.name).all()


@router.post("/suppliers", response_model=SupplierOut, dependencies=[require_permission('settings')])
def create_supplier(data: SupplierCreate, db: Session = Depends(get_db)):
    check_duplicate_name(db, Supplier, data.name, label="fornitore esterno")
    s = Supplier(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/suppliers/{sid}", response_model=SupplierOut, dependencies=[require_permission('settings')])
def update_supplier(sid: int, data: SupplierUpdate, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Fornitore trattamenti non trovato")
    if data.name is not None:
        check_duplicate_name(db, Supplier, data.name, label="fornitore esterno", exclude_id=sid)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/suppliers/{sid}", dependencies=[require_permission('settings')])
def delete_supplier(sid: int, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Fornitore trattamenti non trovato")
    block_if_in_use(
        db, f"Fornitore trattamenti '{s.name}'",
        (ManufacturingPhase, ManufacturingPhase.supplier_id == s.id, "fase", "fasi"),
        (Treatment, Treatment.supplier_id == s.id, "trattamento", "trattamenti"),
    )
    db.delete(s)
    db.commit()
    return {"ok": True}


# --- Import CSV Fornitori trattamenti / esterni (Supplier) -----------------

_SUPPLIERS_CSV_COLUMNS = [
    'Nome', 'Tipo', 'Indirizzo', 'Spedizione (€)', 'Note',
]


def _supplier_mapper(row: dict):
    name = (row.get('Nome') or '').strip()
    if not name:
        raise CsvRowSkip("Nome mancante")
    return name, {
        'name': name,
        'supplier_type': (row.get('Tipo') or '').strip() or None,
        'address': (row.get('Indirizzo') or '').strip() or None,
        'shipping_cost': parse_decimal_it(
            row.get('Spedizione (€)'), 'Spedizione', required=False,
        ) or 0.0,
        'notes': (row.get('Note') or '').strip() or None,
        'active': True,
    }


_SUPPLIERS_IMPORT_CONFIG = CsvImportConfig(
    expected_columns=_SUPPLIERS_CSV_COLUMNS,
    model=Supplier,
    db_key_attr='name',
    mapper=_supplier_mapper,
)


@router.post("/suppliers/import-csv",
             dependencies=[require_permission('settings')])
async def import_suppliers_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Importa un CSV di fornitori esterni / trattamenti. Match per `name`
    normalizzato: le voci già presenti vengono saltate (mai update)."""
    result = await import_catalog_csv(
        file=file, db=db, config=_SUPPLIERS_IMPORT_CONFIG,
    )
    logger.info(
        "CSV fornitori esterni importato: created=%d skipped_existing=%d skipped_invalid=%d",
        result.created, result.skipped_existing, result.skipped_invalid,
    )
    return result.to_dict()


@router.get("/suppliers/csv-template",
            dependencies=[require_permission('settings')])
def download_suppliers_csv_template():
    """Modello CSV per l'import fornitori esterni (UTF-8 con BOM, ';')."""
    return csv_template_response(
        filename='fornitori_esterni_modello.csv',
        columns=_SUPPLIERS_CSV_COLUMNS,
        examples=[
            ['Trattamenti Bianchi Srl', 'termico',     'Via Industria 5, Padova', '20.00', ''],
            ['Galvanica Verdi SpA',     'superficiale', 'Via Brenta 12, Vicenza',  '15.00', 'Zincatura, nichelatura'],
        ],
    )


# --- Treatments ---
@router.get("/treatments", response_model=List[TreatmentOut])
def list_treatments(
    active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """Elenco trattamenti. `active` opzionale: se True/False filtra, se
    omesso restituisce tutto (default invariato). Pattern di
    `normalized_items.list_items`."""
    query = db.query(Treatment).options(joinedload(Treatment.supplier))
    if active is not None:
        query = query.filter(Treatment.active == active)
    return query.order_by(Treatment.name).all()


@router.post("/treatments", response_model=TreatmentOut, dependencies=[require_permission('settings')])
def create_treatment(data: TreatmentCreate, db: Session = Depends(get_db)):
    check_duplicate_name(db, Treatment, data.name, label="trattamento")
    t = Treatment(**data.model_dump())
    db.add(t)
    db.commit()
    return db.query(Treatment).options(joinedload(Treatment.supplier)).filter(Treatment.id == t.id).first()


@router.put("/treatments/{tid}", response_model=TreatmentOut, dependencies=[require_permission('settings')])
def update_treatment(tid: int, data: TreatmentUpdate, db: Session = Depends(get_db)):
    t = db.query(Treatment).filter(Treatment.id == tid).first()
    if not t:
        raise HTTPException(404, "Trattamento non trovato")
    if data.name is not None:
        check_duplicate_name(db, Treatment, data.name, label="trattamento", exclude_id=tid)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    return db.query(Treatment).options(joinedload(Treatment.supplier)).filter(Treatment.id == tid).first()


@router.delete("/treatments/{tid}", dependencies=[require_permission('settings')])
def delete_treatment(tid: int, db: Session = Depends(get_db)):
    t = db.query(Treatment).filter(Treatment.id == tid).first()
    if not t:
        raise HTTPException(404, "Trattamento non trovato")
    block_if_in_use(
        db, f"Trattamento '{t.name}'",
        (ManufacturingPhase, ManufacturingPhase.treatment_id == t.id, "fase", "fasi"),
    )
    db.delete(t)
    db.commit()
    return {"ok": True}


# --- Import CSV Trattamenti ------------------------------------------------
#
# Strict sulle tariffe: a seconda di `cost_unit` ('kg' default vs 'dm3') il
# cost engine usa cost_per_kg × peso oppure cost_per_dm3 × volume. Una
# tariffa mancante sul ramo attivo manda a zero il costo, quindi la
# pretendiamo presente al momento dell'import. Le colonne legacy
# `fixed_cost`/`cost_per_part`/`cost_per_surface_area`/`treatment_supplier_id`
# esistono ancora come colonne SQLite (no DROP COLUMN) ma non sono mappate
# dal model e quindi non vengono ne' importate ne' esposte.

_TREATMENTS_CSV_COLUMNS = [
    'Nome', 'Tipo', 'Unità', 'Costo/kg (€)', 'Costo/dm³ (€)',
    'Costo minimo (€)', 'Peso minimo (kg)', 'Fornitore', 'Note',
]


def _build_treatment_mapper(supplier_by_name: dict):
    """Closure mapper per l'import trattamenti. Riceve la mappa
    `Supplier.name -> id` precaricata dall'endpoint."""

    def mapper(row: dict):
        name = (row.get('Nome') or '').strip()
        if not name:
            raise CsvRowSkip("Nome mancante")

        unit_raw = (row.get('Unità') or '').strip().lower()
        if not unit_raw:
            unit = 'kg'  # default coerente col model
        elif unit_raw in ('kg', 'dm3'):
            unit = unit_raw
        else:
            raise CsvRowSkip(
                f"Unità {unit_raw!r} non valida: usa kg o dm3"
            )

        # Strict sulla tariffa rilevante per l'unità scelta. L'altra resta
        # opzionale (default 0) per coerenza col create CRUD manuale.
        if unit == 'kg':
            cost_per_kg = parse_decimal_it(
                row.get('Costo/kg (€)'), 'Costo/kg', required=True,
            )
            cost_per_dm3 = parse_decimal_it(
                row.get('Costo/dm³ (€)'), 'Costo/dm³', required=False,
            ) or 0.0
        else:
            cost_per_kg = parse_decimal_it(
                row.get('Costo/kg (€)'), 'Costo/kg', required=False,
            ) or 0.0
            cost_per_dm3 = parse_decimal_it(
                row.get('Costo/dm³ (€)'), 'Costo/dm³', required=True,
            )

        supplier_id = None
        supplier_raw = (row.get('Fornitore') or '').strip()
        if supplier_raw:
            supplier_id = supplier_by_name.get(supplier_raw.lower())
            if supplier_id is None:
                raise CsvRowSkip(
                    f"Fornitore '{supplier_raw}' non trovato: "
                    "importa prima i fornitori esterni"
                )

        return name, {
            'name': name,
            'treatment_type': (row.get('Tipo') or '').strip() or None,
            'cost_unit': unit,
            'cost_per_kg': cost_per_kg,
            'cost_per_dm3': cost_per_dm3,
            'minimum_cost': parse_decimal_it(
                row.get('Costo minimo (€)'), 'Costo minimo', required=False,
            ) or 0.0,
            'minimum_weight_kg': parse_decimal_it(
                row.get('Peso minimo (kg)'), 'Peso minimo', required=False,
            ),
            'supplier_id': supplier_id,
            'notes': (row.get('Note') or '').strip() or None,
            'active': True,
        }
    return mapper


@router.post("/treatments/import-csv",
             dependencies=[require_permission('settings')])
async def import_treatments_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Importa un CSV di trattamenti. Match per `name` normalizzato:
    le voci già presenti vengono saltate (mai update). Strict sulla
    tariffa coerente con `cost_unit`. Aggancio fornitore esterno
    (`Supplier`) via lookup per nome — niente creazione al volo."""
    supplier_by_name = {
        (s.name or '').strip().lower(): s.id
        for s in db.query(Supplier).all()
    }
    config = CsvImportConfig(
        expected_columns=_TREATMENTS_CSV_COLUMNS,
        model=Treatment,
        db_key_attr='name',
        mapper=_build_treatment_mapper(supplier_by_name),
    )
    result = await import_catalog_csv(file=file, db=db, config=config)
    logger.info(
        "CSV trattamenti importato: created=%d skipped_existing=%d skipped_invalid=%d",
        result.created, result.skipped_existing, result.skipped_invalid,
    )
    return result.to_dict()


@router.get("/treatments/csv-template",
            dependencies=[require_permission('settings')])
def download_treatments_csv_template():
    """Modello CSV per l'import trattamenti (UTF-8 con BOM, ';').

    `Unità` accetta `kg` o `dm3` (vuoto = `kg`). La tariffa corrispondente
    è obbligatoria; l'altra resta opzionale. `Fornitore` lookup per nome
    su `Supplier` (fornitori esterni/trattamenti): cella vuota ammessa.
    """
    return csv_template_response(
        filename='trattamenti_modello.csv',
        columns=_TREATMENTS_CSV_COLUMNS,
        examples=[
            ['Tempra TT430',   'termico',     'kg',  '3.50', '',     '120.00', '40', 'Trattamenti Bianchi Srl', ''],
            ['Nitrurazione',   'superficiale', 'dm3', '',     '180.00', '250.00', '',  'Galvanica Verdi SpA',     'Tariffa volumica'],
        ],
    )
