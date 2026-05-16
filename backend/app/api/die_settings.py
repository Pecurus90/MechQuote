"""API Impostazioni Stampi — singleton DieSettings + fasce dimensionali + template."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import (
    DieSettings, DieDimensionBracket, DieTemplate, DieTemplatePlate, User,
)
from app.schemas import (
    DieSettingsUpdate, DieSettingsOut,
    DieDimensionBracketCreate, DieDimensionBracketUpdate, DieDimensionBracketOut,
    DieTemplateCreate, DieTemplateUpdate, DieTemplateOut,
)

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
    db.delete(b)
    db.commit()
    return {"ok": True}


# ─── Template stampi ────────────────────────────────────────────────────────

@router.get("/templates", response_model=List[DieTemplateOut])
def list_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(DieTemplate).options(
        joinedload(DieTemplate.plates),
    ).filter(DieTemplate.active == True).order_by(DieTemplate.name).all()


@router.post("/templates", response_model=DieTemplateOut)
def create_template(
    data: DieTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    payload = data.model_dump(exclude={'plates'})
    tpl = DieTemplate(**payload)
    db.add(tpl)
    db.flush()
    for plate in data.plates:
        db.add(DieTemplatePlate(template_id=tpl.id, **plate.model_dump()))
    db.commit()
    return db.query(DieTemplate).options(
        joinedload(DieTemplate.plates),
    ).filter(DieTemplate.id == tpl.id).first()


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
    payload = data.model_dump(exclude_unset=True, exclude={'plates'})
    for k, v in payload.items():
        setattr(tpl, k, v)
    # Plates: replace strategy (più semplice del diff per oggetti embedded).
    if data.plates is not None:
        db.query(DieTemplatePlate).filter(
            DieTemplatePlate.template_id == template_id
        ).delete()
        for plate in data.plates:
            db.add(DieTemplatePlate(template_id=template_id, **plate.model_dump()))
    db.commit()
    return db.query(DieTemplate).options(
        joinedload(DieTemplate.plates),
    ).filter(DieTemplate.id == template_id).first()


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    tpl = db.query(DieTemplate).filter(DieTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template non trovato")
    db.delete(tpl)
    db.commit()
    return {"ok": True}
