# MechQuote — Developer Guide

Technical quoting tool for a precision mechanics workshop (Fratelli Dalla Via).  
Stack: **FastAPI + SQLAlchemy 2 + SQLite** | **React 18 + TypeScript + Vite + Tailwind**

> **Prima di iniziare ogni sessione:** leggi `docs/ROADMAP.md` per sapere cosa c'è da fare.

**Core concept:** the app is a quoting tool — everything serves the quote workflow.  
**DRY is a hard rule.** Every piece of logic lives in exactly one place. If it needs to exist in two layers (e.g. cost formula in backend + frontend), those two copies must be kept identical and documented. Duplication found during development must be refactored immediately, not left for later.

Three quote modes, all converging into the same `Quote → Parts → ManufacturingPhases` structure:
- **Manual** — operator enters all phases by hand
- **2D** — DXF or DWG → profile extraction → operator selects profiles → assigns 2D operations (EDM wire, laser, waterjet, profile grinding…)
- **3D** — STEP file → bounding box + color/feature detection → suggested phases → operator reviews and adjusts

---

## Quick start

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Vite proxies `/api/*` → `localhost:8000/api/*` (see `frontend/vite.config.ts`).  
Database: SQLite at `backend/mechquote.db` — **never commit this file**.

---

## Come lavorare

### Verifica obbligatoria prima di chiudere qualsiasi task

```bash
# TypeScript check — deve terminare senza errori
cd frontend && npx tsc --noEmit

# Backend health — deve rispondere 200
curl http://localhost:8000/api/quotes
```

Se il TypeScript check fallisce il task non è completo. Fare sempre questa verifica prima di committare.

---

### Flusso per una nuova feature che tocca il backend

Seguire questa sequenza nell'ordine esatto:

1. **`backend/app/models.py`** — aggiungere il campo/modello SQLAlchemy
2. **`backend/app/main.py`** — aggiungere `ALTER TABLE` in `_run_migrations()` con try/except
3. **`backend/app/schemas.py`** — aggiungere/aggiornare gli schemi Pydantic (pattern: `Base → Create → Update → Out`)
4. **`backend/app/api/<resource>.py`** — aggiungere l'endpoint; chiamare `recalculate_part()` se si tocca Phase o Part
5. **`backend/app/main.py`** — registrare il router se è un file nuovo (`app.include_router(...)`)
6. **Frontend** — aggiungere la chiamata API in `src/lib/api.ts` o direttamente nel componente; aggiornare i tipi TypeScript

### Flusso per un nuovo componente UI

**Quando estrarre un componente** (almeno una delle condizioni):
- Il file genitore supera ~300 righe **e** il componente ha uno stato o una responsabilità distinta
- Il componente è usato da più di una pagina → questo è il trigger più forte, indipendente dalle righe

**Quando NON estrarre:**
- Il blocco è JSX inline senza stato proprio (non è davvero un componente)
- Estrarlo richiederebbe passare 8+ props — segnale che la responsabilità è nel padre
- Il file è lungo ma coeso (fa una cosa sola, solo quella pagina lo usa)

**Dove mettere il file estratto:**
- Usato da 1 pagina sola → `src/pages/<NomePagina>/NomeComponente.tsx` (co-locazione)
- Usato da più pagine → `src/components/<feature>/NomeComponente.tsx`
- Logica pura senza JSX → `src/lib/nomeFile.ts`

**Regola dopo ogni estrazione:** verificare che costanti e tipi usati nel padre **rimangano nel padre** — non seguono il componente automaticamente.

Stessa logica vale per il backend: un file `api/quotes.py` che supera ~300 righe o gestisce più gruppi logici distinti va spezzato in file separati con router dedicati.

### Flusso per aggiungere una nuova pagina

1. Creare `frontend/src/pages/NomePagina.tsx`
2. Aggiungere la route in `frontend/src/App.tsx` (`<Route path="/percorso" element={<NomePagina />} />`)
3. Aggiungere il link nella Sidebar (`frontend/src/components/layout/Sidebar.tsx`)
4. Se la pagina richiede nuovi dati: aggiungere endpoint backend → schema → api call nel componente

### Flusso per una nuova pagina di Settings

Seguire il pattern di `frontend/src/pages/settings/QuoteCategoriesPage.tsx`:
- Tabella con inline edit (edit row state, save on ✓, cancel on ✗)
- Riga "new row" in fondo con sfondo colorato quando attiva
- Pulsante azioni con icone Lucide (`Pencil`, `Trash2`, `Check`, `X`)
- Chiamate API dirette senza store globale (le settings sono rare, non richiedono cache)

---

### DRY — Don't Repeat Yourself

- La formula di costo fase vive in **un solo posto per layer**: `calculation.py` (backend) e `calcPhase()` in `PhaseEditor.tsx` (frontend). Se cambia, aggiornare entrambi — non creare una terza copia.
- Logica condivisa tra pagine frontend → estrarre in `src/lib/` (es. `quoteCalc.ts`).
- Schemi Pydantic: usare ereditarietà (`Base → Create → Update → Out`) invece di ridefinire i campi.
- Tipi TypeScript che rispecchiano schemi Pydantic → tenerli in un unico posto (`src/types/` o vicino al componente che li definisce per primo).
- Non duplicare chiamate API tra pagine — condividere la stessa funzione di fetch.

---

### Regola commit

- Committare dopo ogni unità di lavoro logicamente completa, non tutto alla fine
- Formato messaggio: `tipo: descrizione concisa in italiano o inglese`
  - `feat:` nuova funzionalità
  - `fix:` correzione bug
  - `refactor:` riscrittura senza cambiare comportamento
  - `docs:` solo documentazione
- Non committare `backend/mechquote.db`
- Push solo se il TypeScript check è verde

---

### Errori classici da non ripetere

| Errore | Conseguenza | Regola |
|--------|-------------|--------|
| `quote.date` invece di `quote.quote_date` | `AttributeError` al primo render PDF | Il campo sul modello è `quote_date` — usare sempre quello |
| `email: str` come query param nell'endpoint | Frontend non riesce ad inviare JSON body | Usare sempre `req: SchemaName` come body Pydantic, mai query param per dati strutturati |
| SQLAlchemy `Enum(name="stato")` con nome già usato | `InvalidRequestError` a startup | Usare `Column(String(20))` — mai `Enum` in SQLite |
| Nuovo campo in `models.py` senza `_run_migrations()` | DB esistente non ha la colonna, errore runtime | Ogni campo nuovo va anche in `_run_migrations()` con try/except |
| `joinedload` mancante in GET detail | N+1 query, dati relazionali vuoti nella risposta | Usare sempre `joinedload` per tutte le relazioni usate nella risposta |
| `recalculate_part()` non chiamato dopo write | Totali disallineati tra DB e UI | Chiamare dopo ogni POST/PUT/DELETE su `ManufacturingPhase` o `Part` |
| Componente estratto porta con sé le costanti del padre | `ReferenceError` runtime nel padre | Dopo ogni estrazione verificare che le costanti restino nel padre |
| Tipo TypeScript non aggiornato dopo modifica schema | Errori TS silenziosi, `undefined` a runtime | Aggiornare schema Pydantic e tipo TS nella stessa modifica |
| Concatenazione in query SQL | Potenziale SQL injection | Usare sempre parametri: `db.execute(text("... WHERE id = :id"), {"id": id})` |

---

## Project structure

```
backend/
  app/
    api/          # One file per resource group (quotes, parts, phases, settings, pdf…)
    models.py     # SQLAlchemy ORM models — single source of truth for DB schema
    schemas.py    # Pydantic request/response schemas (separate from models)
    services/
      calculation.py   # recalculate_part() — the authoritative cost engine
    main.py       # App startup: create tables, _run_migrations(), _seed_categories()
    core/
      database.py # SQLAlchemy engine + SessionLocal + Base

frontend/
  src/
    pages/        # One file per route (QuoteEditor, DashboardPage, QuoteArchivePage, settings/*)
    components/
      quotes/     # PhaseEditor, (future: DxfUploader, StepUploader)
      layout/     # AppLayout, Sidebar
      ui/         # shadcn/ui primitives (button, input, card…)
    lib/
      api.ts      # Axios instance — base URL /api
    types/        # TypeScript interfaces shared across pages
```

---

## Data model

```
Quote
  ├── customer_id → Customer
  ├── quote_type: "single" | "commessa"
  └── parts[]
        ├── material_id → Material
        ├── phases[] → ManufacturingPhase
        │     └── machine_id → Machine
        └── files[] → PartFile
              └── geometry → GeometryAnalysis
```

Other tables: `Supplier`, `Treatment`, `CostRule`, `PhaseTemplate`, `StepColorRule`, `QuoteCategory`.

---

## Business rules — READ THIS CAREFULLY

### Quote number format

```
[CCC]-[YY][CAT]_[PPP]

CCC = 3-digit customer code       e.g. 240
YY  = 2-digit year (auto)         e.g. 26
CAT = category letter (A-G, configurable via QuoteCategory table)
PPP = progressive from ERP        e.g. 001

Example: 240-26A_001
```

The quote number is composed in the frontend wizard and stored as a plain string.

### Quote types

| Type | Parts | part_code |
|------|-------|-----------|
| `single` | 1 | = quote_number |
| `commessa` | N | `{quote_number}_01`, `_02`, …, `_NN` |

Parts are auto-created by `POST /api/quotes` based on `num_components`.

### Cost calculation formulas

**Phase cost** (`calculation.py` and `PhaseEditor.tsx` must stay identical):
```
rate = hourly_rate_override ?? machine.hourly_rate ?? 0

phase_cost = (setup_hours × rate)
           + (cycle_hours_per_part × quantity × rate)
           + fixed_cost
           + (variable_cost_per_part × quantity)
```

**Part totals:**
```
total_cost = material_cost + Σ(phase_costs)
unit_price = max(total_cost, minimum_price) × (1 + margin/100)
total_price = unit_price × quantity

margin resolution: part.margin_percent ?? quote.global_margin_percent
```

**Quote total** (fields exist on model, not yet in UI):
```
quote_total = Σ(part.total_price) + transport_cost + packaging_cost - global_discount_percent
```

**Material cost** (rectangular stock — cylindrical planned):
```
volume_mm3 = raw_x × raw_y × raw_z
volume_dm3 = volume_mm3 / 1_000_000
weight_kg  = volume_dm3 × density_kg_dm3
material_cost = weight_kg × cost_per_kg × (1 + scrap_percent/100)
```

### Calculation architecture

- **Backend** (`recalculate_part(part_id, db)` in `services/calculation.py`): authoritative, called after every phase/part write.
- **Frontend** (`calcPhase()` in `PhaseEditor.tsx`, `calcPartTotals()` in `QuoteEditor.tsx`): real-time preview on every keystroke — mirrors the backend formula exactly.
- Rule: frontend shows live preview; backend confirms on save (onBlur).

---

## Database migrations

We use **manual ALTER TABLE** wrapped in `try/except` — no Alembic.  
All migrations live in `_run_migrations()` in `main.py`.

```python
# Pattern
try:
    db.execute(text("ALTER TABLE quotes ADD COLUMN new_col VARCHAR(20) DEFAULT 'val'"))
    db.commit()
except Exception:
    pass  # column already exists
```

**Rules:**
- Never use SQLAlchemy `Enum` types (they cause name-collision issues in SQLite).
- Use `String` columns with allowed values documented in a comment.
- SQLite does not support `DROP COLUMN` — design columns carefully.
- Add all new columns through `_run_migrations()` so existing DBs stay compatible.

---

## API conventions

```
GET    /api/{resource}          list
POST   /api/{resource}          create
GET    /api/{resource}/{id}     detail
PUT    /api/{resource}/{id}     update
DELETE /api/{resource}/{id}     delete
```

Always use `joinedload` for relations in GET detail/list endpoints to avoid N+1.  
Call `recalculate_part(part_id, db)` after every write to `ManufacturingPhase` or `Part`.

---

## Code conventions

**Backend:**
- `snake_case` everywhere
- Type hints on all functions
- Pydantic schemas in `schemas.py`, never import models directly in API responses
- Router per file in `api/`, included in `main.py` with `app.include_router(..., prefix="/api")`

**Frontend:**
- `PascalCase` components, `camelCase` variables
- TypeScript strict — no `any`
- API calls via `src/lib/api.ts` (Axios instance)
- Settings pages follow the inline-edit table pattern in `QuoteCategoriesPage.tsx`
- shadcn/ui primitives only — no other component library

---

## Key files

| File | Purpose |
|------|---------|
| `backend/app/models.py` | DB schema — add columns here + in `_run_migrations()` |
| `backend/app/schemas.py` | Request/response shapes |
| `backend/app/services/calculation.py` | Cost engine — keep in sync with frontend |
| `backend/app/api/quotes.py` | Quote CRUD + email + PDF trigger |
| `backend/app/api/phases.py` | Phase CRUD — always calls `recalculate_part()` |
| `backend/app/main.py` | Startup: migrations, seeds, router registration |
| `frontend/src/pages/QuoteEditor.tsx` | Main quote editing page + wizard |
| `frontend/src/components/quotes/PhaseEditor.tsx` | Phase list with inline cost calc |
| `frontend/src/lib/api.ts` | Axios base client |

---

## Spec documents (`docs/specs/`)

| File | Content |
|------|---------|
| `docs/specs/01_product_scope.md` | What the app is and isn't |
| `docs/specs/03_create_quote_workflows.md` | Quote wizard flow |
| `docs/specs/04_data_model.md` | Field-level data model spec |
| `docs/specs/05_manufacturing_cycle.md` | Phase types and cycle logic |
| `docs/specs/06_cost_engine_formulas.md` | All cost formulas (authoritative) |
| `docs/specs/07_cnc_officina_logic.md` | CNC complexity, MRR, setups |
| `docs/specs/08_edm_dxf_logic.md` | DXF parsing, 2D profile calculator |
| `docs/specs/09_step_3d_logic.md` | STEP import, 3D preview |
| `docs/specs/10_settings_and_rules.md` | Config tables, cost rules |
| `docs/specs/11_pdf_output.md` | PDF layout spec |
| `docs/ROADMAP.md` | What's done, what's next, gap analysis |
