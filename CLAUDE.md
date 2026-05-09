# MechQuote — Manuale operativo

> **Leggi questo file PRIMA di toccare qualsiasi cosa.** È la fonte di verità su come si lavora qui.

Strumento di preventivazione tecnica per officina meccanica di precisione (Fratelli Dalla Via).

**Stack**: FastAPI + SQLAlchemy 2 + SQLite · React 18 + TypeScript + Vite + Tailwind + shadcn/ui

**Repo GitHub**: https://github.com/Pecurus90/MechQuote.git (branch `main`)

---

## 0. Filosofia

Tre principi sopra tutto. Se sono in contrasto, vincono in quest'ordine:

1. **Don't break the user.** Le bozze in lavoro, i preventivi inviati, i dati aziendali sono lavoro reale di persone reali. Migrazioni distruttive, cambi di stato silenti, refactor senza migration → vietati.
2. **DRY è hard rule.** Una sola fonte di verità per ogni pezzo di logica. Se la stessa formula vive in due layer (es. cost engine backend ↔ frontend live preview), i due punti vanno tenuti **identici** e documentati l'uno con l'altro.
3. **Less is more.** Niente feature speculative, niente layer di astrazione "per il futuro", niente comment-vetrina. Tre righe simili sono meglio di un'astrazione prematura. Quando in dubbio, cancella.

Quando arriva un task, prima di scrivere codice ragiona in quest'ordine:
1. Cosa cambia per l'utente finale?
2. Cosa già esiste e si può riusare?
3. Qual è il fix minimo che risolve il problema senza creare debito nuovo?
4. Quali altri layer devo toccare per restare coerente (modello → migration → schema → API → tipo TS → componente)?
5. Come verifico che non ho rotto niente?

---

## 1. Quick start

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend (terminale separato)
cd frontend
npm install
npm run dev   # http://localhost:5173
```

Vite proxy `/api/*` → `localhost:8000/api/*`.  
DB: SQLite in `backend/mechquote.db` — **mai committare**.

---

## 2. Routine di sviluppo (per tipo di task)

### A — Bug fix mirato

1. Riproduci il bug (manualmente o con un comando concreto).
2. Identifica la riga colpevole (un solo file, di solito).
3. Scrivi il fix minimo. Non rifattorare contestualmente.
4. Verifica:
   - Backend: `cd backend && venv/bin/python -c "from app.main import app; print('OK')"`
   - Frontend: `cd frontend && npx tsc --noEmit`
   - Prova il flusso utente (apri, clicca, controlla toast/risultato).
5. Commit con `fix: ...`.

### B — Nuova feature backend (campo / endpoint / tabella)

Sequenza obbligatoria:

1. **`backend/app/models.py`** — aggiungi campo / classe SQLAlchemy.
2. **`backend/app/main.py`** `_run_migrations()` — aggiungi `ALTER TABLE` o `CREATE TABLE IF NOT EXISTS` dentro la lista. Idempotente: scritto in modo che lanciare il server N volte produce lo stesso DB.
3. **`backend/app/schemas.py`** — schemi Pydantic. Pattern: `Base → Create → Update → Out` con ereditarietà; `Config.from_attributes = True` su `Out`.
4. **`backend/app/api/<resource>.py`** — endpoint. Se è file nuovo: registra in `main.py` con `app.include_router(...)` con la dependency giusta.
5. **Permesso** — se l'endpoint scrive, gating con `require_permission('chiave')`. Se la chiave è nuova, aggiungila a `backend/app/core/permissions.py` `PERMISSION_KEYS` + assegnala ad almeno un ruolo nella migration `role_permissions`.
6. **Frontend** — tipo in `frontend/src/types/index.ts`, chiamata in `lib/api.ts` o nel componente, UI gated con `hasPermission('chiave')`.
7. Verifica TS + backend startup, prova a mano il flusso.
8. Commit `feat: ...`.

### C — Nuova feature frontend / pagina

1. Componente in `frontend/src/pages/<NomePagina>.tsx`.
2. Route in `App.tsx`. Se richiede auth: avvolgila in `<ProtectedRoute permission="chiave">` (NON `roles=`, salvo casi documentati).
3. Link in `Sidebar.tsx` gated con `hasPermission('chiave')`.
4. Tipi in `@/types`, chiamate API tramite `@/lib/api`.
5. Verifica TS check, prova a mano nel browser.

### D — Refactor

Se non c'è un bug e non c'è una feature, **chiedi prima di fare**. Refactor speculativi sono il debito di domani. Se il refactor è giustificato:

1. Spiega in 3 righe cosa cambia e perché.
2. Identifica dove la logica si replica (DRY) o dove un file supera la soglia (vedi §6.2).
3. Esegui il refactor in **un commit separato dal bug fix / feature** che lo motiva.
4. Verifica che il comportamento è invariato.

---

## 3. Sicurezza & permessi (non negoziabile)

### Sistema permessi dinamico

I ruoli sono creabili dall'UI (`Impostazioni → Sistema → Ruoli e Permessi`). I **permessi** sono chiavi fisse nel codice (`backend/app/core/permissions.py` → `PERMISSION_KEYS`). L'assegnazione permessi→ruoli è in `role_permissions` (DB), modificabile dall'UI.

Chiavi attuali (`PERMISSION_KEYS`):
- `dashboard` · `quotes.create` · `quotes.archive` · `quotes.pdf`
- `quotes.send` (chi può "Invia per revisione")
- `quotes.complete` (chi marca completato aprendo)
- `customers` · `settings` (catalogo) · `company` (dati azienda)
- `users` · `backup` · `notifications`

### Regole di gating

| Layer | Pattern |
|---|---|
| Backend endpoint write | `dependencies=[require_permission('chiave')]` o `_=require_permission('chiave')` come parametro |
| Backend endpoint read | dipendenze di base `_auth = [Depends(get_current_user)]` registrate sul router |
| Frontend route | `<ProtectedRoute permission="chiave">` |
| Frontend UI | `hasPermission('chiave')` da `useAuth()` |

**Mai usare `roles=['admin']` per gating se esiste un permesso equivalente.** Il sistema è dinamico: l'admin può ridefinire chi accede a cosa senza redeploy.

### Anti-lockout

Se il ruolo dell'utente non esiste in `roles` ma è `admin` (slug), `get_current_user` gli assegna comunque tutti i `PERMISSION_KEYS`. Garantisce di non chiudersi fuori.

### Bootstrap primo admin

Non esiste registrazione pubblica. Il primo admin si crea in DB:

```bash
cd backend
venv/bin/python -c "
from app.models import User
from app.core.security import get_password_hash
from app.core.database import SessionLocal
db = SessionLocal()
db.add(User(username='admin', hashed_password=get_password_hash('admin'),
            full_name='Admin', role='admin'))
db.commit()
"
```

### File upload

Limite hardcoded a **50 MB** in `parts.py upload_file` (stream a chunk). Niente file mai accettati senza autenticazione + permesso scrittura.

### SECRET_KEY

`backend/app/core/config.py` rifiuta l'avvio se `SECRET_KEY` è il default e `ALLOWED_ORIGINS` indica un dominio non-localhost. In dev locale resta solo un warning.

---

## 4. Architettura

### Data model

```
User ─┬──> Role ─> RolePermission
      │
Quote ──┬─> Customer
        ├─> created_by_user_id, submitted_by_user_id, completed_by_user_id  (User)
        └─> Part [N]
              ├─> Material ─> MaterialSupplier
              ├─> ManufacturingPhase [N]
              │     ├─> Machine
              │     ├─> Supplier
              │     └─> Treatment ─> Supplier
              └─> PartFile [N]

CompanySettings  (singleton id=1: anagrafica + 4 default operativi)
QuoteCategory    (lettera codice preventivo: A-G)
PhaseTemplate    (template fasi riusabili)
StepColorRule    (mapping colori STEP → fasi suggerite, dormiente fino a import 3D)

Notification ─> NotificationRead  (in-app, generiche, target_roles[]+target_user_id)
```

### `Supplier` vs `MaterialSupplier` — perché due tabelle

I due modelli hanno ~80% dei campi sovrapposti (`name`, `address`, `shipping_cost`, `active`) ma rappresentano domini distinti — l'audit ha valutato l'unificazione e l'ha scartata per ROI basso vs rischio FK su tabelle live.

| | `MaterialSupplier` | `Supplier` |
|---|---|---|
| **Cosa rappresenta** | Chi vende il materiale grezzo | Chi fa lavorazioni/trattamenti per conto terzi |
| **Usato da** | `Material.supplier_id` | `ManufacturingPhase.supplier_id`, `Treatment.supplier_id`, `PhaseTemplate.default_supplier_id` |
| **Campi extra** | `cutting_cost_per_part` (taglio del grezzo prima della consegna) | `supplier_type` (metadato libero) |
| **Settings UI** | Materiali → sezione "Fornitori grezzi" | Trattamenti → sezione "Fornitori esterni" |

**Quando aggiungi un fornitore in codice**: scegli `MaterialSupplier` se riguarda l'approvvigionamento materiale grezzo, `Supplier` se riguarda lavorazioni esterne (heat_treatment, surface_treatment, external_supplier phases). Non usare l'uno per l'altro.

### Concorrenza — last write wins

I modelli SQLAlchemy non hanno `version_id_col`: due update concorrenti sullo stesso record (es. `Part.margin_percent` modificato da 2 sessioni che hanno letto lo stesso valore iniziale) producono **lost update silente**, l'ultima scrittura vince senza warning. Per un'app a 1 utente è ininfluente.

Se in futuro più utenti operano sullo stesso preventivo, valutare:
1. Optimistic locking via `updated_at` come `If-Match` header (server confronta, 409 se diverso)
2. Lock pessimistico via `Quote.status='in_edit_da_X'` durante l'editing
3. Re-fetch automatico in UI dopo ogni save per allineare la copia client

Ad oggi (2026-05-09) **non documentato come bug**, è una scelta esplicita per ridurre complessità in scope MVP.

### Workflow stati preventivo (interno, 3 stati)

```
bozza ──[quotes.send]──> inviato ──[GET con quotes.complete]──> completato
                          │                                      │
                          └─> notifica a admin+amministrazione    └─> notifica al creatore (1-a-1)
```

Regole:
- `bozza`: editabile da chi ha `quotes.create`
- `inviato`/`completato`: lock per tutti tranne `admin` (`ensure_editable()` in `quotes.py`)
- `completato` è terminale (niente ritorno via UI)
- Eliminazione preventivo: solo creatore (`Quote.created_by_user_id == current_user.id`) o admin

### Cost engine (DRY hard rule)

**Una sola formula, due copie identiche**:
- Backend: `backend/app/services/calculation.py` `recalculate_part(part_id, db)` — autoritativo
- Frontend: `frontend/src/components/quotes/PhaseEditor.tsx` `calcPhase()` + `frontend/src/lib/quoteCalc.ts` `calcPartTotals()` — preview live

**Material cost** (gemello DRY, devono restare identici):
- Backend: `backend/app/services/calculation.py` `_compute_material_cost(part, material)`
- Frontend: `frontend/src/lib/quoteCalc.ts` `calcMaterialCost(part, material)`
Backend ricalcola al `recalculate_part` se `part.material_id` + dimensioni grezzo presenti.

**Formula calculated_cost (per pezzo)** — Sprint 12: rate split setup vs lavoro:
```
work_rate  = phase.hourly_rate_override ?? machine.hourly_rate ?? 0
setup_rate = machine.setup_hourly_rate ?? work_rate    # NULL → fallback a work_rate
divisor    = quantity × (n_parts if phase.is_shared else 1)

calculated_cost =
    (setup_hours × setup_rate)         / divisor   # setup amortizzato, rate dedicato
  + (cycle_hours_per_part × work_rate)             # già per pezzo, rate lavorazione
  + (fixed_cost)                       / divisor   # costo fisso amortizzato
  + variable_cost_per_part                         # già per pezzo
```

Nota: `hourly_rate_override` su `ManufacturingPhase` agisce **solo sul ciclo**
(work_rate). L'attrezzaggio resta legato alla macchina perché è semanticamente
un costo dell'operatore, non della specifica fase. Nuova colonna
`Machine.setup_hourly_rate` opzionale (NULL = retro-compatibile).

Se `is_shared=true` (es. trattamento batch), setup e fixed sono amortizzati su tutte le parti del preventivo, non solo sulla quantity di una.

**Formula totali parte**:
```
total_cost   = material_cost + delivery_per_piece + cutting_per_piece + Σ(phase.calculated_cost)
unit_price   = max(total_cost, minimum_price) × (1 + margin/100)
total_price  = unit_price × quantity
```

Margine: `part.margin_percent ?? quote.global_margin_percent`.

**Default operativi** (popolati al `POST /quotes` da `CompanySettings`):
- `default_margin_percent` → `Quote.global_margin_percent`
- `default_minimum_part_price` → `Part.minimum_price`
- `default_transport_cost` → `Quote.transport_cost`
- `default_packaging_cost` → `Quote.packaging_cost`

**Campi deferred (esistono ma non applicati nel calcolo, dormienti per feature future)**:
- `Material.edm_coefficient` / `cnc_machinability_coefficient` — UI MaterialsPage compila, mai letti dal cost engine. Da cablare con import 3D.
- `Machine.setup_minimum_hours` — UI MachinesPage compila, non applicato come pavimento per setup auto-calcolato. Da cablare con import 2D/3D.
- `StepColorRule.complexity_coefficient` — UI StepColorRulesPage compila, riservato all'import STEP (modulo 3D futuro).
- `Treatment.treatment_type` — metadato descrittivo (UI TreatmentsPage), non filtrato dal calcolo.
- `EdmCutSpeed.material_id` — colonna legacy nel DB pre-refactor famiglia (audit#1 sprint EDM 1.5), non più letta dal modello SQLAlchemy.

**Campi rimossi dal modello in audit#2 sprint 3 B1** (colonne legacy DB, non leggibili da SQLAlchemy):
- `Part.rounding_rule`, `Part.confidence_level`
- `ManufacturingPhase.quantity_multiplier`, `margin_percent_override`
- `Treatment.fixed_cost`, `cost_per_part`, `cost_per_surface_area`

---

## 5. Standards di codice

### Backend (Python 3.9+)

- `snake_case` ovunque
- Type hints su ogni funzione public
- Pydantic schemas in `schemas.py`, mai esporre modelli SQLAlchemy direttamente nelle response
- Un router per file in `api/`, registrato in `main.py` con `prefix="/api"`
- `joinedload` per le relazioni che servono nella response (no N+1)
- Dopo qualsiasi write su `Part` o `ManufacturingPhase` → `recalculate_part(part_id, db)`
- Messaggi `HTTPException` in italiano, contestuali ("Preventivo non trovato", "Permesso negato")
- Try/except solo dove ha senso. Mai `except: pass` nudo. Se necessario, almeno log.

### Frontend (TypeScript strict)

- `PascalCase` per componenti, `camelCase` per variabili
- Tipi condivisi in `frontend/src/types/index.ts`. **Mai** ridefinire un tipo già lì in modo locale (`interface Supplier {...}` dentro un componente: ❌)
- Niente `any`. Se serve un escape hatch, usa `unknown` + narrowing
- API tramite `@/lib/api` (Axios con auth interceptor + 401 → logout). Mai `fetch()` diretto
- shadcn/ui primitives only (`@/components/ui/*`). No altre UI library
- Toast per ogni feedback utente: `toast.success()`, `toast.error()`. Mai `alert()`. Mai `useState error` + JSX inline
- `console.error/log/warn` solo se hai contesto utile, mai nudo nei catch (preferisci toast)
- Settings page: pattern inline-edit di `QuoteCategoriesPage.tsx` (table + edit row state + new row in fondo)

### File "oversize"

Quando estrarre un componente da un file:
- Il file genitore supera ~300 righe **e** il componente ha stato/responsabilità distinta
- Il componente è usato da più di una pagina (trigger più forte, indipendente dalle righe)

Non estrarre se:
- Il blocco è JSX inline senza stato proprio
- L'estrazione richiede 8+ props (segnale che la responsabilità è nel padre)
- Il file è coeso (fa una cosa sola, una sola pagina lo usa)

Dove mettere l'estratto:
- 1 sola pagina lo usa → co-locato (`pages/<NomePagina>/<NomeComponente>.tsx`)
- Multi-pagina → `components/<feature>/<NomeComponente>.tsx`
- Logica pura senza JSX → `lib/<nomeFile>.ts`

---

## 6. Database & migrazioni

### Pattern manuale (no Alembic)

Tutte le migrazioni vivono in `backend/app/main.py` `_run_migrations()`, eseguite a startup dentro `try/except` (pass-on-error per idempotenza):

```python
migrations = [
    "ALTER TABLE quotes ADD COLUMN new_col VARCHAR(20) DEFAULT 'val'",
    "CREATE TABLE IF NOT EXISTS new_table (...)",
    "UPDATE quotes SET status = 'bozza' WHERE status = 'draft'",
    "DELETE FROM role_permissions WHERE permission_key = 'X'",
    "INSERT INTO role_permissions (role_id, permission_key) SELECT id, 'X' FROM roles WHERE name = 'Y'",
]
```

Regole:
- Mai usare SQLAlchemy `Enum` types (collisioni di nome in SQLite). Usa `String(N)` con valori ammessi documentati nel commento del modello.
- SQLite non supporta `DROP COLUMN`. Progetta colonne con cura. Se una diventa obsoleta, lascia la colonna e smetti di leggerla — niente drop.
- Migrazioni `INSERT/UPDATE/DELETE` devono essere **idempotenti** (eseguibili N volte senza danno). Pattern tipici: `WHERE NOT EXISTS`, `INSERT OR IGNORE`, `DELETE` prima di `INSERT` di seed.
- Aggiungi sempre la colonna **anche** in `_run_migrations()` quando aggiungi un campo al modello, per non rompere DB esistenti.

---

## 7. Verifica obbligatoria prima di committare

```bash
# 1. TypeScript pulito
cd frontend && npx tsc --noEmit

# 2. Backend si avvia
cd backend && venv/bin/python -c "from app.main import app; print('OK')"

# 3. (opzionale ma consigliato) prova manuale del flusso toccato dal cambio
```

Se TS o startup falliscono, **non committare**. Se commit, **non pushare**.

---

## 8. Commit / push / PR

- Conventional Commits in italiano: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Body: max 72 char per riga, focus sul **perché** del cambiamento, non solo sul cosa
- Footer: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` quando è co-scritto con Claude
- Mai committare: `*.db`, `.env`, `node_modules`, `venv`, `dist`
- Push solo dopo `tsc --noEmit` verde e backend startup OK
- Mai amend su commit pushati. Mai `--no-verify`.

---

## 9. Errori classici da non ripetere

| Errore | Conseguenza | Regola |
|--------|-------------|--------|
| `quote.date` invece di `quote.quote_date` | `AttributeError` al render PDF | Il campo è `quote_date`, sempre |
| Query param `email: str` invece di body Pydantic | Frontend non riesce a inviare JSON | Usa `req: SchemaName` come body, mai query param per dati strutturati |
| SQLAlchemy `Enum(name="x")` | `InvalidRequestError` startup | `String(N)` con valori documentati nel commento |
| Nuovo campo nel modello senza riga in `_run_migrations` | DB esistente non ha la colonna, errore runtime | Modello + migration insieme, sempre |
| `joinedload` mancante in GET detail | N+1, dati relazionali vuoti | `joinedload` per ogni relazione usata nella response |
| `recalculate_part()` non chiamato dopo write | Totali disallineati DB ↔ UI | Dopo ogni POST/PUT/DELETE su Phase/Part |
| Componente estratto porta con sé costanti del padre | `ReferenceError` runtime | Verifica costanti dopo ogni estrazione |
| Tipo TS non aggiornato dopo modifica schema | Errori TS silenziosi, `undefined` runtime | Schema Pydantic + tipo TS nello stesso commit |
| Concatenazione in query SQL | SQL injection | `text("... WHERE id = :id"), {"id": id}` |
| `alert()` invece di toast | UX scadente, blocca thread | `toast.success/error()` da `sonner` |
| API senza feedback visivo | Utente non sa se è andato | Ogni `await api.post/put/delete` → toast |
| `useState error` + JSX inline per messaggi | Stato extra, design inconsistente | `toast.error()`, niente JSX |
| `roles=['admin']` invece di `permission='X'` | Gating hardcoded, sistema dinamico inutile | Sempre `permission=` salvo deroghe documentate |
| `console.error(e); toast.error(...)` nudo | Rumore senza valore in prod | Solo `toast.error(...)`, oppure log con contesto utile |
| useEffect deps incomplete + `eslint-disable` | Bug latente: l'effect non rifirà quando dovrebbe | Includi le deps che rappresentano gli input semantici dell'effect (es. quantity per ricalcoli legati alla qty) |

---

## 10. Struttura cartelle

```
backend/app/
  api/             # Un file per resource group (auth, quotes, parts, phases, dashboard, pdf, backup,
                   #  customers, materials, machines, treatments, catalog, roles, notifications,
                   #  company, quotes_archive)
  core/
    config.py      # Settings env-driven (SECRET_KEY, DATABASE_URL, ALLOWED_ORIGINS)
    database.py    # engine, SessionLocal, Base
    permissions.py # PERMISSION_KEYS + DEFAULT_ROLE_PERMISSIONS
    security.py    # JWT, get_current_user (carica permissions[]), require_role, require_permission
  models.py        # SQLAlchemy ORM, single source of truth schema DB
  schemas.py       # Pydantic Base/Create/Update/Out
  services/
    calculation.py # recalculate_part — cost engine autoritativo
    dxf_parser.py  # parse_dxf — analisi DXF in-memory per wizard 2D
    notifications.py # create_notification helper generico
  main.py          # startup, _run_migrations, _seed_categories/_seed_roles/_seed_edm_defaults, router register

frontend/src/
  pages/           # 1 file per route (DashboardPage, QuoteEditor, QuoteArchivePage, NewQuotePage,
                   #  LoginPage, settings/*)
  components/
    layout/        # AppLayout, Sidebar, NotificationPanel
    quotes/        # PartCard, PhaseEditor, QuoteWizard
    ui/            # shadcn primitives
  lib/
    api.ts            # Axios instance + interceptor
    auth.tsx          # AuthProvider, useAuth, hasRole, hasPermission
    constants.ts      # STATUS_LABELS/COLORS, PHASE_TYPES
    quoteCalc.ts      # calcMaterialCost, calcTreatmentCost, calcPartTotals, calcQuoteTotal
    quoteValidation.ts
    timeAgo.ts        # tempo relativo italiano (riusato ovunque)
    useNotifications.ts # hook polling + read/clear
    utils.ts          # cn() per classi tailwind
  types/index.ts   # tipi TS condivisi (single source of truth)
```

---

## 11. File chiave (mappa rapida)

| File | Cosa fa |
|------|---------|
| `backend/app/models.py` | Schema DB |
| `backend/app/main.py` | Startup, migrations, seed, router register |
| `backend/app/services/calculation.py` | Cost engine — sincrono col frontend |
| `backend/app/services/notifications.py` | `create_notification()` helper generico |
| `backend/app/api/quotes.py` | CRUD preventivi, PATCH /status, ensure_editable, auto-mark completato |
| `backend/app/api/notifications.py` | Lista, unread-count, read, confirm, clear-read |
| `backend/app/api/dashboard.py` | KPI, monthly multi-metrica, workflow-stats, my-quotes, to-review, activity |
| `backend/app/api/company.py` | CompanySettings GET/PUT |
| `backend/app/core/permissions.py` | `PERMISSION_KEYS`, `DEFAULT_ROLE_PERMISSIONS` |
| `frontend/src/pages/QuoteEditor.tsx` | Editor preventivo (oversize ~640 righe, refactor opportuno) |
| `frontend/src/pages/DashboardPage.tsx` | Dashboard role-aware (KPI + grafico multi-metrica + sezioni di lavoro) |
| `frontend/src/components/quotes/PhaseEditor.tsx` | Lista fasi + calcPhase() (gemello di calculation.py) |
| `frontend/src/lib/quoteCalc.ts` | Calc material/treatment/part/quote |
| `frontend/src/lib/auth.tsx` | AuthContext, hasPermission |

---

## 12. Spec docs (`docs/specs/`)

Le spec sono **target documentati**, non sempre allineate al codice corrente. Se cogli una divergenza:
1. Identifica chi ha ragione (codice vs spec)
2. Se la divergenza è intenzionale (decisione di prodotto presa in chat), aggiorna la spec
3. Se la spec è target ancora valido ma il codice è in arretrato, pianifica con l'utente

| File | Stato | Note |
|------|-------|------|
| `01_product_scope.md` | Allineato | Visione |
| `02_ui_dashboard_and_navigation.md` | **Obsoleto** | Sidebar oggi è Operatività + Impostazioni (Catalogo/Azienda/Sistema) |
| `03_create_quote_workflows.md` | Allineato | Wizard manuale + auto-create part |
| `04_data_model.md` | **Drift** | Mancano Role/RolePermission/Notification/CompanySettings/campi workflow |
| `05_manufacturing_cycle.md` | Allineato | Phase types e cycle |
| `06_cost_engine_formulas.md` | **Drift parziale** | Cita `complexity_coefficient`/`rounding`, non implementati |
| `07_cnc_officina_logic.md` | Future | Da DXF/STEP in poi |
| `08_edm_dxf_logic.md` | Future | DXF parsing wireframe |
| `09_step_3d_logic.md` | Future | STEP import |
| `10_settings_and_rules.md` | **Drift** | CostRule sostituita da CompanySettings |
| `11_pdf_output.md` | Allineato | PDF cliente/interno |
| `14_workflow_notifiche_permessi.md` | **Riscritto** | 3 stati `bozza/inviato/completato` (interni) |
| `15_acceptance_criteria.md` | Reference | |

`docs/ROADMAP.md` è il diario di stato (cosa è fatto, cosa manca).

---

## 13. Quando chiamare l'utente

- Decisioni di prodotto (es. "il preventivo si può eliminare anche dopo l'invio?")
- Trade-off non risolvibili dal contesto (es. due implementazioni equivalenti)
- Refactor non triviale (chiedi prima di iniziare)
- Operazioni distruttive su DB / git (drop, force-push, hard reset)
- Quando un audit emerge debito: presentare la lista e farsi approvare gli sprint

Quando NON chiamare l'utente:
- Bug fix evidenti
- Cleanup minore (toglier `console.error`, fix imports)
- Allineamento di terminologia già discussa
- Implementazione di un piano già approvato

---

## 14. Onboarding di una nuova sessione

Quando inizi una sessione nuova, in quest'ordine:
1. Leggi `CLAUDE.md` (questo file).
2. Leggi `docs/ROADMAP.md` per stato corrente.
3. Se l'utente cita un dominio specifico, leggi la spec relativa in `docs/specs/`.
4. **Solo poi** proponi/agisci.
