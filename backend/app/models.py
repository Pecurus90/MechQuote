import logging
import os
from datetime import date

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Integer,
    String, Text, JSON, event,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base

logger = logging.getLogger(__name__)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    hashed_password = Column(String(200), nullable=False)
    full_name = Column(String(100))
    email = Column(String(200))
    role = Column(String(20), default='admin')  # admin|ufficio_tecnico|officina|amministrazione
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class QuoteCategory(Base):
    __tablename__ = "quote_categories"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(5), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    customer_number = Column(Integer, unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    vat_number = Column(String(50))
    address = Column(Text)
    phone = Column(String(50))
    email = Column(String(100))
    contact_person = Column(String(100))
    notes = Column(Text)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    quotes = relationship("Quote", back_populates="customer")


class Quote(Base):
    __tablename__ = "quotes"

    id = Column(Integer, primary_key=True, index=True)
    quote_number = Column(String(50), unique=True, index=True, nullable=False)
    quote_type = Column(String(20), default="single")   # single | commessa
    customer_id = Column(Integer, ForeignKey("customers.id"))
    customer_name = Column(String(200))
    customer_reference = Column(String(200))
    # default Python (date.today): server_default=func.now() su SQLite produce
    # un timestamp 'YYYY-MM-DD HH:MM:SS' che il driver Python non sa parsare
    # come date pura → ValueError al SELECT successivo. Usare default Python
    # garantisce un date object pulito (CSPRNG-libero, idempotente per test).
    quote_date = Column(Date, default=date.today)

    customer = relationship("Customer", back_populates="quotes")
    validity_days = Column(Integer, default=30)
    delivery_text = Column(String(200))
    currency = Column(String(10), default="EUR")
    global_margin_percent = Column(Float, default=20.0)
    global_discount_percent = Column(Float, default=0.0)
    transport_cost = Column(Float, default=0.0)
    packaging_cost = Column(Float, default=0.0)
    notes_customer = Column(Text)
    notes_internal = Column(Text)
    status = Column(String(20), default="bozza")  # bozza|inviato|completato
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    submitted_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    completed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    completed_at = Column(DateTime, nullable=True)
    # Tracking ordine materiale: settato quando un MaterialOrder include questo
    # quote (vedi api/orders.py). Indipendente dal workflow stato.
    material_ordered_at = Column(DateTime, nullable=True)
    material_ordered_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    parts = relationship("Part", back_populates="quote", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    submitted_by = relationship("User", foreign_keys=[submitted_by_user_id])
    completed_by = relationship("User", foreign_keys=[completed_by_user_id])
    material_ordered_by = relationship("User", foreign_keys=[material_ordered_by_user_id])


class Part(Base):
    __tablename__ = "parts"

    id = Column(Integer, primary_key=True, index=True)
    quote_id = Column(Integer, ForeignKey("quotes.id"), nullable=False)
    part_code = Column(String(100), nullable=False)
    revision = Column(String(20), default="A")
    description = Column(Text)
    quantity = Column(Integer, default=1)
    quote_mode = Column(String(20), default="manual")
    material_id = Column(Integer, ForeignKey("materials.id"))
    raw_x_mm = Column(Float)
    raw_y_mm = Column(Float)
    raw_z_mm = Column(Float)
    raw_diameter_mm = Column(Float)
    finished_weight_kg = Column(Float)
    raw_weight_kg = Column(Float)
    material_cost = Column(Float, default=0.0)
    material_delivery_cost = Column(Float, default=0.0)
    # Conto lavoro: cliente porta lui il materiale. Quando True il cost
    # engine azzera material_cost, material_delivery_cost, cutting_per_piece.
    # Le info di materiale/dimensioni restano visibili (utili per autocalc
    # EDM, peso finito, PDF).
    customer_supplied_material = Column(Boolean, default=False)
    # Materiale a magazzino: lo abbiamo già in officina. Il costo grezzo
    # (vol×densità×€/kg×scrap) resta applicato; shipping e cutting del
    # fornitore sono sostituiti da 2 override globali in CompanySettings.
    # Mutex con customer_supplied_material (UI gestisce con radio).
    material_from_stock = Column(Boolean, default=False)
    margin_percent = Column(Float)
    minimum_price = Column(Float)
    customer_notes = Column(Text)
    internal_notes = Column(Text)
    # Colonne legacy nel DB ma non mappate (drop dal modello, dati restano):
    # rounding_rule, confidence_level — mai applicate nel cost engine.
    total_cost = Column(Float, default=0.0)
    unit_price = Column(Float, default=0.0)
    total_price = Column(Float, default=0.0)

    quote = relationship("Quote", back_populates="parts")
    phases = relationship("ManufacturingPhase", back_populates="part",
                          cascade="all, delete-orphan", order_by="ManufacturingPhase.sequence_number")
    files = relationship("PartFile", back_populates="part", cascade="all, delete-orphan")
    material = relationship("Material")


class PartFile(Base):
    __tablename__ = "part_files"

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    file_type = Column(String(20), nullable=False)
    filename = Column(String(200), nullable=False)
    path = Column(String(500), nullable=False)
    uploaded_at = Column(DateTime, server_default=func.now())

    part = relationship("Part", back_populates="files")


class ManufacturingPhase(Base):
    __tablename__ = "manufacturing_phases"

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    sequence_number = Column(Integer, default=10)
    phase_type = Column(String(50), nullable=False)
    description = Column(String(200))
    machine_id = Column(Integer, ForeignKey("machines.id"))
    supplier_id = Column(Integer, ForeignKey("suppliers.id"))
    setup_hours = Column(Float, default=0.0)
    cycle_hours_per_part = Column(Float, default=0.0)
    fixed_cost = Column(Float, default=0.0)
    variable_cost_per_part = Column(Float, default=0.0)
    hourly_rate_override = Column(Float)
    calculated_cost = Column(Float, default=0.0)
    is_shared = Column(Boolean, default=False)
    internal_notes = Column(Text)
    customer_notes = Column(Text)
    # Colonne legacy nel DB ma non mappate (drop dal modello, dati restano):
    # quantity_multiplier, margin_percent_override — mai applicate.
    # customer_visible — era per nascondere fasi nel PDF cliente, rimosso
    # quando il PDF cliente è stato eliminato (un solo PDF interno).

    treatment_id = Column(Integer, ForeignKey("treatments.id"), nullable=True)

    # Lavorazione (categoria libera dall'utente, sostituisce phase_type).
    # phase_type resta come colonna legacy nel DB ma non più letta dal modello.
    operation_id = Column(Integer, ForeignKey("operations.id"), nullable=True)

    # Wire EDM extra: popolati quando si vuole l'autocalc tempo. Si attivano
    # quando la macchina della fase è di tipo wire_edm (machine.machine_type).
    cut_length_mm = Column(Float, nullable=True)
    cut_height_mm = Column(Float, nullable=True)
    cutting_cycle_id = Column(Integer, ForeignKey("cutting_cycles.id"), nullable=True)
    n_pierce = Column(Integer, nullable=True)
    dxf_profile_ids = Column(JSON, nullable=True)
    # Colonne legacy in DB ma non mappate (prototipo Sprint 13c volumetric):
    # input_volume_cm3 — non più letta.

    part = relationship("Part", back_populates="phases")
    machine = relationship("Machine")
    supplier = relationship("Supplier")
    cutting_cycle = relationship("CuttingCycle")
    treatment = relationship("Treatment")
    operation = relationship("Operation")


class MaterialSupplier(Base):
    __tablename__ = "material_suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    address = Column(Text)
    shipping_cost = Column(Float, default=0.0)
    cutting_cost_per_part = Column(Float, default=0.0)
    active = Column(Boolean, default=True)



class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    family = Column(String(50))
    density_kg_dm3 = Column(Float, default=0.0)
    cost_per_kg = Column(Float, default=0.0)
    edm_coefficient = Column(Float, default=1.0)
    cnc_machinability_coefficient = Column(Float, default=1.0)
    default_scrap_percent = Column(Float, default=10.0)
    active = Column(Boolean, default=True)
    notes = Column(Text)
    supplier_id = Column(Integer, ForeignKey("material_suppliers.id"), nullable=True)
    # Scheda tecnica PDF: path al blob in uploads/officina/materiali/.
    # Gestito via /api/materials/{id}/datasheet (upload/download/delete).
    # Consultabile dall'officinista nella vista /officina/materiali (read-only).
    datasheet_path = Column(String(500), nullable=True)

    material_supplier = relationship("MaterialSupplier")

    @property
    def has_datasheet(self) -> bool:
        """Esposto in MaterialOut. Il path effettivo non è mai serializzato
        verso il client (privacy interna)."""
        return bool(self.datasheet_path)


class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    machine_type = Column(String(50))
    hourly_rate = Column(Float, default=0.0)             # costo orario lavorazione
    setup_hourly_rate = Column(Float, nullable=True)     # costo orario attrezzaggio; NULL → fallback a hourly_rate
    setup_minimum_hours = Column(Float, default=0.0)
    active = Column(Boolean, default=True)
    notes = Column(Text)


class Treatment(Base):
    __tablename__ = "treatments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    treatment_type = Column(String(50))
    cost_per_kg = Column(Float, default=0.0)
    minimum_cost = Column(Float, default=0.0)
    minimum_weight_kg = Column(Float, nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"))
    active = Column(Boolean, default=True)
    notes = Column(Text)

    supplier = relationship("Supplier")
    # Colonne legacy nel DB ma non mappate: fixed_cost, cost_per_part,
    # cost_per_surface_area — mai usate nel cost engine.


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    supplier_type = Column(String(50))
    address = Column(Text, nullable=True)
    shipping_cost = Column(Float, default=0.0)
    notes = Column(Text)
    active = Column(Boolean, default=True)


class CompanySettings(Base):
    __tablename__ = "company_settings"

    id = Column(Integer, primary_key=True)
    # Anagrafica
    name = Column(String(200), default="")
    address = Column(Text, default="")
    vat = Column(String(50), default="")
    phone = Column(String(50), default="")
    email = Column(String(100), default="")
    website = Column(String(200), default="")
    # Default applicati al create di Quote/Part se non specificati esplicitamente
    default_margin_percent = Column(Float, default=20.0)
    default_minimum_part_price = Column(Float, default=0.0)
    default_transport_cost = Column(Float, default=0.0)
    default_packaging_cost = Column(Float, default=0.0)
    # Override applicati quando Part.material_from_stock = True. Sostituiscono
    # shipping_cost/cutting_cost_per_part del fornitore abituale.
    stock_shipping_cost = Column(Float, default=0.0)
    stock_cutting_cost_per_part = Column(Float, default=0.0)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Operation(Base):
    """Catalogo lavorazioni utente (= "Lavorazioni" nella sidebar).

    Etichetta libera, gestita dall'utente via UI. Sostituisce
    completamente l'enum hardcoded `phase_type`. Il cost engine non
    dipende più da questa tabella: i behavior speciali (autocalc EDM)
    sono dedotti da `machine.machine_type`, i trattamenti da `treatment_id`.
    """
    __tablename__ = "operations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    active = Column(Boolean, default=True)


class WorkflowTemplate(Base):
    """Template di flusso lavoro: sequenza ordinata di PhaseTemplate.

    Es. "Componente di precisione standard": Progettazione CAD →
    Programmazione CAM → Tornitura Mazak → Foratura EDM → Taglio EDM.
    Apply nel preventivo crea N fasi pre-popolate (clean slate: cancella
    le esistenti). I tempi/parametri specifici (cycle_hours, profilo DXF)
    restano da compilare dall'utente sul preventivo.

    Distinto da PhaseTemplate (= 1 fase singola): qui modelliamo cicli
    multi-fase via referenza al PhaseTemplate, così se cambia un mattone
    si aggiornano automaticamente tutti i flussi che lo usano.
    """
    __tablename__ = "workflow_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    active = Column(Boolean, default=True)

    steps = relationship(
        "WorkflowTemplateStep",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowTemplateStep.sequence_number",
    )


class WorkflowTemplateStep(Base):
    """Singolo step di un WorkflowTemplate: coppia (Macchina, Lavorazione).

    `machine_id` può essere NULL per fasi senza macchina dedicata
    (es. "Progettazione CAD", "Controllo qualità manuale").
    `operation_id` punta al catalogo Lavorazioni (Operation) — l'utente
    sceglie da una lista personalizzabile da UI invece dall'enum fisso.
    All'apply, `phase_type` della fase viene copiato da `operation.phase_type`,
    `description` da `operation.name`, `setup_hours` da `machine.setup_minimum_hours`.
    """
    __tablename__ = "workflow_template_steps"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflow_templates.id"), nullable=False)
    sequence_number = Column(Integer, nullable=False)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    operation_id = Column(Integer, ForeignKey("operations.id"), nullable=False)

    workflow = relationship("WorkflowTemplate", back_populates="steps")
    machine = relationship("Machine")
    operation = relationship("Operation")


class StepColorRule(Base):
    __tablename__ = "step_color_rules"

    id = Column(Integer, primary_key=True, index=True)
    color_hex = Column(String(10), nullable=False)
    color_name = Column(String(50))
    meaning = Column(String(100))
    suggested_phase_type = Column(String(50))
    complexity_coefficient = Column(Float, default=1.0)
    notes = Column(Text)
    active = Column(Boolean, default=True)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True, nullable=False)   # slug: "admin"
    label = Column(String(100), nullable=False)              # "Amministratore"
    color = Column(String(20), default='gray')
    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")


class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(Integer, primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    permission_key = Column(String(100), nullable=False)
    role = relationship("Role", back_populates="permissions")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    type = Column(String(50), nullable=False)            # es. "quote_submitted", "tool_low_stock"
    title = Column(String(200), nullable=False)
    body = Column(Text)
    data_json = Column(JSON)                              # payload arbitrario per il client
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    target_roles = Column(JSON, default=list)             # lista di slug ruolo
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # per notifiche 1-a-1
    target_quote_id = Column(Integer, ForeignKey("quotes.id"), nullable=True)  # per dedupe via UNIQUE INDEX
    requires_action = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    reads = relationship("NotificationRead", back_populates="notification", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys=[created_by_user_id])


class NotificationRead(Base):
    __tablename__ = "notification_reads"

    id = Column(Integer, primary_key=True)
    notification_id = Column(Integer, ForeignKey("notifications.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    read_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    dismissed_at = Column(DateTime, nullable=True)  # nascondi dal pannello (per-utente)

    notification = relationship("Notification", back_populates="reads")


# ─── Wire EDM models ──────────────────────────────────────────────────────────

class EdmConfig(Base):
    """Singleton (id=1) con costanti globali del calcolo EDM filo."""
    __tablename__ = "edm_config"

    id = Column(Integer, primary_key=True)
    rough_speed_factor = Column(Float, default=1.0)
    semi_speed_factor = Column(Float, default=0.9)
    finish_speed_factor = Column(Float, default=0.7)
    default_pierce_time_s = Column(Float, default=2.0)
    # Macchina dedicata alla foratura pre-EDM (1 sola in azienda). Usata dal
    # wizard 2D quando l'utente sceglie modalità "Foratrice EDM" per popolare
    # automaticamente la fase Foratura del preventivo.
    default_drilling_machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    default_drilling_machine = relationship("Machine")


class EdmCutSpeed(Base):
    """Velocità di taglio per (famiglia materiale × range altezza).

    L'indicizzazione è per famiglia (acciaio_inox, alluminio, …) e non per
    singolo materiale: una riga copre tutti i materiali della stessa famiglia.

    `speed_mm_per_min` è l'avanzamento LINEARE del filo (mm/min). Lo spessore
    serve a scegliere la riga giusta della tabella (di solito step di 10mm:
    0-10, 10-20, 20-30, …) ma NON entra nella formula del tempo: il calcolo
    è `tempo = cut_length / (speed × cycle_factor) + pierce`.

    Il nome di colonna in DB è `speed_mm2_min` per ragioni storiche (era
    interpretato come area/min), ma l'attribute Python è `speed_mm_per_min`
    coerente con la semantica corrente.
    """
    __tablename__ = "edm_cut_speeds"

    id = Column(Integer, primary_key=True)
    material_family = Column(String(50), nullable=False)  # slug da core.material_families
    thickness_min_mm = Column(Float, nullable=False, default=0.0)
    thickness_max_mm = Column(Float, nullable=False)
    speed_mm_per_min = Column('speed_mm2_min', Float, nullable=False)
    pierce_time_s = Column(Float, nullable=True)  # override del default per range altezza
    notes = Column(Text)
    # Nota: la colonna legacy material_id resta nel DB (SQLite no DROP COLUMN)
    # ma il modello smette di leggerla. Backfill su material_family in main._run_migrations.


class CuttingCycle(Base):
    """Template di ciclo di taglio EDM = sequenza ordinata di passate."""
    __tablename__ = "cutting_cycles"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    active = Column(Boolean, default=True)

    passes = relationship(
        "CuttingPass",
        back_populates="cycle",
        cascade="all, delete-orphan",
        order_by="CuttingPass.sequence_number",
    )


class CuttingPass(Base):
    """Singola passata di un CuttingCycle (rough/semi/finish)."""
    __tablename__ = "cutting_passes"

    id = Column(Integer, primary_key=True)
    cycle_id = Column(Integer, ForeignKey("cutting_cycles.id"), nullable=False)
    sequence_number = Column(Integer, nullable=False)
    pass_type = Column(String(20), nullable=False)  # 'rough' | 'semi' | 'finish'

    cycle = relationship("CuttingCycle", back_populates="passes")


class DrillingTime(Base):
    """Velocità di foratura per (famiglia materiale × diametro elettrodo).

    Schema redesigned in Sprint 11: lookup discreto su (family, electrode_diameter)
    + velocità lineare mm/sec. Calcolo nel preventivo:
      tempo_foro_s = part.cut_height_mm / row.speed_mm_per_sec
      tempo_totale_h = (n_pierce × tempo_foro_s) / 3600

    Lookup discreto perché l'azienda ha un set fisso di elettrodi.
    """
    __tablename__ = "drilling_times"

    id = Column(Integer, primary_key=True)
    material_family = Column(String(50), nullable=False)
    electrode_diameter_mm = Column(Float, nullable=False)
    speed_mm_per_sec = Column(Float, nullable=False)
    notes = Column(Text)
    # Colonne legacy nel DB ma non mappate (Sprint 1.5 + Sprint 11):
    #   material_id, diameter_min_mm, diameter_max_mm, height_min_mm,
    #   height_max_mm, seconds_per_hole — il modello smette di leggerle.


# ─── Ordini materiali ──────────────────────────────────────────────────────

class MaterialOrder(Base):
    """Lista materiali da ordinare estratta da un set di preventivi completati.

    Non è l'ordine vero verso il fornitore (quello passa dal gestionale
    aziendale): è un documento di lavoro che aggrega i materiali grezzi
    dei preventivi selezionati, raggruppati per fornitore. All'apply:
    1. Crea questo record + righe in `material_order_quotes`
    2. Marca ogni quote selezionato con `material_ordered_at`
    3. Genera PDF + notifica
    """
    __tablename__ = "material_orders"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, server_default=func.now())
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_user_id])
    quotes = relationship(
        "Quote",
        secondary="material_order_quotes",
        backref="material_orders",
    )


class MaterialOrderQuote(Base):
    """Join table N:M tra MaterialOrder e Quote."""
    __tablename__ = "material_order_quotes"

    id = Column(Integer, primary_key=True)
    material_order_id = Column(Integer, ForeignKey("material_orders.id"), nullable=False)
    quote_id = Column(Integer, ForeignKey("quotes.id"), nullable=False)


# ─── Utensili (porting da legacy `utensili`) ───────────────────────────────

class ToolSupplier(Base):
    """Fornitori di utensili (es. Hypertools, UTF, OSG, Sandvik).

    Distinto da `Supplier` (fornitori di trattamenti/lavorazioni esterne
    come Haerta) e da `MaterialSupplier` (fornitori di materiale grezzo).
    Domini diversi, niente sovrapposizioni voluta dal cliente.
    """
    __tablename__ = "tool_suppliers"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    address = Column(Text, nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class ToolType(Base):
    """Catalogo Tipi utensile (es. Cilindrica, Sferica, Conica).
    Gestito da Settings → Catalogo → Attributi utensili. `Tool.tool_type` è
    una stringa libera che fa lookup per nome — niente FK per non rompere
    utensili esistenti se un Tipo viene rinominato/eliminato.
    """
    __tablename__ = "tool_types"
    id = Column(Integer, primary_key=True)
    name = Column(String(80), unique=True, nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class ToolBrand(Base):
    """Catalogo Marchi utensile (es. Sandvik, JJ Tools, OSG)."""
    __tablename__ = "tool_brands"
    id = Column(Integer, primary_key=True)
    name = Column(String(80), unique=True, nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class ToolLocation(Base):
    """Catalogo Posizioni magazzino utensili (es. 1-C-2)."""
    __tablename__ = "tool_locations"
    id = Column(Integer, primary_key=True)
    name = Column(String(80), unique=True, nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class Tool(Base):
    """Catalogo utensili officina con gestione scorta + low-stock alert.

    Migrazione dalla tabella `utensili` del MySQL legacy (PRV/Lavoro.sql).
    Nuova rispetto al legacy: FK ToolSupplier, audit timestamps, soft active.
    """
    __tablename__ = "tools"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    tool_type = Column(String(80))
    brand = Column(String(50))
    model = Column(String(80))
    # Colonna legacy `material` resta nel DB (SQLite no DROP COLUMN) ma non
    # più mappata dal modello: richiesta utente del 2026-05-11.
    diameter_mm = Column(Float, nullable=True)
    toroidal_mm = Column(Float, nullable=True)
    quantity = Column(Integer, default=0)
    minimum_quantity = Column(Integer, default=0)
    location = Column(String(50), nullable=True)
    # FK al nuovo elenco fornitori utensili. Colonna legacy `supplier_id`
    # (FK Supplier) resta nel DB ma non più mappata dal modello.
    tool_supplier_id = Column(Integer, ForeignKey("tool_suppliers.id"), nullable=True)
    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    tool_supplier = relationship("ToolSupplier")


class ToolOrder(Base):
    """Ordine utensili (snapshot del momento in cui si è generato il PDF).

    A differenza di MaterialOrder, qui salviamo uno snapshot dei dati
    (codice, marchio, fornitore, qty da ordinare) perché gli utensili
    sono in continuo aggiornamento e il PDF storico deve riflettere
    il momento esatto dell'ordine.
    """
    __tablename__ = "tool_orders"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, server_default=func.now())
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    triggered_by = Column(String(20), default='manual')  # 'manual' | 'weekly_auto'

    created_by = relationship("User", foreign_keys=[created_by_user_id])
    items = relationship(
        "ToolOrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="ToolOrderItem.id",
    )


class ToolOrderItem(Base):
    """Singolo utensile incluso in un ToolOrder. Snapshot dei dati."""
    __tablename__ = "tool_order_items"

    id = Column(Integer, primary_key=True)
    tool_order_id = Column(Integer, ForeignKey("tool_orders.id"), nullable=False)
    tool_id = Column(Integer, ForeignKey("tools.id"), nullable=True)  # null se utensile cancellato dopo

    # Snapshot al momento della creazione dell'ordine
    code_snapshot = Column(String(50), nullable=False)
    tool_type_snapshot = Column(String(80))
    brand_snapshot = Column(String(50))
    model_snapshot = Column(String(80))
    diameter_snapshot = Column(Float, nullable=True)
    supplier_name_snapshot = Column(String(100))   # nome ToolSupplier al momento
    quantity_at_time = Column(Integer, default=0)  # qty attuale al momento
    minimum_at_time = Column(Integer, default=0)
    quantity_to_order = Column(Integer, default=0) # max(min - qty, 1)

    order = relationship("ToolOrder", back_populates="items")


# ─── Officina (sezione documentazione operativa) ───────────────────────────

class OfficinaDocument(Base):
    """PDF cataloghi/schede consultabili dagli operatori in officina.

    Solo PDF (filtrato MIME server-side). Categoria libera con dropdown
    auto-popolato dai valori esistenti (pattern Tool attributi). Upload
    riservato a `officina.write` (admin + ufficio_tecnico), lettura a tutti
    gli operatori con permesso `officina`.
    """
    __tablename__ = "officina_documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    category = Column(String(80))                 # libera, popolata dai valori esistenti
    filename = Column(String(255), nullable=False)  # filename originale
    file_path = Column(String(500), nullable=False)  # path su disco (uploads/officina/)
    size_bytes = Column(Integer, default=0)
    uploaded_at = Column(DateTime, server_default=func.now())
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])


# ─── Event listeners ────────────────────────────────────────────────────────

@event.listens_for(PartFile, 'before_delete')
def _cleanup_partfile_blob(_mapper, _connection, target: PartFile) -> None:
    """Cancella il blob fisico in uploads/ quando il record PartFile viene eliminato.

    Trigger uniforme per:
      - DELETE /files/{file_id} (esplicito)
      - DELETE /parts/{id}    (cascade Part→PartFile)
      - DELETE /quotes/{id}   (cascade Quote→Part→PartFile)

    Senza questo listener i record DB vengono droppati dalla cascade ma i file
    su disco restano orfani in uploads/, causando leak storage e potenziale
    dati sensibili (DXF aziendali post-eliminazione preventivo).

    OSError non blocca il delete: se il file non esiste o non è accessibile,
    il record DB va comunque rimosso.
    """
    if not target.path:
        return
    try:
        if os.path.exists(target.path):
            os.remove(target.path)
    except OSError as e:
        logger.warning("Cleanup blob PartFile %s (%s) fallito: %s", target.id, target.path, e)


@event.listens_for(OfficinaDocument, 'before_delete')
def _cleanup_officina_doc_blob(_mapper, _connection, target: OfficinaDocument) -> None:
    """Stesso pattern di PartFile: pulisce il PDF su disco quando il record
    viene eliminato. OSError non blocca il delete."""
    if not target.file_path:
        return
    try:
        if os.path.exists(target.file_path):
            os.remove(target.file_path)
    except OSError as e:
        logger.warning("Cleanup blob OfficinaDocument %s (%s) fallito: %s", target.id, target.file_path, e)
