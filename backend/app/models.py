from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Integer,
    String, Text, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


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
    quote_number = Column(String(50), unique=True, index=True)
    quote_type = Column(String(20), default="single")   # single | commessa
    customer_id = Column(Integer, ForeignKey("customers.id"))
    customer_name = Column(String(200))
    customer_reference = Column(String(200))
    quote_date = Column(Date, server_default=func.now())

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
    submitted_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    completed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    parts = relationship("Part", back_populates="quote", cascade="all, delete-orphan")


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
    margin_percent = Column(Float)
    minimum_price = Column(Float)
    rounding_rule = Column(String(20), default="none")
    confidence_level = Column(String(20), default="high")
    customer_notes = Column(Text)
    internal_notes = Column(Text)
    total_cost = Column(Float, default=0.0)
    unit_price = Column(Float, default=0.0)
    total_price = Column(Float, default=0.0)

    quote = relationship("Quote", back_populates="parts")
    phases = relationship("ManufacturingPhase", back_populates="part",
                          cascade="all, delete-orphan", order_by="ManufacturingPhase.sequence_number")
    files = relationship("PartFile", back_populates="part", cascade="all, delete-orphan")
    geometry = relationship("GeometryAnalysis", back_populates="part",
                            uselist=False, cascade="all, delete-orphan")
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


class GeometryAnalysis(Base):
    __tablename__ = "geometry_analyses"

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    source_file_id = Column(Integer, ForeignKey("part_files.id"))
    bounding_box_x = Column(Float)
    bounding_box_y = Column(Float)
    bounding_box_z = Column(Float)
    volume_mm3 = Column(Float)
    surface_area_mm2 = Column(Float)
    detected_holes_count = Column(Integer, default=0)
    detected_pockets_count = Column(Integer, default=0)
    detected_colors_json = Column(JSON)
    dxf_total_length_mm = Column(Float)
    dxf_profile_count = Column(Integer, default=0)
    confidence_level = Column(String(20), default="high")
    warnings_json = Column(JSON)
    raw_analysis_json = Column(JSON)

    part = relationship("Part", back_populates="geometry")


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
    quantity_multiplier = Column(Float, default=1.0)
    fixed_cost = Column(Float, default=0.0)
    variable_cost_per_part = Column(Float, default=0.0)
    hourly_rate_override = Column(Float)
    calculated_cost = Column(Float, default=0.0)
    margin_percent_override = Column(Float)
    customer_visible = Column(Boolean, default=True)
    is_shared = Column(Boolean, default=False)
    internal_notes = Column(Text)
    customer_notes = Column(Text)

    treatment_id = Column(Integer, ForeignKey("treatments.id"), nullable=True)

    part = relationship("Part", back_populates="phases")
    machine = relationship("Machine")
    supplier = relationship("Supplier")
    treatment = relationship("Treatment")


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

    material_supplier = relationship("MaterialSupplier")


class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    machine_type = Column(String(50))
    hourly_rate = Column(Float, default=0.0)
    setup_minimum_hours = Column(Float, default=0.0)
    active = Column(Boolean, default=True)
    notes = Column(Text)


class Treatment(Base):
    __tablename__ = "treatments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    treatment_type = Column(String(50))
    fixed_cost = Column(Float, default=0.0)
    cost_per_kg = Column(Float, default=0.0)
    cost_per_part = Column(Float, default=0.0)
    cost_per_surface_area = Column(Float, default=0.0)
    minimum_cost = Column(Float, default=0.0)
    minimum_weight_kg = Column(Float, nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"))
    active = Column(Boolean, default=True)
    notes = Column(Text)

    supplier = relationship("Supplier")


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    supplier_type = Column(String(50))
    address = Column(Text, nullable=True)
    shipping_cost = Column(Float, default=0.0)
    notes = Column(Text)
    active = Column(Boolean, default=True)


class CostRule(Base):
    __tablename__ = "cost_rules"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), nullable=False, unique=True)
    value = Column(String(500))
    description = Column(Text)


class PhaseTemplate(Base):
    __tablename__ = "phase_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    phase_type = Column(String(50), nullable=False)
    default_machine_id = Column(Integer, ForeignKey("machines.id"))
    default_supplier_id = Column(Integer, ForeignKey("suppliers.id"))
    setup_hours = Column(Float, default=0.0)
    cycle_hours_per_part = Column(Float, default=0.0)
    fixed_cost = Column(Float, default=0.0)
    variable_cost_per_part = Column(Float, default=0.0)
    customer_visible = Column(Boolean, default=True)
    is_shared = Column(Boolean, default=False)
    notes = Column(Text)


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
    requires_action = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    reads = relationship("NotificationRead", back_populates="notification", cascade="all, delete-orphan")


class NotificationRead(Base):
    __tablename__ = "notification_reads"

    id = Column(Integer, primary_key=True)
    notification_id = Column(Integer, ForeignKey("notifications.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    read_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)

    notification = relationship("Notification", back_populates="reads")
