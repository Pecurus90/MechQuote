from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models import (
    Material, Machine, Treatment, Supplier, CostRule,
    PhaseTemplate, StepColorRule, QuoteCategory
)
from app.schemas import (
    MaterialCreate, MaterialUpdate, MaterialOut,
    MachineCreate, MachineUpdate, MachineOut,
    TreatmentCreate, TreatmentUpdate, TreatmentOut,
    SupplierCreate, SupplierUpdate, SupplierOut,
    CostRuleCreate, CostRuleBase, CostRuleOut,
    PhaseTemplateCreate, PhaseTemplateBase, PhaseTemplateOut,
    StepColorRuleCreate, StepColorRuleBase, StepColorRuleOut,
    QuoteCategoryCreate, QuoteCategoryUpdate, QuoteCategoryOut,
)

router = APIRouter(prefix="/api", tags=["settings"])


# --- Quote Categories ---
@router.get("/quote-categories", response_model=List[QuoteCategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(QuoteCategory).order_by(QuoteCategory.sort_order, QuoteCategory.code).all()


@router.post("/quote-categories", response_model=QuoteCategoryOut)
def create_category(data: QuoteCategoryCreate, db: Session = Depends(get_db)):
    cat = QuoteCategory(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/quote-categories/{cid}", response_model=QuoteCategoryOut)
def update_category(cid: int, data: QuoteCategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(QuoteCategory).filter(QuoteCategory.id == cid).first()
    if not cat:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/quote-categories/{cid}")
def delete_category(cid: int, db: Session = Depends(get_db)):
    cat = db.query(QuoteCategory).filter(QuoteCategory.id == cid).first()
    if not cat:
        raise HTTPException(404, "Not found")
    db.delete(cat)
    db.commit()
    return {"ok": True}


# --- Materials ---
@router.get("/materials", response_model=List[MaterialOut])
def list_materials(db: Session = Depends(get_db)):
    return db.query(Material).all()


@router.post("/materials", response_model=MaterialOut)
def create_material(data: MaterialCreate, db: Session = Depends(get_db)):
    m = Material(**data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.put("/materials/{mid}", response_model=MaterialOut)
def update_material(mid: int, data: MaterialUpdate, db: Session = Depends(get_db)):
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/materials/{mid}")
def delete_material(mid: int, db: Session = Depends(get_db)):
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Not found")
    db.delete(m)
    db.commit()
    return {"ok": True}


# --- Machines ---
@router.get("/machines", response_model=List[MachineOut])
def list_machines(db: Session = Depends(get_db)):
    return db.query(Machine).all()


@router.post("/machines", response_model=MachineOut)
def create_machine(data: MachineCreate, db: Session = Depends(get_db)):
    m = Machine(**data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.put("/machines/{mid}", response_model=MachineOut)
def update_machine(mid: int, data: MachineUpdate, db: Session = Depends(get_db)):
    m = db.query(Machine).filter(Machine.id == mid).first()
    if not m:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/machines/{mid}")
def delete_machine(mid: int, db: Session = Depends(get_db)):
    m = db.query(Machine).filter(Machine.id == mid).first()
    if not m:
        raise HTTPException(404, "Not found")
    db.delete(m)
    db.commit()
    return {"ok": True}


# --- Treatments ---
@router.get("/treatments", response_model=List[TreatmentOut])
def list_treatments(db: Session = Depends(get_db)):
    return db.query(Treatment).all()


@router.post("/treatments", response_model=TreatmentOut)
def create_treatment(data: TreatmentCreate, db: Session = Depends(get_db)):
    t = Treatment(**data.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.put("/treatments/{tid}", response_model=TreatmentOut)
def update_treatment(tid: int, data: TreatmentUpdate, db: Session = Depends(get_db)):
    t = db.query(Treatment).filter(Treatment.id == tid).first()
    if not t:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/treatments/{tid}")
def delete_treatment(tid: int, db: Session = Depends(get_db)):
    t = db.query(Treatment).filter(Treatment.id == tid).first()
    if not t:
        raise HTTPException(404, "Not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


# --- Suppliers ---
@router.get("/suppliers", response_model=List[SupplierOut])
def list_suppliers(db: Session = Depends(get_db)):
    return db.query(Supplier).all()


@router.post("/suppliers", response_model=SupplierOut)
def create_supplier(data: SupplierCreate, db: Session = Depends(get_db)):
    s = Supplier(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/suppliers/{sid}", response_model=SupplierOut)
def update_supplier(sid: int, data: SupplierUpdate, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/suppliers/{sid}")
def delete_supplier(sid: int, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Not found")
    db.delete(s)
    db.commit()
    return {"ok": True}


# --- Cost Rules ---
@router.get("/cost-rules", response_model=List[CostRuleOut])
def list_cost_rules(db: Session = Depends(get_db)):
    return db.query(CostRule).all()


@router.post("/cost-rules", response_model=CostRuleOut)
def create_cost_rule(data: CostRuleCreate, db: Session = Depends(get_db)):
    r = CostRule(**data.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.put("/cost-rules/{rid}", response_model=CostRuleOut)
def update_cost_rule(rid: int, data: CostRuleBase, db: Session = Depends(get_db)):
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
    return db.query(PhaseTemplate).all()


@router.post("/phase-templates", response_model=PhaseTemplateOut)
def create_template(data: PhaseTemplateCreate, db: Session = Depends(get_db)):
    t = PhaseTemplate(**data.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.put("/phase-templates/{tid}", response_model=PhaseTemplateOut)
def update_template(tid: int, data: PhaseTemplateBase, db: Session = Depends(get_db)):
    t = db.query(PhaseTemplate).filter(PhaseTemplate.id == tid).first()
    if not t:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump().items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/phase-templates/{tid}")
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
    return db.query(StepColorRule).all()


@router.post("/step-color-rules", response_model=StepColorRuleOut)
def create_color_rule(data: StepColorRuleCreate, db: Session = Depends(get_db)):
    c = StepColorRule(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/step-color-rules/{cid}", response_model=StepColorRuleOut)
def update_color_rule(cid: int, data: StepColorRuleBase, db: Session = Depends(get_db)):
    c = db.query(StepColorRule).filter(StepColorRule.id == cid).first()
    if not c:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/step-color-rules/{cid}")
def delete_color_rule(cid: int, db: Session = Depends(get_db)):
    c = db.query(StepColorRule).filter(StepColorRule.id == cid).first()
    if not c:
        raise HTTPException(404, "Not found")
    db.delete(c)
    db.commit()
    return {"ok": True}
