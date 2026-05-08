"""API per la configurazione Wire EDM.

Gestisce:
- EdmConfig (singleton globale: factor di passate + default pierce time)
- EdmCutSpeed (velocità di taglio per materiale × range altezza)
- CuttingCycle / CuttingPass (template di sequenze di passate)
- DrillingTime (tempo per foro foratrice, materiale × diametro × altezza)
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import require_permission
from app.models import (
    EdmConfig, EdmCutSpeed, CuttingCycle, CuttingPass, DrillingTime,
)
from app.schemas import (
    EdmConfigOut, EdmConfigUpdate,
    EdmCutSpeedOut, EdmCutSpeedCreate, EdmCutSpeedUpdate,
    CuttingCycleOut, CuttingCycleCreate, CuttingCycleUpdate,
    DrillingTimeOut, DrillingTimeCreate, DrillingTimeUpdate,
)

router = APIRouter(prefix="/api", tags=["edm"])

_can_edit = require_permission('settings')


# ─── EdmConfig (singleton) ──────────────────────────────────────────────────

def _get_or_create_config(db: Session) -> EdmConfig:
    cfg = db.query(EdmConfig).filter(EdmConfig.id == 1).first()
    if not cfg:
        cfg = EdmConfig(id=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/edm-config", response_model=EdmConfigOut)
def get_edm_config(db: Session = Depends(get_db)):
    return _get_or_create_config(db)


@router.put("/edm-config", response_model=EdmConfigOut, dependencies=[_can_edit])
def update_edm_config(data: EdmConfigUpdate, db: Session = Depends(get_db)):
    cfg = _get_or_create_config(db)
    for key, value in data.model_dump().items():
        setattr(cfg, key, value)
    db.commit()
    db.refresh(cfg)
    return cfg


# ─── EdmCutSpeed (CRUD) ─────────────────────────────────────────────────────

@router.get("/edm-cut-speeds", response_model=List[EdmCutSpeedOut])
def list_cut_speeds(db: Session = Depends(get_db)):
    return db.query(EdmCutSpeed).order_by(
        EdmCutSpeed.material_family, EdmCutSpeed.thickness_min_mm
    ).all()


@router.post("/edm-cut-speeds", response_model=EdmCutSpeedOut, dependencies=[_can_edit])
def create_cut_speed(data: EdmCutSpeedCreate, db: Session = Depends(get_db)):
    row = EdmCutSpeed(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/edm-cut-speeds/{rid}", response_model=EdmCutSpeedOut, dependencies=[_can_edit])
def update_cut_speed(rid: int, data: EdmCutSpeedUpdate, db: Session = Depends(get_db)):
    row = db.query(EdmCutSpeed).filter(EdmCutSpeed.id == rid).first()
    if not row:
        raise HTTPException(404, "Velocità non trovata")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/edm-cut-speeds/{rid}", dependencies=[_can_edit])
def delete_cut_speed(rid: int, db: Session = Depends(get_db)):
    row = db.query(EdmCutSpeed).filter(EdmCutSpeed.id == rid).first()
    if not row:
        raise HTTPException(404, "Velocità non trovata")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ─── CuttingCycle (CRUD nested con passes) ──────────────────────────────────

@router.get("/cutting-cycles", response_model=List[CuttingCycleOut])
def list_cycles(db: Session = Depends(get_db)):
    return db.query(CuttingCycle).options(joinedload(CuttingCycle.passes)).order_by(CuttingCycle.id).all()


@router.post("/cutting-cycles", response_model=CuttingCycleOut, dependencies=[_can_edit])
def create_cycle(data: CuttingCycleCreate, db: Session = Depends(get_db)):
    cycle = CuttingCycle(name=data.name, description=data.description, active=data.active)
    db.add(cycle)
    db.flush()
    for p in data.passes:
        db.add(CuttingPass(cycle_id=cycle.id, sequence_number=p.sequence_number, pass_type=p.pass_type))
    db.commit()
    db.refresh(cycle)
    return cycle


@router.put("/cutting-cycles/{cid}", response_model=CuttingCycleOut, dependencies=[_can_edit])
def update_cycle(cid: int, data: CuttingCycleUpdate, db: Session = Depends(get_db)):
    cycle = db.query(CuttingCycle).filter(CuttingCycle.id == cid).first()
    if not cycle:
        raise HTTPException(404, "Ciclo non trovato")
    cycle.name = data.name
    cycle.description = data.description
    cycle.active = data.active
    # Sostituzione completa delle passes
    db.query(CuttingPass).filter(CuttingPass.cycle_id == cid).delete()
    for p in data.passes:
        db.add(CuttingPass(cycle_id=cid, sequence_number=p.sequence_number, pass_type=p.pass_type))
    db.commit()
    db.refresh(cycle)
    return cycle


@router.delete("/cutting-cycles/{cid}", dependencies=[_can_edit])
def delete_cycle(cid: int, db: Session = Depends(get_db)):
    cycle = db.query(CuttingCycle).filter(CuttingCycle.id == cid).first()
    if not cycle:
        raise HTTPException(404, "Ciclo non trovato")
    db.delete(cycle)
    db.commit()
    return {"ok": True}


# ─── DrillingTime (CRUD) ────────────────────────────────────────────────────

@router.get("/drilling-times", response_model=List[DrillingTimeOut])
def list_drilling_times(db: Session = Depends(get_db)):
    return db.query(DrillingTime).order_by(
        DrillingTime.material_family, DrillingTime.diameter_min_mm, DrillingTime.height_min_mm
    ).all()


@router.post("/drilling-times", response_model=DrillingTimeOut, dependencies=[_can_edit])
def create_drilling_time(data: DrillingTimeCreate, db: Session = Depends(get_db)):
    row = DrillingTime(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/drilling-times/{rid}", response_model=DrillingTimeOut, dependencies=[_can_edit])
def update_drilling_time(rid: int, data: DrillingTimeUpdate, db: Session = Depends(get_db)):
    row = db.query(DrillingTime).filter(DrillingTime.id == rid).first()
    if not row:
        raise HTTPException(404, "Tempo foratura non trovato")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/drilling-times/{rid}", dependencies=[_can_edit])
def delete_drilling_time(rid: int, db: Session = Depends(get_db)):
    row = db.query(DrillingTime).filter(DrillingTime.id == rid).first()
    if not row:
        raise HTTPException(404, "Tempo foratura non trovato")
    db.delete(row)
    db.commit()
    return {"ok": True}
