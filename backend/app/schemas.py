import re
from pydantic import BaseModel, field_validator
from datetime import date, datetime
from typing import Optional, List


# --- QuoteCategory ---
class QuoteCategoryBase(BaseModel):
    code: str
    name: str
    active: Optional[bool] = True
    sort_order: Optional[int] = 0


class QuoteCategoryCreate(QuoteCategoryBase):
    pass


class QuoteCategoryUpdate(QuoteCategoryBase):
    pass


class QuoteCategoryOut(QuoteCategoryBase):
    id: int

    class Config:
        from_attributes = True


# --- Customer ---
class CustomerBase(BaseModel):
    name: str
    vat_number: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = True

    @field_validator('phone', mode='before')
    @classmethod
    def normalize_phone(cls, v):
        if not v:
            return v
        s = str(v).strip()
        if not re.search(r'\d', s):
            return None
        s = re.sub(r'^\+\s*39\s*', '', s)
        s = s.replace('(', '').replace(')', '')
        s = re.sub(r'\s*int\.?\s*\d+.*$', '', s, flags=re.IGNORECASE)
        s = s.replace('-', ' ').replace('/', ' ').replace('.', ' ')
        s = re.sub(r'\s+', ' ', s).strip()
        return s or None


class CustomerCreate(CustomerBase):
    customer_number: int


class CustomerUpdate(CustomerBase):
    customer_number: Optional[int] = None


class CustomerOut(CustomerBase):
    id: int
    customer_number: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Auth ---
class UserLogin(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = 'admin'


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None  # se presente viene ri-hashato


class UserOut(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Role / Permissions ---
class RoleCreate(BaseModel):
    name: str    # slug, no spaces
    label: str
    color: str = 'gray'


class RoleUpdate(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None


class RoleOut(BaseModel):
    id: int
    name: str
    label: str
    color: str
    permissions: List[str] = []

    class Config:
        from_attributes = True


# --- ManufacturingPhase (defined before PartOut) ---
class PhaseBase(BaseModel):
    sequence_number: Optional[int] = 10
    phase_type: str
    description: Optional[str] = None
    machine_id: Optional[int] = None
    supplier_id: Optional[int] = None
    setup_hours: Optional[float] = 0.0
    cycle_hours_per_part: Optional[float] = 0.0
    fixed_cost: Optional[float] = 0.0
    variable_cost_per_part: Optional[float] = 0.0
    hourly_rate_override: Optional[float] = None
    calculated_cost: Optional[float] = 0.0
    customer_visible: Optional[bool] = True
    is_shared: Optional[bool] = False
    treatment_id: Optional[int] = None
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


# --- MaterialSupplier ---
class MaterialSupplierBase(BaseModel):
    name: str
    address: Optional[str] = None
    shipping_cost: Optional[float] = 0.0
    cutting_cost_per_part: Optional[float] = 0.0
    active: Optional[bool] = True


class MaterialSupplierCreate(MaterialSupplierBase):
    pass


class MaterialSupplierUpdate(MaterialSupplierBase):
    pass


class MaterialSupplierOut(MaterialSupplierBase):
    id: int

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
    supplier_id: Optional[int] = None


class MaterialCreate(MaterialBase):
    pass


class MaterialUpdate(MaterialBase):
    pass


class MaterialOut(MaterialBase):
    id: int
    material_supplier: Optional[MaterialSupplierOut] = None

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
    material_delivery_cost: Optional[float] = 0.0
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


class PartFileOut(BaseModel):
    id: int
    file_type: str
    filename: str
    path: str

    class Config:
        from_attributes = True


class PartOut(PartBase):
    id: int
    quote_id: int
    phases: List[PhaseOut] = []
    files: List[PartFileOut] = []
    material: Optional[MaterialOut] = None

    class Config:
        from_attributes = True


# --- Quote ---
class QuoteBase(BaseModel):
    quote_type: Optional[str] = "single"
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_reference: Optional[str] = None
    quote_date: Optional[date] = None
    validity_days: Optional[int] = 30
    delivery_text: Optional[str] = None
    currency: Optional[str] = "EUR"
    global_margin_percent: Optional[float] = 20.0
    global_discount_percent: Optional[float] = 0.0
    transport_cost: Optional[float] = 0.0
    packaging_cost: Optional[float] = 0.0
    notes_customer: Optional[str] = None
    notes_internal: Optional[str] = None
    status: Optional[str] = "bozza"


class QuoteCreate(QuoteBase):
    quote_number: Optional[str] = None
    num_components: Optional[int] = None
    default_quantity: Optional[int] = 1


class QuoteUpdate(QuoteBase):
    pass


class QuoteStatusUpdate(BaseModel):
    status: str  # "bozza" | "inviato"


class UserMinimal(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None

    class Config:
        from_attributes = True


class QuoteOut(QuoteBase):
    id: int
    quote_number: str
    created_by_user_id: Optional[int] = None
    submitted_by_user_id: Optional[int] = None
    submitted_at: Optional[datetime] = None
    completed_by_user_id: Optional[int] = None
    completed_at: Optional[datetime] = None
    submitted_by: Optional[UserMinimal] = None
    completed_by: Optional[UserMinimal] = None
    created_at: datetime
    updated_at: datetime
    parts: List[PartOut] = []
    customer: Optional[CustomerOut] = None

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


# --- Supplier ---
class SupplierBase(BaseModel):
    name: str
    supplier_type: Optional[str] = None
    address: Optional[str] = None
    shipping_cost: Optional[float] = 0.0
    notes: Optional[str] = None
    active: Optional[bool] = True


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(SupplierBase):
    pass


class SupplierOut(SupplierBase):
    id: int

    class Config:
        from_attributes = True


# --- Treatment ---
class TreatmentBase(BaseModel):
    name: str
    treatment_type: Optional[str] = None
    cost_per_kg: Optional[float] = 0.0
    minimum_cost: Optional[float] = 0.0
    minimum_weight_kg: Optional[float] = None
    supplier_id: Optional[int] = None
    active: Optional[bool] = True
    notes: Optional[str] = None


class TreatmentCreate(TreatmentBase):
    pass


class TreatmentUpdate(TreatmentBase):
    pass


class TreatmentOut(TreatmentBase):
    id: int
    supplier: Optional[SupplierOut] = None

    class Config:
        from_attributes = True


# --- CompanySettings (singleton: anagrafica + default operativi) ---
class CompanySettingsBase(BaseModel):
    name: str = ""
    address: str = ""
    vat: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    default_margin_percent: float = 20.0
    default_minimum_part_price: float = 0.0
    default_transport_cost: float = 0.0
    default_packaging_cost: float = 0.0


class CompanySettingsUpdate(CompanySettingsBase):
    pass


class CompanySettingsOut(CompanySettingsBase):
    id: int
    updated_at: datetime

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
    is_shared: Optional[bool] = False
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
    year: int
    value: float     # somma part.total_price (valore preventivato finale)
    margin: float    # somma (price - cost_total)
    material: float  # somma costi materiali (grezzo + delivery + taglio)
    labor: float     # somma calculated_cost delle fasi non-treatment


class WorkflowStats(BaseModel):
    by_status: dict[str, int]
    my_drafts_count: int
    my_pending_count: int
    to_review_count: int


class DashboardQuoteRow(BaseModel):
    id: int
    quote_number: str
    customer_name: Optional[str] = None
    status: str
    quote_date: Optional[date] = None
    total_price: float
    submitted_at: Optional[datetime] = None
    submitted_by: Optional[UserMinimal] = None

    class Config:
        from_attributes = True

