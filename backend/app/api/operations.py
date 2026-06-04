"""API CRUD per Operation (catalogo Lavorazioni utente).

Etichette libere usate dal Workflow per popolare le fasi del preventivo.
phase_type è la categoria sottostante (uno degli slug PHASE_TYPES) che
guida il cost engine (autocalc EDM, riconoscimento treatment, ecc.).
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.catalog_protect import block_if_in_use
from app.core.csv_import import (
    CsvImportConfig, CsvRowSkip,
    csv_template_response, import_catalog_csv,
)
from app.core.database import get_db
from app.core.security import require_permission
from app.models import ManufacturingPhase, Operation, WorkflowTemplateStep
from app.schemas import OperationCreate, OperationUpdate, OperationOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["operations"])


@router.get("/operations", response_model=List[OperationOut])
def list_operations(db: Session = Depends(get_db)):
    return db.query(Operation).order_by(Operation.name).all()


@router.post("/operations", response_model=OperationOut, dependencies=[require_permission('settings')])
def create_operation(data: OperationCreate, db: Session = Depends(get_db)):
    op = Operation(**data.model_dump())
    db.add(op)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Esiste già una lavorazione con questo nome")
    db.refresh(op)
    return op


@router.put("/operations/{oid}", response_model=OperationOut, dependencies=[require_permission('settings')])
def update_operation(oid: int, data: OperationUpdate, db: Session = Depends(get_db)):
    op = db.query(Operation).filter(Operation.id == oid).first()
    if not op:
        raise HTTPException(404, "Lavorazione non trovata")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(op, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Esiste già una lavorazione con questo nome")
    db.refresh(op)
    return op


@router.delete("/operations/{oid}", dependencies=[require_permission('settings')])
def delete_operation(oid: int, db: Session = Depends(get_db)):
    op = db.query(Operation).filter(Operation.id == oid).first()
    if not op:
        raise HTTPException(404, "Lavorazione non trovata")
    block_if_in_use(
        db, f"Lavorazione '{op.name}'",
        (ManufacturingPhase, ManufacturingPhase.operation_id == op.id, "fase", "fasi"),
        (WorkflowTemplateStep, WorkflowTemplateStep.operation_id == op.id, "step template", "step template"),
    )
    db.delete(op)
    db.commit()
    return {"ok": True}


# --- Import CSV Lavorazioni (Operation) ------------------------------------
#
# Operation.name e' UNIQUE a DB: il motore CSV dedup-pa per chiave
# normalizzata (strip+lower), quindi "Tornitura" e "tornitura" vengono
# trattati come la stessa voce e la seconda viene saltata. Comportamento
# coerente con l'intento utente.

_OPERATIONS_CSV_COLUMNS = ['Nome']


def _operation_mapper(row: dict):
    name = (row.get('Nome') or '').strip()
    if not name:
        raise CsvRowSkip("Nome mancante")
    return name, {'name': name, 'active': True}


_OPERATIONS_IMPORT_CONFIG = CsvImportConfig(
    expected_columns=_OPERATIONS_CSV_COLUMNS,
    model=Operation,
    db_key_attr='name',
    mapper=_operation_mapper,
)


@router.post("/operations/import-csv",
             dependencies=[require_permission('settings')])
async def import_operations_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Importa un CSV di lavorazioni. Match per `name` normalizzato:
    le voci già presenti vengono saltate (mai update)."""
    result = await import_catalog_csv(
        file=file, db=db, config=_OPERATIONS_IMPORT_CONFIG,
    )
    logger.info(
        "CSV lavorazioni importato: created=%d skipped_existing=%d skipped_invalid=%d",
        result.created, result.skipped_existing, result.skipped_invalid,
    )
    return result.to_dict()


@router.get("/operations/csv-template",
            dependencies=[require_permission('settings')])
def download_operations_csv_template():
    """Modello CSV per l'import lavorazioni (UTF-8 con BOM, ';')."""
    return csv_template_response(
        filename='lavorazioni_modello.csv',
        columns=_OPERATIONS_CSV_COLUMNS,
        examples=[
            ['Tornitura'],
            ['Foratura'],
        ],
    )
