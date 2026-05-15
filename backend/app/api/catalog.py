from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.catalog_protect import block_if_in_use
from app.core.security import require_permission
from app.models import Quote, QuoteCategory, StepColorRule
from app.schemas import (
    QuoteCategoryCreate, QuoteCategoryUpdate, QuoteCategoryOut,
    StepColorRuleCreate, StepColorRuleBase, StepColorRuleOut,
)

router = APIRouter(prefix="/api", tags=["catalog"])


# --- Quote Categories ---
@router.get("/quote-categories", response_model=List[QuoteCategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(QuoteCategory).order_by(QuoteCategory.sort_order, QuoteCategory.code).all()


@router.post("/quote-categories", response_model=QuoteCategoryOut, dependencies=[require_permission('settings')])
def create_category(data: QuoteCategoryCreate, db: Session = Depends(get_db)):
    cat = QuoteCategory(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/quote-categories/{cid}", response_model=QuoteCategoryOut, dependencies=[require_permission('settings')])
def update_category(cid: int, data: QuoteCategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(QuoteCategory).filter(QuoteCategory.id == cid).first()
    if not cat:
        raise HTTPException(404, "Categoria non trovata")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/quote-categories/{cid}", dependencies=[require_permission('settings')])
def delete_category(cid: int, db: Session = Depends(get_db)):
    cat = db.query(QuoteCategory).filter(QuoteCategory.id == cid).first()
    if not cat:
        raise HTTPException(404, "Categoria non trovata")
    # La categoria entra nel quote_number come singola lettera embedded
    # ("CCC-YYC_PPP"): nessuna FK formale, ma quote esistenti che la usano
    # vanno protetti — riconosciamo il pattern con LIKE escape-safe.
    n_in_use = db.query(Quote).filter(
        Quote.quote_number.like(f"%{cat.code}\\_%", escape="\\")
    ).count()
    if n_in_use > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Categoria '{cat.code}' in uso da {n_in_use} {'preventivo' if n_in_use == 1 else 'preventivi'} — riassegnali prima",
        )
    db.delete(cat)
    db.commit()
    return {"ok": True}


# --- STEP Color Rules ---
@router.get("/step-color-rules", response_model=List[StepColorRuleOut])
def list_color_rules(db: Session = Depends(get_db)):
    return db.query(StepColorRule).order_by(StepColorRule.color_name).all()


@router.post("/step-color-rules", response_model=StepColorRuleOut, dependencies=[require_permission('settings')])
def create_color_rule(data: StepColorRuleCreate, db: Session = Depends(get_db)):
    c = StepColorRule(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/step-color-rules/{cid}", response_model=StepColorRuleOut, dependencies=[require_permission('settings')])
def update_color_rule(cid: int, data: StepColorRuleBase, db: Session = Depends(get_db)):
    c = db.query(StepColorRule).filter(StepColorRule.id == cid).first()
    if not c:
        raise HTTPException(404, "Regola colore non trovata")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/step-color-rules/{cid}", dependencies=[require_permission('settings')])
def delete_color_rule(cid: int, db: Session = Depends(get_db)):
    c = db.query(StepColorRule).filter(StepColorRule.id == cid).first()
    if not c:
        raise HTTPException(404, "Regola colore non trovata")
    # No FK formale verso StepColorRule (dormiente fino a import 3D). Il
    # check è segnaposto per coerenza con il pattern catalog: se in futuro
    # ManufacturingPhase guadagna un FK qui, basta aggiungere la tupla.
    block_if_in_use(db, f"Regola colore '{c.color_name}'")
    db.delete(c)
    db.commit()
    return {"ok": True}
