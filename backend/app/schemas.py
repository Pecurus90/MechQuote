import re
from pydantic import BaseModel, field_validator, model_validator, Field
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
    name: str = Field(min_length=1, max_length=200)
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
    # Opzionale: se non passato, l'endpoint POST /customers auto-genera
    # max(customer_number) + 1. Mantiene compat col frontend che lo invia.
    customer_number: Optional[int] = None


class CustomerUpdate(CustomerBase):
    customer_number: Optional[int] = None


class CustomerOut(CustomerBase):
    id: int
    customer_number: int
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerMinimal(BaseModel):
    """Solo i campi essenziali per riferimenti (es. su OfficinaDocument)."""
    id: int
    customer_number: int
    name: str

    class Config:
        from_attributes = True


class SupplierMinimal(BaseModel):
    """Riferimento compatto a un fornitore (materiali o utensili)."""
    id: int
    name: str

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


class RolePermissionsBulk(BaseModel):
    """Set/unset in blocco più chiavi permesso per un ruolo (toggle di gruppo)."""
    keys: List[str]
    value: bool


# --- ManufacturingPhase (defined before PartOut) ---
class PhaseBase(BaseModel):
    sequence_number: Optional[int] = 10
    phase_type: str
    description: Optional[str] = None
    machine_id: Optional[int] = None
    supplier_id: Optional[int] = None
    setup_hours: Optional[float] = Field(default=0.0, ge=0)
    cycle_hours_per_part: Optional[float] = Field(default=0.0, ge=0)
    fixed_cost: Optional[float] = Field(default=0.0, ge=0)
    variable_cost_per_part: Optional[float] = Field(default=0.0, ge=0)
    hourly_rate_override: Optional[float] = Field(default=None, ge=0)
    calculated_cost: Optional[float] = Field(default=0.0, ge=0)
    # is_shared rimosso (cost engine usa sempre divisor=qty, no più cross-parts)
    treatment_id: Optional[int] = None
    operation_id: Optional[int] = None
    internal_notes: Optional[str] = None
    customer_notes: Optional[str] = None
    # Wire EDM extra (popolati solo se phase_type='wire_edm')
    cut_length_mm: Optional[float] = Field(default=None, ge=0)
    cut_height_mm: Optional[float] = Field(default=None, ge=0)
    cutting_cycle_id: Optional[int] = None
    n_pierce: Optional[int] = Field(default=None, ge=0)
    dxf_profile_ids: Optional[list] = None


class PhaseCreate(PhaseBase):
    pass


class PhaseUpdate(BaseModel):
    """Update parziale: tutti i campi opzionali. Permette PUT con un solo
    campo (es. {"setup_hours": 1.5}) senza dover ri-mandare phase_type
    e tutti gli altri obbligatori di PhaseBase.
    """
    sequence_number: Optional[int] = None
    phase_type: Optional[str] = None
    description: Optional[str] = None
    machine_id: Optional[int] = None
    supplier_id: Optional[int] = None
    setup_hours: Optional[float] = Field(default=None, ge=0)
    cycle_hours_per_part: Optional[float] = Field(default=None, ge=0)
    fixed_cost: Optional[float] = Field(default=None, ge=0)
    variable_cost_per_part: Optional[float] = Field(default=None, ge=0)
    hourly_rate_override: Optional[float] = Field(default=None, ge=0)
    calculated_cost: Optional[float] = Field(default=None, ge=0)
    treatment_id: Optional[int] = None
    operation_id: Optional[int] = None
    internal_notes: Optional[str] = None
    customer_notes: Optional[str] = None
    cut_length_mm: Optional[float] = Field(default=None, ge=0)
    cut_height_mm: Optional[float] = Field(default=None, ge=0)
    cutting_cycle_id: Optional[int] = None
    n_pierce: Optional[int] = Field(default=None, ge=0)
    dxf_profile_ids: Optional[list] = None


class PhaseOut(PhaseBase):
    id: int
    part_id: int
    # Voce di catalogo già agganciata, esposta per costruire l'option
    # "ritirato" nelle dropdown del preventivatore quando il GET di lista è
    # filtrato `?active=true`. Lazy-load via from_attributes; il GET
    # /quotes/{id} aggiunge un joinedload mirato per evitare N+1 (vedi
    # `api/quotes.py:_load_quote`).
    machine: Optional["MachineOut"] = None
    operation: Optional["OperationOut"] = None
    treatment: Optional["TreatmentOut"] = None
    supplier: Optional["SupplierOut"] = None

    class Config:
        from_attributes = True


# --- MaterialSupplier ---
class MaterialSupplierBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
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
    name: str = Field(min_length=1, max_length=100)
    family: Optional[str] = None
    density_kg_dm3: Optional[float] = Field(default=0.0, ge=0)
    cost_per_kg: Optional[float] = Field(default=0.0, ge=0)
    edm_coefficient: Optional[float] = Field(default=1.0, ge=0)
    cnc_machinability_coefficient: Optional[float] = Field(default=1.0, ge=0)
    default_scrap_percent: Optional[float] = Field(default=10.0, ge=0)
    active: Optional[bool] = True
    notes: Optional[str] = None
    supplier_id: Optional[int] = None

    @field_validator('family')
    @classmethod
    def _validate_family(cls, v: Optional[str]) -> Optional[str]:
        # Accetta None / stringa vuota (materiale senza famiglia categorizzata).
        if v is None or v == '':
            return None
        from app.core.material_families import MATERIAL_FAMILY_SLUGS
        if v not in MATERIAL_FAMILY_SLUGS:
            raise ValueError(f"Famiglia '{v}' non valida")
        return v


class MaterialCreate(MaterialBase):
    pass


class MaterialUpdate(MaterialBase):
    pass


class MaterialOut(MaterialBase):
    id: int
    material_supplier: Optional[MaterialSupplierOut] = None
    # Letto dalla @property Material.has_datasheet via from_attributes=True.
    # Il path su disco non viene mai esposto al client.
    has_datasheet: bool = False

    class Config:
        from_attributes = True


# --- Part ---
class PartBase(BaseModel):
    part_code: str
    revision: Optional[str] = "A"
    description: Optional[str] = None
    quantity: Optional[int] = Field(default=1, ge=1)  # almeno 1, evita div/0 nel cost engine
    quote_mode: Optional[str] = "manual"
    material_id: Optional[int] = None
    raw_x_mm: Optional[float] = Field(default=None, ge=0)
    raw_y_mm: Optional[float] = Field(default=None, ge=0)
    raw_z_mm: Optional[float] = Field(default=None, ge=0)
    raw_diameter_mm: Optional[float] = Field(default=None, ge=0)
    finished_weight_kg: Optional[float] = Field(default=None, ge=0)
    raw_weight_kg: Optional[float] = Field(default=None, ge=0)
    material_cost: Optional[float] = Field(default=0.0, ge=0)
    material_delivery_cost: Optional[float] = Field(default=0.0, ge=0)
    customer_supplied_material: Optional[bool] = False
    material_from_stock: Optional[bool] = False
    margin_percent: Optional[float] = Field(default=None, ge=-99, le=1000)
    minimum_price: Optional[float] = Field(default=None, ge=0)
    customer_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    # Modulo Stampi: ruolo piastra (cappello | porta_punzoni | premilamiera |
    # matrice | base | custom). NULL per Part di preventivi standard.
    plate_role: Optional[str] = Field(default=None, max_length=50)
    total_cost: Optional[float] = Field(default=0.0, ge=0)
    unit_price: Optional[float] = Field(default=0.0, ge=0)
    total_price: Optional[float] = Field(default=0.0, ge=0)


class PartCreate(PartBase):
    pass


class PartUpdate(PartBase):
    # Tutti i campi opzionali per le PUT parziali (il pattern Update accetta
    # qualunque sottoinsieme di campi). PartBase rende `part_code` required
    # perché lo è in PartCreate; qui lo facciamo opzionale.
    part_code: Optional[str] = None


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
    global_margin_percent: Optional[float] = Field(default=20.0, ge=-99, le=1000)
    global_discount_percent: Optional[float] = Field(default=0.0, ge=0, le=100)
    transport_cost: Optional[float] = 0.0
    packaging_cost: Optional[float] = 0.0
    notes_customer: Optional[str] = None
    notes_internal: Optional[str] = None
    status: Optional[str] = "bozza"
    # Sprint G — tracking storico (compilabili solo da PUT su status=completato).
    sold_price: Optional[float] = Field(default=None, ge=0)
    actual_cost: Optional[float] = Field(default=None, ge=0)


class QuoteCreate(QuoteBase):
    quote_number: str = Field(min_length=1, max_length=50)  # unique sul modello
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
    read_by_user_id: Optional[int] = None
    read_at: Optional[datetime] = None
    confirmed_by_user_id: Optional[int] = None
    confirmed_at: Optional[datetime] = None
    completed_by_user_id: Optional[int] = None
    completed_at: Optional[datetime] = None
    submitted_by: Optional[UserMinimal] = None
    read_by: Optional[UserMinimal] = None
    confirmed_by: Optional[UserMinimal] = None
    completed_by: Optional[UserMinimal] = None
    material_ordered_at: Optional[datetime] = None
    material_ordered_by_user_id: Optional[int] = None
    material_ordered_by: Optional[UserMinimal] = None
    created_at: datetime
    updated_at: datetime
    parts: List[PartOut] = []
    customer: Optional[CustomerOut] = None
    # Modulo Stampi: popolato solo per quote_type='die'.
    # Type annotation come stringa per evitare forward-ref (DieSpecOut definita
    # in fondo al file).
    die_spec: Optional['DieSpecOut'] = None
    die_normalized_items: List['DieNormalizedItemOut'] = []

    class Config:
        from_attributes = True


class ArchiveQuoteOut(QuoteOut):
    """QuoteOut + stato materiale derivato (spec 18), solo per la lista
    archivio. `None` per gli stampi (fuori scope) o quando non calcolato."""
    material_status: Optional[str] = None


class ArticleMaterialRow(BaseModel):
    """Riga articolo nella vista espandibile dell'archivio (spec 18, sola vista)."""
    part_id: int
    part_code: str
    revision: Optional[str] = None
    material_name: Optional[str] = None
    family: Optional[str] = None          # etichettato "Tipo" in UI
    dimensions: str = "—"
    treatments: List[str] = []            # nomi trattamenti termici (fasi treatment)
    supplier_name: Optional[str] = None
    state: str                            # ordinato / da_ordinare / da_magazzino / conto_lavoro / senza_fornitore / nessun_materiale


class QuoteMaterialDetailOut(BaseModel):
    quote_id: int
    material_status: str
    articles: List[ArticleMaterialRow] = []


# --- Machine ---
class MachineBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    machine_type: Optional[str] = None
    hourly_rate: Optional[float] = Field(default=0.0, ge=0)
    setup_hourly_rate: Optional[float] = Field(default=None, ge=0)
    setup_minimum_hours: Optional[float] = Field(default=0.0, ge=0)
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
    name: str = Field(min_length=1, max_length=100)
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
    name: str = Field(min_length=1, max_length=100)
    treatment_type: Optional[str] = None
    cost_per_kg: Optional[float] = Field(default=0.0, ge=0)
    # Modulo Stampi: trattamenti come nitrurazione vengono fatturati a volume
    # (€/dm³) invece che a peso. cost_unit='kg'|'dm3' switcha la formula nel
    # cost engine; cost_per_dm3 popolato solo quando cost_unit='dm3'.
    cost_unit: Optional[str] = Field(default='kg', pattern=r'^(kg|dm3)$')
    cost_per_dm3: Optional[float] = Field(default=0.0, ge=0)
    minimum_cost: Optional[float] = Field(default=0.0, ge=0)
    minimum_weight_kg: Optional[float] = Field(default=None, ge=0)
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
    default_margin_percent: float = Field(default=20.0, ge=0)
    default_minimum_part_price: float = Field(default=0.0, ge=0)
    default_transport_cost: float = Field(default=0.0, ge=0)
    default_packaging_cost: float = Field(default=0.0, ge=0)
    stock_shipping_cost: float = Field(default=0.0, ge=0)
    stock_cutting_cost_per_part: float = Field(default=0.0, ge=0)


class CompanySettingsUpdate(CompanySettingsBase):
    pass


class CompanySettingsOut(CompanySettingsBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Operation (catalogo Lavorazioni utente) ---
class OperationBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    active: bool = True


class OperationCreate(OperationBase):
    pass


class OperationUpdate(OperationBase):
    pass


class OperationOut(OperationBase):
    id: int

    class Config:
        from_attributes = True


# --- WorkflowTemplate (sequenza di Macchina + Lavorazione) ---
class WorkflowTemplateStepBase(BaseModel):
    sequence_number: int
    machine_id: Optional[int] = None
    operation_id: int


class WorkflowTemplateStepOut(WorkflowTemplateStepBase):
    id: int
    machine: Optional[MachineOut] = None
    operation: Optional[OperationOut] = None

    class Config:
        from_attributes = True


class WorkflowTemplateBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    active: bool = True


class WorkflowTemplateCreate(WorkflowTemplateBase):
    steps: List[WorkflowTemplateStepBase] = []


class WorkflowTemplateUpdate(WorkflowTemplateBase):
    steps: List[WorkflowTemplateStepBase] = []


class WorkflowTemplateOut(WorkflowTemplateBase):
    id: int
    steps: List[WorkflowTemplateStepOut] = []

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
    # Modulo Stampi: valore preventivato dei quote_type='die' (industriale ×
    # margine × sconto), escluso dal split CNC/EDM.
    dies_quoted_value: float = 0.0
    # Margine medio % sui preventivi standard (non die):
    # (Σ unit_price × qty - Σ total_cost × qty) / Σ total_cost × qty * 100.
    avg_margin_percent: float = 0.0


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


# ─── Statistics page (StatisticsOut) ──────────────────────────────────────
# 4 dataset aggregati per la pagina /statistics. Tutti calcolati lato BE
# con SQL aggregato (no row idratate in Python).

class StatsTrendPoint(BaseModel):
    month: str        # YYYY-MM
    standard: float   # € preventivati per quote_type single+commessa
    dies: float       # € preventivati per quote_type='die'


class StatsCustomerRow(BaseModel):
    customer_id: Optional[int] = None
    customer_name: str
    total: float


class StatsCategoryRow(BaseModel):
    category_code: str
    count: int
    total: float


class StatsMarginPoint(BaseModel):
    month: str
    margin_percent: float


class StatsHoursRow(BaseModel):
    """Ore aggregate per una dimensione (macchina o lavorazione)."""
    label: str
    hours: float


class StatisticsOut(BaseModel):
    period: str                              # 'year' | '12m' | 'prev_year' | 'all'
    standard_count: int = 0                  # n° preventivi standard nel periodo
    dies_count: int = 0                      # n° preventivi stampo nel periodo
    trend_monthly: List[StatsTrendPoint]
    top_customers: List[StatsCustomerRow]
    by_category: List[StatsCategoryRow]
    margin_monthly: List[StatsMarginPoint]
    hours_by_machine: List[StatsHoursRow] = []
    hours_by_operation: List[StatsHoursRow] = []


# ─── Statistics: tab Materiali ────────────────────────────────────────────

class StatsCountPoint(BaseModel):
    """Conteggio per mese, riusato da più tab (ordini materiali, utensili)."""
    month: str
    count: int


class StatsSupplierRow(BaseModel):
    supplier_name: str
    count: int


class StatsLeadTimePoint(BaseModel):
    month: str
    avg_days: float


class StatsMaterialSupplierRow(BaseModel):
    """Aggregato costi/kg/spedizione per fornitore grezzo (tab Materiali)."""
    supplier_name: str
    material_cost: float
    weight_kg: float
    shipping_cost: float
    orders_count: int


class StatsMaterialRow(BaseModel):
    """Aggregato costi/kg per materiale (tab Materiali)."""
    material_name: str
    material_cost: float
    weight_kg: float
    lines: int                                      # quante righe (parti) ordinate


class MaterialsStatsOut(BaseModel):
    period: str
    total_material_cost: float = 0.0                # € grezzo ordinato nel periodo
    total_weight_kg: float = 0.0
    total_shipping: float = 0.0                     # € spedizioni (una per ordine/fornitore)
    orders_count: int = 0
    trend_monthly: List[StatsCountPoint]            # n. ordini emessi per mese
    top_suppliers: List[StatsSupplierRow]           # top 10 fornitori materiale
    lead_time_avg_days: float                       # media periodo
    lead_time_monthly: List[StatsLeadTimePoint]     # trend per mese
    by_supplier: List[StatsMaterialSupplierRow] = []
    by_material: List[StatsMaterialRow] = []


# ─── Statistics: tab Utensili ─────────────────────────────────────────────

class StatsToolRow(BaseModel):
    code: str
    total_quantity: int


class StatsToolTypeRow(BaseModel):
    """Quantità ordinata per tipo utensile (tab Utensili, solo quantità)."""
    label: str
    quantity: int


class ToolsStatsOut(BaseModel):
    period: str
    orders_count: int = 0                           # n° ordini utensili nel periodo
    total_quantity: int = 0                         # Σ quantità ordinata
    distinct_tools: int = 0                         # utensili distinti ordinati
    trend_monthly: List[StatsCountPoint]            # n. ordini emessi per mese
    top_suppliers: List[StatsSupplierRow]           # top 10 fornitori utensili
    top_tools: List[StatsToolRow]                   # top 10 utensili più ordinati
    by_type: List[StatsToolTypeRow] = []            # quantità per tipo utensile


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


# ─── Wire EDM ─────────────────────────────────────────────────────────────────

class EdmConfigBase(BaseModel):
    rough_speed_factor: float = Field(default=1.0, ge=0)
    semi_speed_factor: float = Field(default=0.9, ge=0)
    finish_speed_factor: float = Field(default=0.7, ge=0)
    default_pierce_time_s: float = Field(default=2.0, ge=0)
    default_drilling_machine_id: Optional[int] = None


class EdmConfigUpdate(EdmConfigBase):
    pass


class EdmConfigOut(EdmConfigBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True


class EdmCutSpeedBase(BaseModel):
    material_family: str
    thickness_min_mm: float = Field(default=0.0, ge=0)
    thickness_max_mm: float = Field(ge=0)
    speed_mm_per_min: float = Field(ge=0)  # avanzamento lineare del filo
    pierce_time_s: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None

    @field_validator('material_family')
    @classmethod
    def _validate_family(cls, v: str) -> str:
        from app.core.material_families import MATERIAL_FAMILY_SLUGS
        if v not in MATERIAL_FAMILY_SLUGS:
            raise ValueError(f"Famiglia '{v}' non valida")
        return v


class EdmCutSpeedCreate(EdmCutSpeedBase):
    pass


class EdmCutSpeedUpdate(EdmCutSpeedBase):
    pass


class EdmCutSpeedOut(EdmCutSpeedBase):
    id: int

    class Config:
        from_attributes = True


class CuttingPassBase(BaseModel):
    sequence_number: int
    pass_type: str  # 'rough' | 'semi' | 'finish'


class CuttingPassOut(CuttingPassBase):
    id: int

    class Config:
        from_attributes = True


class CuttingCycleBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    active: bool = True


class CuttingCycleCreate(CuttingCycleBase):
    passes: List[CuttingPassBase] = []


class CuttingCycleUpdate(CuttingCycleBase):
    passes: List[CuttingPassBase] = []


class CuttingCycleOut(CuttingCycleBase):
    id: int
    passes: List[CuttingPassOut] = []

    class Config:
        from_attributes = True


class DrillingTimeBase(BaseModel):
    material_family: str
    electrode_diameter_mm: float = Field(ge=0)
    speed_mm_per_sec: float = Field(ge=0)
    notes: Optional[str] = None

    @field_validator('material_family')
    @classmethod
    def _validate_family(cls, v: str) -> str:
        from app.core.material_families import MATERIAL_FAMILY_SLUGS
        if v not in MATERIAL_FAMILY_SLUGS:
            raise ValueError(f"Famiglia '{v}' non valida")
        return v


class DrillingTimeCreate(DrillingTimeBase):
    pass


class DrillingTimeUpdate(DrillingTimeBase):
    pass


class DrillingTimeOut(DrillingTimeBase):
    id: int

    class Config:
        from_attributes = True


# --- DXF analysis (in-memory, no persistenza) ---

class DxfBboxOut(BaseModel):
    x: float
    y: float
    w: float
    h: float


class DxfProfileOut(BaseModel):
    id: int
    closed: bool
    length_mm: float
    bbox: DxfBboxOut
    svg_path: str
    point_count: int


class DxfAnalysisOut(BaseModel):
    profiles: List[DxfProfileOut]
    bbox_global: DxfBboxOut
    total_length_mm: float
    n_closed_profiles: int
    suggested_pierce: int
    units: str
    warnings: List[str]


# ─── Ordini materiali ──────────────────────────────────────────────────────

class MaterialOrderCreate(BaseModel):
    quote_ids: List[int] = Field(min_length=1)
    # Spec 18: creare l'ordine è per-fornitore. Opzionale nello schema perché
    # /aggregate (preview) usa lo stesso modello e non lo richiede; l'endpoint
    # di creazione lo esige.
    material_supplier_id: Optional[int] = None


class MaterialOrderOut(BaseModel):
    """Sintesi ordine materiali per storico/list view."""
    id: int
    created_at: datetime
    created_by: Optional[UserMinimal] = None
    supplier_name: Optional[str] = None
    quote_count: int
    quote_numbers: List[str] = []

    class Config:
        from_attributes = True


class MaterialItemAggregated(BaseModel):
    """Singolo materiale aggregato (stessa specifica grezzo)."""
    material_id: Optional[int] = None
    material_name: str
    family: Optional[str] = None
    dim_str: str                          # "Prismatico 80×120×30 mm" o "Tondo Ø80×100 mm" o "—"
    total_qty: int                        # somma quantità delle parti
    total_weight_kg: float                # somma peso grezzo stimato
    quote_refs: List[str] = []            # es. ["240-26A_003 ×4", "240-26B_010 ×1"]
    from_stock: bool = False              # True se parti marcate "a magazzino" (badge UI/PDF)


class MaterialAggregateBySupplier(BaseModel):
    supplier_id: Optional[int] = None     # None = materiale senza fornitore configurato
    supplier_name: str                    # "Senza fornitore" se supplier_id None
    items: List[MaterialItemAggregated] = []


class MaterialAggregateOut(BaseModel):
    groups: List[MaterialAggregateBySupplier] = []


# ─── Utensili ──────────────────────────────────────────────────────────────

class ToolSupplierBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


class ToolSupplierCreate(ToolSupplierBase):
    pass


class ToolSupplierUpdate(ToolSupplierBase):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)


class ToolSupplierOut(ToolSupplierBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- NormalizedSupplier (componenti normalizzati: viti, bulloni, cuscinetti...) ---

class NormalizedSupplierBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    # Modulo Stampi (L2 cost engine): spedizione aggregata per fornitore
    # quando il preventivo include normalizzati di quel fornitore.
    shipping_cost: float = Field(default=0.0, ge=0)
    active: bool = True


class NormalizedSupplierCreate(NormalizedSupplierBase):
    pass


class NormalizedSupplierUpdate(NormalizedSupplierBase):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)


class NormalizedSupplierOut(NormalizedSupplierBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- NormalizedItem (catalogo voci normalizzate: viti, cuscinetti, molle...) ---

class NormalizedItemBase(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=1, max_length=200)
    category: Optional[str] = Field(default=None, max_length=50)
    supplier_id: Optional[int] = None
    unit_price: float = Field(default=0.0, ge=0)
    notes: Optional[str] = None
    active: bool = True


class NormalizedItemCreate(NormalizedItemBase):
    pass


class NormalizedItemUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    description: Optional[str] = Field(default=None, min_length=1, max_length=200)
    category: Optional[str] = Field(default=None, max_length=50)
    supplier_id: Optional[int] = None
    unit_price: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None
    active: Optional[bool] = None


class NormalizedItemOut(NormalizedItemBase):
    id: int
    supplier: Optional[NormalizedSupplierOut] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ToolBase(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    tool_type: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    diameter_mm: Optional[float] = Field(default=None, ge=0)
    toroidal_mm: Optional[float] = Field(default=None, ge=0)
    quantity: int = Field(default=0, ge=0)
    minimum_quantity: int = Field(default=0, ge=0)
    location: Optional[str] = None
    tool_supplier_id: Optional[int] = None
    notes: Optional[str] = None
    active: bool = True


class ToolCreate(ToolBase):
    pass


class ToolUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    tool_type: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    diameter_mm: Optional[float] = Field(default=None, ge=0)
    toroidal_mm: Optional[float] = Field(default=None, ge=0)
    quantity: Optional[int] = Field(default=None, ge=0)
    minimum_quantity: Optional[int] = Field(default=None, ge=0)
    location: Optional[str] = None
    tool_supplier_id: Optional[int] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


# Attributi utensile (Tipo / Marchio / Posizione) — catalog semplice
class ToolAttributeBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    active: bool = True


class ToolAttributeCreate(ToolAttributeBase):
    pass


class ToolAttributeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    active: Optional[bool] = None


class ToolAttributeOut(ToolAttributeBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ToolOut(ToolBase):
    id: int
    tool_supplier: Optional[ToolSupplierOut] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ToolScanRequest(BaseModel):
    code: str = Field(min_length=1)
    mode: str = Field(pattern=r'^(load|unload)$')   # 'load' = +1, 'unload' = -1
    quantity: int = Field(default=1, ge=1)


class ToolOrderItemOut(BaseModel):
    id: int
    tool_id: Optional[int] = None
    code_snapshot: str
    tool_type_snapshot: Optional[str] = None
    brand_snapshot: Optional[str] = None
    model_snapshot: Optional[str] = None
    diameter_snapshot: Optional[float] = None
    supplier_name_snapshot: Optional[str] = None
    quantity_at_time: int
    minimum_at_time: int
    quantity_to_order: int

    class Config:
        from_attributes = True


class ToolOrderCreate(BaseModel):
    supplier_id: int  # fornitore per cui generare l'ordine (un ordine = un fornitore)


class ToolOrderOut(BaseModel):
    id: int
    created_at: datetime
    created_by: Optional[UserMinimal] = None
    triggered_by: str
    supplier_name: Optional[str] = None
    item_count: int
    total_quantity: int

    class Config:
        from_attributes = True


class ToolOrderDetailOut(ToolOrderOut):
    items: List[ToolOrderItemOut] = []


# ─── Officina ──────────────────────────────────────────────────────────────

class OfficinaDocumentOut(BaseModel):
    id: int
    title: str
    category: Optional[str] = None
    filename: str
    size_bytes: int
    uploaded_at: datetime
    uploaded_by: Optional[UserMinimal] = None
    customer: Optional[CustomerMinimal] = None
    material_supplier: Optional[SupplierMinimal] = None
    tool_supplier: Optional[SupplierMinimal] = None
    normalized_supplier: Optional[SupplierMinimal] = None

    class Config:
        from_attributes = True


class OfficinaCategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    icon: str = Field(default='Folder', max_length=40)
    sort_order: int = 100


class OfficinaCategoryCreate(OfficinaCategoryBase):
    pass


class OfficinaCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    icon: Optional[str] = Field(default=None, max_length=40)
    sort_order: Optional[int] = None


class OfficinaCategoryOut(OfficinaCategoryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Risultati tempra (Officina) ────────────────────────────────────────────

class HeatTreatmentResultBase(BaseModel):
    material: str = Field(min_length=1, max_length=100)
    shape: str = Field(default='tondo', pattern=r'^(tondo|quadrato)$')
    temp_insertion_c: Optional[float] = None
    temp_quench_c: Optional[float] = None
    temp_temper_c: Optional[float] = None
    temper_time_min: Optional[float] = None
    outer_dia_pre_mm: Optional[float] = None
    outer_dia_post_mm: Optional[float] = None
    inner_dia_pre_mm: Optional[float] = None
    inner_dia_post_mm: Optional[float] = None
    width_pre_mm: Optional[float] = None
    width_post_mm: Optional[float] = None
    height_pre_mm: Optional[float] = None
    height_post_mm: Optional[float] = None
    length_pre_mm: Optional[float] = None
    length_post_mm: Optional[float] = None
    hardness: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None


class HeatTreatmentResultCreate(HeatTreatmentResultBase):
    pass


class HeatTreatmentResultUpdate(BaseModel):
    material: Optional[str] = Field(default=None, min_length=1, max_length=100)
    shape: Optional[str] = Field(default=None, pattern=r'^(tondo|quadrato)$')
    temp_insertion_c: Optional[float] = None
    temp_quench_c: Optional[float] = None
    temp_temper_c: Optional[float] = None
    temper_time_min: Optional[float] = None
    outer_dia_pre_mm: Optional[float] = None
    outer_dia_post_mm: Optional[float] = None
    inner_dia_pre_mm: Optional[float] = None
    inner_dia_post_mm: Optional[float] = None
    width_pre_mm: Optional[float] = None
    width_post_mm: Optional[float] = None
    height_pre_mm: Optional[float] = None
    height_post_mm: Optional[float] = None
    length_pre_mm: Optional[float] = None
    length_post_mm: Optional[float] = None
    hardness: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None


class HeatTreatmentResultOut(HeatTreatmentResultBase):
    id: int
    created_at: datetime
    created_by: Optional[UserMinimal] = None

    class Config:
        from_attributes = True


# ─── Modulo Stampi ──────────────────────────────────────────────────────────

class DieSpecBase(BaseModel):
    die_subtype: str = Field(default='passo', pattern=r'^(passo|blocco)$')
    bbox_x_mm: Optional[float] = Field(default=0.0, ge=0)
    bbox_y_mm: Optional[float] = Field(default=0.0, ge=0)
    sheet_thickness_mm: Optional[float] = Field(default=0.0, ge=0)
    perimeter_pezzo_mm: Optional[float] = Field(default=None, ge=0)
    complexity_factor: Optional[float] = Field(default=1.2, ge=0.5, le=3.0)
    n_stations: Optional[int] = Field(default=None, ge=1)
    pitch_mm: Optional[float] = Field(default=None, ge=0)
    strip_offset_y_mm: Optional[float] = Field(default=0.0, ge=0)
    n_operations: Optional[int] = Field(default=None, ge=1)
    block_strip_offset_mm: Optional[float] = Field(default=0.0, ge=0)
    castle_offset_x_mm: Optional[float] = Field(default=None, ge=0)
    castle_offset_y_mm: Optional[float] = Field(default=None, ge=0)
    difficulty: str = Field(default='base', pattern=r'^(base|medium|hard)$')
    n_bends_simple: int = Field(default=0, ge=0)
    n_bends_medium: int = Field(default=0, ge=0)
    n_bends_complex: int = Field(default=0, ge=0)
    n_punches_simple: int = Field(default=0, ge=0)
    n_punches_medium: int = Field(default=0, ge=0)
    n_punches_complex: int = Field(default=0, ge=0)
    delivery_days: Optional[int] = Field(default=None, ge=0)
    technical_notes: Optional[str] = None
    extras_amount: float = Field(default=0.0, ge=0)
    extras_description: Optional[str] = Field(default=None, max_length=200)
    # Override "matita" — NULL = usa calcolato dal cost engine.
    override_material: Optional[float] = Field(default=None, ge=0)
    override_normalized: Optional[float] = Field(default=None, ge=0)
    override_machining: Optional[float] = Field(default=None, ge=0)
    override_accessories: Optional[float] = Field(default=None, ge=0)


class DieSpecCreate(DieSpecBase):
    """Sprint E — vincoli condizionali per tipologia:
      - die_subtype='passo'  → n_stations ≥ 1 e pitch_mm > 0 obbligatori.
      - die_subtype='blocco' → n_operations ≥ 1 obbligatorio.
      - bbox_x_mm > 0 e bbox_y_mm > 0 sempre obbligatori (la geometria è
        il driver primario del cost engine).
    """
    @model_validator(mode='after')
    def _validate_subtype_constraints(self) -> 'DieSpecCreate':
        if (self.bbox_x_mm or 0) <= 0 or (self.bbox_y_mm or 0) <= 0:
            raise ValueError("Dimensioni pezzo (bbox_x_mm, bbox_y_mm) obbligatorie")
        if self.die_subtype == 'passo':
            if not self.n_stations or self.n_stations < 1:
                raise ValueError("Per stampi a passo, n_stations è obbligatorio (≥ 1)")
            if not self.pitch_mm or self.pitch_mm <= 0:
                raise ValueError("Per stampi a passo, pitch_mm è obbligatorio (> 0)")
        elif self.die_subtype == 'blocco':
            if not self.n_operations or self.n_operations < 1:
                raise ValueError("Per stampi a blocco, n_operations è obbligatorio (≥ 1)")
        return self


class DieSpecUpdate(DieSpecBase):
    # Tutti i campi opzionali per PUT parziali.
    die_subtype: Optional[str] = Field(default=None, pattern=r'^(passo|blocco)$')
    difficulty: Optional[str] = Field(default=None, pattern=r'^(base|medium|hard)$')


class DieSpecOut(DieSpecBase):
    quote_id: int
    cost_material: float
    cost_normalized: float
    cost_machining: float
    cost_machining_edm: float = 0.0
    cost_machining_mech: float = 0.0
    cost_accessories: float
    cost_industrial: float

    class Config:
        from_attributes = True


class DieNormalizedItemBase(BaseModel):
    normalized_supplier_id: Optional[int] = None
    description: str = Field(min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=1)
    unit_price: float = Field(default=0.0, ge=0)
    notes: Optional[str] = None
    # D1: provenienza dal catalogo NormalizedItem (snapshot). NULL = testo libero.
    normalized_item_id: Optional[int] = Field(default=None, ge=1)


class DieNormalizedItemCreate(DieNormalizedItemBase):
    pass


class DieNormalizedItemUpdate(DieNormalizedItemBase):
    description: Optional[str] = Field(default=None, min_length=1, max_length=200)
    quantity: Optional[int] = Field(default=None, ge=1)


class DieNormalizedItemOut(DieNormalizedItemBase):
    id: int
    quote_id: int
    supplier: Optional[NormalizedSupplierOut] = None

    class Config:
        from_attributes = True


class DieSettingsBase(BaseModel):
    hourly_rate_milling: float = Field(default=45.0, ge=0)
    hourly_rate_grinding: float = Field(default=50.0, ge=0)
    hourly_rate_edm_wire: float = Field(default=60.0, ge=0)
    hourly_rate_edm_die: float = Field(default=55.0, ge=0)
    cost_bend_simple: float = Field(default=80.0, ge=0)
    cost_bend_medium: float = Field(default=160.0, ge=0)
    cost_bend_complex: float = Field(default=320.0, ge=0)
    cost_punch_simple: float = Field(default=120.0, ge=0)
    cost_punch_medium: float = Field(default=240.0, ge=0)
    cost_punch_complex: float = Field(default=480.0, ge=0)
    cost_per_plate_base: float = Field(default=150.0, ge=0)
    diff_mult_base: float = Field(default=1.0, ge=0)
    diff_mult_medium: float = Field(default=1.3, ge=0)
    diff_mult_hard: float = Field(default=1.7, ge=0)
    design_hours_base: float = Field(default=8.0, ge=0)
    design_hours_medium: float = Field(default=16.0, ge=0)
    design_hours_hard: float = Field(default=32.0, ge=0)
    design_hourly_rate: float = Field(default=50.0, ge=0)
    assembly_forfeit_base: float = Field(default=300.0, ge=0)
    assembly_forfeit_medium: float = Field(default=600.0, ge=0)
    assembly_forfeit_hard: float = Field(default=1200.0, ge=0)
    default_margin_percent: float = Field(default=30.0, ge=0)
    default_castle_offset_x_mm: float = Field(default=80.0, ge=0)
    default_castle_offset_y_mm: float = Field(default=80.0, ge=0)
    # Sprint A — driver EDM filo
    wire_edm_cycle_id: Optional[int] = Field(default=None, ge=1)
    edm_extractor_factor: float = Field(default=0.6, ge=0, le=2.0)
    edm_punch_factor: float = Field(default=0.3, ge=0, le=2.0)
    # Sprint B — produttività macchine officina (h/dm² per operazione)
    milling_h_per_dm2: float = Field(default=0.15, ge=0, le=5.0)
    grinding_h_per_dm2: float = Field(default=0.10, ge=0, le=5.0)
    drilling_h_per_dm2: float = Field(default=0.20, ge=0, le=5.0)
    # Dormienti dopo Sprint F (scala piastre ora via DieDimensionBracket lookup).
    # Mantenuti come opzionali per retro-compat: i client vecchi possono
    # ancora leggere/inviare i campi senza errore.
    large_plate_threshold_dm2: float = Field(default=80.0, ge=0)
    large_plate_factor: float = Field(default=1.25, ge=1.0, le=3.0)
    # Sprint F — aggancio Machine FK alle 4 tariffe (NULL = fallback hourly_rate_*)
    milling_machine_id: Optional[int] = Field(default=None, ge=1)
    grinding_machine_id: Optional[int] = Field(default=None, ge=1)
    drilling_machine_id: Optional[int] = Field(default=None, ge=1)
    edm_wire_machine_id: Optional[int] = Field(default=None, ge=1)
    # Sprint F — bonus design configurabile (era hardcoded)
    design_h_per_bend: float = Field(default=0.4, ge=0, le=10.0)
    design_h_per_punch: float = Field(default=0.3, ge=0, le=10.0)


class DieSettingsUpdate(DieSettingsBase):
    pass


class DieSettingsOut(DieSettingsBase):
    id: int

    class Config:
        from_attributes = True


class DieDimensionBracketBase(BaseModel):
    label: str = Field(min_length=1, max_length=20)
    area_min_dm2: float = Field(default=0.0, ge=0)
    area_max_dm2: Optional[float] = Field(default=None, ge=0)
    coefficient: float = Field(default=1.0, ge=0)
    sort_order: int = Field(default=0, ge=0)


class DieDimensionBracketCreate(DieDimensionBracketBase):
    pass


class DieDimensionBracketUpdate(DieDimensionBracketBase):
    label: Optional[str] = Field(default=None, min_length=1, max_length=20)


class DieDimensionBracketOut(DieDimensionBracketBase):
    id: int

    class Config:
        from_attributes = True


class DieTemplatePlateBase(BaseModel):
    plate_role: str = Field(min_length=1, max_length=50)
    default_thickness_mm: float = Field(default=0.0, ge=0)
    default_material_id: Optional[int] = None
    default_treatment_id: Optional[int] = None
    sort_order: int = Field(default=0, ge=0)


class DieTemplatePlateCreate(DieTemplatePlateBase):
    pass


class DieTemplatePlateOut(DieTemplatePlateBase):
    id: int

    class Config:
        from_attributes = True


# ─── Sprint C — DieTemplateNormalized (BoM scalabile) ──────────────────────
class DieTemplateNormalizedBase(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    normalized_supplier_id: Optional[int] = Field(default=None, ge=1)
    quantity_formula: str = Field(default="1", max_length=100)
    unit_price_default: float = Field(default=0.0, ge=0)
    sort_order: int = Field(default=0, ge=0)
    # D1: provenienza dal catalogo NormalizedItem (snapshot). NULL = testo libero.
    normalized_item_id: Optional[int] = Field(default=None, ge=1)


class DieTemplateNormalizedCreate(DieTemplateNormalizedBase):
    pass


class DieTemplateNormalizedUpdate(DieTemplateNormalizedBase):
    description: Optional[str] = Field(default=None, min_length=1, max_length=200)
    quantity_formula: Optional[str] = Field(default=None, max_length=100)


class DieTemplateNormalizedOut(DieTemplateNormalizedBase):
    id: int

    class Config:
        from_attributes = True


class DieTemplateBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    die_subtype: str = Field(default='passo', pattern=r'^(passo|blocco)$')
    suggested_stations: Optional[int] = Field(default=None, ge=1)
    suggested_pitch_mm: Optional[float] = Field(default=None, ge=0)
    suggested_n_bends_simple: int = Field(default=0, ge=0)
    suggested_n_bends_medium: int = Field(default=0, ge=0)
    suggested_n_bends_complex: int = Field(default=0, ge=0)
    suggested_n_punches_simple: int = Field(default=0, ge=0)
    suggested_n_punches_medium: int = Field(default=0, ge=0)
    suggested_n_punches_complex: int = Field(default=0, ge=0)
    default_difficulty: str = Field(default='base', pattern=r'^(base|medium|hard)$')
    active: bool = True


class DieTemplateCreate(DieTemplateBase):
    plates: List[DieTemplatePlateCreate] = []
    normalized_items: List[DieTemplateNormalizedCreate] = []


class DieTemplateUpdate(DieTemplateBase):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    plates: Optional[List[DieTemplatePlateCreate]] = None
    normalized_items: Optional[List[DieTemplateNormalizedCreate]] = None


class DieTemplateOut(DieTemplateBase):
    id: int
    created_at: datetime
    plates: List[DieTemplatePlateOut] = []
    normalized_items: List[DieTemplateNormalizedOut] = []

    class Config:
        from_attributes = True


# Schema specifico per la creazione di un preventivo stampo (wizard).
# Bundle: dati quote + dati spec + template opzionale. Endpoint POST /api/dies
# crea il Quote + DieSpec + (se template_id) le Part-piastre.
class DieQuoteCreate(BaseModel):
    quote_number: str = Field(min_length=1, max_length=50)
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_reference: Optional[str] = None
    notes_customer: Optional[str] = None
    notes_internal: Optional[str] = None
    template_id: Optional[int] = None
    spec: DieSpecCreate


# Forward-ref resolution:
# - QuoteOut referenzia DieSpecOut/DieNormalizedItemOut;
# - PhaseOut referenzia MachineOut/OperationOut/TreatmentOut/SupplierOut
#   (definiti dopo PhaseOut nel file, vedi commento in PhaseOut).
PhaseOut.model_rebuild()
QuoteOut.model_rebuild()
