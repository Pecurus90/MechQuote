"""API Impostazioni Stampi — singleton DieSettings + fasce dimensionali + template."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import (
    DieSettings, DieDimensionBracket, DieTemplate, DieTemplatePlate,
    DieTemplateNormalized, DieSpec, User,
)
from app.schemas import (
    DieSettingsUpdate, DieSettingsOut,
    DieDimensionBracketCreate, DieDimensionBracketUpdate, DieDimensionBracketOut,
    DieTemplateCreate, DieTemplateUpdate, DieTemplateOut,
)
from app.services.calculation import _compute_castle_dimensions

_can_write = require_permission('dies.settings')

router = APIRouter(prefix="/api/die-settings", tags=["die-settings"])


# ─── Singleton DieSettings ──────────────────────────────────────────────────

@router.get("", response_model=DieSettingsOut)
def get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(DieSettings).filter(DieSettings.id == 1).first()
    if not s:
        # Lazy-init se il seed di startup non ha popolato (legacy DB).
        s = DieSettings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.put("", response_model=DieSettingsOut)
def update_settings(
    data: DieSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    s = db.query(DieSettings).filter(DieSettings.id == 1).first()
    if not s:
        s = DieSettings(id=1)
        db.add(s)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


# ─── Fasce dimensionali castello ────────────────────────────────────────────

@router.get("/brackets", response_model=List[DieDimensionBracketOut])
def list_brackets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(DieDimensionBracket).order_by(DieDimensionBracket.sort_order).all()


@router.post("/brackets", response_model=DieDimensionBracketOut)
def create_bracket(
    data: DieDimensionBracketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    b = DieDimensionBracket(**data.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@router.put("/brackets/{bracket_id}", response_model=DieDimensionBracketOut)
def update_bracket(
    bracket_id: int,
    data: DieDimensionBracketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    b = db.query(DieDimensionBracket).filter(DieDimensionBracket.id == bracket_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Fascia non trovata")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return b


def _count_dies_in_bracket(db: Session, bracket: DieDimensionBracket) -> int:
    """Conta i DieSpec la cui area castello calcolata ricade in questa fascia.
    Le fasce non hanno FK diretta: l'appartenenza è lookup al volo su
    `area_min ≤ area < area_max`. Loop Python: ok per volumi officina
    (decine, non migliaia, di preventivi stampo)."""
    area_min = bracket.area_min_dm2 or 0.0
    area_max = bracket.area_max_dm2  # None = infinito (ultima fascia)
    n = 0
    for s in db.query(DieSpec).all():
        cx, cy = _compute_castle_dimensions(s)
        area = (cx * cy) / 10_000.0
        if area >= area_min and (area_max is None or area < area_max):
            n += 1
    return n


@router.delete("/brackets/{bracket_id}")
def delete_bracket(
    bracket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    b = db.query(DieDimensionBracket).filter(DieDimensionBracket.id == bracket_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Fascia non trovata")
    in_use = _count_dies_in_bracket(db, b)
    if in_use > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Fascia '{b.label}' in uso da "
                f"{in_use} {'preventivo stampo' if in_use == 1 else 'preventivi stampo'} "
                f"— riassegna o elimina prima quei preventivi"
            ),
        )
    db.delete(b)
    db.commit()
    return {"ok": True}


# ─── Template stampi ────────────────────────────────────────────────────────

def _load_template_full(db: Session, template_id: int) -> DieTemplate:
    return db.query(DieTemplate).options(
        joinedload(DieTemplate.plates),
        joinedload(DieTemplate.normalized_items),
    ).filter(DieTemplate.id == template_id).first()


@router.get("/templates", response_model=List[DieTemplateOut])
def list_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(DieTemplate).options(
        joinedload(DieTemplate.plates),
        joinedload(DieTemplate.normalized_items),
    ).filter(DieTemplate.active == True).order_by(DieTemplate.name).all()


@router.post("/templates", response_model=DieTemplateOut)
def create_template(
    data: DieTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    payload = data.model_dump(exclude={'plates', 'normalized_items'})
    tpl = DieTemplate(**payload)
    db.add(tpl)
    db.flush()
    for plate in data.plates:
        db.add(DieTemplatePlate(template_id=tpl.id, **plate.model_dump()))
    for norm in data.normalized_items:
        db.add(DieTemplateNormalized(template_id=tpl.id, **norm.model_dump()))
    db.commit()
    return _load_template_full(db, tpl.id)


@router.put("/templates/{template_id}", response_model=DieTemplateOut)
def update_template(
    template_id: int,
    data: DieTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    tpl = db.query(DieTemplate).filter(DieTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template non trovato")
    payload = data.model_dump(exclude_unset=True, exclude={'plates', 'normalized_items'})
    for k, v in payload.items():
        setattr(tpl, k, v)
    # Plates: replace strategy (più semplice del diff per oggetti embedded).
    if data.plates is not None:
        db.query(DieTemplatePlate).filter(
            DieTemplatePlate.template_id == template_id
        ).delete()
        for plate in data.plates:
            db.add(DieTemplatePlate(template_id=template_id, **plate.model_dump()))
    # Sprint C — normalized_items: stessa replace strategy.
    if data.normalized_items is not None:
        db.query(DieTemplateNormalized).filter(
            DieTemplateNormalized.template_id == template_id
        ).delete()
        for norm in data.normalized_items:
            db.add(DieTemplateNormalized(template_id=template_id, **norm.model_dump()))
    db.commit()
    return _load_template_full(db, template_id)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    """Soft delete: il template resta in DB con `active=False` e sparisce
    dalle liste. Nessuna FK reale Quote→DieTemplate (l'apply è clean-slate),
    quindi un hard delete non rompe nulla, ma il soft delete preserva la
    possibilità di riattivare il template e l'audit storico."""
    tpl = db.query(DieTemplate).filter(DieTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template non trovato")
    tpl.active = False
    db.commit()
    return {"ok": True}
