from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
    auth, quotes, parts, phases, dashboard, backup, customers, quotes_archive,
    materials, machines, treatments, catalog, roles, notifications, company, activity, edm, dxf,
    workflow_templates, operations, orders, orders_from_file, material_requests, normalized_from_file,
    tools, orders_tools, officina,
    heat_treatments,
    normalized_suppliers, normalized_items, direct_sales,
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
app.include_router(orders_from_file.router, dependencies=_auth)
app.include_router(material_requests.router, dependencies=_auth)
app.include_router(normalized_from_file.router, dependencies=_auth)
app.include_router(tools.router, dependencies=_auth)
app.include_router(orders_tools.router, dependencies=_auth)
app.include_router(officina.router, dependencies=_auth)
app.include_router(heat_treatments.router, dependencies=_auth)
app.include_router(normalized_suppliers.router, dependencies=_auth)
app.include_router(normalized_items.router, dependencies=_auth)
app.include_router(direct_sales.router, dependencies=_auth)


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
        # Idempotente NON distruttivo: semina la baseline solo dove manca, senza
        # cancellare i grant dati via UI ai ruoli custom (bug spunte-che-spariscono).
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'company' FROM roles WHERE name = 'admin' AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='company')",

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

        # ═══ Operation (catalogo Lavorazioni utente) + WorkflowTemplate ═══
        # Tabelle libere, gestite dall'utente da UI (lavorazioni + template di
        # flusso). CREATE idempotenti.
        # ⚠️ TD-13 (2026-07-21) — FIX PERDITA DATI: qui c'erano DROP TABLE
        # INCONDIZIONATI su operations/workflow_templates(+steps)/phase_templates,
        # nati per un cambio schema una-tantum (phase_type rimosso). Ma giravano
        # a OGNI avvio → cancellavano i template di flusso e le lavorazioni
        # custom dell'utente ad ogni restart/aggiornamento del server. Rimossi:
        # le tabelle hanno da tempo il nuovo schema (la migrazione è passata da
        # mesi), quindi i DROP erano solo distruttivi. Ora `CREATE TABLE IF NOT
        # EXISTS`: no-op se la tabella esiste già, dati preservati.
        ("CREATE TABLE IF NOT EXISTS operations ("
         "id INTEGER PRIMARY KEY, "
         "name VARCHAR(100) UNIQUE NOT NULL, "
         "active BOOLEAN DEFAULT 1)"),
        # Aggiungo operation_id su manufacturing_phases. La colonna potrebbe
        # già esistere come legacy (Sprint 13c volumetric smontato): try/except
        # del runner ALTER TABLE coprirà il "duplicate column" silenziosamente.
        "ALTER TABLE manufacturing_phases ADD COLUMN operation_id INTEGER REFERENCES operations(id)",
        ("CREATE TABLE IF NOT EXISTS workflow_templates ("
         "id INTEGER PRIMARY KEY, "
         "name VARCHAR(100) NOT NULL, "
         "description TEXT, "
         "active BOOLEAN DEFAULT 1)"),
        ("CREATE TABLE IF NOT EXISTS workflow_template_steps ("
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
        # Idempotente NON distruttivo (vedi nota su 'company').
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'tools' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione','officina') AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='tools')",

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
        # Idempotente NON distruttivo (vedi nota su 'company').
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'orders.materials' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione') AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='orders.materials')",

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
        # Idempotente NON distruttivo (vedi nota su 'company').
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'officina' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione','officina') AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='officina')",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'officina.write' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione') AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='officina.write')",

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

        # Registro risultati tempra (Officina): misure pre/post trattamento.
        # Compilato a mano dall'operatore, una riga per pezzo. Deformazioni
        # derivate in UI (non salvate). Read 'officina', write 'officina.write'.
        ("CREATE TABLE IF NOT EXISTS heat_treatment_results ("
         "id INTEGER PRIMARY KEY, "
         "material VARCHAR(100) NOT NULL, "
         "temp_insertion_c FLOAT, "
         "temp_quench_c FLOAT, "
         "temp_temper_c FLOAT, "
         "temper_time_min FLOAT, "
         "outer_dia_pre_mm FLOAT, "
         "outer_dia_post_mm FLOAT, "
         "inner_dia_pre_mm FLOAT, "
         "inner_dia_post_mm FLOAT, "
         "length_pre_mm FLOAT, "
         "length_post_mm FLOAT, "
         "hardness VARCHAR(50), "
         "notes TEXT, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
         "created_by_user_id INTEGER REFERENCES users(id))"),
        # Forma del pezzo (tondo|quadrato) + misure quadrato (larghezza/altezza).
        # Additive su DB esistente: i tondi gia' inseriti restano 'tondo' (default).
        "ALTER TABLE heat_treatment_results ADD COLUMN shape VARCHAR(20) DEFAULT 'tondo'",
        "ALTER TABLE heat_treatment_results ADD COLUMN width_pre_mm FLOAT",
        "ALTER TABLE heat_treatment_results ADD COLUMN width_post_mm FLOAT",
        "ALTER TABLE heat_treatment_results ADD COLUMN height_pre_mm FLOAT",
        "ALTER TABLE heat_treatment_results ADD COLUMN height_post_mm FLOAT",

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
        # AUD-44: colonne di quotes filtrate/ordinate su OGNI lista/archivio/
        # dashboard. created_by_user_id → ACL per chi non ha view_all (la
        # maggioranza); status → COUNT dashboard + filtri archivio/ordini;
        # quote_date → ordinamento + raggruppamento mensile. notifications.
        # created_at → ordinamento pannello notifiche. Additivi/idempotenti.
        "CREATE INDEX IF NOT EXISTS idx_quotes_created_by_user_id ON quotes(created_by_user_id)",
        "CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status)",
        "CREATE INDEX IF NOT EXISTS idx_quotes_quote_date ON quotes(quote_date)",
        "CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)",

        # ═══ ACL: quotes.view_all ═══
        # Permesso per vedere TUTTI i preventivi (non solo i propri). Senza,
        # GET /api/quotes e /api/quotes/archive filtrano su created_by_user_id.
        # Baseline: admin + amministrazione; gli altri ruoli lo ricevono via UI.
        #
        # F10 (2026-07-16): rimosso il `DELETE ... WHERE permission_key='quotes.view_all'`
        # che precedeva l'INSERT. Girando a OGNI avvio, quel DELETE spogliava
        # view_all da qualsiasi ruolo e la riassegnava solo ad admin+amministrazione:
        # un grant via UI a un ruolo custom (es. ufficio_tecnico_plus) veniva
        # azzerato al primo restart, rendendo view_all NON delegabile (contro il
        # modello permessi dinamico, §3). Ora solo INSERT idempotente per la
        # baseline: i grant UI ai ruoli custom sopravvivono ai riavvii.
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'quotes.view_all' FROM roles WHERE name IN ('admin','amministrazione') AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='quotes.view_all')",

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

        # ─── Modulo Stampi RIMOSSO (2026-07-14) ─────────────────────────────
        # Il preventivatore stampi è stato rimosso (da ricostruire da zero —
        # snapshot nel tag git `stampi-pre-rimozione`). Togliamo i permessi
        # dies.* e droppiamo le tabelle dedicate (children → parent). Le colonne
        # die_* / plate_role su `parts` restano (SQLite no DROP COLUMN) ma non
        # sono più mappate dal modello, quindi ignorate.
        "DELETE FROM role_permissions WHERE permission_key IN ('dies.create','dies.archive','dies.settings','dies.pdf')",
        "DROP TABLE IF EXISTS die_normalized_items",
        "DROP TABLE IF EXISTS die_template_normalized",
        "DROP TABLE IF EXISTS die_template_plates",
        "DROP TABLE IF EXISTS die_templates",
        "DROP TABLE IF EXISTS die_dimension_brackets",
        "DROP TABLE IF EXISTS die_specs",
        "DROP TABLE IF EXISTS die_settings",

        # ═══ NormalizedItem — catalogo voci normalizzate (cantiere catalogo
        # normalizzati, Step 1). Catalogo globale di viti/cuscinetti/molle/...
        # con codice, descrizione, categoria, fornitore opzionale, prezzo.
        # Gli agganci a DieTemplateNormalized e DieNormalizedItem arrivano
        # negli Step 4-5 (FK opzionale, snapshot al collegamento).
        ("CREATE TABLE IF NOT EXISTS normalized_items ("
         "id INTEGER PRIMARY KEY, "
         "code VARCHAR(50) UNIQUE NOT NULL, "
         "description VARCHAR(200) NOT NULL, "
         "category VARCHAR(50), "
         "supplier_id INTEGER REFERENCES normalized_suppliers(id), "
         "unit_price REAL DEFAULT 0, "
         "notes TEXT, "
         "active BOOLEAN DEFAULT 1, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        "CREATE INDEX IF NOT EXISTS idx_normalized_items_supplier ON normalized_items(supplier_id)",

        # ═══ Ordine utensili per-fornitore: colonna fornitore sullo storico ═══
        # Un ToolOrder ora riguarda un solo fornitore (export CSV per fornitore).
        "ALTER TABLE tool_orders ADD COLUMN supplier_name VARCHAR(100)",

        # ═══ Spec 18 — evasione materiale per (preventivo × fornitore) ═══
        # Fonte di verità dello stato materiale del preventivo (sostituisce
        # come guida il flag per-preventivo quotes.material_ordered_at).
        ("CREATE TABLE IF NOT EXISTS quote_supplier_orders ("
         "id INTEGER PRIMARY KEY, "
         "quote_id INTEGER NOT NULL REFERENCES quotes(id), "
         "material_supplier_id INTEGER NOT NULL REFERENCES material_suppliers(id), "
         "material_order_id INTEGER REFERENCES material_orders(id), "
         "ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
         "ordered_by_user_id INTEGER REFERENCES users(id), "
         "UNIQUE(quote_id, material_supplier_id))"),
        "CREATE INDEX IF NOT EXISTS idx_quote_supplier_orders_quote ON quote_supplier_orders(quote_id)",

        # ═══ Spec 18 — ordine materiale per fornitore (come utensili) ═══
        "ALTER TABLE material_orders ADD COLUMN material_supplier_id INTEGER REFERENCES material_suppliers(id)",
        "ALTER TABLE material_orders ADD COLUMN supplier_name VARCHAR(100)",

        # ═══ Spec 18 Blocco 4 — ciclo di vita preventivo esteso ═══
        # Nuovi stati letto/confermato/completo (String, no Enum) + timestamp/attori.
        "ALTER TABLE quotes ADD COLUMN read_by_user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE quotes ADD COLUMN read_at DATETIME",
        "ALTER TABLE quotes ADD COLUMN confirmed_by_user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE quotes ADD COLUMN confirmed_at DATETIME",
        # Permesso "Conferma preventivo" (sostituisce quotes.complete).
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'quotes.confirm' FROM roles WHERE name IN ('admin','amministrazione') AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='quotes.confirm')",
        "DELETE FROM role_permissions WHERE permission_key = 'quotes.complete'",
        # Opzione B (deciso con l'utente): nessun preventivo reale in DB → mappo
        # gli eventuali 'completato' legacy a 'letto' per coerenza coi nuovi stati.
        "UPDATE quotes SET status = 'letto' WHERE status = 'completato'",

        # ═══ Tema J (2026-07-02): modello permessi esteso ═══
        # Chiavi nuove edit_locked/delete (solo admin) + orders.tools (split da
        # 'tools'). NB: il ruolo admin esiste in DB → get_current_user legge
        # role_permissions, l'anti-lockout NON scatta: le chiavi nuove vanno
        # inserite anche per admin, qui.
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'quotes.edit_locked' FROM roles WHERE name = 'admin' AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='quotes.edit_locked')",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'quotes.delete' FROM roles WHERE name = 'admin' AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='quotes.delete')",
        # orders.tools (ordini utensili) separato da 'tools' (catalogo): lo
        # prendono i ruoli che gestiscono ordini, NON officina.
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'orders.tools' FROM roles WHERE name IN ('admin','ufficio_tecnico','amministrazione') AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='orders.tools')",
        # Ruolo officina ridefinito: solo officina + officina.write + tools.
        # Tolgo preventivi e notifiche (mirato al solo ruolo officina), aggiungo
        # officina.write. Il catalogo utensili 'tools' lo ha già.
        "DELETE FROM role_permissions WHERE permission_key IN ('quotes.archive','quotes.pdf','notifications') AND role_id IN (SELECT id FROM roles WHERE name='officina')",
        "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'officina.write' FROM roles WHERE name = 'officina' AND id NOT IN (SELECT role_id FROM role_permissions WHERE permission_key='officina.write')",

        # ═══ D2 (2026-07-02): anti-doppioni cataloghi — indice UNIQUE su nome
        # (case-insensitive + trimmed). Garanzia hard su ogni via di scrittura;
        # gli endpoint danno anche un messaggio 400 chiaro (check_duplicate_name).
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_materials_name ON materials(lower(trim(name)))",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_machines_name ON machines(lower(trim(name)))",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_treatments_name ON treatments(lower(trim(name)))",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_material_suppliers_name ON material_suppliers(lower(trim(name)))",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_suppliers_name ON suppliers(lower(trim(name)))",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_normalized_suppliers_name ON normalized_suppliers(lower(trim(name)))",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_tool_suppliers_name ON tool_suppliers(lower(trim(name)))",

        # ═══ Spec 18 — stati "in attesa cliente" e "non ordinato" (perso) ═══
        # Nuovi stati additivi (status resta String, nessun vincolo). Colonne
        # audit per le statistiche: data invio al cliente + data/autore "perso".
        "ALTER TABLE quotes ADD COLUMN awaiting_client_at DATETIME",
        "ALTER TABLE quotes ADD COLUMN not_ordered_at DATETIME",
        "ALTER TABLE quotes ADD COLUMN not_ordered_by_user_id INTEGER REFERENCES users(id)",

        # ═══ Rimozione feature PDF preventivo (standard + stampi) ═══
        # Il PDF non si genera più (nessun endpoint): le chiavi quotes.pdf /
        # dies.pdf sono state tolte da PERMISSION_KEYS. Pulisci le assegnazioni
        # residue sui DB esistenti. Idempotente (ultima migrazione della lista:
        # eventuali INSERT precedenti di dies.pdf vengono comunque rimossi qui).
        "DELETE FROM role_permissions WHERE permission_key IN ('quotes.pdf', 'dies.pdf')",

        # ═══ Ordini materiale "da file" (distinta CSV/manuale, no preventivo) ═══
        "ALTER TABLE material_orders ADD COLUMN source VARCHAR(10) DEFAULT 'quotes'",
        ("CREATE TABLE IF NOT EXISTS material_order_items ("
         "id INTEGER PRIMARY KEY, "
         "material_order_id INTEGER NOT NULL REFERENCES material_orders(id), "
         "material_id INTEGER REFERENCES materials(id), "
         "material_name VARCHAR(100) NOT NULL DEFAULT '', "
         "part_code VARCHAR(120) DEFAULT '', "
         "description VARCHAR(200) DEFAULT '', "
         "width_mm FLOAT, height_mm FLOAT, thickness_mm FLOAT, "
         "quantity INTEGER DEFAULT 1)"),
        ("CREATE TABLE IF NOT EXISTS material_aliases ("
         "id INTEGER PRIMARY KEY, "
         "csv_name VARCHAR(120) NOT NULL UNIQUE, "
         "material_id INTEGER NOT NULL REFERENCES materials(id))"),
        "CREATE INDEX IF NOT EXISTS ix_material_aliases_csv_name ON material_aliases(csv_name)",
        ("CREATE TABLE IF NOT EXISTS normalized_aliases ("
         "id INTEGER PRIMARY KEY, "
         "csv_name VARCHAR(120) NOT NULL UNIQUE, "
         "normalized_item_id INTEGER NOT NULL REFERENCES normalized_items(id))"),
        "CREATE INDEX IF NOT EXISTS ix_normalized_aliases_csv_name ON normalized_aliases(csv_name)",
        ("CREATE TABLE IF NOT EXISTS normalized_orders ("
         "id INTEGER PRIMARY KEY, "
         "created_by_user_id INTEGER REFERENCES users(id), "
         "normalized_supplier_id INTEGER REFERENCES normalized_suppliers(id), "
         "supplier_name VARCHAR(100) NOT NULL DEFAULT '', "
         "source VARCHAR(20) DEFAULT 'file', "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        ("CREATE TABLE IF NOT EXISTS normalized_order_items ("
         "id INTEGER PRIMARY KEY, "
         "normalized_order_id INTEGER NOT NULL REFERENCES normalized_orders(id), "
         "normalized_item_id INTEGER REFERENCES normalized_items(id), "
         "article VARCHAR(100) NOT NULL DEFAULT '', "
         "description VARCHAR(200) NOT NULL DEFAULT '', "
         "reference VARCHAR(100), "
         "quantity INTEGER DEFAULT 1)"),
        "CREATE INDEX IF NOT EXISTS ix_normalized_order_items_order ON normalized_order_items(normalized_order_id)",
        # Nuovo permesso orders.normalized: assegnato a chi gestisce gli ordini
        # (idempotente: NOT EXISTS evita duplicati a ogni avvio).
        "INSERT INTO role_permissions (role_id, permission_key) "
        "SELECT r.id, 'orders.normalized' FROM roles r "
        "WHERE r.name IN ('admin','ufficio_tecnico','amministrazione') "
        "AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_key = 'orders.normalized')",
        ("CREATE TABLE IF NOT EXISTS direct_sales ("
         "id INTEGER PRIMARY KEY, "
         "code VARCHAR(100) NOT NULL, "
         "description VARCHAR(200), "
         "sale_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
         "unit_price FLOAT DEFAULT 0, "
         "unit_cost FLOAT DEFAULT 0, "
         "quantity INTEGER DEFAULT 1, "
         "notes TEXT, "
         "created_by_user_id INTEGER REFERENCES users(id), "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
        "CREATE INDEX IF NOT EXISTS ix_direct_sales_sale_date ON direct_sales(sale_date)",
        "INSERT INTO role_permissions (role_id, permission_key) "
        "SELECT r.id, 'sales.direct' FROM roles r "
        "WHERE r.name IN ('admin','amministrazione') "
        "AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_key = 'sales.direct')",
        # Forma grezzo sulle righe ordine-da-file (prismatico | tondo | tubo).
        "ALTER TABLE material_order_items ADD COLUMN shape VARCHAR(12) DEFAULT 'prismatico'",
        "ALTER TABLE material_order_items ADD COLUMN diameter_mm FLOAT",
        "ALTER TABLE material_order_items ADD COLUMN length_mm FLOAT",
        "ALTER TABLE material_order_items ADD COLUMN inner_diameter_mm FLOAT",
        # sales.direct esteso a ufficio_tecnico (decisione prodotto 2026-07-10):
        # anche l'ufficio tecnico registra vendite dirette. Idempotente.
        "INSERT INTO role_permissions (role_id, permission_key) "
        "SELECT r.id, 'sales.direct' FROM roles r "
        "WHERE r.name = 'ufficio_tecnico' "
        "AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_key = 'sales.direct')",
        # B1: totale finale preventivo persistito (fonte unica archivio/dashboard).
        # Popolato al primo recalculate_quote di ogni preventivo; NULL per i
        # preventivi mai ricalcolati dopo la migrazione (fallback client).
        "ALTER TABLE quotes ADD COLUMN final_total FLOAT",
        # Permesso statistics: separa la sezione Statistiche (costi/margini
        # aggregati) dalla Dashboard. Prima era gated da 'dashboard'; ora ha una
        # chiave propria così l'ufficio tecnico "normale" non vede i costi di
        # tutta l'azienda. Assegnato ad admin+amministrazione (idempotente).
        # I ruoli custom (es. ufficio_tecnico_plus) si abilitano dall'UI.
        "INSERT INTO role_permissions (role_id, permission_key) "
        "SELECT r.id, 'statistics' FROM roles r "
        "WHERE r.name IN ('admin','amministrazione') "
        "AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_key = 'statistics')",
        # F9 (decisione prodotto 2026-07-16): l'amministrazione può creare
        # preventivi (grant storico assegnato via UI) ma non inviarli → i
        # preventivi creati da amministrazione restavano bloccati in bozza,
        # nessuno poteva mandarli avanti. Aggiungi 'quotes.send' al ruolo così
        # il flusso crea→invia è completo. Idempotente (NOT EXISTS). I ruoli
        # custom (es. ufficio_tecnico_plus) si abilitano dall'UI.
        "INSERT INTO role_permissions (role_id, permission_key) "
        "SELECT r.id, 'quotes.send' FROM roles r "
        "WHERE r.name = 'amministrazione' "
        "AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_key = 'quotes.send')",

        # ═══ Richieste materiale manuali (gemello del preventivo per il materiale) ═══
        # Ordine materiale "a mano"/da distinta che NON passa da un preventivo:
        # nasce bozza, con "Invia" entra nel pool di /orders/materials insieme
        # ai preventivi da ordinare. Le righe portano il proprio fornitore
        # (una richiesta copre più fornitori) e la propria evasione
        # (material_order_id/evaso_at), come QuoteSupplierOrder per i preventivi.
        # Nessun permesso nuovo: si riusa 'orders.materials'.
        ("CREATE TABLE IF NOT EXISTS material_requests ("
         "id INTEGER PRIMARY KEY, "
         "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
         "created_by_user_id INTEGER REFERENCES users(id), "
         "status VARCHAR(12) DEFAULT 'bozza', "
         "sent_at DATETIME, "
         "title VARCHAR(120))"),
        ("CREATE TABLE IF NOT EXISTS material_request_items ("
         "id INTEGER PRIMARY KEY, "
         "material_request_id INTEGER NOT NULL REFERENCES material_requests(id), "
         "material_id INTEGER REFERENCES materials(id), "
         "material_name VARCHAR(100) NOT NULL DEFAULT '', "
         "part_code VARCHAR(120) DEFAULT '', "
         "description VARCHAR(200) DEFAULT '', "
         "shape VARCHAR(12) DEFAULT 'prismatico', "
         "width_mm FLOAT, height_mm FLOAT, thickness_mm FLOAT, "
         "diameter_mm FLOAT, inner_diameter_mm FLOAT, length_mm FLOAT, "
         "quantity INTEGER DEFAULT 1, "
         "supplier_id INTEGER REFERENCES material_suppliers(id), "
         "supplier_name VARCHAR(100), "
         "material_order_id INTEGER REFERENCES material_orders(id), "
         "evaso_at DATETIME)"),
        "CREATE INDEX IF NOT EXISTS ix_material_request_items_request ON material_request_items(material_request_id)",

        # ═══ TD-7 — Foratura a elettrodo: consumo elettrodo + tempo ═══
        # Catalogo elettrodi (Ø, lunghezza barretta, prezzo → €/mm derivato).
        ("CREATE TABLE IF NOT EXISTS electrodes ("
         "id INTEGER PRIMARY KEY AUTOINCREMENT, "
         "diameter_mm FLOAT NOT NULL, "
         "length_mm FLOAT NOT NULL, "
         "price FLOAT NOT NULL, "
         "notes TEXT, "
         "active BOOLEAN DEFAULT 1)"),
        # Fattori di consumo configurabili su EdmConfig (default ×2, +5%).
        "ALTER TABLE edm_config ADD COLUMN electrode_wear_factor FLOAT DEFAULT 2.0",
        "ALTER TABLE edm_config ADD COLUMN electrode_margin_percent FLOAT DEFAULT 5.0",
        # Input foratura sulla fase (autocalc quando la macchina è la foratrice designata).
        "ALTER TABLE manufacturing_phases ADD COLUMN electrode_diameter_mm FLOAT",
        "ALTER TABLE manufacturing_phases ADD COLUMN n_holes INTEGER",
        "ALTER TABLE manufacturing_phases ADD COLUMN drill_depth_mm FLOAT",

        # ═══ TD-16 — Stato 'in_revisione' + snapshot prezzo baseline ═══
        # Nuovo stato workflow (String, nessun vincolo da migrare); baseline del
        # prezzo salvata al "manda in revisione" per il confronto nell'editor.
        "ALTER TABLE quotes ADD COLUMN revision_baseline_total FLOAT",
        "ALTER TABLE quotes ADD COLUMN revision_baseline_at DATETIME",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as exc:
                # AUD-22: prima ingoiavamo TUTTO con `pass`. La maggior parte
                # dei fallimenti è benigna e attesa (colonna/tabella/indice già
                # esistente sugli statement idempotenti) → DEBUG. Ma la lista
                # contiene anche grant di permessi, UNIQUE index e backfill: un
                # fallimento *reale* lì lascia il DB sbagliato in silenzio →
                # WARNING con SQL+errore, così è visibile nei log.
                conn.rollback()
                msg = str(exc).lower()
                benign = (
                    "duplicate column name" in msg
                    or "already exists" in msg
                )
                log = logging.getLogger("mechquote.migrations")
                if benign:
                    log.debug("migrazione idempotente saltata: %s -- %s", sql, exc)
                else:
                    log.warning("migrazione fallita: %s -- %s", sql, exc)


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


def _seed_merge_p20():
    """TD-15 — unifica 1.2311 e 40CrMnMo7 (stesso acciaio, AISI P20) in un'unica
    voce a catalogo: sopravvive 1.2311. ONE-TIME via marker. Riassegna OGNI
    riferimento (parti, righe ordine, righe richiesta, alias) da 40CrMnMo7 a
    1.2311, poi elimina 40CrMnMo7 e aggiunge '40crmnmo7' come alias di 1.2311
    (così le distinte con quel nome continuano ad agganciare). Idempotente: se
    una delle due voci manca (già unificate / rinominate) non fa nulla."""
    from sqlalchemy.orm import Session
    from app.models import (Material, Part, MaterialAlias, MaterialOrderItem,
                            MaterialRequestItem)
    from app.core.csv_import import normalize_alias
    marker = 'merge_p20_v1'
    with Session(engine) as db:
        db.execute(text("CREATE TABLE IF NOT EXISTS seed_markers (key VARCHAR(80) PRIMARY KEY)"))
        db.commit()
        if db.execute(text("SELECT 1 FROM seed_markers WHERE key=:k"), {"k": marker}).first():
            return
        mats = {normalize_alias(m.name): m for m in db.query(Material).all()}
        keep, drop = mats.get('1.2311'), mats.get('40crmnmo7')
        if keep and drop and keep.id != drop.id:
            # Alias: sposta quelli non in conflitto, elimina i redondanti.
            keep_aliases = {a.csv_name for a in db.query(MaterialAlias).filter(
                MaterialAlias.material_id == keep.id).all()}
            for a in db.query(MaterialAlias).filter(MaterialAlias.material_id == drop.id).all():
                if a.csv_name in keep_aliases or a.csv_name == normalize_alias(keep.name):
                    db.delete(a)
                else:
                    a.material_id = keep.id
            # Riferimenti d'uso: riassegna a 1.2311.
            for model in (Part, MaterialOrderItem, MaterialRequestItem):
                db.query(model).filter(model.material_id == drop.id).update(
                    {model.material_id: keep.id}, synchronize_session=False)
            db.delete(drop)
            # Il vecchio nome diventa alias della voce sopravvissuta.
            old = normalize_alias('40CrMnMo7')
            if old not in keep_aliases and not db.query(MaterialAlias).filter(
                    MaterialAlias.csv_name == old).first():
                db.add(MaterialAlias(csv_name=old, material_id=keep.id))
            logging.getLogger("mechquote.seed").info("merge P20: 40CrMnMo7 → 1.2311 unificati")
        db.execute(text("INSERT INTO seed_markers (key) VALUES (:k)"), {"k": marker})
        db.commit()


def _seed_material_aliases():
    """TD-15 — alias per i materiali a catalogo (designazioni equivalenti
    verificate). A PASSATE, ognuna ONE-TIME via marker in `seed_markers`: gira
    una volta per DB e NON re-inserisce alias eliminati a mano (a differenza di
    un seed che rigira ad ogni avvio). Passate: 'v1' (acciai/inox/allu) e
    'generics_v1' (Bronzo/Ottone/Rame — tutti i gradi → voce generica). Ogni
    alias è saltato se già usato (unicità globale), se coincide col nome del
    materiale, o col nome esatto di un altro materiale."""
    from sqlalchemy.orm import Session
    from app.models import Material, MaterialAlias
    from app.core.csv_import import normalize_alias
    from app.core.material_aliases_seed import MATERIAL_ALIASES, GENERIC_ALIASES

    with Session(engine) as db:
        db.execute(text("CREATE TABLE IF NOT EXISTS seed_markers (key VARCHAR(80) PRIMARY KEY)"))
        db.commit()
        mats = {normalize_alias(m.name): m for m in db.query(Material).all()}
        for marker, mapping in (('material_aliases_v1', MATERIAL_ALIASES),
                                ('material_aliases_generics_v1', GENERIC_ALIASES)):
            if db.execute(text("SELECT 1 FROM seed_markers WHERE key=:k"), {"k": marker}).first():
                continue
            taken = {a.csv_name for a in db.query(MaterialAlias).all()}
            added = 0
            for name, aliases in mapping.items():
                mat = mats.get(normalize_alias(name))
                if not mat:
                    continue
                for al in aliases:
                    key = normalize_alias(al)
                    if not key or key in taken or key == normalize_alias(mat.name):
                        continue
                    other = mats.get(key)
                    if other is not None and other.id != mat.id:
                        continue   # è il nome esatto di un ALTRO materiale
                    db.add(MaterialAlias(csv_name=key, material_id=mat.id))
                    taken.add(key)
                    added += 1
            db.execute(text("INSERT INTO seed_markers (key) VALUES (:k)"), {"k": marker})
            db.commit()
            logging.getLogger("mechquote.seed").info("seed alias materiali (%s): %d creati", marker, added)


_run_migrations()
# AUD-47: i seed girano a import-time. Prima, un seed che sollevava (DB
# parzialmente migrato, lock transitorio) faceva fallire `import app.main` →
# uvicorn non partiva affatto. Ora ogni seed è isolato: se uno fallisce viene
# loggato e l'app parte comunque (degradazione parziale invece di down totale).
for _seed in (_seed_categories, _seed_roles, _seed_operations,
              _seed_edm_defaults, _seed_merge_p20, _seed_material_aliases):
    try:
        _seed()
    except Exception as exc:
        logging.getLogger("mechquote.seed").warning(
            "seed %s fallito: %s", _seed.__name__, exc
        )


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "MechQuote"}


os.makedirs("uploads", exist_ok=True)
# NB: nessun mount statico su /uploads (rimosso, sicurezza). Serviva gli stessi
# file SENZA autenticazione — backdoor rispetto agli endpoint autenticati che
# già li servono (part-file, datasheet materiale, documenti officina) e vettore
# stored-XSS same-origin. Il frontend non usa /uploads: accede ai file solo via
# quegli endpoint (auth + permesso). I file restano su disco in uploads/.
