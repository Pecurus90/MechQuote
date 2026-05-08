from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
import os

from app.core.database import engine, Base
from app.core.security import get_current_user, require_role, require_permission
from app.models import (
    User, QuoteCategory, Customer, Quote, Part, PartFile, GeometryAnalysis,
    ManufacturingPhase, MaterialSupplier, Material, Machine, Treatment,
    Supplier, PhaseTemplate, StepColorRule, Role, RolePermission,
    Notification, NotificationRead, CompanySettings,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MechQuote API", version="1.0.0")

_allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_auth = [Depends(get_current_user)]
_admin = [require_role('admin')]
_backup = [require_permission('backup')]

from app.api import (
    auth, quotes, parts, phases, dashboard, pdf, backup, customers, quotes_archive,
    materials, machines, treatments, catalog, roles, notifications, company, activity,
)
app.include_router(auth.router)
app.include_router(auth.users_router, dependencies=_auth)
# quotes_archive MUST be registered before quotes to avoid /quotes/{id} swallowing /quotes/archive
app.include_router(quotes_archive.router, dependencies=_auth)
app.include_router(quotes.router, dependencies=_auth)
app.include_router(parts.router, dependencies=_auth)
app.include_router(phases.router, dependencies=_auth)
app.include_router(materials.router, dependencies=_auth)
app.include_router(machines.router, dependencies=_auth)
app.include_router(treatments.router, dependencies=_auth)
app.include_router(catalog.router, dependencies=_auth)
app.include_router(dashboard.router, dependencies=_auth)
app.include_router(pdf.router, dependencies=_auth)
app.include_router(backup.router, dependencies=_backup)
app.include_router(customers.router, dependencies=_auth)
app.include_router(roles.router, dependencies=_auth)
app.include_router(roles.permissions_router, dependencies=_auth)
app.include_router(notifications.router, dependencies=_auth)
app.include_router(company.router, dependencies=_auth)
app.include_router(activity.router, dependencies=_auth)


def _run_migrations():
    """Add new columns to existing tables without losing data."""
    migrations = [
        "ALTER TABLE quotes ADD COLUMN quote_type VARCHAR(20) DEFAULT 'single'",
        "ALTER TABLE quotes ADD COLUMN global_discount_percent FLOAT DEFAULT 0.0",
        "ALTER TABLE quotes ADD COLUMN transport_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE quotes ADD COLUMN packaging_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE parts ADD COLUMN rounding_rule VARCHAR(20) DEFAULT 'none'",
        "ALTER TABLE parts ADD COLUMN minimum_price FLOAT",
        "ALTER TABLE parts ADD COLUMN raw_diameter_mm FLOAT",
        "ALTER TABLE parts ADD COLUMN finished_weight_kg FLOAT",
        "ALTER TABLE parts ADD COLUMN raw_weight_kg FLOAT",
        "ALTER TABLE parts ADD COLUMN confidence_level VARCHAR(20) DEFAULT 'high'",
        "ALTER TABLE parts ADD COLUMN customer_notes TEXT",
        "ALTER TABLE parts ADD COLUMN internal_notes TEXT",
        "ALTER TABLE quotes ADD COLUMN currency VARCHAR(10) DEFAULT 'EUR'",
        "ALTER TABLE quotes ADD COLUMN validity_days INTEGER DEFAULT 30",
        "ALTER TABLE quotes ADD COLUMN delivery_text VARCHAR(200)",
        "ALTER TABLE quotes ADD COLUMN customer_reference VARCHAR(200)",
        "ALTER TABLE manufacturing_phases ADD COLUMN treatment_id INTEGER REFERENCES treatments(id)",
        "ALTER TABLE manufacturing_phases ADD COLUMN is_shared INTEGER DEFAULT 0",
        "ALTER TABLE phase_templates ADD COLUMN is_shared INTEGER DEFAULT 0",
        "ALTER TABLE parts ADD COLUMN material_delivery_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE materials ADD COLUMN supplier_id INTEGER REFERENCES material_suppliers(id)",
        "ALTER TABLE suppliers ADD COLUMN shipping_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE suppliers ADD COLUMN address TEXT",
        "ALTER TABLE treatments ADD COLUMN minimum_weight_kg FLOAT",
        "ALTER TABLE material_suppliers ADD COLUMN cutting_cost_per_part FLOAT DEFAULT 0.0",
        "ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'admin'",
        "ALTER TABLE users ADD COLUMN email VARCHAR(200)",
        # Workflow status migration — convert legacy English values to Italian
        "UPDATE quotes SET status = 'bozza' WHERE status = 'draft'",
        "UPDATE quotes SET status = 'inviato_cliente' WHERE status = 'sent'",
        "UPDATE quotes SET status = 'vinto' WHERE status = 'won'",
        "UPDATE quotes SET status = 'perso' WHERE status = 'lost'",
        # Ensure roles/role_permissions tables exist (also created by create_all)
        "CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY, name VARCHAR(50) UNIQUE NOT NULL, label VARCHAR(100) NOT NULL, color VARCHAR(20) DEFAULT 'gray')",
        "CREATE TABLE IF NOT EXISTS role_permissions (id INTEGER PRIMARY KEY, role_id INTEGER REFERENCES roles(id), permission_key VARCHAR(100) NOT NULL)",
        # FASE C — workflow interno semplificato (bozza|inviato|completato)
        "ALTER TABLE quotes ADD COLUMN submitted_by_user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE quotes ADD COLUMN submitted_at DATETIME",
        "ALTER TABLE quotes ADD COLUMN completed_by_user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE quotes ADD COLUMN completed_at DATETIME",
        # Collassa i vecchi stati al cliente / vinti / persi in 'completato'
        "UPDATE quotes SET status = 'completato' WHERE status IN ('inviato_cliente','vinto','perso')",
        # Pulizia permessi rimossi / rinominati
        "DELETE FROM role_permissions WHERE permission_key IN ('quotes.send_client','quotes.close')",
        # Inserisce 'quotes.complete' per admin e amministrazione (idempotente: prima cancella, poi reinserisce)
        "DELETE FROM role_permissions WHERE permission_key = 'quotes.complete'",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'quotes.complete' FROM roles WHERE name IN ('admin','amministrazione')",
        # FASE D — sistema notifiche generico (anche create_all li crea, qui per consistency)
        "CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, type VARCHAR(50) NOT NULL, title VARCHAR(200) NOT NULL, body TEXT, data_json JSON, created_by_user_id INTEGER REFERENCES users(id), target_roles JSON, target_user_id INTEGER REFERENCES users(id), requires_action BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS notification_reads (id INTEGER PRIMARY KEY, notification_id INTEGER REFERENCES notifications(id), user_id INTEGER REFERENCES users(id), read_at DATETIME, confirmed_at DATETIME)",
        "ALTER TABLE notification_reads ADD COLUMN dismissed_at DATETIME",
        # FASE C rifinitura — chi ha creato il preventivo (per controllo eliminazione)
        "ALTER TABLE quotes ADD COLUMN created_by_user_id INTEGER REFERENCES users(id)",
        # CompanySettings — singleton che sostituisce CostRule + 4 default attivi
        ("CREATE TABLE IF NOT EXISTS company_settings ("
         "id INTEGER PRIMARY KEY, name VARCHAR(200) DEFAULT '', address TEXT DEFAULT '', "
         "vat VARCHAR(50) DEFAULT '', phone VARCHAR(50) DEFAULT '', "
         "email VARCHAR(100) DEFAULT '', website VARCHAR(200) DEFAULT '', "
         "default_margin_percent FLOAT DEFAULT 20.0, default_minimum_part_price FLOAT DEFAULT 0.0, "
         "default_transport_cost FLOAT DEFAULT 0.0, default_packaging_cost FLOAT DEFAULT 0.0, "
         "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        # Migrazione idempotente: se non esiste il singleton, lo crea copiando i valori da cost_rules
        ("INSERT INTO company_settings (id, name, address, vat, phone, email, website, "
         "default_margin_percent, default_minimum_part_price, default_transport_cost, default_packaging_cost) "
         "SELECT 1, "
         "COALESCE((SELECT value FROM cost_rules WHERE key='company_name'), ''), "
         "COALESCE((SELECT value FROM cost_rules WHERE key='company_address'), ''), "
         "COALESCE((SELECT value FROM cost_rules WHERE key='company_vat'), ''), "
         "COALESCE((SELECT value FROM cost_rules WHERE key='company_phone'), ''), "
         "COALESCE((SELECT value FROM cost_rules WHERE key='company_email'), ''), "
         "COALESCE((SELECT value FROM cost_rules WHERE key='company_website'), ''), "
         "COALESCE(CAST((SELECT value FROM cost_rules WHERE key='default_margin_percent') AS FLOAT), 20.0), "
         "COALESCE(CAST((SELECT value FROM cost_rules WHERE key='minimum_part_price') AS FLOAT), 0.0), "
         "COALESCE(CAST((SELECT value FROM cost_rules WHERE key='transport_default') AS FLOAT), 0.0), "
         "COALESCE(CAST((SELECT value FROM cost_rules WHERE key='packaging_default') AS FLOAT), 0.0) "
         "WHERE NOT EXISTS (SELECT 1 FROM company_settings WHERE id=1)"),
        # Permesso 'company' aggiunto in audit#3 — di default solo admin
        "DELETE FROM role_permissions WHERE permission_key = 'company'",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'company' FROM roles WHERE name = 'admin'",
        # Pulizia preventivi orfani con quote_number NULL/'' (residui da test pre-validazione)
        "DELETE FROM quotes WHERE quote_number IS NULL OR quote_number = ''",
        # Dedupe notifiche quote_completed sotto race: target_quote_id + UNIQUE INDEX parziale.
        # Il secondo INSERT con stesso (type,target_user_id,target_quote_id) fallisce con IntegrityError.
        "ALTER TABLE notifications ADD COLUMN target_quote_id INTEGER REFERENCES quotes(id)",
        # Backfill: estrae quote_id da data_json per le righe esistenti
        ("UPDATE notifications SET target_quote_id = "
         "CAST(json_extract(data_json, '$.quote_id') AS INTEGER) "
         "WHERE target_quote_id IS NULL AND data_json IS NOT NULL"),
        # Pulizia duplicati esistenti (audit#4 ne aveva creati 7+ per qid 5,6,7,8...): tieni solo il primo
        ("DELETE FROM notifications WHERE id NOT IN ("
         "SELECT MIN(id) FROM notifications WHERE type='quote_completed' "
         "GROUP BY type, target_user_id, target_quote_id"
         ") AND type='quote_completed'"),
        # Pulizia notifiche orfane: target_quote_id punta a quote eliminato (id riciclato dal pool SQLite)
        ("DELETE FROM notifications "
         "WHERE target_quote_id IS NOT NULL "
         "AND target_quote_id NOT IN (SELECT id FROM quotes)"),
        # Pulizia notification_reads orfane: notification_id punta a notifiche cancellate.
        # Critico per evitare che id riciclati ereditino lo stato 'dismessa' del precedente record.
        ("DELETE FROM notification_reads "
         "WHERE notification_id NOT IN (SELECT id FROM notifications)"),
        # UNIQUE INDEX parziale: blocca INSERT duplicati per quote_completed
        ("CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_quote_completed "
         "ON notifications(type, target_user_id, target_quote_id) "
         "WHERE type='quote_completed' AND target_quote_id IS NOT NULL"),
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # column already exists


def _seed_categories():
    """Insert default quote categories if the table is empty."""
    from sqlalchemy.orm import Session
    from app.models import QuoteCategory

    with Session(engine) as db:
        if db.query(QuoteCategory).count() == 0:
            defaults = [
                QuoteCategory(code="A", name="Componenti meccanici", sort_order=1),
                QuoteCategory(code="B", name="Trance", sort_order=2),
                QuoteCategory(code="C", name="Blocco stampi", sort_order=3),
                QuoteCategory(code="D", name="Stampi progressivi", sort_order=4),
                QuoteCategory(code="E", name="Elettroerosione", sort_order=5),
                QuoteCategory(code="F", name="Attrezzature", sort_order=6),
                QuoteCategory(code="G", name="Altro", sort_order=7),
            ]
            db.add_all(defaults)
            db.commit()


def _seed_roles():
    """Insert default roles and permissions if the roles table is empty."""
    from sqlalchemy.orm import Session
    from app.models import Role, RolePermission
    from app.core.permissions import DEFAULT_ROLE_PERMISSIONS

    with Session(engine) as db:
        if db.query(Role).count() > 0:
            return
        role_defs = [
            ("admin",           "Amministratore",  "green"),
            ("ufficio_tecnico", "Ufficio Tecnico", "blue"),
            ("officina",        "Officina",        "gray"),
            ("amministrazione", "Amministrazione", "purple"),
        ]
        for name, label, color in role_defs:
            role = Role(name=name, label=label, color=color)
            db.add(role)
            db.flush()
            for key in DEFAULT_ROLE_PERMISSIONS.get(name, []):
                db.add(RolePermission(role_id=role.id, permission_key=key))
        db.commit()


_run_migrations()
_seed_categories()
_seed_roles()


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "MechQuote"}


os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
