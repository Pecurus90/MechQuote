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
    # Sprint G — tracking storico per calibrazione (post-completamento):
    # prezzo finale di vendita (post-trattativa col cliente) e consuntivo
    # reale a fine commessa. Compilabili solo su status='completato'.
    # Usati da find-similar per mostrare ratio venduto/preventivato e
    # cost-to-quoted, calibrazione passiva del cost engine.
    sold_price = Column(Float, nullable=True)
    actual_cost = Column(Float, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # order_by="Part.id" garantisce ordine stabile dopo refresh: senza, il
    # joinedload può restituire le parti in ordine non deterministico,
    # spostando visivamente la selezione dell'utente in QuoteEditor (commessa
    # multi-parte: cambiando un trattamento, la sidebar "saltava" su un'altra
    # parte perché `selectedPartIdx` puntava al nuovo ordine).
    parts = relationship("Part", back_populates="quote", cascade="all, delete-orphan",
                         order_by="Part.id")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    submitted_by = relationship("User", foreign_keys=[submitted_by_user_id])
    completed_by = relationship("User", foreign_keys=[completed_by_user_id])
    material_ordered_by = relationship("User", foreign_keys=[material_ordered_by_user_id])
    # Modulo Stampi: 1:1 con DieSpec (NULL se quote_type != 'die').
    die_spec = relationship("DieSpec", uselist=False, back_populates="quote",
                            cascade="all, delete-orphan")
    # Modulo Stampi: lista normalizzati a livello quote (NOT per piastra).
    die_normalized_items = relationship("DieNormalizedItem", back_populates="quote",
                                        cascade="all, delete-orphan")


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
    # Modulo Stampi: ruolo della piastra nel castello (cappello, porta_punzoni,
    # premilamiera, matrice, base, o custom). NULL per Part di preventivi standard.
    plate_role = Column(String(50))
    # Sprint B — snapshot dei parametri "tipici per ruolo" copiati dal
    # DieTemplatePlate al momento dell'apply-template. Usati da
    # `_estimate_die_plate_hours` per calcolare le ore meccaniche piastra
    # (setup + h/dm² × n_facce × area + station_bonus × n_stazioni).
    # Tutti NULL = fallback ai valori default-per-ruolo nel cost engine.
    die_setup_h = Column(Float)
    die_n_milled_faces = Column(Integer)
    die_n_ground_faces = Column(Integer)
    die_n_drilled_faces = Column(Integer)
    die_station_bonus_h = Column(Float)
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
    # is_shared: rimosso dal modello (era ambiguo, oggi divisor=qty sempre).
    # La colonna DB resta per retro-compatibilità (SQLite no DROP COLUMN).
    # Vedi docs/specs/16_legacy_columns.md.
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
    # MVP Stampi: il trattamento può fatturare a peso (€/kg) o a volume (€/dm³).
    # `cost_unit` discrimina; il cost engine usa cost_per_kg × peso oppure
    # cost_per_dm3 × volume in base a questo flag.
    cost_unit = Column(String(10), default='kg')  # 'kg' | 'dm3'
    cost_per_kg = Column(Float, default=0.0)
    cost_per_dm3 = Column(Float, default=0.0)
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


class NormalizedSupplier(Base):
    """Fornitori di componenti normalizzati: viti, bulloni, cuscinetti,
    dadi, rondelle, guarnizioni, raccordi... (es. Bossard, Würth, Misumi).

    Quarto tipo di fornitore (oltre a MaterialSupplier, Supplier per
    trattamenti, ToolSupplier). Domini distinti per scelta — un dado UNI
    non è materiale grezzo, non è utensile, non è trattamento.
    """
    __tablename__ = "normalized_suppliers"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    address = Column(Text, nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    # MVP Stampi L2: spedizione aggregata per supplier nei preventivi stampo.
    # Replica pattern di MaterialSupplier.shipping_cost. Per supplier con N
    # NormalizedItem nello stesso preventivo, lo shipping è "1 viaggio".
    shipping_cost = Column(Float, default=0.0)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class NormalizedItem(Base):
    """Catalogo voci normalizzate (viti, cuscinetti, molle, colonne, boccole...).

    Catalogo globale, indipendente da template/preventivi: una voce vive qui
    una sola volta e viene "pescata" via autocomplete da `DieTemplateNormalized`
    (BoM standard) e `DieNormalizedItem` (riga di preventivo stampo). La
    relazione e' snapshot (Opzione A del cantiere): al momento del collegamento
    description/supplier/unit_price vengono COPIATI nella riga, poi
    indipendenti. Cambi al catalogo non retro-modificano preventivi storici.
    """
    __tablename__ = "normalized_items"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(String(200), nullable=False)
    category = Column(String(50), nullable=True)
    supplier_id = Column(Integer, ForeignKey("normalized_suppliers.id"), nullable=True)
    unit_price = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    supplier = relationship("NormalizedSupplier")


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
    """Ordine utensili di UN fornitore (snapshot del momento di creazione).

    Un ordine = un fornitore: il gestionale tratta ogni fornitore come un
    ordine separato, quindi l'export CSV genera un file per fornitore.
    Salviamo uno snapshot dei dati (codice, marchio, qty da ordinare) perché
    gli utensili sono in continuo aggiornamento e il CSV storico deve
    riflettere il momento esatto dell'ordine.
    """
    __tablename__ = "tool_orders"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, server_default=func.now())
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    triggered_by = Column(String(20), default='manual')  # 'manual' | 'weekly_auto'
    supplier_name = Column(String(100), nullable=True)   # fornitore dell'ordine (snapshot)

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

class OfficinaCategory(Base):
    """Catalogo categorie documenti officina, con icona lucide-react.

    Gestita da admin (permesso `users`). I `OfficinaDocument.category` matchano
    per nome (stringa, niente FK per non rompere documenti esistenti).
    Le icone preselezionate vivono in `frontend/src/lib/icons.ts`.
    """
    __tablename__ = "officina_categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(80), unique=True, nullable=False)
    icon = Column(String(40), default='Folder')
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime, server_default=func.now())


class OfficinaDocument(Base):
    """File ufficio (PDF, Word, Excel, immagini, DXF) consultabili dall'officina.

    MIME filtrato server-side. Categoria matching per nome con
    `OfficinaCategory` (no FK rigida per retro-compatibilità). Upload
    riservato a `officina.write` (admin + ufficio_tecnico + amministrazione),
    lettura a tutti con permesso `officina`. PDF e immagini si aprono inline
    nel browser, DXF in modal con viewer integrato, altri si scaricano.
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
    # Linking opzionale a Customer / Supplier: permette raggruppamento per
    # cliente o fornitore nelle viste officina. Massimo 1 valorizzato per
    # record (mutex enforced lato UI/API, non a livello DB).
    # - customer_id: cataloghi/datasheet specifici per cliente
    # - material_supplier_id: cataloghi fornitori materiale grezzo
    # - tool_supplier_id: cataloghi fornitori utensili
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    material_supplier_id = Column(Integer, ForeignKey("material_suppliers.id"), nullable=True)
    tool_supplier_id = Column(Integer, ForeignKey("tool_suppliers.id"), nullable=True)
    normalized_supplier_id = Column(Integer, ForeignKey("normalized_suppliers.id"), nullable=True)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])
    customer = relationship("Customer", foreign_keys=[customer_id])
    material_supplier = relationship("MaterialSupplier", foreign_keys=[material_supplier_id])
    tool_supplier = relationship("ToolSupplier", foreign_keys=[tool_supplier_id])
    normalized_supplier = relationship("NormalizedSupplier", foreign_keys=[normalized_supplier_id])


class HeatTreatmentResult(Base):
    """Registro risultati tempra: misure pre/post trattamento e deformazioni.

    Tabella dati compilata a mano dall'operatore (una riga per pezzo trattato),
    consultabile in Officina. Read con permesso `officina`, scrittura con
    `officina.write` — stesso gating dei documenti. Le deformazioni (delta
    post-pre sulle misure) NON sono salvate: si derivano in UI dalle misure
    (DRY, una sola fonte di verità). Misure tutte opzionali: l'operatore
    registra solo i valori che ha. Temperature in °C, tempo rinvenimento in
    minuti, durezza testo libero (la dicitura "HRC" è aggiunta in UI).

    `shape` determina quali misure geometriche sono pertinenti:
    - 'tondo'    → Ø esterno + Ø interno + lunghezza
    - 'quadrato' → larghezza + altezza + lunghezza
    Le colonne non pertinenti alla forma restano NULL. La lunghezza è comune.
    """
    __tablename__ = "heat_treatment_results"

    id = Column(Integer, primary_key=True, index=True)
    material = Column(String(100), nullable=False)
    shape = Column(String(20), default='tondo')        # tondo | quadrato
    temp_insertion_c = Column(Float, nullable=True)   # gradi inserimento forno
    temp_quench_c = Column(Float, nullable=True)       # gradi tempra
    temp_temper_c = Column(Float, nullable=True)       # gradi rinvenimento
    temper_time_min = Column(Float, nullable=True)     # tempo rinvenimento (minuti)
    # Forma 'tondo': diametri esterno/interno
    outer_dia_pre_mm = Column(Float, nullable=True)
    outer_dia_post_mm = Column(Float, nullable=True)
    inner_dia_pre_mm = Column(Float, nullable=True)
    inner_dia_post_mm = Column(Float, nullable=True)
    # Forma 'quadrato': larghezza e altezza
    width_pre_mm = Column(Float, nullable=True)
    width_post_mm = Column(Float, nullable=True)
    height_pre_mm = Column(Float, nullable=True)
    height_post_mm = Column(Float, nullable=True)
    # Comune a entrambe le forme
    length_pre_mm = Column(Float, nullable=True)
    length_post_mm = Column(Float, nullable=True)
    hardness = Column(String(50), nullable=True)       # testo libero (scala inclusa)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_user_id])


# ─── Modulo Preventivatore Stampi Lamiera ───────────────────────────────────
# Quote esteso con quote_type='die' + 6 tabelle satellite.
# 1 Quote = 1 castello stampo; 1 Part = 1 piastra (riusa material/treatment/
# spedizioni del cost engine standard, con branch in recalculate_quote per
# trattamenti €/dm³).

class DieSpec(Base):
    """1:1 con Quote (quote_type='die'). Parametri non-piastre + snapshot costi."""
    __tablename__ = "die_specs"

    quote_id = Column(Integer, ForeignKey("quotes.id", ondelete="CASCADE"), primary_key=True)
    die_subtype = Column(String(20), nullable=False, default='passo')   # passo | blocco
    # Colonna `mode` esiste in DB ('rapid'|'detailed') ma è dormiente: la
    # modalità Rapida è stata rimossa. Vedi docs/specs/16_legacy_columns.md.

    # Geometria pezzo (da DXF bbox o manuale)
    bbox_x_mm = Column(Float, default=0.0)
    bbox_y_mm = Column(Float, default=0.0)
    sheet_thickness_mm = Column(Float, default=0.0)
    # Perimetro pezzo: driver chiave per stima ore EDM filo (matrice + estrattore +
    # punzoni sagomati). Da DXF (somma profili.length) o stimato a partire dal
    # bbox via `2*(X+Y)*complexity_factor`. NULL = il cost engine usa il fallback
    # bbox×complexity_factor invece del valore esplicito.
    perimeter_pezzo_mm = Column(Float)
    # Moltiplicatore complessità profilo per la stima del perimetro senza DXF.
    # 1.0 = rettangolare puro; 1.3 = sagoma media; 1.6 = sagoma complessa;
    # 1.9 = molto articolato. Default conservativo a 1.2.
    complexity_factor = Column(Float, default=1.2)

    # Striscia — passo
    n_stations = Column(Integer)
    pitch_mm = Column(Float)
    strip_offset_y_mm = Column(Float, default=0.0)

    # Striscia — blocco
    n_operations = Column(Integer)
    block_strip_offset_mm = Column(Float, default=0.0)

    # Ingombro castello (offset attorno alla striscia)
    castle_offset_x_mm = Column(Float)
    castle_offset_y_mm = Column(Float)

    # Difficoltà + feature
    difficulty = Column(String(20), default='base')                      # base | medium | hard
    n_bends_simple = Column(Integer, default=0)
    n_bends_medium = Column(Integer, default=0)
    n_bends_complex = Column(Integer, default=0)
    n_punches_simple = Column(Integer, default=0)
    n_punches_medium = Column(Integer, default=0)
    n_punches_complex = Column(Integer, default=0)

    # Misc (consegna, note, extras)
    delivery_days = Column(Integer)
    technical_notes = Column(Text)
    extras_amount = Column(Float, default=0.0)
    extras_description = Column(String(200))

    # Snapshot costi calcolati (popolati da recalculate_die_quote)
    cost_material = Column(Float, default=0.0)
    cost_normalized = Column(Float, default=0.0)
    cost_machining = Column(Float, default=0.0)
    cost_accessories = Column(Float, default=0.0)
    cost_industrial = Column(Float, default=0.0)
    # Sprint A — breakdown lavorazioni: cost_machining_edm è la stima delle ore
    # EDM filo per piastre stampo (matrice + porta_punzoni). Affiancato a
    # cost_machining (feature × coeff) durante taratura, in attesa di Sprint D
    # che farà cleanup del vecchio L3.
    cost_machining_edm = Column(Float, default=0.0)
    # Sprint B — breakdown lavorazioni meccaniche piastre (setup + h/dm² ×
    # n_facce + station_bonus). Sommato a cost_machining come gli altri
    # breakdown. Costo = ore_totali × hourly_rate_milling.
    cost_machining_mech = Column(Float, default=0.0)

    # Override "matita" sulle 4 voci L1-L4 (NULL = usa calcolato).
    # L'UI permette di forzare manualmente una voce; il cost engine la usa
    # al posto del calcolato per la riga di L5 industriale.
    override_material = Column(Float)
    override_normalized = Column(Float)
    override_machining = Column(Float)
    override_accessories = Column(Float)

    # Colonne `rapid_min`/`rapid_max` esistono in DB ma sono dormienti
    # (Modalità Rapida rimossa). Vedi docs/specs/16_legacy_columns.md.

    quote = relationship("Quote", back_populates="die_spec")


class DieNormalizedItem(Base):
    """Componente commerciale del preventivo stampo, aggregato a livello Quote
    (NON per piastra — semplifica UI/PDF). L2 cost engine somma qty × unit_price
    + shipping aggregato per NormalizedSupplier.shipping_cost."""
    __tablename__ = "die_normalized_items"

    id = Column(Integer, primary_key=True, index=True)
    quote_id = Column(Integer, ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False)
    normalized_supplier_id = Column(Integer, ForeignKey("normalized_suppliers.id"))
    description = Column(String(200), nullable=False)
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, default=0.0)
    notes = Column(Text)

    quote = relationship("Quote", back_populates="die_normalized_items")
    supplier = relationship("NormalizedSupplier")


class DieSettings(Base):
    """Singleton id=1 — tariffe + default + parametri Rapida del modulo Stampi.
    11 sezioni configurabili dall'UI Impostazioni Stampi."""
    __tablename__ = "die_settings"

    id = Column(Integer, primary_key=True, default=1)

    # 1. Tariffe orarie officina
    hourly_rate_milling = Column(Float, default=45.0)
    hourly_rate_grinding = Column(Float, default=50.0)
    hourly_rate_edm_wire = Column(Float, default=60.0)
    hourly_rate_edm_die = Column(Float, default=55.0)

    # 2+3. Costi pieghe + punzoni per fascia (€/unità, prima dei coeff dim/diff)
    cost_bend_simple = Column(Float, default=80.0)
    cost_bend_medium = Column(Float, default=160.0)
    cost_bend_complex = Column(Float, default=320.0)
    cost_punch_simple = Column(Float, default=120.0)
    cost_punch_medium = Column(Float, default=240.0)
    cost_punch_complex = Column(Float, default=480.0)

    # 4. Costo base per piastra (cost_per_plate_base × n_plates in L3)
    cost_per_plate_base = Column(Float, default=150.0)

    # 6. Moltiplicatori difficoltà globale
    diff_mult_base = Column(Float, default=1.0)
    diff_mult_medium = Column(Float, default=1.3)
    diff_mult_hard = Column(Float, default=1.7)

    # 7. Progettazione: ore CAD per difficoltà × tariffa €/h
    design_hours_base = Column(Float, default=8.0)
    design_hours_medium = Column(Float, default=16.0)
    design_hours_hard = Column(Float, default=32.0)
    design_hourly_rate = Column(Float, default=50.0)

    # 8. Forfait montaggio/collaudo per difficoltà
    assembly_forfeit_base = Column(Float, default=300.0)
    assembly_forfeit_medium = Column(Float, default=600.0)
    assembly_forfeit_hard = Column(Float, default=1200.0)

    # 9. Margine commerciale default
    default_margin_percent = Column(Float, default=30.0)

    # 10. Offset XY default per ingombro castello (mm)
    default_castle_offset_x_mm = Column(Float, default=80.0)
    default_castle_offset_y_mm = Column(Float, default=80.0)

    # 11. Driver EDM filo per piastre stampo (Sprint A)
    # Ciclo EDM di default per la stima ore (riusa CuttingCycle del modulo Wire EDM).
    # NULL → il cost engine usa il primo CuttingCycle attivo.
    wire_edm_cycle_id = Column(Integer, ForeignKey("cutting_cycles.id"))
    # Moltiplicatore: estrattore taglia una sagoma più piccola della matrice
    # (offset interno). Lunghezza EDM porta_punzoni = perimetro × n_stazioni × factor.
    edm_extractor_factor = Column(Float, default=0.6)
    # Moltiplicatore: punzoni sagomati (medium/complex) contribuiscono metri EDM
    # proporzionali al perimetro pezzo × questo factor.
    edm_punch_factor = Column(Float, default=0.3)

    # 12. Produttività MACCHINE officina per lavorazione piastre stampo (Sprint B).
    # Ore per dm² di superficie lavorata, per operazione. Sono parametri della
    # specifica officina (non della tipologia di stampo). Cambiando macchina,
    # cambia il numero.
    milling_h_per_dm2 = Column(Float, default=0.15)
    grinding_h_per_dm2 = Column(Float, default=0.10)
    drilling_h_per_dm2 = Column(Float, default=0.20)
    # Sprint B → Sprint F (re-purposed): large_plate_threshold/factor sono
    # dormienti — la scala piastre ora usa la tabella DieDimensionBracket
    # come lookup di fasce sull'area piastra. Colonne lasciate in DB per
    # retro-compatibilità (SQLite no DROP).
    large_plate_threshold_dm2 = Column(Float, default=80.0)
    large_plate_factor = Column(Float, default=1.25)

    # Sprint F — aggancio a Machine: se FK popolata, il cost engine usa
    # machine.hourly_rate al posto di hourly_rate_* sopra. Così aggiornare
    # la tariffa della macchina in Settings → Macchine propaga subito anche
    # ai preventivi stampo. FK NULL = fallback alle tariffe esplicite di
    # questo singleton (retro-compat).
    milling_machine_id = Column(Integer, ForeignKey("machines.id"))
    grinding_machine_id = Column(Integer, ForeignKey("machines.id"))
    drilling_machine_id = Column(Integer, ForeignKey("machines.id"))
    edm_wire_machine_id = Column(Integer, ForeignKey("machines.id"))

    # Sprint F — bonus design configurabile (era hardcoded 0.4 / 0.3).
    # Ore CAD extra per ogni piega / punzone, sommate alle design_hours[diff].
    design_h_per_bend = Column(Float, default=0.4)
    design_h_per_punch = Column(Float, default=0.3)

    # 5 colonne `rapid_*` esistono in DB ma sono dormienti (modalità Rapida
    # rimossa dal cost engine). Vedi docs/specs/16_legacy_columns.md.


class DieDimensionBracket(Base):
    """5. Fasce dimensionali castello — area dm² → coefficiente moltiplicativo L3.
    Lookup: `area_min ≤ area < area_max` (ultima fascia ha area_max=NULL).
    Numero fasce configurabile dall'UI."""
    __tablename__ = "die_dimension_brackets"

    id = Column(Integer, primary_key=True)
    label = Column(String(20), nullable=False)                # S, M, L, XL
    area_min_dm2 = Column(Float, nullable=False, default=0.0)
    area_max_dm2 = Column(Float)
    coefficient = Column(Float, nullable=False, default=1.0)
    sort_order = Column(Integer, default=0)


class DieTemplate(Base):
    """11. Template stampo. Il wizard creazione preventivo lo applica
    precompilando piastre + suggerimenti feature."""
    __tablename__ = "die_templates"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    die_subtype = Column(String(20), nullable=False, default='passo')
    suggested_stations = Column(Integer)
    suggested_pitch_mm = Column(Float)
    suggested_n_bends_simple = Column(Integer, default=0)
    suggested_n_bends_medium = Column(Integer, default=0)
    suggested_n_bends_complex = Column(Integer, default=0)
    suggested_n_punches_simple = Column(Integer, default=0)
    suggested_n_punches_medium = Column(Integer, default=0)
    suggested_n_punches_complex = Column(Integer, default=0)
    default_difficulty = Column(String(20), default='base')
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    plates = relationship("DieTemplatePlate", back_populates="template",
                          cascade="all, delete-orphan",
                          order_by="DieTemplatePlate.sort_order")
    # Sprint C — BoM normalizzati scalabile: il template dichiara la "ricetta"
    # commerciale standard (4 colonne, N molle, kit viti…) con formula di
    # quantità che scala con dimensioni/feature dello stampo. Auto-generato
    # come DieNormalizedItem al momento del POST /api/dies.
    normalized_items = relationship("DieTemplateNormalized", back_populates="template",
                                    cascade="all, delete-orphan",
                                    order_by="DieTemplateNormalized.sort_order")


class DieTemplatePlate(Base):
    """Riga piastra di un DieTemplate."""
    __tablename__ = "die_template_plates"

    id = Column(Integer, primary_key=True)
    template_id = Column(Integer, ForeignKey("die_templates.id", ondelete="CASCADE"), nullable=False)
    plate_role = Column(String(50), nullable=False)
    default_thickness_mm = Column(Float, default=0.0)
    default_material_id = Column(Integer, ForeignKey("materials.id"))
    default_treatment_id = Column(Integer, ForeignKey("treatments.id"))
    sort_order = Column(Integer, default=0)
    # Sprint B — costanti "tipiche per ruolo" usate per stimare le ore di
    # lavorazione meccanica della piastra. Copiate su Part al momento
    # dell'apply-template (snapshot). Modificabili dall'editor template stampi.
    setup_hours_fixed = Column(Float, default=0.4)        # bloccaggio + zero macchina
    n_milled_faces = Column(Integer, default=2)           # facce fresate
    n_ground_faces = Column(Integer, default=0)           # facce rettificate
    n_drilled_faces = Column(Integer, default=1)          # facce con foratura/filettatura
    station_bonus_hours = Column(Float, default=0.0)      # ore extra per stazione (matrice/porta_punzoni)

    template = relationship("DieTemplate", back_populates="plates")
    default_material = relationship("Material")
    default_treatment = relationship("Treatment")


class DieTemplateNormalized(Base):
    """Riga "BoM normalizzati di default" di un DieTemplate (Sprint C).

    Dichiara la ricetta commerciale standard (colonne, boccole, molle, viti,
    spine…). `quantity_formula` è una mini-espressione che scala il numero
    di pezzi con dimensioni/feature dello stampo, valutata server-side via
    `core.expression_eval` (no `eval`, whitelist nodi AST + variabili).

    Esempi: "4" (fissa), "n_stations * 2 + 4" (molle proporzionali alle
    stazioni), "4 if area_castello_dm2 < 30 else 6" (colonne più grandi se
    castello supera soglia).
    """
    __tablename__ = "die_template_normalized"

    id = Column(Integer, primary_key=True)
    template_id = Column(Integer, ForeignKey("die_templates.id", ondelete="CASCADE"), nullable=False)
    description = Column(String(200), nullable=False)
    normalized_supplier_id = Column(Integer, ForeignKey("normalized_suppliers.id"))
    quantity_formula = Column(String(100), default="1")
    unit_price_default = Column(Float, default=0.0)
    sort_order = Column(Integer, default=0)

    template = relationship("DieTemplate", back_populates="normalized_items")
    supplier = relationship("NormalizedSupplier")


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
