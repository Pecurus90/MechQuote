from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List, Dict, Any


# --- Auth ---
class UserLogin(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Quote ---
class QuoteBase(BaseModel):
    customer_name: Optional[str] = None
    customer_reference: Optional[str] = None
    date: Optional[date] = None
    validity_days: Optional[int] = 30
    delivery_text: Optional[str] = None
    currency: Optional[str] = "EUR"
    global_margin_percent: Optional[float] = 20.0
    global_discount_percent: Optional[float] = 0.0
    transport_cost: Optional[float] = 0.0
    packaging_cost: Optional[float] = 0.0
    notes_customer: Optional[str] = None
    notes_internal: Optional[str] = None
    status: Optional[str] = "draft"


class QuoteCreate(QuoteBase):
    pass


class QuoteUpdate(QuoteBase):
    pass


class QuoteOut(QuoteBase):
    id: int
    quote_number: str
    created_at: datetime
    updated_at: datetime
    parts: List["PartOut"] = []

    class Config:
        from_attributes = True


# --- Part ---
class PartBase(BaseModel):
    part_code: str
    revision: Optional[str] = "A"
    description: Optional[str] = None
    quantity: Optional[int] = 1
    quote_mode: Optional[str] = "manual"
    material_id: Optional[int] = None
    raw_x_mm: Optional[float] = None
    raw_y_mm: Optional[float] = None
    raw_z_mm: Optional[float] = None
    raw_diameter_mm: Optional[float] = None
    finished_weight_kg: Optional[float] = None
    raw_weight_kg: Optional[float] = None
    material_cost: Optional[float] = 0.0
    margin_percent: Optional[float] = None
    minimum_price: Optional[float] = None
    rounding_rule: Optional[str] = "none"
    confidence_level: Optional[str] = "high"
    customer_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    total_cost: Optional[float] = 0.0
    unit_price: Optional[float] = 0.0
    total_price: Optional[float] = 0.0


class PartCreate(PartBase):
    pass


class PartUpdate(PartBase):
    pass


class PartOut(PartBase):
    id: int
    quote_id: int

    class Config:
        from_attributes = True


# --- ManufacturingPhase ---
class PhaseBase(BaseModel):
    sequence_number: Optional[int] = 10
    phase_type: str
    description: Optional[str] = None
    machine_id: Optional[int] = None
    supplier_id: Optional[int] = None
    setup_hours: Optional[float] = 0.0
    cycle_hours_per_part: Optional[float] = 0.0
    quantity_multiplier: Optional[float] = 1.0
    fixed_cost: Optional[float] = 0.0
    variable_cost_per_part: Optional[float] = 0.0
    hourly_rate_override: Optional[float] = None
    calculated_cost: Optional[float] = 0.0
    margin_percent_override: Optional[float] = None
    customer_visible: Optional[bool] = True
    internal_notes: Optional[str] = None
    customer_notes: Optional[str] = None


class PhaseCreate(PhaseBase):
    pass


class PhaseUpdate(PhaseBase):
    pass


class PhaseOut(PhaseBase):
    id: int
    part_id: int

    class Config:
        from_attributes = True


# --- Material ---
class MaterialBase(BaseModel):
    name: str
    family: Optional[str] = None
    density_kg_dm3: Optional[float] = 0.0
    cost_per_kg: Optional[float] = 0.0
    edm_coefficient: Optional[float] = 1.0
    cnc_machinability_coefficient: Optional[float] = 1.0
    default_scrap_percent: Optional[float] = 10.0
    active: Optional[bool] = True
    notes: Optional[str] = None


class MaterialCreate(MaterialBase):
    pass


class MaterialUpdate(MaterialBase):
    pass


class MaterialOut(MaterialBase):
    id: int

    class Config:
        from_attributes = True


# --- Machine ---
class MachineBase(BaseModel):
    name: str
    machine_type: Optional[str] = None
    hourly_rate: Optional[float] = 0.0
    setup_minimum_hours: Optional[float] = 0.0
    active: Optional[bool] = True
    notes: Optional[str] = None


class MachineCreate(MachineBase):
    pass


class MachineUpdate(MachineBase):
    pass


class MachineOut(MachineBase):
    id: int

    class Config:
        from_attributes = True


# --- Treatment ---
class TreatmentBase(BaseModel):
    name: str
    treatment_type: Optional[str] = None
    fixed_cost: Optional[float] = 0.0
    cost_per_kg: Optional[float] = 0.0
    cost_per_part: Optional[float] = 0.0
    cost_per_surface_area: Optional[float] = 0.0
    minimum_cost: Optional[float] = 0.0
    supplier_id: Optional[int] = None
    active: Optional[bool] = True
    notes: Optional[str] = None


class TreatmentCreate(TreatmentBase):
    pass


class TreatmentOut(TreatmentBase):
    id: int

    class Config:
        from_attributes = True


# --- Supplier ---
class SupplierBase(BaseModel):
    name: str
    supplier_type: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = True


class SupplierCreate(SupplierBase):
    pass


class SupplierOut(SupplierBase):
    id: int

    class Config:
        from_attributes = True


# --- CostRule ---
class CostRuleBase(BaseModel):
    key: str
    value: Optional[str] = None
    description: Optional[str] = None


class CostRuleCreate(CostRuleBase):
    pass


class CostRuleOut(CostRuleBase):
    id: int

    class Config:
        from_attributes = True


# --- PhaseTemplate ---
class PhaseTemplateBase(BaseModel):
    name: str
    phase_type: str
    default_machine_id: Optional[int] = None
    default_supplier_id: Optional[int] = None
    setup_hours: Optional[float] = 0.0
    cycle_hours_per_part: Optional[float] = 0.0
    fixed_cost: Optional[float] = 0.0
    variable_cost_per_part: Optional[float] = 0.0
    customer_visible: Optional[bool] = True
    notes: Optional[str] = None


class PhaseTemplateCreate(PhaseTemplateBase):
    pass


class PhaseTemplateOut(PhaseTemplateBase):
    id: int

    class Config:
        from_attributes = True


# --- StepColorRule ---
class StepColorRuleBase(BaseModel):
    color_hex: str
    color_name: Optional[str] = None
    meaning: Optional[str] = None
    suggested_phase_type: Optional[str] = None
    complexity_coefficient: Optional[float] = 1.0
    notes: Optional[str] = None
    active: Optional[bool] = True


class StepColorRuleCreate(StepColorRuleBase):
    pass


class StepColorRuleOut(StepColorRuleBase):
    id: int

    class Config:
        from_attributes = True


# --- Dashboard ---
class DashboardKPI(BaseModel):
    total_quotes: int
    total_quotes_this_month: int
    total_quoted_value: float
    quoted_value_this_month: float
    quoted_value_prev_month: float
    percentage_diff: float
    avg_quote_value: float
    total_part_codes: int
    cnc_quoted_value: float
    edm_quoted_value: float


class MonthlyData(BaseModel):
    month: str
    value: float
    year: int
