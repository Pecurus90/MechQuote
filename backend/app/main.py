from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
import logging
import os

# Logging strutturato base. Livello configurabile via env var.
# Override LOG_LEVEL=DEBUG per vedere SQL/dettagli, default INFO.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

from app.core.database import engine, Base
from app.core.rate_limit import limiter
from app.core.security import get_current_user, require_permission
from app.models import (
    User, QuoteCategory, Customer, Quote, Part, PartFile,
    ManufacturingPhase, MaterialSupplier, Material, Machine, Treatment,
    Supplier, StepColorRule, Role, RolePermission,
    Notification, NotificationRead, CompanySettings,
    EdmConfig, EdmCutSpeed, CuttingCycle, CuttingPass, DrillingTime,
    WorkflowTemplate, WorkflowTemplateStep, Operation,
    MaterialOrder, MaterialOrderQuote, Tool, ToolSupplier,
    ToolOrder, ToolOrderItem,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MechQuote API", version="1.0.0")

# Rate limiter (slowapi). Vedi `app/core/rate_limit.py`. L'handler
# 429 ritorna un detail in italiano coerente col resto delle API.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Troppi tentativi. Riprova tra qualche minuto."},
    )


_allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_auth = [Depends(get_current_user)]
_backup = [require_permission('backup')]

from app.api import (
    auth, quotes, parts, phases, dashboard, pdf, backup, customers, quotes_archive,
    materials, machines, treatments, catalog, roles, notifications, company, activity, edm, dxf,
    workflow_templates, operations, orders, tools, orders_tools, officina,
    normalized_suppliers,
    dies, die_normalized_items, die_settings,
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
app.include_router(edm.router, dependencies=_auth)
app.include_router(dxf.router, dependencies=_auth)
app.include_router(workflow_templates.router, dependencies=_auth)
app.include_router(operations.router, dependencies=_auth)
app.include_router(orders.router, dependencies=_auth)
app.include_router(tools.router, dependencies=_auth)
app.include_router(orders_tools.router, dependencies=_auth)
app.include_router(officina.router, dependencies=_auth)
app.include_router(normalized_suppliers.router, dependencies=_auth)
# Modulo Stampi — 3 router con prefix dedicato.
app.include_router(dies.router, dependencies=_auth)
app.include_router(die_normalized_items.router, dependencies=_auth)
app.include_router(die_settings.router, dependencies=_auth)


def _run_migrations():
    """Migrazioni manuali idempotenti applicate ad ogni boot.

    Ogni statement è in try/except: pass — gli ALTER TABLE falliscono se la
    colonna esiste già (no-op), gli UPDATE/DELETE sono idempotenti per
    costruzione (WHERE clause selettive). Vedi CLAUDE.md §6.

    Le sezioni sono ordinate cronologicamente per fase di sviluppo. L'ordine
    interno conta perché ci sono dipendenze (es. FK references); preserva
    l'ordine quando aggiungi nuove migrazioni.
    """
    migrations = [
        # ═══ Schema base — colonne aggiunte gradualmente ai modelli esistenti ═══
        "ALTER TABLE quotes ADD COLUMN quote_type VARCHAR(20) DEFAULT 'single'",
        "ALTER TABLE quotes ADD COLUMN global_discount_percent FLOAT DEFAULT 0.0",
        "ALTER TABLE quotes ADD COLUMN transport_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE quotes ADD COLUMN packaging_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE quotes ADD COLUMN currency VARCHAR(10) DEFAULT 'EUR'",
        "ALTER TABLE quotes ADD COLUMN validity_days INTEGER DEFAULT 30",
        "ALTER TABLE quotes ADD COLUMN delivery_text VARCHAR(200)",
        "ALTER TABLE quotes ADD COLUMN customer_reference VARCHAR(200)",
        "ALTER TABLE parts ADD COLUMN rounding_rule VARCHAR(20) DEFAULT 'none'",  # legacy, non più letto (audit B1)
        "ALTER TABLE parts ADD COLUMN minimum_price FLOAT",
        "ALTER TABLE parts ADD COLUMN raw_diameter_mm FLOAT",
        "ALTER TABLE parts ADD COLUMN finished_weight_kg FLOAT",
        "ALTER TABLE parts ADD COLUMN raw_weight_kg FLOAT",
        "ALTER TABLE parts ADD COLUMN confidence_level VARCHAR(20) DEFAULT 'high'",  # legacy, non più letto (audit B1)
        "ALTER TABLE parts ADD COLUMN customer_notes TEXT",
        "ALTER TABLE parts ADD COLUMN internal_notes TEXT",
        "ALTER TABLE parts ADD COLUMN material_delivery_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE manufacturing_phases ADD COLUMN treatment_id INTEGER REFERENCES treatments(id)",
        "ALTER TABLE manufacturing_phases ADD COLUMN is_shared INTEGER DEFAULT 0",
        # Note fase per DB legacy (audit Sprint A — H1). Su DB freschi
        # create_all() le aggiunge dal modello; per i DB pre-modello
        # queste ALTER sono il safety net (idempotente via try/pass).
        "ALTER TABLE manufacturing_phases ADD COLUMN internal_notes TEXT",
        "ALTER TABLE manufacturing_phases ADD COLUMN customer_notes TEXT",
        "ALTER TABLE materials ADD COLUMN supplier_id INTEGER REFERENCES material_suppliers(id)",
        "ALTER TABLE suppliers ADD COLUMN shipping_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE suppliers ADD COLUMN address TEXT",
        "ALTER TABLE treatments ADD COLUMN minimum_weight_kg FLOAT",
        "ALTER TABLE material_suppliers ADD COLUMN cutting_cost_per_part FLOAT DEFAULT 0.0",
        "ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'admin'",
        "ALTER TABLE users ADD COLUMN email VARCHAR(200)",

        # ═══ Status preventivo: legacy inglese → italiano, poi 3-stati ═══
        "UPDATE quotes SET status = 'bozza' WHERE status = 'draft'",
        "UPDATE quotes SET status = 'inviato_cliente' WHERE status = 'sent'",
        "UPDATE quotes SET status = 'vinto' WHERE status = 'won'",
        "UPDATE quotes SET status = 'perso' WHERE status = 'lost'",
        # Collassa stati intermedi nel modello a 3 stati (bozza|inviato|completato)
        "UPDATE quotes SET status = 'completato' WHERE status IN ('inviato_cliente','vinto','perso')",

        # ═══ Workflow tracking — chi-ha-fatto-cosa-quando ═══
        "ALTER TABLE quotes ADD COLUMN submitted_by_user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE quotes ADD COLUMN submitted_at DATETIME",
        "ALTER TABLE quotes ADD COLUMN completed_by_user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE quotes ADD COLUMN completed_at DATETIME",
        "ALTER TABLE quotes ADD COLUMN created_by_user_id INTEGER REFERENCES users(id)",
        # Pulizia preventivi orfani con quote_number NULL/'' (residui da test pre-validazione)
        "DELETE FROM quotes WHERE quote_number IS NULL OR quote_number = ''",

        # ═══ Sistema permessi dinamici: roles + role_permissions ═══
        "CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY, name VARCHAR(50) UNIQUE NOT NULL, label VARCHAR(100) NOT NULL, color VARCHAR(20) DEFAULT 'gray')",
        "CREATE TABLE IF NOT EXISTS role_permissions (id INTEGER PRIMARY KEY, role_id INTEGER REFERENCES roles(id), permission_key VARCHAR(100) NOT NULL)",
        # Cleanup permessi rimossi/rinominati
        "DELETE FROM role_permissions WHERE permission_key IN ('quotes.send_client','quotes.close')",
        # Pattern idempotente per assegnazione permesso (DELETE + INSERT seleziona ruoli):
        "DELETE FROM role_permissions WHERE permission_key = 'quotes.complete'",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'quotes.complete' FROM roles WHERE name IN ('admin','amministrazione')",
        "DELETE FROM role_permissions WHERE permission_key = 'company'",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'company' FROM roles WHERE name = 'admin'",

        # ═══ CompanySettings — singleton che sostituisce CostRule legacy ═══
        # La tabella cost_rules resta nel DB per backward compat con DB pre-CompanySettings:
        # alla prima migrazione, il SELECT FROM cost_rules sotto popola company_settings.id=1.
        # Su DB nuovi cost_rules può non esistere → la statement INSERT viene saltata via
        # try/except, e il singleton viene popolato con default da CompanySettings model.
        ("CREATE TABLE IF NOT EXISTS company_settings ("
         "id INTEGER PRIMARY KEY, name VARCHAR(200) DEFAULT '', address TEXT DEFAULT '', "
         "vat VARCHAR(50) DEFAULT '', phone VARCHAR(50) DEFAULT '', "
         "email VARCHAR(100) DEFAULT '', website VARCHAR(200) DEFAULT '', "
         "default_margin_percent FLOAT DEFAULT 20.0, default_minimum_part_price FLOAT DEFAULT 0.0, "
         "default_transport_cost FLOAT DEFAULT 0.0, default_packaging_cost FLOAT DEFAULT 0.0, "
         "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
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

        # ═══ Notifiche — schema + dedupe race conditions ═══
        "CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, type VARCHAR(50) NOT NULL, title VARCHAR(200) NOT NULL, body TEXT, data_json JSON, created_by_user_id INTEGER REFERENCES users(id), target_roles JSON, target_user_id INTEGER REFERENCES users(id), requires_action BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS notification_reads (id INTEGER PRIMARY KEY, notification_id INTEGER REFERENCES notifications(id), user_id INTEGER REFERENCES users(id), read_at DATETIME, confirmed_at DATETIME)",
        "ALTER TABLE notification_reads ADD COLUMN dismissed_at DATETIME",
        # target_quote_id + UNIQUE INDEX parziale: blocca duplicati di quote_completed sotto race
        "ALTER TABLE notifications ADD COLUMN target_quote_id INTEGER REFERENCES quotes(id)",
        # Backfill: estrae quote_id da data_json per le righe pre-target_quote_id
        ("UPDATE notifications SET target_quote_id = "
         "CAST(json_extract(data_json, '$.quote_id') AS INTEGER) "
         "WHERE target_quote_id IS NULL AND data_json IS NOT NULL"),
        # Pulizia duplicati pre-UNIQUE INDEX (audit#4 ne aveva creati 7+ per quote_id)
        ("DELETE FROM notifications WHERE id NOT IN ("
         "SELECT MIN(id) FROM notifications WHERE type='quote_completed' "
         "GROUP BY type, target_user_id, target_quote_id"
         ") AND type='quote_completed'"),
        # Pulizia notifiche orfane (target_quote_id punta a quote eliminato — id riciclato da SQLite)
        ("DELETE FROM notifications "
         "WHERE target_quote_id IS NOT NULL "
         "AND target_quote_id NOT IN (SELECT id FROM quotes)"),
        # Pulizia notification_reads orfane: critico per evitare che id riciclati ereditino lo stato 'dismessa'
        ("DELETE FROM notification_reads "
         "WHERE notification_id NOT IN (SELECT id FROM notifications)"),
        ("CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_quote_completed "
         "ON notifications(type, target_user_id, target_quote_id) "
         "WHERE type='quote_completed' AND target_quote_id IS NOT NULL"),

        # ═══ Wire EDM Step 1 — campi extra su ManufacturingPhase ═══
        # Popolati quando phase_type='wire_edm', altrimenti NULL → fallback al manuale.
        "ALTER TABLE manufacturing_phases ADD COLUMN cut_length_mm FLOAT",
        "ALTER TABLE manufacturing_phases ADD COLUMN cut_height_mm FLOAT",
        "ALTER TABLE manufacturing_phases ADD COLUMN cutting_cycle_id INTEGER REFERENCES cutting_cycles(id)",
        "ALTER TABLE manufacturing_phases ADD COLUMN n_pierce INTEGER",
        "ALTER TABLE manufacturing_phases ADD COLUMN dxf_profile_ids JSON",

        # ═══ Wire EDM Step 1.5 — EdmCutSpeed/DrillingTime indicizzati per famiglia ═══
        # Refactor da material_id (FK) a material_family (slug). La colonna material_id
        # legacy resta nel DB ma il modello smette di leggerla (CLAUDE.md §6: no DROP COLUMN).
        "ALTER TABLE edm_cut_speeds ADD COLUMN material_family VARCHAR(50)",
        "ALTER TABLE drilling_times ADD COLUMN material_family VARCHAR(50)",
        # Normalizza materials.family ai nuovi slug (idempotente: UPDATE no-op se già nuovo slug)
        "UPDATE materials SET family='alluminio'        WHERE LOWER(family) IN ('aluminum','aluminium')",
        "UPDATE materials SET family='acciaio_carbonio' WHERE LOWER(family) IN ('carbon steel','carbon_steel')",
        "UPDATE materials SET family='acciaio_inox'     WHERE LOWER(family) IN ('stainless steel','stainless_steel','stainless')",
        "UPDATE materials SET family='acciaio_utensili' WHERE LOWER(family) IN ('tool steel','tool_steel')",
        "UPDATE materials SET family='titanio'          WHERE LOWER(family) IN ('titanium')",
        "UPDATE materials SET family='ottone'           WHERE LOWER(family) IN ('brass')",
        "UPDATE materials SET family='rame'             WHERE LOWER(family) IN ('copper')",
        "UPDATE materials SET family='plastica'         WHERE LOWER(family) IN ('plastic','plastics')",
        "UPDATE materials SET family='carburi'          WHERE LOWER(family) IN ('carbide','carbides')",
        # Slug non riconosciuti diventano 'altro' (preservando i NULL)
        ("UPDATE materials SET family='altro' WHERE family IS NOT NULL "
         "AND family NOT IN ('acciaio_carbonio','acciaio_inox','acciaio_utensili','alluminio',"
         "'titanio','ottone','rame','plastica','carburi','altro')"),
        # Backfill material_family su righe esistenti via material_id legacy → materials.family
        ("UPDATE edm_cut_speeds SET material_family = "
         "(SELECT m.family FROM materials m WHERE m.id = edm_cut_speeds.material_id) "
         "WHERE material_family IS NULL AND material_id IS NOT NULL"),
        ("UPDATE drilling_times SET material_family = "
         "(SELECT m.family FROM materials m WHERE m.id = drilling_times.material_id) "
         "WHERE material_family IS NULL AND material_id IS NOT NULL"),

        # ═══ Sprint 11 — DrillingTime redesigned (electrode_diameter + mm/sec) ═══
        # Schema vecchio (range Ø + range altezza + seconds_per_hole) sostituito da:
        # lookup discreto su (family, electrode_diameter) + velocità lineare. Calcolo
        # tempo_foro = part.cut_height / row.speed_mm_per_sec.
        "ALTER TABLE drilling_times ADD COLUMN electrode_diameter_mm FLOAT",
        "ALTER TABLE drilling_times ADD COLUMN speed_mm_per_sec FLOAT",

        # ═══ Sprint 11.5 — Foratrice EDM dedicata su EdmConfig ═══
        # Macchina di default usata dal wizard 2D in modalità "Foratrice EDM"
        # per popolare automaticamente la fase Foratura del preventivo.
        "ALTER TABLE edm_config ADD COLUMN default_drilling_machine_id INTEGER REFERENCES machines(id)",

        # ═══ Sprint 12 — Machine: costo orario attrezzaggio separato ═══
        # In azienda l'attrezzaggio costa meno della lavorazione (operatore senza
        # macchina in produzione). Cost engine: setup_cost = setup_hours ×
        # (setup_hourly_rate ?? hourly_rate). NULL → fallback a hourly_rate.
        "ALTER TABLE machines ADD COLUMN setup_hourly_rate FLOAT",

        # ═══ Operation (catalogo Lavorazioni utente) ═══
        # Tabella libera, gestita dall'utente da UI. Sostituisce l'enum
        # PHASE_TYPES hardcoded. Il cost engine non dipende più da questa:
        # behavior speciali dedotti da machine.machine_type (autocalc EDM)
        # e da treatment_id (fasi trattamento).
        # DROP & ricreo: schema cambiato (phase_type rimosso). Nessun dato
        # utente reale da preservare in questa fase del progetto.
        "DROP TABLE IF EXISTS workflow_template_steps",
        "DROP TABLE IF EXISTS workflow_templates",
        "DROP TABLE IF EXISTS phase_templates",  # rimosso
        "DROP TABLE IF EXISTS operations",
        ("CREATE TABLE operations ("
         "id INTEGER PRIMARY KEY, "
         "name VARCHAR(100) UNIQUE NOT NULL, "
         "active BOOLEAN DEFAULT 1)"),
        # Aggiungo operation_id su manufacturing_phases. La colonna potrebbe
        # già esistere come legacy (Sprint 13c volumetric smontato): try/except
        # del runner ALTER TABLE coprirà il "duplicate column" silenziosamente.
        "ALTER TABLE manufacturing_phases ADD COLUMN operation_id INTEGER REFERENCES operations(id)",
        ("CREATE TABLE workflow_templates ("
         "id INTEGER PRIMARY KEY, "
         "name VARCHAR(100) NOT NULL, "
         "description TEXT, "
         "active BOOLEAN DEFAULT 1)"),
        ("CREATE TABLE workflow_template_steps ("
         "id INTEGER PRIMARY KEY, "
         "workflow_id INTEGER NOT NULL REFERENCES workflow_templates(id), "
         "sequence_number INTEGER NOT NULL, "
         "machine_id INTEGER REFERENCES machines(id), "
         "operation_id INTEGER NOT NULL REFERENCES operations(id))"),

        # ═══ Utensili (porting legacy `utensili`) ═══
        ("CREATE TABLE IF NOT EXISTS tools ("
         "id INTEGER PRIMARY KEY, "
         "code VARCHAR(50) UNIQUE NOT NULL, "
         "tool_type VARCHAR(80), brand VARCHAR(50), model VARCHAR(80), "
         "material VARCHAR(50), diameter_mm FLOAT, toroidal_mm FLOAT, "
         "quantity INTEGER DEFAULT 0, minimum_quantity INTEGER DEFAULT 0, "
         "location VARCHAR(50), supplier_id INTEGER REFERENCES suppliers(id), "
         "notes TEXT, active BOOLEAN DEFAULT 1, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
         "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        "DELETE FROM role_permissions WHERE permission_key = 'tools'",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'tools' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione','officina')",

        # ═══ Refactor utensili: ToolSupplier separato da Supplier ═══
        # I fornitori di utensili (Hypertools, UTF, OSG) sono distinti dai
        # fornitori esterni di trattamenti (Haerta). Nuova tabella +
        # nuova colonna su tools. La vecchia tools.supplier_id resta nel DB
        # ma il modello smette di leggerla (CLAUDE.md §6: no DROP COLUMN).
        ("CREATE TABLE IF NOT EXISTS tool_suppliers ("
         "id INTEGER PRIMARY KEY, "
         "name VARCHAR(100) NOT NULL, "
         "address TEXT, phone VARCHAR(50), email VARCHAR(100), "
         "notes TEXT, active BOOLEAN DEFAULT 1, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        "ALTER TABLE tools ADD COLUMN tool_supplier_id INTEGER REFERENCES tool_suppliers(id)",

        # ═══ Storico ordini utensili (snapshot) ═══
        ("CREATE TABLE IF NOT EXISTS tool_orders ("
         "id INTEGER PRIMARY KEY, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
         "created_by_user_id INTEGER REFERENCES users(id), "
         "triggered_by VARCHAR(20) DEFAULT 'manual')"),
        ("CREATE TABLE IF NOT EXISTS tool_order_items ("
         "id INTEGER PRIMARY KEY, "
         "tool_order_id INTEGER NOT NULL REFERENCES tool_orders(id), "
         "tool_id INTEGER REFERENCES tools(id), "
         "code_snapshot VARCHAR(50) NOT NULL, "
         "tool_type_snapshot VARCHAR(80), brand_snapshot VARCHAR(50), "
         "model_snapshot VARCHAR(80), diameter_snapshot FLOAT, "
         "supplier_name_snapshot VARCHAR(100), "
         "quantity_at_time INTEGER DEFAULT 0, "
         "minimum_at_time INTEGER DEFAULT 0, "
         "quantity_to_order INTEGER DEFAULT 0)"),

        # ═══ Ordini materiali ═══
        # Tracking ordine materiale sui quote + tabella MaterialOrder per
        # storico degli ordini fatti (con quotes inclusi via join m2m).
        "ALTER TABLE quotes ADD COLUMN material_ordered_at DATETIME",
        "ALTER TABLE quotes ADD COLUMN material_ordered_by_user_id INTEGER REFERENCES users(id)",

        # Sprint G — tracking storico: prezzo finale di vendita + consuntivo.
        "ALTER TABLE quotes ADD COLUMN sold_price FLOAT",
        "ALTER TABLE quotes ADD COLUMN actual_cost FLOAT",
        ("CREATE TABLE IF NOT EXISTS material_orders ("
         "id INTEGER PRIMARY KEY, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
         "created_by_user_id INTEGER REFERENCES users(id))"),
        ("CREATE TABLE IF NOT EXISTS material_order_quotes ("
         "id INTEGER PRIMARY KEY, "
         "material_order_id INTEGER NOT NULL REFERENCES material_orders(id), "
         "quote_id INTEGER NOT NULL REFERENCES quotes(id))"),
        # Permesso orders.materials → admin + ufficio_tecnico + amministrazione
        "DELETE FROM role_permissions WHERE permission_key = 'orders.materials'",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'orders.materials' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione')",

        # ═══ Conto lavoro: materiale fornito dal cliente ═══
        # Flag boolean su Part. Quando True il cost engine azzera material
        # costs (materiale + spedizione + taglio). Le info dimensionali
        # restano per autocalc EDM e PDF.
        "ALTER TABLE parts ADD COLUMN customer_supplied_material INTEGER DEFAULT 0",

        # ═══ Materiale a magazzino (override shipping/cutting) ═══
        # Secondo flag mutex con customer_supplied_material. Quando True il
        # cost engine usa stock_shipping_cost/stock_cutting_cost_per_part da
        # CompanySettings invece di shipping/cutting del fornitore abituale.
        # Il costo grezzo (vol×densità×€/kg×scrap) resta applicato.
        "ALTER TABLE parts ADD COLUMN material_from_stock INTEGER DEFAULT 0",
        "ALTER TABLE company_settings ADD COLUMN stock_shipping_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE company_settings ADD COLUMN stock_cutting_cost_per_part FLOAT DEFAULT 0.0",

        # ═══ Sezione Officina (documenti, tabelle reference, calcolatori) ═══
        # Permessi: 'officina' (read), 'officina.write' (upload + modifiche).
        # Read: admin + ufficio_tecnico + amministrazione + officina.
        # Write: admin + ufficio_tecnico (l'officinista consulta soltanto).
        "DELETE FROM role_permissions WHERE permission_key IN ('officina', 'officina.write')",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'officina' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione','officina')",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'officina.write' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione')",

        ("CREATE TABLE IF NOT EXISTS officina_documents ("
         "id INTEGER PRIMARY KEY, "
         "title VARCHAR(200) NOT NULL, "
         "category VARCHAR(80), "
         "filename VARCHAR(255) NOT NULL, "
         "file_path VARCHAR(500) NOT NULL, "
         "size_bytes INTEGER DEFAULT 0, "
         "uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
         "uploaded_by_user_id INTEGER REFERENCES users(id))"),

        # Scheda tecnica PDF per Material (1 PDF allegato, opzionale).
        # Path al blob in uploads/officina/materiali/. Gestito da
        # /api/materials/{id}/datasheet (upload/download/delete).
        "ALTER TABLE materials ADD COLUMN datasheet_path VARCHAR(500)",

        # Catalogo categorie officina (con icona lucide-react). Gestito da
        # admin via UI; i documenti matchano per nome stringa (no FK
        # rigida per retro-compat). Seed da categorie esistenti.
        ("CREATE TABLE IF NOT EXISTS officina_categories ("
         "id INTEGER PRIMARY KEY, "
         "name VARCHAR(80) UNIQUE NOT NULL, "
         "icon VARCHAR(40) DEFAULT 'Folder', "
         "sort_order INTEGER DEFAULT 100, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        "INSERT OR IGNORE INTO officina_categories (name, icon) SELECT DISTINCT category, 'Folder' FROM officina_documents WHERE category IS NOT NULL AND TRIM(category) != ''",

        # Linking documento ↔ cliente per raggruppamento nelle viste officina
        # (es. datasheet per cliente). FK opzionale.
        "ALTER TABLE officina_documents ADD COLUMN customer_id INTEGER REFERENCES customers(id)",
        # Linking opzionale anche a fornitori materiali e utensili (cataloghi
        # produttori). Mutex con customer_id e tra loro.
        "ALTER TABLE officina_documents ADD COLUMN material_supplier_id INTEGER REFERENCES material_suppliers(id)",
        "ALTER TABLE officina_documents ADD COLUMN tool_supplier_id INTEGER REFERENCES tool_suppliers(id)",

        # Fornitori di componenti normalizzati (viti, bulloni, cuscinetti...)
        # Quarto tipo di fornitore, distinto dagli altri 3.
        ("CREATE TABLE IF NOT EXISTS normalized_suppliers ("
         "id INTEGER PRIMARY KEY, "
         "name VARCHAR(100) NOT NULL, "
         "address TEXT, "
         "phone VARCHAR(50), "
         "email VARCHAR(100), "
         "notes TEXT, "
         "active BOOLEAN DEFAULT 1, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        "ALTER TABLE officina_documents ADD COLUMN normalized_supplier_id INTEGER REFERENCES normalized_suppliers(id)",

        # ═══ Attributi utensili (Tipo / Marchio / Posizione) ═══
        # Tabelle di catalogo gestite da Settings → Attributi utensili.
        # Tool.tool_type / brand / location restano stringhe libere; queste
        # tabelle servono solo come registry per popolare i dropdown.
        ("CREATE TABLE IF NOT EXISTS tool_types ("
         "id INTEGER PRIMARY KEY, "
         "name VARCHAR(80) UNIQUE NOT NULL, "
         "active BOOLEAN DEFAULT 1, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        ("CREATE TABLE IF NOT EXISTS tool_brands ("
         "id INTEGER PRIMARY KEY, "
         "name VARCHAR(80) UNIQUE NOT NULL, "
         "active BOOLEAN DEFAULT 1, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        ("CREATE TABLE IF NOT EXISTS tool_locations ("
         "id INTEGER PRIMARY KEY, "
         "name VARCHAR(80) UNIQUE NOT NULL, "
         "active BOOLEAN DEFAULT 1, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        # Seed: estrai i valori distinti già presenti negli utensili.
        # INSERT OR IGNORE → idempotente (UNIQUE su name).
        "INSERT OR IGNORE INTO tool_types (name, active) SELECT DISTINCT tool_type, 1 FROM tools WHERE tool_type IS NOT NULL AND TRIM(tool_type) != ''",
        "INSERT OR IGNORE INTO tool_brands (name, active) SELECT DISTINCT brand, 1 FROM tools WHERE brand IS NOT NULL AND TRIM(brand) != ''",
        "INSERT OR IGNORE INTO tool_locations (name, active) SELECT DISTINCT location, 1 FROM tools WHERE location IS NOT NULL AND TRIM(location) != ''",

        # ═══ Cleanup tools.supplier_id legacy (refactor Sprint 1 audit) ═══
        # Colonna legacy del modello pre-ToolSupplier — non più mappata
        # (CLAUDE.md §4) ma i DB legacy hanno ancora 305 valori orphan che
        # puntavano a suppliers (trattamenti) per migrazione MySQL imperfetta.
        # Nullifica per pulizia FK. La colonna resta nel DB (SQLite no DROP).
        "UPDATE tools SET supplier_id = NULL WHERE supplier_id IS NOT NULL",

        # ═══ Cleanup tabella `cost_rules` legacy (audit sprint E) ═══
        # Sostituita da CompanySettings (singleton id=1) da molto tempo.
        # Il backfill INSERT INTO company_settings ... SELECT FROM cost_rules
        # qui sopra è già stato eseguito su tutti i DB di prod (la condizione
        # WHERE NOT EXISTS company_settings.id=1 lo rende no-op da boot ≥2).
        # Posso droppare la tabella senza perdere dati: il singleton ne ha
        # ricopiato anagrafica + 4 default operativi. Idempotente: IF EXISTS.
        "DROP TABLE IF EXISTS cost_rules",

        # ═══ Cleanup permesso 'users' dai ruoli non-admin (audit sicurezza) ═══
        # Il default in DEFAULT_ROLE_PERMISSIONS (permissions.py) non assegna
        # 'users' a officina/ufficio_tecnico/amministrazione: solo admin
        # gestisce utenti. Alcuni DB hanno il permesso assegnato per anomalia
        # di seed o configurazione manuale. Combinato con la possibilità di
        # creare/modificare utenti via POST /api/users + role='admin',
        # apriva una privilege escalation reale (dimostrata in audit).
        # Idempotente: DELETE no-op se il permesso non è assegnato.
        "DELETE FROM role_permissions WHERE permission_key='users' AND role_id IN (SELECT id FROM roles WHERE name != 'admin')",

        # ═══ Indici su FK (audit DB — performance a regime) ═══
        # SQLite crea automaticamente indici sui PK ma NON sulle FK.
        # Query frequenti che filtrano su FK fanno full table scan: oggi
        # invisibile (dataset piccolo, sub-15ms), ma cresce O(n). Aggiungo
        # indici sulle FK più trafficate dai pattern di accesso noti:
        # - Quote → Part → ManufacturingPhase / PartFile (load detail)
        # - Quote.customer_id (filtri per cliente)
        # - NotificationRead.* (dedup + lista per utente)
        # - MaterialOrderQuote.* (join M2M ordini ↔ preventivi)
        # - ToolOrderItem.tool_order_id (load ordine utensili)
        # IF NOT EXISTS → idempotenti.
        "CREATE INDEX IF NOT EXISTS idx_parts_quote_id ON parts(quote_id)",
        "CREATE INDEX IF NOT EXISTS idx_manufacturing_phases_part_id ON manufacturing_phases(part_id)",
        "CREATE INDEX IF NOT EXISTS idx_part_files_part_id ON part_files(part_id)",
        "CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id)",
        "CREATE INDEX IF NOT EXISTS idx_notification_reads_notification_id ON notification_reads(notification_id)",
        "CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON notification_reads(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_material_order_quotes_order_id ON material_order_quotes(material_order_id)",
        "CREATE INDEX IF NOT EXISTS idx_material_order_quotes_quote_id ON material_order_quotes(quote_id)",
        "CREATE INDEX IF NOT EXISTS idx_tool_order_items_order_id ON tool_order_items(tool_order_id)",

        # ═══ ACL: quotes.view_all ═══
        # Permesso per vedere TUTTI i preventivi (non solo i propri). Senza,
        # GET /api/quotes e /api/quotes/archive filtrano su created_by_user_id.
        # Assegnato a admin + amministrazione: l'ufficio tecnico/officina
        # vede solo i preventivi che ha creato lui.
        "DELETE FROM role_permissions WHERE permission_key = 'quotes.view_all'",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'quotes.view_all' FROM roles WHERE name IN ('admin','amministrazione')",

        # ═══ Preventivatore Stampi Lamiera — Schema fresh (Fase 1, 2026-05-16) ═══
        # Rollback delle tabelle legacy MVP1+2+3 già eseguito nel commit
        # precedente (DROP IF EXISTS sulle vecchie die_quote_specs/normalized_items/...
        # ora rimosse anche da `quotes` con quote_type='die').
        # Le tabelle nuove (die_specs, die_normalized_items, die_settings,
        # die_dimension_brackets, die_templates, die_template_plates) vengono
        # create da SQLAlchemy create_all() ai modelli definiti in models.py.
        # Qui aggiungiamo solo:
        # - ALTER su treatments per cost_unit + cost_per_dm3 (Fase 1.1)
        # - ALTER su normalized_suppliers per shipping_cost (Fase 1.2)
        # - INSERT OR IGNORE + UPDATE COALESCE su die_settings singleton
        # - Seed 4 fasce dimensionali castello
        # - Seed 5 template default + piastre standard
        # - Permessi dies.* + ruoli (Fase 1.6)

        # 1.1 Treatment: cost_unit (kg|dm3) + cost_per_dm3
        "ALTER TABLE treatments ADD COLUMN cost_unit VARCHAR(10) DEFAULT 'kg'",
        "ALTER TABLE treatments ADD COLUMN cost_per_dm3 FLOAT DEFAULT 0",
        "UPDATE treatments SET cost_unit='kg' WHERE cost_unit IS NULL OR cost_unit=''",

        # 1.2 NormalizedSupplier: shipping_cost
        "ALTER TABLE normalized_suppliers ADD COLUMN shipping_cost FLOAT DEFAULT 0",

        # Sprint A — driver EDM filo per piastre stampo:
        # DieSpec.perimeter_pezzo_mm (NULL = fallback bbox×factor)
        # DieSpec.complexity_factor (default 1.2)
        "ALTER TABLE die_specs ADD COLUMN perimeter_pezzo_mm FLOAT",
        "ALTER TABLE die_specs ADD COLUMN complexity_factor FLOAT DEFAULT 1.2",
        "UPDATE die_specs SET complexity_factor = 1.2 WHERE complexity_factor IS NULL",
        "ALTER TABLE die_specs ADD COLUMN cost_machining_edm FLOAT DEFAULT 0",
        "ALTER TABLE die_specs ADD COLUMN cost_machining_mech FLOAT DEFAULT 0",
        # DieSettings.wire_edm_cycle_id (FK opz a CuttingCycle, default NULL → primo attivo)
        # DieSettings.edm_extractor_factor (default 0.6)
        # DieSettings.edm_punch_factor (default 0.3)
        "ALTER TABLE die_settings ADD COLUMN wire_edm_cycle_id INTEGER",
        "ALTER TABLE die_settings ADD COLUMN edm_extractor_factor FLOAT DEFAULT 0.6",
        "ALTER TABLE die_settings ADD COLUMN edm_punch_factor FLOAT DEFAULT 0.3",

        # Sprint B — produttività MACCHINE officina (h/dm² per operazione) + scala
        # piastre extra-large. Valori pensati per fresa/rettifica/foratura tipiche
        # di un'officina stampi (calibrabili dall'UI).
        "ALTER TABLE die_settings ADD COLUMN milling_h_per_dm2 FLOAT DEFAULT 0.15",
        "ALTER TABLE die_settings ADD COLUMN grinding_h_per_dm2 FLOAT DEFAULT 0.10",
        "ALTER TABLE die_settings ADD COLUMN drilling_h_per_dm2 FLOAT DEFAULT 0.20",
        "ALTER TABLE die_settings ADD COLUMN large_plate_threshold_dm2 FLOAT DEFAULT 80.0",
        "ALTER TABLE die_settings ADD COLUMN large_plate_factor FLOAT DEFAULT 1.25",

        # Sprint F — aggancio Machine alle 4 tariffe per operazione (FK opz).
        # NULL = fallback alle hourly_rate_* esplicite (retro-compat).
        "ALTER TABLE die_settings ADD COLUMN milling_machine_id INTEGER",
        "ALTER TABLE die_settings ADD COLUMN grinding_machine_id INTEGER",
        "ALTER TABLE die_settings ADD COLUMN drilling_machine_id INTEGER",
        "ALTER TABLE die_settings ADD COLUMN edm_wire_machine_id INTEGER",

        # Sprint F — bonus design configurabile (era hardcoded in calculation.py).
        "ALTER TABLE die_settings ADD COLUMN design_h_per_bend FLOAT DEFAULT 0.4",
        "ALTER TABLE die_settings ADD COLUMN design_h_per_punch FLOAT DEFAULT 0.3",

        # Sprint B — costanti "tipiche per ruolo" su DieTemplatePlate.
        "ALTER TABLE die_template_plates ADD COLUMN setup_hours_fixed FLOAT DEFAULT 0.4",
        "ALTER TABLE die_template_plates ADD COLUMN n_milled_faces INTEGER DEFAULT 2",
        "ALTER TABLE die_template_plates ADD COLUMN n_ground_faces INTEGER DEFAULT 0",
        "ALTER TABLE die_template_plates ADD COLUMN n_drilled_faces INTEGER DEFAULT 1",
        "ALTER TABLE die_template_plates ADD COLUMN station_bonus_hours FLOAT DEFAULT 0.0",

        # Sprint B — snapshot su Part (NULL = fallback default per ruolo nel cost engine).
        "ALTER TABLE parts ADD COLUMN die_setup_h FLOAT",
        "ALTER TABLE parts ADD COLUMN die_n_milled_faces INTEGER",
        "ALTER TABLE parts ADD COLUMN die_n_ground_faces INTEGER",
        "ALTER TABLE parts ADD COLUMN die_n_drilled_faces INTEGER",
        "ALTER TABLE parts ADD COLUMN die_station_bonus_h FLOAT",

        # Sprint C — BoM normalizzati scalabile sul DieTemplate.
        # create_all() crea la tabella su DB freschi; questo IF NOT EXISTS
        # copre i DB legacy + è no-op idempotente.
        ("CREATE TABLE IF NOT EXISTS die_template_normalized ("
         "id INTEGER PRIMARY KEY, "
         "template_id INTEGER NOT NULL REFERENCES die_templates(id) ON DELETE CASCADE, "
         "description VARCHAR(200) NOT NULL, "
         "normalized_supplier_id INTEGER REFERENCES normalized_suppliers(id), "
         "quantity_formula VARCHAR(100) DEFAULT '1', "
         "unit_price_default FLOAT DEFAULT 0.0, "
         "sort_order INTEGER DEFAULT 0"
         ")"),

        # Backfill default per ruolo su template_plates già seedati (idempotente).
        # Cappello/base hanno carico più leggero; matrice/porta_punzoni più pesante.
        ("UPDATE die_template_plates SET "
         "setup_hours_fixed = 0.3, n_milled_faces = 1, n_ground_faces = 0, "
         "n_drilled_faces = 1, station_bonus_hours = 0.0 "
         "WHERE plate_role = 'cappello' AND setup_hours_fixed IS NULL"),
        ("UPDATE die_template_plates SET "
         "setup_hours_fixed = 0.5, n_milled_faces = 2, n_ground_faces = 1, "
         "n_drilled_faces = 2, station_bonus_hours = 0.4 "
         "WHERE plate_role = 'porta_punzoni' AND setup_hours_fixed IS NULL"),
        ("UPDATE die_template_plates SET "
         "setup_hours_fixed = 0.4, n_milled_faces = 2, n_ground_faces = 1, "
         "n_drilled_faces = 1, station_bonus_hours = 0.0 "
         "WHERE plate_role = 'premilamiera' AND setup_hours_fixed IS NULL"),
        ("UPDATE die_template_plates SET "
         "setup_hours_fixed = 0.5, n_milled_faces = 2, n_ground_faces = 2, "
         "n_drilled_faces = 2, station_bonus_hours = 0.5 "
         "WHERE plate_role = 'matrice' AND setup_hours_fixed IS NULL"),
        ("UPDATE die_template_plates SET "
         "setup_hours_fixed = 0.3, n_milled_faces = 1, n_ground_faces = 0, "
         "n_drilled_faces = 1, station_bonus_hours = 0.0 "
         "WHERE plate_role = 'base' AND setup_hours_fixed IS NULL"),

        # Singleton DieSettings + seed default operativi (SQLAlchemy create_all
        # non applica DEFAULT SQL — COALESCE ricopre il caso DB legacy).
        "INSERT OR IGNORE INTO die_settings (id) VALUES (1)",
        ("UPDATE die_settings SET "
         "hourly_rate_milling = COALESCE(hourly_rate_milling, 45), "
         "hourly_rate_grinding = COALESCE(hourly_rate_grinding, 50), "
         "hourly_rate_edm_wire = COALESCE(hourly_rate_edm_wire, 60), "
         "hourly_rate_edm_die = COALESCE(hourly_rate_edm_die, 55), "
         "cost_bend_simple = COALESCE(cost_bend_simple, 80), "
         "cost_bend_medium = COALESCE(cost_bend_medium, 160), "
         "cost_bend_complex = COALESCE(cost_bend_complex, 320), "
         "cost_punch_simple = COALESCE(cost_punch_simple, 120), "
         "cost_punch_medium = COALESCE(cost_punch_medium, 240), "
         "cost_punch_complex = COALESCE(cost_punch_complex, 480), "
         "cost_per_plate_base = COALESCE(cost_per_plate_base, 150), "
         "diff_mult_base = COALESCE(diff_mult_base, 1.0), "
         "diff_mult_medium = COALESCE(diff_mult_medium, 1.3), "
         "diff_mult_hard = COALESCE(diff_mult_hard, 1.7), "
         "design_hours_base = COALESCE(design_hours_base, 8), "
         "design_hours_medium = COALESCE(design_hours_medium, 16), "
         "design_hours_hard = COALESCE(design_hours_hard, 32), "
         "design_hourly_rate = COALESCE(design_hourly_rate, 50), "
         "assembly_forfeit_base = COALESCE(assembly_forfeit_base, 300), "
         "assembly_forfeit_medium = COALESCE(assembly_forfeit_medium, 600), "
         "assembly_forfeit_hard = COALESCE(assembly_forfeit_hard, 1200), "
         "default_margin_percent = COALESCE(default_margin_percent, 30), "
         "default_castle_offset_x_mm = COALESCE(default_castle_offset_x_mm, 80), "
         "default_castle_offset_y_mm = COALESCE(default_castle_offset_y_mm, 80), "
         "edm_extractor_factor = COALESCE(edm_extractor_factor, 0.6), "
         "edm_punch_factor = COALESCE(edm_punch_factor, 0.3), "
         "milling_h_per_dm2 = COALESCE(milling_h_per_dm2, 0.15), "
         "grinding_h_per_dm2 = COALESCE(grinding_h_per_dm2, 0.10), "
         "drilling_h_per_dm2 = COALESCE(drilling_h_per_dm2, 0.20), "
         "large_plate_threshold_dm2 = COALESCE(large_plate_threshold_dm2, 80.0), "
         "large_plate_factor = COALESCE(large_plate_factor, 1.25), "
         "design_h_per_bend = COALESCE(design_h_per_bend, 0.4), "
         "design_h_per_punch = COALESCE(design_h_per_punch, 0.3) "
         "WHERE id = 1"),
        # Modalità Rapida rimossa: le colonne rapid_* restano in DB (SQLite
        # no DROP COLUMN) ma non più popolate/lette. Vedi 16_legacy_columns.md.

        # Seed 4 fasce piastra (Sprint F re-purpose: era castello, ora piastra).
        # Idempotente: skippa se già seedato. Per officine con tagli max ~1300×600mm
        # (=78 dm²) i coefficienti sono modesti: 1.00 → 1.30 invece di 1.0 → 2.0.
        # I record già esistenti dalla Sprint A NON vengono toccati (l'utente
        # potrebbe aver calibrato a mano).
        ("INSERT INTO die_dimension_brackets (label, area_min_dm2, area_max_dm2, coefficient, sort_order) "
         "SELECT 'S', 0, 15, 1.0, 1 WHERE NOT EXISTS (SELECT 1 FROM die_dimension_brackets WHERE label='S')"),
        ("INSERT INTO die_dimension_brackets (label, area_min_dm2, area_max_dm2, coefficient, sort_order) "
         "SELECT 'M', 15, 40, 1.05, 2 WHERE NOT EXISTS (SELECT 1 FROM die_dimension_brackets WHERE label='M')"),
        ("INSERT INTO die_dimension_brackets (label, area_min_dm2, area_max_dm2, coefficient, sort_order) "
         "SELECT 'L', 40, 65, 1.15, 3 WHERE NOT EXISTS (SELECT 1 FROM die_dimension_brackets WHERE label='L')"),
        ("INSERT INTO die_dimension_brackets (label, area_min_dm2, area_max_dm2, coefficient, sort_order) "
         "SELECT 'XL', 65, NULL, 1.30, 4 WHERE NOT EXISTS (SELECT 1 FROM die_dimension_brackets WHERE label='XL')"),

        # Permessi dies.* — admin + ufficio_tecnico (create/archive/pdf) + amministrazione (archive/pdf), admin (settings).
        "DELETE FROM role_permissions WHERE permission_key IN ('dies.create','dies.archive','dies.pdf','dies.settings')",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'dies.create' FROM roles WHERE name IN ('admin','ufficio_tecnico')",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'dies.archive' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione')",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'dies.pdf' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione')",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'dies.settings' FROM roles WHERE name = 'admin'",
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


def _seed_operations():
    """Popola la tabella `operations` con il vocabolario iniziale di
    lavorazioni (mappato dai vecchi PHASE_TYPES) + backfill di
    `manufacturing_phases.operation_id` partendo dal vecchio `phase_type`.

    Idempotente: se la tabella ha già voci, non tocca. Il backfill
    aggiorna solo le righe con operation_id NULL.
    """
    from sqlalchemy.orm import Session
    from app.core.phase_types import PHASE_TYPES as INITIAL_OPS

    with Session(engine) as db:
        if db.query(Operation).count() == 0:
            for p in INITIAL_OPS:
                db.add(Operation(name=p["label"], active=True))
            db.commit()
        # Backfill manufacturing_phases.operation_id da phase_type legacy.
        # Mappa slug → name della voce seed.
        slug_to_name = {p["slug"]: p["label"] for p in INITIAL_OPS}
        ops_by_name = {o.name: o.id for o in db.query(Operation).all()}
        try:
            rows = db.execute(text(
                "SELECT id, phase_type FROM manufacturing_phases "
                "WHERE operation_id IS NULL AND phase_type IS NOT NULL"
            )).fetchall()
            for row in rows:
                phase_id, phase_type = row[0], row[1]
                name = slug_to_name.get(phase_type)
                if not name:
                    continue
                op_id = ops_by_name.get(name)
                if not op_id:
                    continue
                db.execute(
                    text("UPDATE manufacturing_phases SET operation_id = :oid WHERE id = :pid"),
                    {"oid": op_id, "pid": phase_id},
                )
            db.commit()
        except Exception:
            db.rollback()


def _seed_edm_defaults():
    """Insert default EDM config (singleton) + 3 starter cycles, idempotente."""
    from sqlalchemy.orm import Session

    with Session(engine) as db:
        if db.query(EdmConfig).count() == 0:
            db.add(EdmConfig(
                id=1,
                rough_speed_factor=1.0,
                semi_speed_factor=0.9,
                finish_speed_factor=0.7,
                default_pierce_time_s=2.0,
            ))
            db.commit()

        if db.query(CuttingCycle).count() == 0:
            cycles = [
                ("Solo sgrossatura", "1 passata di sola sgrossatura", ["rough"]),
                ("Standard 1+3", "Sgrossatura + 3 finiture", ["rough", "finish", "finish", "finish"]),
                ("Alta precisione 1+1+3", "Sgrossatura + 1 semifinitura + 3 finiture",
                 ["rough", "semi", "finish", "finish", "finish"]),
            ]
            for name, desc, passes in cycles:
                cyc = CuttingCycle(name=name, description=desc, active=True)
                db.add(cyc)
                db.flush()
                for i, pt in enumerate(passes, start=1):
                    db.add(CuttingPass(cycle_id=cyc.id, sequence_number=i, pass_type=pt))
            db.commit()


# NOTA: i fix one-shot per le colonne legacy NOT NULL (edm_cut_speeds,
# drilling_times) vivevano qui ed erano eseguiti ad ogni boot. Sono
# stati spostati in `backend/scripts/one_shot_db_fixes.py` (audit sprint E):
# sui DB attuali sono no-op da molto tempo, non vale la pena fare introspect
# del DB ad ogni avvio. Eseguire a mano se serve sistemare un DB legacy:
#   venv/bin/python -m scripts.one_shot_db_fixes


def _seed_die_templates():
    """Seed dei 5 template stampo della spec utente (idempotente: skip se
    la tabella ha già righe). Ogni template ha 5 piastre standard
    (cappello/porta_punzoni/premilamiera/matrice/base) con spessori 25/30/25/30/30 mm.
    Material/treatment default: lookup per nome comune ('C45', '1.2311',
    'tempra'). Se i nomi non esistono nel catalogo dell'istanza, le piastre
    restano NULL e l'utente assegna manualmente."""
    from sqlalchemy.orm import Session
    from app.models import DieTemplate, DieTemplatePlate, DieTemplateNormalized, Material, Treatment

    # (role, thickness, sort_order, material_lookup_name, treatment_lookup_name,
    #  setup_h, n_milled, n_ground, n_drilled, station_bonus_h)
    # I "lookup name" sono best-guess sul catalogo dell'officina: se non
    # trovati, default_material_id/treatment_id restano NULL.
    # Le costanti Sprint B alimentano `_estimate_die_plate_hours` per il
    # calcolo delle ore meccaniche di ciascuna piastra.
    STANDARD_PLATES = [
        ('cappello',      25.0, 1, 'C45',    None,     0.3, 1, 0, 1, 0.0),
        ('porta_punzoni', 30.0, 2, '1.2311', 'tempra', 0.5, 2, 1, 2, 0.4),
        ('premilamiera',  25.0, 3, 'C45',    None,     0.4, 2, 1, 1, 0.0),
        ('matrice',       30.0, 4, '1.2311', 'tempra', 0.5, 2, 2, 2, 0.5),
        ('base',          30.0, 5, 'C45',    None,     0.3, 1, 0, 1, 0.0),
    ]

    # Sprint C — BoM normalizzati di default per nome template. Tutte le
    # formule sono valutate via `core.expression_eval.evaluate_quantity_formula`
    # con variabili {n_stations, n_bends_total, n_punches_total,
    # area_castello_dm2, castle_x_mm, castle_y_mm, bbox_x_mm, bbox_y_mm}.
    # Prezzi unitari sono best-guess: l'utente raffina dall'editor template.
    # (description, formula, unit_price_default, sort_order)
    NORMALIZED_BY_TEMPLATE = {
        'Tranciatura semplice a blocco': [
            ('Colonna guidata Ø25', '4',  35.0, 1),
            ('Boccola Ø25',          '4',  12.0, 2),
            ('Molla gialla',         '2',  10.0, 3),
            ('Kit viti+spine M8',    '1',  50.0, 4),
        ],
        'Tranciatura + piega a blocco': [
            ('Colonna guidata Ø25', '4',  35.0, 1),
            ('Boccola Ø25',          '4',  12.0, 2),
            ('Molla gialla',         '4',  10.0, 3),
            ('Kit viti+spine M8',    '1',  50.0, 4),
        ],
        'Progressivo 3-4 stazioni': [
            ('Colonna guidata Ø32',  '4',                 45.0, 1),
            ('Boccola Ø32',          '4',                 15.0, 2),
            ('Molla gialla',         'n_stations * 2 + 4', 10.0, 3),
            ('Kit viti+spine M8',    '1',                  80.0, 4),
        ],
        'Progressivo complesso 5+ stazioni': [
            ('Colonna guidata Ø40',  '4',                 65.0, 1),
            ('Boccola Ø40',          '4',                 22.0, 2),
            ('Molla gialla',         'n_stations * 3 + 4', 10.0, 3),
            ('Tendispinotti',        '2',                 35.0, 4),
            ('Kit viti+spine M10',   '1',                 110.0, 5),
        ],
        'Tranciatura fine (precisione)': [
            ('Colonna guidata Ø32',  '4',  45.0, 1),
            ('Boccola Ø32',          '4',  15.0, 2),
            ('Molla precisione',     '4',  20.0, 3),
            ('Kit viti+spine M8',    '1',  60.0, 4),
        ],
    }

    TEMPLATES = [
        # name, description, die_subtype, suggested_stations, suggested_pitch_mm,
        # n_bends_s/m/c, n_punches_s/m/c, default_difficulty
        ('Tranciatura semplice a blocco',
         'Stampo a blocco con 1-2 stazioni: 5 piastre standard, solo tranciatura.',
         'blocco', None, None, 0, 0, 0, 1, 0, 0, 'base'),
        ('Tranciatura + piega a blocco',
         'Stampo a blocco con tranciatura e una piega.',
         'blocco', None, None, 1, 0, 0, 1, 0, 0, 'base'),
        ('Progressivo 3-4 stazioni',
         'Stampo a passo medio: 3-4 stazioni, pieghe e punzoni medi.',
         'passo', 3, None, 0, 2, 0, 0, 2, 0, 'medium'),
        ('Progressivo complesso 5+ stazioni',
         'Stampo a passo complesso: 5+ stazioni, feature articolate.',
         'passo', 6, None, 1, 2, 2, 2, 2, 2, 'hard'),
        ('Tranciatura fine (precisione)',
         'Stampo a blocco per tranciatura di precisione (1 stazione, punzone medio).',
         'blocco', 1, None, 0, 0, 0, 0, 1, 0, 'hard'),
    ]

    with Session(engine) as db:
        # Lookup catalog by name (case-sensitive sul nome esatto). Eseguito
        # una volta sola, riutilizzato per tutte le piastre.
        def _material_id(name):
            m = db.query(Material).filter(Material.name == name).first()
            return m.id if m else None

        def _treatment_id(name):
            if name is None:
                return None
            t = db.query(Treatment).filter(Treatment.name == name).first()
            return t.id if t else None

        if db.query(DieTemplate).count() > 0:
            # Già seedato: applica solo i default material/treatment alle
            # piastre che ne sono ancora prive (idempotente, no-op se
            # l'utente ha già configurato a mano). Per Sprint B, le costanti
            # di produttività (setup_h, n_*_faces, station_bonus) hanno già
            # i default DB da migration → niente UPDATE qui.
            for role, _t, _o, mat_name, treat_name, *_b in STANDARD_PLATES:
                mid = _material_id(mat_name)
                tid = _treatment_id(treat_name)
                if mid is not None:
                    db.query(DieTemplatePlate).filter(
                        DieTemplatePlate.plate_role == role,
                        DieTemplatePlate.default_material_id.is_(None),
                    ).update({"default_material_id": mid}, synchronize_session=False)
                if tid is not None:
                    db.query(DieTemplatePlate).filter(
                        DieTemplatePlate.plate_role == role,
                        DieTemplatePlate.default_treatment_id.is_(None),
                    ).update({"default_treatment_id": tid}, synchronize_session=False)
            # Sprint C — backfill BoM normalizzati su template già seedati.
            # Idempotente: si auto-popola solo se il template non ne ha già
            # (rispetta eventuali personalizzazioni dell'utente).
            for tpl in db.query(DieTemplate).all():
                existing = db.query(DieTemplateNormalized).filter(
                    DieTemplateNormalized.template_id == tpl.id
                ).count()
                if existing > 0:
                    continue
                for description, formula, price, order in NORMALIZED_BY_TEMPLATE.get(tpl.name, []):
                    db.add(DieTemplateNormalized(
                        template_id=tpl.id,
                        description=description,
                        quantity_formula=formula,
                        unit_price_default=price,
                        sort_order=order,
                    ))
            db.commit()
            return

        for (name, desc, subtype, stations, pitch,
             nbs, nbm, nbc, nps, npm, npc, diff) in TEMPLATES:
            tpl = DieTemplate(
                name=name, description=desc, die_subtype=subtype,
                suggested_stations=stations, suggested_pitch_mm=pitch,
                suggested_n_bends_simple=nbs, suggested_n_bends_medium=nbm, suggested_n_bends_complex=nbc,
                suggested_n_punches_simple=nps, suggested_n_punches_medium=npm, suggested_n_punches_complex=npc,
                default_difficulty=diff, active=True,
            )
            db.add(tpl)
            db.flush()
            for (role, thickness, order, mat_name, treat_name,
                 setup_h, n_milled, n_ground, n_drilled, station_bonus) in STANDARD_PLATES:
                db.add(DieTemplatePlate(
                    template_id=tpl.id,
                    plate_role=role,
                    default_thickness_mm=thickness,
                    default_material_id=_material_id(mat_name),
                    default_treatment_id=_treatment_id(treat_name),
                    sort_order=order,
                    setup_hours_fixed=setup_h,
                    n_milled_faces=n_milled,
                    n_ground_faces=n_ground,
                    n_drilled_faces=n_drilled,
                    station_bonus_hours=station_bonus,
                ))
            # Sprint C — BoM normalizzati di default per questo template.
            for description, formula, price, order in NORMALIZED_BY_TEMPLATE.get(name, []):
                db.add(DieTemplateNormalized(
                    template_id=tpl.id,
                    description=description,
                    quantity_formula=formula,
                    unit_price_default=price,
                    sort_order=order,
                ))
        db.commit()


_run_migrations()
_seed_categories()
_seed_roles()
_seed_operations()
_seed_edm_defaults()
_seed_die_templates()


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "MechQuote"}


os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
