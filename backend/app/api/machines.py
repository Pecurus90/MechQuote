import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.catalog_protect import block_if_in_use, check_duplicate_name
from app.core.csv_import import (
    CsvImportConfig, CsvRowSkip,
    csv_template_response, import_catalog_csv, parse_decimal_it,
)
from app.core.database import get_db
from app.core.security import require_permission
from app.models import EdmConfig, Machine, ManufacturingPhase, WorkflowTemplateStep
from app.schemas import MachineCreate, MachineUpdate, MachineOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["machines"])


@router.get("/machines", response_model=List[MachineOut])
def list_machines(
    active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """Elenco centri di costo (macchine). `active` opzionale: se True/False
    filtra, se omesso restituisce tutto (default invariato). Pattern di
    `normalized_items.list_items`."""
    query = db.query(Machine)
    if active is not None:
        query = query.filter(Machine.active == active)
    return query.order_by(Machine.name).all()


@router.post("/machines", response_model=MachineOut, dependencies=[require_permission('settings')])
def create_machine(data: MachineCreate, db: Session = Depends(get_db)):
    check_duplicate_name(db, Machine, data.name, label="macchina/centro di costo")
    m = Machine(**data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.put("/machines/{mid}", response_model=MachineOut, dependencies=[require_permission('settings')])
def update_machine(mid: int, data: MachineUpdate, db: Session = Depends(get_db)):
    m = db.query(Machine).filter(Machine.id == mid).first()
    if not m:
        raise HTTPException(404, "Centro di costo non trovato")
    if data.name is not None:
        check_duplicate_name(db, Machine, data.name, label="macchina/centro di costo", exclude_id=mid)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/machines/{mid}", dependencies=[require_permission('settings')])
def delete_machine(mid: int, db: Session = Depends(get_db)):
    m = db.query(Machine).filter(Machine.id == mid).first()
    if not m:
        raise HTTPException(404, "Centro di costo non trovato")
    block_if_in_use(
        db, f"Centro di costo '{m.name}'",
        (ManufacturingPhase, ManufacturingPhase.machine_id == m.id, "fase", "fasi"),
        (WorkflowTemplateStep, WorkflowTemplateStep.machine_id == m.id, "step template", "step template"),
        (EdmConfig, EdmConfig.default_drilling_machine_id == m.id, "config EDM", "config EDM"),
    )
    db.delete(m)
    db.commit()
    return {"ok": True}


# --- Import CSV Centri di costo (Machine) ----------------------------------

_MACHINES_CSV_COLUMNS = [
    'Nome', 'Tipo', 'Tariffa oraria (€/h)',
    'Tariffa setup (€/h)', 'Setup minimo (h)', 'Note',
]


def _machine_mapper(row: dict):
    name = (row.get('Nome') or '').strip()
    if not name:
        raise CsvRowSkip("Nome mancante")
    return name, {
        'name': name,
        'machine_type': (row.get('Tipo') or '').strip() or None,
        'hourly_rate': parse_decimal_it(
            row.get('Tariffa oraria (€/h)'), 'Tariffa oraria', required=False,
        ) or 0.0,
        # setup_hourly_rate è nullable: vuoto => NULL (fallback a hourly_rate
        # nel cost engine), non zero
        'setup_hourly_rate': parse_decimal_it(
            row.get('Tariffa setup (€/h)'), 'Tariffa setup', required=False,
        ),
        'setup_minimum_hours': parse_decimal_it(
            row.get('Setup minimo (h)'), 'Setup minimo', required=False,
        ) or 0.0,
        'notes': (row.get('Note') or '').strip() or None,
        'active': True,
    }


_MACHINES_IMPORT_CONFIG = CsvImportConfig(
    expected_columns=_MACHINES_CSV_COLUMNS,
    model=Machine,
    db_key_attr='name',
    mapper=_machine_mapper,
)


@router.post("/machines/import-csv",
             dependencies=[require_permission('settings')])
async def import_machines_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Importa un CSV di centri di costo (Machine). Match per `name`
    normalizzato: le voci già presenti vengono saltate (mai update)."""
    result = await import_catalog_csv(
        file=file, db=db, config=_MACHINES_IMPORT_CONFIG,
    )
    logger.info(
        "CSV macchine importato: created=%d skipped_existing=%d skipped_invalid=%d",
        result.created, result.skipped_existing, result.skipped_invalid,
    )
    return result.to_dict()


@router.get("/machines/csv-template",
            dependencies=[require_permission('settings')])
def download_machines_csv_template():
    """Modello CSV per l'import centri di costo (UTF-8 con BOM, ';').

    La colonna `Tariffa setup (€/h)` può restare vuota: in quel caso il
    cost engine usa la `Tariffa oraria` come tariffa setup di fallback.
    """
    return csv_template_response(
        filename='centri_di_costo_modello.csv',
        columns=_MACHINES_CSV_COLUMNS,
        examples=[
            ['Tornio CNC Mazak', 'cnc',  '65.00', '70.00', '0.25', ''],
            ['Wire EDM Sodick',  'edm',  '85.00', '',      '0.5',  'Filo Φ 0.25'],
        ],
    )
