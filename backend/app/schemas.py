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
def normalize_phone_number(v):
    """Normalizza un numero di telefono IT: toglie prefisso +39, parentesi,
    interni ('int. 3'), unifica separatori (- / .) in spazi. None/senza cifre → None.

    Fonte UNICA (DRY): usata sia dal validator `CustomerBase.phone` (path API)
    sia dall'import CSV clienti (AUD-27), che prima faceva solo uno strip e
    divergeva dal formato canonico.
    """
    if not v:
        return None
    s = str(v).strip()
    if not re.search(r'\d', s):
        return None
    s = re.sub(r'^\+\s*39\s*', '', s)
    s = s.replace('(', '').replace(')', '')
    s = re.sub(r'\s*int\.?\s*\d+.*$', '', s, flags=re.IGNORECASE)
    s = s.replace('-', ' ').replace('/', ' ').replace('.', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s or None


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
        return normalize_phone_number(v)


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


class ChangePasswordIn(BaseModel):
    """Cambio password self-service (AUD-13): l'utente cambia la PROPRIA
    password fornendo quella attuale. Min 8 caratteri per la nuova."""
    old_password: str
    new_password: str = Field(min_length=8)


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
    # TD-7 — foratura a elettrodo (autocalc se la macchina è la foratrice designata)
    electrode_diameter_mm: Optional[float] = Field(default=None, ge=0)
    n_holes: Optional[int] = Field(default=None, ge=0)
    drill_depth_mm: Optional[float] = Field(default=None, ge=0)


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
    electrode_diameter_mm: Optional[float] = Field(default=None, ge=0)
    n_holes: Optional[int] = Field(default=None, ge=0)
    drill_depth_mm: Optional[float] = Field(default=None, ge=0)


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
class MaterialAliasBrief(BaseModel):
    """Alias materiale embeddato in MaterialOut (id + nome, senza ridondanza)."""
    id: int
    csv_name: str

    class Config:
        from_attributes = True


class MaterialAliasAdd(BaseModel):
    """Body per aggiungere un alias a un materiale (material_id è nel path)."""
    csv_name: str = Field(min_length=1)


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
    aliases: List[MaterialAliasBrief] = []

    class Config:
        from_attributes = True


# --- Part ---
class PartCloneRequest(BaseModel):
    """Clona la ricetta di una parte su altri articoli (target) dello stesso
    preventivo. Vedi POST /parts/{source_id}/clone-onto."""
    target_ids: List[int]


class PartBase(BaseModel):
    part_code: str
    revision: Optional[str] = "A"
    description: Optional[str] = None
    quantity: Optional[int] = Field(default=1, ge=1, le=1_000_000)  # ≥1 (no div/0); tetto sano (F27)
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
    margin_percent: Optional[float] = Field(default=None, ge=0, le=1000)
    minimum_price: Optional[float] = Field(default=None, ge=0)
    customer_notes: Optional[str] = None
    internal_notes: Optional[str] = None
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
    # F1c: in output NON riapplichiamo il vincolo ge=1 (resta su PartCreate/
    # PartUpdate). Senza questo override una singola riga legacy/corrotta con
    # quantity < 1 farebbe fallire la serializzazione dell'INTERA lista
    # preventivi (500), senza modo di trovarla/eliminarla dalla UI.
    quantity: Optional[int] = None
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
    global_margin_percent: Optional[float] = Field(default=20.0, ge=0, le=1000)
    global_discount_percent: Optional[float] = Field(default=0.0, ge=0, le=100)
    transport_cost: Optional[float] = Field(default=0.0, ge=0)
    packaging_cost: Optional[float] = Field(default=0.0, ge=0)
    notes_customer: Optional[str] = None
    notes_internal: Optional[str] = None
    status: Optional[str] = "bozza"
    # Sprint G — tracking storico (compilabili solo da PUT su status=completato).
    sold_price: Optional[float] = Field(default=None, ge=0)
    actual_cost: Optional[float] = Field(default=None, ge=0)


class QuoteCreate(QuoteBase):
    quote_number: str = Field(min_length=1, max_length=50)  # unique sul modello
    num_components: Optional[int] = None
    default_quantity: Optional[int] = Field(default=1, ge=1, le=1_000_000)  # tetto sano (F27)

    @field_validator('quote_number')
    @classmethod
    def _validate_quote_number(cls, v: str) -> str:
        # F26: whitelist di caratteri (difesa in profondità). Il formato reale è
        # {cli}-{yy}{cat}_{prog}; ammettiamo lettere, cifre e . _ - così da
        # bloccare separatori di path, spazi e markup senza rompere la
        # numerazione esistente. NB: '/' escluso di proposito (anti-traversal).
        if not re.fullmatch(r'[A-Za-z0-9._-]+', v):
            raise ValueError(
                "Numero preventivo: ammessi solo lettere, cifre e i caratteri . _ -"
            )
        return v


class QuoteUpdate(QuoteBase):
    pass


class QuoteStatusUpdate(BaseModel):
    status: str  # "bozza" | "inviato"


class QuoteCloseoutUpdate(BaseModel):
    """Consuntivo commessa: prezzo venduto + costo reale (solo su completo).
    Editabile da chi accede all'archivio (PATCH /quotes/{id}/closeout)."""
    sold_price: Optional[float] = Field(default=None, ge=0)
    actual_cost: Optional[float] = Field(default=None, ge=0)


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
    created_by: Optional[UserMinimal] = None
    submitted_by_user_id: Optional[int] = None
    submitted_at: Optional[datetime] = None
    read_by_user_id: Optional[int] = None
    read_at: Optional[datetime] = None
    awaiting_client_at: Optional[datetime] = None
    confirmed_by_user_id: Optional[int] = None
    confirmed_at: Optional[datetime] = None
    completed_by_user_id: Optional[int] = None
    completed_at: Optional[datetime] = None
    not_ordered_at: Optional[datetime] = None
    not_ordered_by_user_id: Optional[int] = None
    submitted_by: Optional[UserMinimal] = None
    read_by: Optional[UserMinimal] = None
    confirmed_by: Optional[UserMinimal] = None
    completed_by: Optional[UserMinimal] = None
    not_ordered_by: Optional[UserMinimal] = None
    material_ordered_at: Optional[datetime] = None
    material_ordered_by_user_id: Optional[int] = None
    material_ordered_by: Optional[UserMinimal] = None
    # B1: totale finale persistito (Σ parti + trasporto + imballaggio − sconto;
    # stampi = L7). NULL per preventivi mai ricalcolati dopo la migrazione.
    final_total: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    parts: List[PartOut] = []
    customer: Optional[CustomerOut] = None

    class Config:
        from_attributes = True


class ArchiveQuoteOut(QuoteOut):
    """QuoteOut + stato materiale derivato (spec 18), solo per la lista
    archivio. `None` per gli stampi (fuori scope) o quando non calcolato."""
    material_status: Optional[str] = None
    # True se almeno una parte del preventivo ha un allegato (DXF/PDF/STEP…).
    # Indicatore passivo in lista; calcolato in list_archive (batch, no N+1).
    has_files: bool = False


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


# --- Vendite dirette (extra-preventivo) ---
class DirectSaleBase(BaseModel):
    code: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    sale_date: datetime
    unit_price: float = Field(default=0.0, ge=0)   # prezzo di vendita unitario
    unit_cost: float = Field(default=0.0, ge=0)    # costo unitario (consuntivo)
    quantity: int = Field(default=1, ge=1)
    notes: Optional[str] = None


class DirectSaleCreate(DirectSaleBase):
    pass


class DirectSaleUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    sale_date: Optional[datetime] = None
    unit_price: Optional[float] = Field(default=None, ge=0)
    unit_cost: Optional[float] = Field(default=None, ge=0)
    quantity: Optional[int] = Field(default=None, ge=1)
    notes: Optional[str] = None


class DirectSaleOut(DirectSaleBase):
    id: int
    created_by: Optional[UserMinimal] = None

    class Config:
        from_attributes = True


# --- Dashboard ---
class MonthlyData(BaseModel):
    month: str
    year: int
    # Grafico dashboard "Costo preventivato vs Venduto": sui preventivi VENDUTI
    # (con sold_price), per mese di chiusura (completed_at, fallback quote_date).
    quoted_cost: float = 0   # Σ costo stimato dei preventivi venduti
    sold: float = 0          # Σ prezzo di vendita reale (sold_price)


class WorkflowStats(BaseModel):
    by_status: dict[str, int]
    to_review_count: int
    awaiting_client_count: int = 0        # offerte in attesa risposta cliente
    completed_missing_price_count: int = 0  # ordini completi senza prezzo di vendita
    standard_count: int = 0   # totale preventivi


# ─── Statistics page (StatisticsOut) ──────────────────────────────────────
# Dataset aggregati per la pagina /statistics. Tutti calcolati lato BE
# con SQL aggregato (no row idratate in Python).

class StatsTrendPoint(BaseModel):
    month: str        # YYYY-MM
    standard: float   # € preventivati nel mese


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


class StatsOutcome(BaseModel):
    """Esito commerciale (vinto/perso/aperto) per conteggio e valore €.

    Vinto = confermato + completo (il cliente ha ordinato); perso =
    non_ordinato; aperto = bozza/inviato/letto/in_attesa_cliente.
    Tasso di conversione = vinti / (vinti + persi) — solo sui decisi.
    """
    won_count: int = 0
    lost_count: int = 0
    open_count: int = 0
    won_value: float = 0.0
    lost_value: float = 0.0
    open_value: float = 0.0
    conversion_rate: float = 0.0        # % sul numero di preventivi decisi
    conversion_rate_value: float = 0.0  # % sul valore € dei preventivi decisi


class StatsCmpPoint(BaseModel):
    """Punto della serie di confronto (MoM/YoY), allineato per posizione."""
    month: str
    value: float


class StatsQuotesComparison(BaseModel):
    """Aggregati del periodo di confronto (tab Preventivi). Il frontend ne
    ricava i delta dei KPI e la serie tratteggiata `cmp` sui trend."""
    total_value: float = 0.0
    count: int = 0
    conversion_rate: float = 0.0
    # None quando non c'è margine confrontabile (es. filtro "Stampi": i preventivi
    # die non hanno margine parti) → il frontend non mostra una pill fuorviante.
    avg_margin: Optional[float] = None
    trend_total: List[StatsCmpPoint] = []     # € totale/mese (standard+stampi)
    margin_by_month: List[StatsCmpPoint] = []  # margine %/mese


class StatisticsOut(BaseModel):
    period: str                              # 'year' | '12m' | 'prev_year' | 'all'
    standard_count: int = 0                  # n° preventivi nel periodo
    outcome: StatsOutcome = StatsOutcome()   # esito vinto/perso/aperto
    trend_monthly: List[StatsTrendPoint]
    top_customers: List[StatsCustomerRow]
    by_category: List[StatsCategoryRow]
    margin_monthly: List[StatsMarginPoint]
    hours_by_machine: List[StatsHoursRow] = []
    hours_by_operation: List[StatsHoursRow] = []
    comparison: Optional[StatsQuotesComparison] = None  # popolato se compare attivo


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


class StatsToolBrandRow(BaseModel):
    """Utensili sotto scorta raggruppati per marca (tab Utensili)."""
    name: str
    value: int


class ToolsStatsOut(BaseModel):
    period: str
    orders_count: int = 0                           # n° ordini utensili nel periodo
    total_quantity: int = 0                         # Σ quantità ordinata
    distinct_tools: int = 0                         # utensili distinti ordinati
    low_stock_total: int = 0                        # utensili sotto scorta (attuale)
    trend_monthly: List[StatsCountPoint]            # n. ordini emessi per mese
    top_suppliers: List[StatsSupplierRow]           # top 10 fornitori utensili
    top_tools: List[StatsToolRow]                   # top 10 utensili più ordinati
    by_type: List[StatsToolTypeRow] = []            # quantità per tipo utensile
    low_stock_by_brand: List[StatsToolBrandRow] = []  # sotto scorta per marca


# ─── Statistics: tab Marginalità & taratura ───────────────────────────────
# Solo preventivi in stato 'completo' (esclusi Stampi: non hanno sold_price).
# Guadagno reale = venduto − costo reale. Taratura prezzo = venduto ÷
# preventivato. Taratura costo = costo reale ÷ costo stimato.

class MarginMonthlyPoint(BaseModel):
    month: str                                      # YYYY-MM
    preventivato: float                             # Σ final_total
    venduto: float                                  # Σ sold_price
    costo: float                                    # Σ actual_cost


class MarginProfitPoint(BaseModel):
    month: str
    profit: float                                   # Σ (sold_price − actual_cost)


class MarginBandRow(BaseModel):
    """Fascia dell'istogramma di distribuzione dello scostamento prezzo."""
    band: str                                       # es. '0,90–0,95'
    count: int


class MarginWorstRow(BaseModel):
    """Riga della tabella 'peggiori scostamenti' (venduto ≪ preventivato)."""
    quote_number: str
    customer_name: str
    preventivato: float
    venduto: float
    costo_reale: Optional[float] = None
    delta_percent: float                            # (venduto − preventivato)/preventivato ×100


class MarginComparison(BaseModel):
    """Aggregati del periodo di confronto (tab Marginalità)."""
    guadagno_reale: Optional[float] = None
    taratura_prezzo: Optional[float] = None
    taratura_costo: Optional[float] = None
    profit_by_month: List[MarginProfitPoint] = []


class MarginStatsOut(BaseModel):
    period: str
    # KPI (None quando il dato è insufficiente → degradazione graziosa)
    guadagno_reale: Optional[float] = None          # € venduto − costo reale
    taratura_prezzo: Optional[float] = None         # ratio venduto ÷ preventivato
    taratura_costo: Optional[float] = None          # ratio costo reale ÷ costo stimato
    # Copertura dato (affidabilità delle medie)
    completed_count: int = 0                         # preventivi completi nel periodo
    with_sold_count: int = 0                         # con prezzo venduto compilato
    with_cost_count: int = 0                         # con costo reale compilato
    monthly: List[MarginMonthlyPoint] = []
    profit_monthly: List[MarginProfitPoint] = []
    distribution: List[MarginBandRow] = []
    worst: List[MarginWorstRow] = []
    comparison: Optional[MarginComparison] = None  # popolato se compare attivo


class DashboardQuoteRow(BaseModel):
    id: int
    quote_number: str
    customer_name: Optional[str] = None
    status: str
    quote_type: Optional[str] = None
    quote_date: Optional[date] = None
    total_price: float
    submitted_at: Optional[datetime] = None
    submitted_by: Optional[UserMinimal] = None
    # Stato materiale aggregato (solo dove serve, es. "materiale da fare").
    material_status: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Wire EDM ─────────────────────────────────────────────────────────────────

class EdmConfigBase(BaseModel):
    rough_speed_factor: float = Field(default=1.0, ge=0)
    semi_speed_factor: float = Field(default=0.9, ge=0)
    finish_speed_factor: float = Field(default=0.7, ge=0)
    default_pierce_time_s: float = Field(default=2.0, ge=0)
    default_drilling_machine_id: Optional[int] = None
    # TD-7: consumo elettrodo = n_fori × profondità × wear × (1 + margin/100).
    electrode_wear_factor: float = Field(default=2.0, ge=0)
    electrode_margin_percent: float = Field(default=5.0, ge=0)


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


class ElectrodeBase(BaseModel):
    """TD-7 — riga catalogo elettrodo (Ø, lunghezza barretta, prezzo)."""
    diameter_mm: float = Field(gt=0)
    length_mm: float = Field(gt=0)
    price: float = Field(ge=0)
    notes: Optional[str] = None


class ElectrodeCreate(ElectrodeBase):
    pass


class ElectrodeUpdate(ElectrodeBase):
    pass


class ElectrodeOut(ElectrodeBase):
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


class DxfPointOut(BaseModel):
    x: float
    y: float


class DxfEntityOut(BaseModel):
    """Entità geometrica DXF per il rendering/hover (coord in mm).
    `t`: 'line' | 'circle' | 'arc' | 'poly'. Campi valorizzati per tipo."""
    t: str
    x1: Optional[float] = None
    y1: Optional[float] = None
    x2: Optional[float] = None
    y2: Optional[float] = None
    cx: Optional[float] = None
    cy: Optional[float] = None
    r: Optional[float] = None
    a0: Optional[float] = None
    a1: Optional[float] = None
    pts: Optional[List[List[float]]] = None
    closed: Optional[bool] = None


class DxfAnalysisOut(BaseModel):
    profiles: List[DxfProfileOut]
    bbox_global: DxfBboxOut
    total_length_mm: float
    n_closed_profiles: int
    suggested_pierce: int
    units: str
    unit_factor: float = 1.0   # raw × factor = mm (per l'override unità nel viewer)
    warnings: List[str]
    # Primitive per gli strumenti di misura del viewer (default vuote per
    # retro-compat con eventuali chiamate/cachati che non le hanno).
    snap_points: List[DxfPointOut] = []
    entities: List[DxfEntityOut] = []


# ─── Ordini materiali ──────────────────────────────────────────────────────

class BarPiece(BaseModel):
    """Una barra da ordinare (lunghezza × quantità) dentro un BarSpec."""
    length_mm: float = Field(gt=0)
    quantity: int = Field(default=1, ge=1)


class BarSpec(BaseModel):
    """TD-3 — consolidamento in barre dei tondi con stesso materiale + diametro.

    Il frontend, al "Crea CSV", propone di sostituire N spezzoni tondi con una
    o più barre. `lengths` = le lunghezze (mm) dei componenti da consolidare:
    gli item tondi (stesso material + diametro) con quelle lunghezze vengono
    rimossi dallo snapshot e sostituiti dalle barre in `pieces` (una riga per
    lunghezza-barra). Gli spezzoni con lunghezze non incluse restano righe
    singole (override utente). Es.: fabbisogno 4000 mm → pieces = [{3000,1},
    {1000,1}] oppure [{2000,2}].
    """
    material_id: Optional[int] = None
    material_name: str
    diameter_mm: float
    lengths: List[float] = Field(default_factory=list)
    pieces: List[BarPiece] = Field(default_factory=list)


class MaterialOrderCreate(BaseModel):
    # Pool unificato: un ordine nasce da preventivi e/o richieste materiale
    # manuali. Entrambe le liste opzionali (l'endpoint esige che almeno una sia
    # non vuota); /aggregate (preview) usa lo stesso modello.
    quote_ids: List[int] = Field(default_factory=list)
    request_ids: List[int] = Field(default_factory=list)
    # Spec 18: creare l'ordine è per-fornitore. Opzionale nello schema perché
    # /aggregate (preview) non lo richiede; l'endpoint di creazione lo esige.
    material_supplier_id: Optional[int] = None
    # TD-3: consolidamenti in barra scelti nel popup (vuoto = nessuno).
    bars: List[BarSpec] = Field(default_factory=list)


class MaterialOrderOut(BaseModel):
    """Sintesi ordine materiali per storico/list view."""
    id: int
    created_at: datetime
    created_by: Optional[UserMinimal] = None
    supplier_name: Optional[str] = None
    quote_count: int
    quote_numbers: List[str] = []
    source: str = "quotes"            # 'quotes' | 'request' | 'mixed' | 'file'
    item_count: int = 0               # righe snapshot dell'ordine

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
    # TD-3: dimensioni strutturate (oltre a dim_str) per il consolidamento barra
    # lato client — evitano di ri-parsare la stringa. Valorizzate per forma.
    shape: str = 'prismatico'             # 'tondo' | 'prismatico' | 'tubo'
    diameter_mm: Optional[float] = None   # tondo/tubo: Ø esterno
    length_mm: Optional[float] = None     # tondo/tubo: lunghezza (raw_z_mm)


class MaterialAggregateBySupplier(BaseModel):
    supplier_id: Optional[int] = None     # None = materiale senza fornitore configurato
    supplier_name: str                    # "Senza fornitore" se supplier_id None
    items: List[MaterialItemAggregated] = []


class MaterialAggregateOut(BaseModel):
    groups: List[MaterialAggregateBySupplier] = []


# ─── Ordini materiale "da file" (distinta CSV / manuale) ────────────────────

class FileOrderRow(BaseModel):
    """Riga della tabella editabile: risultato del parse E input alla creazione.

    Dimensioni = GREZZO (larghezza/altezza già +5, spessore già al multiplo di
    5 per eccesso). `needs_*` sono flag informativi per la UI (rossi), ignorati
    in creazione (il backend rivaluta).
    """
    part_code: str = ""
    description: str = ""
    csv_material: str = ""                # nome materiale dalla distinta
    material_id: Optional[int] = None     # materiale catalogo abbinato
    material_name: str = ""               # nome mostrato/esportato
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    shape: str = "prismatico"             # 'prismatico' | 'tondo' | 'tubo'
    width_mm: Optional[float] = Field(default=None, ge=0)
    height_mm: Optional[float] = Field(default=None, ge=0)
    thickness_mm: Optional[float] = Field(default=None, ge=0)
    diameter_mm: Optional[float] = Field(default=None, ge=0)
    inner_diameter_mm: Optional[float] = Field(default=None, ge=0)
    length_mm: Optional[float] = Field(default=None, ge=0)
    quantity: int = Field(default=1, ge=1)
    needs_dimensions: bool = False
    needs_material: bool = False


class FileOrderParseOut(BaseModel):
    rows: List[FileOrderRow] = []


class MaterialAliasCreate(BaseModel):
    csv_name: str = Field(min_length=1)
    material_id: int


class MaterialAliasOut(BaseModel):
    id: int
    csv_name: str
    material_id: int


# ─── Richieste materiale manuali (gemello del preventivo per il materiale) ──

class MaterialRequestItemOut(BaseModel):
    """Riga di una richiesta materiale (output)."""
    id: int
    material_id: Optional[int] = None
    material_name: str = ""
    part_code: str = ""
    description: str = ""
    shape: str = "prismatico"
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    thickness_mm: Optional[float] = None
    diameter_mm: Optional[float] = None
    inner_diameter_mm: Optional[float] = None
    length_mm: Optional[float] = None
    quantity: int = 1
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    # Evasione: True quando la riga è confluita in un MaterialOrder emesso
    # (bloccata in modifica). Speculare all'evasione dei preventivi.
    evaso: bool = False
    material_order_id: Optional[int] = None

    class Config:
        from_attributes = True


class MaterialRequestOut(BaseModel):
    """Richiesta materiale con righe (detail) o senza (per la lista pool)."""
    id: int
    created_at: datetime
    created_by: Optional[UserMinimal] = None
    status: str = "bozza"                  # 'bozza' | 'inviato'
    sent_at: Optional[datetime] = None
    title: Optional[str] = None
    items: List[MaterialRequestItemOut] = []
    item_count: int = 0                    # righe totali
    open_count: int = 0                    # righe ancora da ordinare (non evase)
    supplier_names: List[str] = []         # fornitori distinti delle righe aperte

    class Config:
        from_attributes = True


class MaterialRequestCreate(BaseModel):
    title: Optional[str] = None
    rows: List[FileOrderRow] = Field(default_factory=list)


class MaterialRequestUpdate(BaseModel):
    """Aggiorna titolo e/o righe di una richiesta.

    `rows` sostituisce le righe ANCORA APERTE (non evase): quelle già ordinate
    restano intoccabili. `None` = non toccare le righe (aggiorna solo il titolo).
    """
    title: Optional[str] = None
    rows: Optional[List[FileOrderRow]] = None
    material_name: str = ""

    class Config:
        from_attributes = True


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

class NormalizedAliasBrief(BaseModel):
    """Alias embeddato in NormalizedItemOut (id + nome grezzo)."""
    id: int
    csv_name: str

    class Config:
        from_attributes = True


class NormalizedAliasAdd(BaseModel):
    """Body per aggiungere un alias a una voce normalizzata (id nel path)."""
    csv_name: str = Field(min_length=1)


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
    aliases: List[NormalizedAliasBrief] = []

    class Config:
        from_attributes = True


# ─── Ordini normalizzati da file ────────────────────────────────────────────

class NormalizedFileRow(BaseModel):
    """Riga della tabella editabile normalizzati: risultato del parse E input
    alla creazione. `csv_raw` = designazione grezza dalla distinta (per
    imparare l'alias); `article` = tipo normalizzato mostrato/esportato."""
    reference: str = ""                     # commessa / num. parte
    csv_raw: str = ""                       # designazione grezza (per l'alias)
    normalized_item_id: Optional[int] = None
    article: str = ""                       # tipo normalizzato (es. "Viti TCEI")
    description: str = ""                    # spec (es. "M8x100 TCEI")
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    quantity: int = 1
    needs_type: bool = False                # flag UI: non abbinato (riga rossa)


class NormalizedFileParseOut(BaseModel):
    rows: List[NormalizedFileRow] = []


class NormalizedFileOrderCreate(BaseModel):
    rows: List[NormalizedFileRow] = Field(min_length=1)


class NormalizedFileAliasOut(BaseModel):
    """Alias appreso per il pannello 'alias' della pagina da-file."""
    id: int
    csv_name: str
    item_code: str = ""                     # code della voce normalizzata


class NormalizedOrderOut(BaseModel):
    """Sintesi ordine normalizzati per lo storico."""
    id: int
    created_at: datetime
    created_by: Optional[UserMinimal] = None
    supplier_name: Optional[str] = None
    item_count: int = 0

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



# Forward-ref resolution:
# - PhaseOut referenzia MachineOut/OperationOut/TreatmentOut/SupplierOut
#   (definiti dopo PhaseOut nel file, vedi commento in PhaseOut).
PhaseOut.model_rebuild()
QuoteOut.model_rebuild()
