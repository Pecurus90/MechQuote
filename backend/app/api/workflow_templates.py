"""API per WorkflowTemplate (sequenza ordinata di PhaseTemplate).

CRUD + endpoint apply che genera N fasi pre-popolate sul preventivo.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import require_permission
from app.models import (
    WorkflowTemplate, WorkflowTemplateStep,
    ManufacturingPhase, Part, Operation,
)
from app.schemas import (
    WorkflowTemplateCreate, WorkflowTemplateUpdate, WorkflowTemplateOut,
    PartOut,
)
from app.services.calculation import recalculate_quote

router = APIRouter(prefix="/api", tags=["workflow_templates"])

_can_edit = require_permission('settings')
_can_apply = require_permission('quotes.create')


@router.get("/workflow-templates", response_model=List[WorkflowTemplateOut])
def list_workflows(db: Session = Depends(get_db)):
    return (
        db.query(WorkflowTemplate)
        .options(
            joinedload(WorkflowTemplate.steps).joinedload(WorkflowTemplateStep.machine),
            joinedload(WorkflowTemplate.steps).joinedload(WorkflowTemplateStep.operation),
        )
        .order_by(WorkflowTemplate.id)
        .all()
    )


@router.post("/workflow-templates", response_model=WorkflowTemplateOut, dependencies=[_can_edit])
def create_workflow(data: WorkflowTemplateCreate, db: Session = Depends(get_db)):
    wf = WorkflowTemplate(name=data.name, description=data.description, active=data.active)
    db.add(wf)
    db.flush()
    for s in data.steps:
        db.add(WorkflowTemplateStep(workflow_id=wf.id, **s.model_dump()))
    db.commit()
    db.refresh(wf)
    return wf


@router.put("/workflow-templates/{wid}", response_model=WorkflowTemplateOut, dependencies=[_can_edit])
def update_workflow(wid: int, data: WorkflowTemplateUpdate, db: Session = Depends(get_db)):
    wf = db.query(WorkflowTemplate).filter(WorkflowTemplate.id == wid).first()
    if not wf:
        raise HTTPException(404, "Template flusso non trovato")
    wf.name = data.name
    wf.description = data.description
    wf.active = data.active
    # Replace completo degli step (pattern come CuttingCycle)
    db.query(WorkflowTemplateStep).filter(WorkflowTemplateStep.workflow_id == wid).delete()
    for s in data.steps:
        db.add(WorkflowTemplateStep(workflow_id=wid, **s.model_dump()))
    db.commit()
    db.refresh(wf)
    return wf


@router.delete("/workflow-templates/{wid}", dependencies=[_can_edit])
def delete_workflow(wid: int, db: Session = Depends(get_db)):
    wf = db.query(WorkflowTemplate).filter(WorkflowTemplate.id == wid).first()
    if not wf:
        raise HTTPException(404, "Template flusso non trovato")
    db.delete(wf)
    db.commit()
    return {"ok": True}


@router.post(
    "/parts/{part_id}/apply-workflow/{workflow_id}",
    response_model=PartOut,
    dependencies=[_can_apply],
)
def apply_workflow_to_part(part_id: int, workflow_id: int, db: Session = Depends(get_db)):
    """Applica un WorkflowTemplate a una parte (CLEAN SLATE):
    cancella tutte le fasi esistenti, poi crea N fasi nuove dagli step
    (machine_id, phase_type). sequence_number progressivo 10, 20, 30, …
    setup_hours = Machine.setup_minimum_hours (se machine presente).
    cycle_hours = 0 (l'utente compila nel preventivo); fasi wire_edm
    nascono vuote per il profilo DXF (carica via modale).
    """
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(404, "Parte non trovata")
    wf = db.query(WorkflowTemplate).options(
        joinedload(WorkflowTemplate.steps).joinedload(WorkflowTemplateStep.machine),
        joinedload(WorkflowTemplate.steps).joinedload(WorkflowTemplateStep.operation),
    ).filter(WorkflowTemplate.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Template flusso non trovato")

    # Clean slate: rimuovi tutte le fasi della parte.
    db.query(ManufacturingPhase).filter(ManufacturingPhase.part_id == part_id).delete()
    db.flush()

    # Crea N nuove fasi dagli step (machine + operation).
    for idx, step in enumerate(wf.steps, start=1):
        op: Operation = step.operation
        machine = step.machine
        setup = (machine.setup_minimum_hours or 0.0) if machine else 0.0
        db.add(ManufacturingPhase(
            part_id=part_id,
            sequence_number=idx * 10,
            phase_type='',                   # legacy column, non più usato dal cost engine
            description=op.name,             # etichetta utente visibile
            machine_id=step.machine_id,
            operation_id=step.operation_id,  # nuovo riferimento al catalogo Lavorazioni
            setup_hours=setup,
            cycle_hours_per_part=0.0,
            fixed_cost=0.0,
            variable_cost_per_part=0.0,
        ))
    db.commit()

    # Ricalcola costi del quote (aggregazioni eventuali).
    recalculate_quote(part.quote_id, db)

    # Ritorna la parte fresh con phases caricate.
    fresh = db.query(Part).options(
        joinedload(Part.phases).options(
            # CAT-1 Fase 2: PhaseOut espone machine/operation/treatment/
            # supplier nested per le dropdown del preventivatore (stesso
            # pattern in `quotes._load_quote` e `parts.*`).
            joinedload(ManufacturingPhase.machine),
            joinedload(ManufacturingPhase.operation),
            joinedload(ManufacturingPhase.treatment),
            joinedload(ManufacturingPhase.supplier),
        ),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == part_id).first()
    return fresh
