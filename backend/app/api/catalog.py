from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_role
from app.models import CostRule, PhaseTemplate, QuoteCategory, StepColorRule
from app.schemas import (
    CostRuleCreate, CostRuleUpdate, CostRuleOut,
    PhaseTemplateCreate, PhaseTemplateBase, PhaseTemplateOut,
    QuoteCategoryCreate, QuoteCategoryUpdate, QuoteCategoryOut,
    StepColorRuleCreate, StepColorRuleBase, StepColorRuleOut,
)

router = APIRouter(prefix="/api", tags=["catalog"])


# --- Quote Categories ---
@router.get("/quote-categories", response_model=List[QuoteCategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(QuoteCategory).order_by(QuoteCategory.sort_order, QuoteCategory.code).all()


@router.post("/quote-categories", response_model=QuoteCategoryOut, dependencies=[require_role('admin')])
def create_category(data: QuoteCategoryCreate, db: Session = Depends(get_db)):
    cat = QuoteCategory(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/quote-categories/{cid}", response_model=QuoteCategoryOut, dependencies=[require_role('admin')])
def update_category(cid: int, data: QuoteCategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(QuoteCategory).filter(QuoteCategory.id == cid).first()
    if not cat:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/quote-categories/{cid}", dependencies=[require_role('admin')])
def delete_category(cid: int, db: Session = Depends(get_db)):
    cat = db.query(QuoteCategory).filter(QuoteCategory.id == cid).first()
    if not cat:
        raise HTTPException(404, "Not found")
    db.delete(cat)
    db.commit()
    return {"ok": True}


# --- Cost Rules ---
@router.get("/cost-rules", response_model=List[CostRuleOut])
def list_cost_rules(db: Session = Depends(get_db)):
    return db.query(CostRule).order_by(CostRule.key).all()


@router.post("/cost-rules", response_model=CostRuleOut, dependencies=[require_role('admin')])
def create_cost_rule(data: CostRuleCreate, db: Session = Depends(get_db)):
    r = CostRule(**data.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.put("/cost-rules/{rid}", response_model=CostRuleOut, dependencies=[require_role('admin')])
def update_cost_rule(rid: int, data: CostRuleUpdate, db: Session = Depends(get_db)):
    r = db.query(CostRule).filter(CostRule.id == rid).first()
    if not r:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


# --- Phase Templates ---
@router.get("/phase-templates", response_model=List[PhaseTemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return db.query(PhaseTemplate).order_by(PhaseTemplate.name).all()


@router.post("/phase-templates", response_model=PhaseTemplateOut, dependencies=[require_role('admin')])
def create_template(data: PhaseTemplateCreate, db: Session = Depends(get_db)):
    t = PhaseTemplate(**data.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.put("/phase-templates/{tid}", response_model=PhaseTemplateOut, dependencies=[require_role('admin')])
def update_template(tid: int, data: PhaseTemplateBase, db: Session = Depends(get_db)):
    t = db.query(PhaseTemplate).filter(PhaseTemplate.id == tid).first()
    if not t:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/phase-templates/{tid}", dependencies=[require_role('admin')])
def delete_template(tid: int, db: Session = Depends(get_db)):
    t = db.query(PhaseTemplate).filter(PhaseTemplate.id == tid).first()
    if not t:
        raise HTTPException(404, "Not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


# --- STEP Color Rules ---
@router.get("/step-color-rules", response_model=List[StepColorRuleOut])
def list_color_rules(db: Session = Depends(get_db)):
    return db.query(StepColorRule).order_by(StepColorRule.color_name).all()


@router.post("/step-color-rules", response_model=StepColorRuleOut, dependencies=[require_role('admin')])
def create_color_rule(data: StepColorRuleCreate, db: Session = Depends(get_db)):
    c = StepColorRule(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/step-color-rules/{cid}", response_model=StepColorRuleOut, dependencies=[require_role('admin')])
def update_color_rule(cid: int, data: StepColorRuleBase, db: Session = Depends(get_db)):
    c = db.query(StepColorRule).filter(StepColorRule.id == cid).first()
    if not c:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/step-color-rules/{cid}", dependencies=[require_role('admin')])
def delete_color_rule(cid: int, db: Session = Depends(get_db)):
    c = db.query(StepColorRule).filter(StepColorRule.id == cid).first()
    if not c:
        raise HTTPException(404, "Not found")
    db.delete(c)
    db.commit()
    return {"ok": True}
