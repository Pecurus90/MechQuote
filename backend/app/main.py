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
    workflow_templates, operations,
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

        # ═══ Conto lavoro: materiale fornito dal cliente ═══
        # Flag boolean su Part. Quando True il cost engine azzera material
        # costs (materiale + spedizione + taglio). Le info dimensionali
        # restano per autocalc EDM e PDF.
        "ALTER TABLE parts ADD COLUMN customer_supplied_material INTEGER DEFAULT 0",

        # ═══ Cleanup tabella `cost_rules` legacy (audit sprint E) ═══
        # Sostituita da CompanySettings (singleton id=1) da molto tempo.
        # Il backfill INSERT INTO company_settings ... SELECT FROM cost_rules
        # qui sopra è già stato eseguito su tutti i DB di prod (la condizione
        # WHERE NOT EXISTS company_settings.id=1 lo rende no-op da boot ≥2).
        # Posso droppare la tabella senza perdere dati: il singleton ne ha
        # ricopiato anagrafica + 4 default operativi. Idempotente: IF EXISTS.
        "DROP TABLE IF EXISTS cost_rules",
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


_run_migrations()
_seed_categories()
_seed_roles()
_seed_operations()
_seed_edm_defaults()


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "MechQuote"}


os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
