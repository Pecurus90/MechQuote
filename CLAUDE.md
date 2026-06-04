# MechQuote — Manuale operativo

> **Leggi questo file PRIMA di toccare qualsiasi cosa.** È la fonte di verità su come si lavora qui.

Strumento di preventivazione tecnica per officina meccanica di precisione (Fratelli Dalla Via).

**Stack**: FastAPI + SQLAlchemy 2 + SQLite · React 18 + TypeScript + Vite + Tailwind + shadcn/ui

**Repo GitHub**: https://github.com/Pecurus90/MechQuote.git (branch `main`)

---

## 0. Documenti di progetto — leggili insieme a questo file

Oltre a questo `CLAUDE.md`, il progetto ha due documenti di riferimento. Non
vengono letti in automatico: vanno aperti su richiesta, ma sono parte
integrante del quadro.

- **`MECHQUOTE_RIFERIMENTO.md`** — la "carta d'identità" del progetto: cos'è,
  com'è fatto, decisioni prese, cosa è verificato e cosa solo riferito.
- **`MECHQUOTE_LISTA_LAVORI.md`** — il piano di lavoro: tutti gli interventi
  da fare, filtrati e ordinati per priorità, divisi da "due linee".

**Prima di iniziare un lavoro:** controlla se è nella lista lavori e a quale
blocco appartiene. Non iniziare lavori del Blocco B o C se i lavori del
Blocco A non sono completati, salvo richiesta esplicita dell'utente.

---

## 0-bis. Filosofia

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

## 0-ter. Metodo di lavoro (disciplina, non negoziabile)

Queste regole valgono per ogni sessione e ogni task. Sono il "metodo di
lavoro serio": non una gerarchia di ruoli inventata, ma disciplina concreta.

1. **Un lavoro alla volta.** Affronta un solo intervento per volta. Portalo a
   termine, verificalo, poi fermati. Non incatenare più lavori in una sola
   sessione senza che l'utente lo chieda.
2. **Attieniti al compito assegnato.** Se durante un lavoro noti altro da
   fare, **non eseguirlo**: segnalalo all'utente come proposta, in fondo alla
   risposta, e attendi una decisione. Allargare il compito di propria
   iniziativa è vietato — è la causa più comune di debito e di regressioni.
3. **Capisci prima di toccare.** Prima di modificare codice, spiega in poche
   righe cosa stai per cambiare e perché. Se il task tocca una "zona fragile"
   (vedi §0-quater), fermati ed esponi il piano prima di agire.
4. **Verifica sempre.** Nessun commit senza la verifica obbligatoria della §7.
   Dopo una modifica, prova anche il flusso utente concreto, non solo che il
   codice "compili".
5. **Niente supposizioni.** Se un'informazione non è verificabile dal codice
   o dal contesto, non inventarla: chiedi all'utente. Vale soprattutto per
   decisioni di prodotto e per i prezzi.
6. **In caso di dubbio, fai meno.** Se non è chiaro se un intervento sia
   sicuro, l'opzione corretta è fermarsi e chiedere, non procedere.

---

## 0-quater. Zone fragili — maneggiare con cautela

Le ricognizioni del progetto hanno individuato le parti più delicate. **Non
sono rotte** — funzionano — ma una modifica qui rischia facilmente un effetto
domino. Prima di toccarle, fermati e spiega all'utente cosa stai per fare.

- **`backend/app/services/calculation.py` — `recalculate_quote()`**
  È il motore di calcolo prezzi: ~300 righe con branching intrecciato
  (materiale fornito dal cliente / da magazzino / normale; fasi a €/kg e
  €/dm³; aggregazioni cross-parti). È il punto più delicato dell'intero
  progetto. Ogni modifica qui va spiegata prima e verificata con cura.
- **`backend/app/main.py` — `_run_migrations()`**
  ~187 migrazioni inline, l'ordine conta (dipendenze tra loro). Una nuova
  migrazione va aggiunta sapendo cosa viene prima e dopo.
- **La formula del costo fase esiste in TRE copie** che devono restare
  identiche: `calculation.py` (backend), `PhaseEditor.tsx` `calcPhase()` e
  `PartCard.tsx` (parte setup). Modificarne una senza le altre crea
  divergenze di prezzo tra anteprima e valore salvato.
- **Cost engine backend ↔ frontend** in generale: ogni "gemello DRY" va
  modificato su entrambi i lati nello stesso commit (vedi §4).

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
2. Identifica dove la logica si replica (DRY) o dove un file supera la soglia (vedi §5).
3. Esegui il refactor in **un commit separato dal bug fix / feature** che lo motiva.
4. Verifica che il comportamento è invariato.

### E — Smoke test / esperimenti contro DB locale (REGOLA CRITICA)

⚠️  **PRIMA di chiamare endpoint distruttivi o di lanciare integration test che toccano il DB di sviluppo, fai sempre backup.**

Endpoint distruttivi:
- `POST /api/backup/import` (svuota tutte le tabelle prima di reimportare)
- DELETE batch su Quote/Part/Phase senza filtro mirato
- Qualsiasi `db.query(Model).delete()` da script ad-hoc
- Suite pytest `tests/integration/*` (ricreano user/role e fanno DELETE+INSERT su quotes per testare isolamento)

**Workflow obbligatorio — backup corretto WAL-aware:**

SQLite di MechQuote gira in modalità WAL: le ultime scritture vivono nel file
`mechquote.db-wal`, non ancora in `mechquote.db`. Una copia semplice del solo
`.db` (`cp mechquote.db ...`) produce un backup **incompleto**. Usare sempre
il comando di backup nativo di SQLite, che è atomico e WAL-aware:

```bash
cd backend
sqlite3 mechquote.db ".backup 'mechquote.db.bak-$(date +%Y%m%d-%H%M%S)'"
```

In alternativa, forzare il merge del WAL prima di copiare:
`sqlite3 mechquote.db "PRAGMA wal_checkpoint(TRUNCATE);"` e poi copiare.

Workflow:
1. **Snapshot DB** col comando `.backup` qui sopra — un secondo, costo zero.
2. Esegui il test/smoke.
3. Se è andato bene puoi lasciare il `.bak`; se è andato male, ripristina il
   `.bak` (a servizio fermo) e riparti.

**Perché è critico**: SQLite non enforce le foreign key di default (`PRAGMA foreign_keys` è OFF). Un payload "test" con FK violate viene accettato e committato → DELETE+INSERT genera DB inconsistente o vuoto, **senza recovery automatico**. Episodio reale: 2026-05-10, smoke test backup ha cancellato customers/materials/preventivi/CompanySettings perché il payload corrotto è passato il check FK (silenzioso) e il commit è stato persistito.

Vale anche se "ho appena fatto un commit" — il commit git non protegge il DB SQLite (non è versionato).

---

## 3. Sicurezza & permessi (non negoziabile)

### Sistema permessi dinamico

I ruoli sono creabili dall'UI (`Impostazioni → Sistema → Ruoli e Permessi`). I **permessi** sono chiavi fisse nel codice (`backend/app/core/permissions.py` → `PERMISSION_KEYS`). L'assegnazione permessi→ruoli è in `role_permissions` (DB), modificabile dall'UI.

Chiavi attuali (`PERMISSION_KEYS`):
- `dashboard` · `quotes.create` · `quotes.archive` · `quotes.pdf`
- `quotes.send` (chi può "Invia per revisione")
- `quotes.complete` (chi marca completato aprendo)
- `quotes.view_all` (vede tutti i preventivi, non solo i propri)
- `customers` · `settings` (catalogo) · `company` (dati azienda)
- `users` · `backup` · `notifications`
- `orders.materials` (Ordini materiali — lista + PDF)
- `tools` (Gestione utensili **e** ordini utensili — copertura voluta)
- `officina` (Officina — lettura documenti / reference / calcolatori)
- `officina.write` (Officina — upload + modifica)
- `dies.create` · `dies.archive` · `dies.pdf` · `dies.settings` (modulo Preventivatore Stampi)

### Regola di gating

**Mai usare `roles=['admin']` per gating se esiste un permesso equivalente.** Il sistema è dinamico: l'admin può ridefinire chi accede a cosa senza redeploy.

### Anti-lockout
Se il ruolo dell'utente non esiste in `roles` ma è `admin` (slug), `get_current_user` gli assegna comunque tutti i `PERMISSION_KEYS`. Garantisce di non chiudersi fuori.

### Bootstrap primo admin

Non esiste registrazione pubblica. Il primo admin si crea (o si reimposta dopo un disastro) in DB con uno script di upsert idempotente.

> ⚠️ **AVVISO DI SICUREZZA — leggere prima di usare lo script.**
> Lo script di bootstrap imposta una password **provvisoria e debole**
> (`admin`). Va bene **solo** sul PC di sviluppo.
> **Sul server di produzione, una password di default è una falla grave:**
> chiunque conosca "admin/admin" entra come amministratore e vede tutti i
> dati aziendali. Tutta la sicurezza di MechQuote (bcrypt, permessi) è
> annullata da questo.
> Regola: sul server, **subito dopo** il bootstrap, l'utente admin deve
> cambiare la password con una forte. Questo è un punto della lista lavori
> (Blocco A). Non considerare il server "a posto" finché non è fatto.

Script (upsert idempotente — lanciato N volte produce lo stesso stato):

```bash
cd backend
venv/bin/python -c "
from app.models import User
from app.core.security import get_password_hash
from app.core.database import SessionLocal
db = SessionLocal()
existing = db.query(User).filter(User.username == 'admin').first()
if existing:
    existing.hashed_password = get_password_hash('admin')
    existing.is_active = True
    existing.role = 'admin'
    print('Admin esistente: password resettata a admin')
else:
    db.add(User(username='admin', hashed_password=get_password_hash('admin'),
                full_name='Admin', role='admin', is_active=True))
    print('Admin creato')
db.commit()
"
```

### File upload

Limite hardcoded a **50 MB** in `parts.py upload_file` (stream a chunk). Niente file mai accettati senza autenticazione + permesso scrittura.

> Nota dalle ricognizioni: la validazione dei file è oggi basata
> sull'estensione del nome, non sul contenuto reale; inoltre la cartella
> `uploads/` è servita come statica senza autenticazione. Entrambi sono in
> lista lavori (Blocco B). Tienilo presente quando tocchi gli upload.

### SECRET_KEY

`backend/app/core/config.py` rifiuta l'avvio se `SECRET_KEY` è il default e `ALLOWED_ORIGINS` indica un dominio non-localhost. In dev locale resta solo un warning.

---

## 4. Architettura

### Data model

> **Fonte autoritativa**: `backend/app/models.py`. Qui sotto solo overview a domini per orientamento — non un diagramma esaustivo (che andrebbe in drift a ogni feature).

Il modello SQLAlchemy è organizzato in 8 domini logici:
- **Auth**: `User`, `Role`, `RolePermission` — utenti, ruoli dinamici, mapping permessi.
- **Quotes / Costing**: `Quote → Part [N] → ManufacturingPhase [N] → PartFile [N]` — preventivo, parti, fasi di lavorazione con file allegati. `Quote.created_by/submitted_by/completed_by/material_ordered_by` puntano a `User`. `QuoteCategory` lettera codice A-G.
- **Catalog materiali**: `Material → MaterialSupplier`, `NormalizedSupplier` (viti/bulloni/cuscinetti). Material ha scheda PDF opzionale (`datasheet_path`).
- **Catalog operations**: `Operation` (catalogo Lavorazioni utente), `Machine`, `Treatment → Supplier` (trattamenti/lavorazioni esterne). `WorkflowTemplate → WorkflowTemplateStep` (sequenze riusabili applicate clean-slate alla Part). `StepColorRule` (mapping colore STEP → fase, dormiente fino a import 3D).
- **Officina**: `OfficinaDocument` (PDF/Word/Excel/immagini/DXF, MIME filtrato server-side), `OfficinaCategory` (icona lucide-react). Documenti linkabili opzionalmente a `Customer` / `MaterialSupplier` / `ToolSupplier` / `NormalizedSupplier`.
- **Orders**: `MaterialOrder → MaterialOrderQuote` (storico ordini materiale, N:M con `Quote`), `ToolOrder → ToolOrderItem` (storico utensili con snapshot di codice/marca/quantità al momento dell'ordine).
- **Tools / Utensili**: `Tool` (anagrafica utensili) con attributi catalogo via stringa libera + lookup: `ToolType`, `ToolBrand`, `ToolLocation`, `ToolSupplier`.
- **EDM** (Wire EDM): `EdmConfig` (singleton id=1, parametri taglio default), `EdmCutSpeed` (velocità per materiale × spessore × pass), `CuttingCycle → CuttingPass` (cicli di taglio multi-pass), `DrillingTime` (tempi foratura).

Cross-cutting:
- `CompanySettings` — singleton id=1: anagrafica + 4 default operativi (margine/prezzo minimo/trasporto/packaging) + override stock shipping/cutting.
- `Notification → NotificationRead` — in-app, generiche, `target_roles[]` + `target_user_id`.

Il diagramma di riferimento canonico è inline in `models.py` con docstring sui modelli.

### `Supplier` vs `MaterialSupplier` — perché due tabelle

I due modelli hanno ~80% dei campi sovrapposti (`name`, `address`, `shipping_cost`, `active`) ma rappresentano domini distinti — l'audit ha valutato l'unificazione e l'ha scartata per ROI basso vs rischio FK su tabelle live.

| | `MaterialSupplier` | `Supplier` |
|---|---|---|
| **Cosa rappresenta** | Chi vende il materiale grezzo | Chi fa lavorazioni/trattamenti per conto terzi |
| **Usato da** | `Material.supplier_id` | `ManufacturingPhase.supplier_id`, `Treatment.supplier_id` |
| **Campi extra** | `cutting_cost_per_part` (taglio del grezzo prima della consegna) | `supplier_type` (metadato libero) |
| **Settings UI** | Materiali → sezione "Fornitori grezzi" | Trattamenti → sezione "Fornitori esterni" |

**Quando aggiungi un fornitore in codice**: scegli `MaterialSupplier` se riguarda l'approvvigionamento materiale grezzo, `Supplier` se riguarda lavorazioni esterne (heat_treatment, surface_treatment, external_supplier phases). Non usare l'uno per l'altro.

### Concorrenza — last write wins

Niente `version_id_col` sui modelli: update concorrenti producono **lost update silente** (due utenti sullo stesso preventivo: l'ultimo che salva sovrascrive l'altro senza avviso).

> Stato: è una scelta storica fatta per uno scope a 1 utente. MechQuote però
> nasce per essere multi-utente. L'introduzione di una protezione (optimistic
> locking via `updated_at` come `If-Match`, con avviso all'utente) è un
> lavoro pianificato — vedi `MECHQUOTE_LISTA_LAVORI.md`, Blocco B. Finché non
> è fatto, l'uso in contemporanea sullo stesso preventivo non è sicuro.

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

**Una sola formula, copie da tenere identiche su backend e frontend**:
- Backend: `backend/app/services/calculation.py` `recalculate_part(part_id, db)` — autoritativo
- Frontend: `frontend/src/components/quotes/PhaseEditor.tsx` `calcPhase()` + `frontend/src/lib/quoteCalc.ts` `calcPartTotals()` — preview live

**Material cost** (gemello DRY, devono restare identici):
- Backend: `backend/app/services/calculation.py` `_compute_material_cost(part, material)`
- Frontend: `frontend/src/lib/quoteCalc.ts` `calcMaterialCost(part, material)`
Backend ricalcola al `recalculate_part` se `part.material_id` + dimensioni grezzo presenti.

**Formula calculated_cost (per pezzo)** — rate split setup vs lavoro:
```
work_rate  = phase.hourly_rate_override ?? machine.hourly_rate ?? 0
setup_rate = machine.setup_hourly_rate ?? work_rate    # NULL → fallback a work_rate
divisor    = quantity                                  # qty della singola parte

calculated_cost =
    (setup_hours × setup_rate)         / divisor   # setup amortizzato, rate dedicato
  + (cycle_hours_per_part × work_rate)             # già per pezzo, rate lavorazione
  + (fixed_cost)                       / divisor   # costo fisso amortizzato
  + variable_cost_per_part                         # già per pezzo
```

Nota: `hourly_rate_override` su `ManufacturingPhase` agisce **solo sul ciclo**
(work_rate). L'attrezzaggio resta legato alla macchina perché è semanticamente
un costo dell'operatore, non della specifica fase. Colonna
`Machine.setup_hourly_rate` opzionale (NULL = retro-compatibile).

> ⚠️ **CORREZIONE — `is_shared` è stato RIMOSSO.**
> Versioni precedenti di questo file e vecchie spec descrivevano un
> `divisor = quantity × (n_parts if phase.is_shared else 1)`, con `is_shared`
> usato per amortizzare setup e costi fissi su tutte le parti del preventivo.
> **Quel meccanismo non esiste più nel codice.** `is_shared` è stato rimosso
> (era ambiguo); oggi `divisor = quantity` sempre, cioè la quantità della
> singola parte. Non cercare `is_shared` nel cost engine, non basarci alcun
> ragionamento. La fonte di verità è `calculation.py`.

**Formula totali parte**:
```
total_cost   = material_cost + delivery_per_piece + cutting_per_piece + Σ(phase.calculated_cost)
unit_price   = max(total_cost, minimum_price) × (1 + margin/100)
total_price  = unit_price × quantity
```

Margine: `part.margin_percent ?? quote.global_margin_percent`.

> Nota dalle ricognizioni: oggi `margin_percent` e `global_discount_percent`
> non hanno limiti — un margine fortemente negativo o uno sconto > 100%
> produce prezzi negativi che arrivano al PDF. L'aggiunta dei vincoli è in
> lista lavori, Blocco A. Inoltre `unit_price` viene arrotondato e poi
> moltiplicato per `quantity`: per qty alte si accumula un errore di
> centesimi (vedi lista lavori, Blocco C).

**Default operativi** (popolati al `POST /quotes` da `CompanySettings`):
- `default_margin_percent` → `Quote.global_margin_percent`
- `default_minimum_part_price` → `Part.minimum_price`
- `default_transport_cost` → `Quote.transport_cost`
- `default_packaging_cost` → `Quote.packaging_cost`

**Archeologia DB** (campi deferred, colonne orfane, campi rimossi) → `docs/specs/16_legacy_columns.md`. **Regola operativa**: la fonte di verità è `models.py`. Colonne SQLite non mappate dal modello = inesistenti (non leggerle, non scriverle).

### Cost engine Stampi (7 livelli, modulo Preventivatore Stampi)

`Quote.quote_type='die'` attiva un secondo cost engine, allineato alla spec utente. Backend autoritativo in `backend/app/services/calculation.py` `_recalculate_die_levels()` (chiamato in coda a `recalculate_quote` se il preventivo è di tipo die). Frontend live preview (solo L3/L4) in `frontend/src/lib/dieCalc.ts` `computeDiePreviewCosts()` — gemello DRY.

```
L1 Materiale piastre  = Σ Part.total_cost × qty  (filtra per plate_role != NULL)
L2 Normalizzati       = Σ (qty × unit_price) + Σ shipping_cost per fornitore distinto
L3 Lavorazioni        = featureCost × coeff_dim × coeff_diff + cost_per_plate_base × n_plates
L4 Accessori          = design_hours[diff] × design_hourly_rate + assembly_forfeit[diff] + extras
L5 Industriale        = (override_material ?? L1) + (override_normalized ?? L2) + (override_machining ?? L3) + (override_accessories ?? L4)
L6 Markup (UI/PDF)    = L5 × (1 + global_margin_percent / 100)
L7 Sconto (UI/PDF)    = L6 × (1 - global_discount_percent / 100)
```

- `featureCost` = Σ (n_bends_{simple,medium,complex} × cost_bend_{simple,medium,complex}) + Σ (n_punches_* × cost_punch_*)
- `coeff_dim` = lookup `DieDimensionBracket` per `area_castello_dm² ∈ [area_min, area_max)`, fallback 1.0
- `coeff_diff` = `DieSettings.diff_mult_{base,medium,hard}` su `spec.difficulty`
- `cost_per_plate_base`, `design_hours_*`, `assembly_forfeit_*`, tariffe → `DieSettings` (singleton id=1)
- **Override matita**: `DieSpec.override_{material,normalized,machining,accessories}` — null-coalesce; impostarli forza la riga corrispondente in L5 ignorando il calcolato.
- **Auto-fill X/Y piastre**: in `recalculate_quote`, per Part con `plate_role != NULL`, se `raw_x_mm/raw_y_mm IS NULL` vengono popolati dal castello calcolato (override esplicito utente preservato, anche se 0).

> Nota dalle ricognizioni: `L6/L7` (markup e sconto) sono applicati lato
> UI/PDF e **non persistiti** nel DB — `DieSpec.cost_industrial` salvato è al
> lordo. Report estratti direttamente dal DB non corrispondono ai PDF.
> Inoltre il live preview frontend non gestisce i trattamenti a €/dm³ e in
> alcuni casi il totale stampo somma solo le piastre: vedi lista lavori.

Gemelli geometria/lookup (devono restare identici):
- `_compute_castle_dimensions(spec)` ↔ `computeDieGeometry(input)`
- `_bracket_coefficient(area, brackets)` ↔ `bracketCoefficient(area, brackets)`

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
- Endpoint **DELETE** su tabelle catalog (Material, Machine, Treatment, Supplier, Operation, ToolType, Customer, ecc.): SEMPRE chiamare `block_if_in_use()` (in `app.core.catalog_protect`) prima di `db.delete()`. Per cataloghi con riferimento via **stringa libera** (raro: oggi solo `ToolType.name`/`ToolBrand.name`/`ToolLocation.name` ↔ `Tool.tool_type`/`brand`/`location`), il PUT deve anche fare cascade rename via `UPDATE` manuale su tutte le tabelle child (pattern in `_mount_tool_attribute_crud` in `api/tools.py`). Senza `block_if_in_use` lasci orfani su SQLite (FK non enforced) o sollevi `IntegrityError` generici opachi.

### Frontend (TypeScript strict)
- `PascalCase` per componenti, `camelCase` per variabili
- Tipi condivisi in `frontend/src/types/index.ts`. **Mai** ridefinire un tipo già lì in modo locale (`interface Supplier {...}` dentro un componente: ❌)
- Niente `any`. Se serve un escape hatch, usa `unknown` + narrowing
- API tramite `@/lib/api` (Axios con auth interceptor + 401 → logout). Mai `fetch()` diretto
- shadcn/ui primitives only (`@/components/ui/*`). No altre UI library
- Toast per ogni feedback utente: `toast.success()`, `toast.error()`. Mai `alert()`. Mai `useState error` + JSX inline
- `console.error/log/warn` solo se hai contesto utile, mai nudo nei catch (preferisci toast)
- Settings page: pattern inline-edit di `QuoteCategoriesPage.tsx` (table + edit row state + new row in fondo)
- Pagine catalogo (lista valori semplici, es. `ToolAttributesPage`): **niente colonna/toggle "Attivo"** nella UI. Le voci si gestiscono solo con create/edit/delete. Il campo `active` può restare nel modello come default `True` per compatibilità ma non va esposto. Motivo: aggiungeva attrito senza valore reale (chi non usa una voce la elimina, non la "disattiva")

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
- L'ordine delle migrazioni conta (dipendenze tra loro). Una nuova migrazione va inserita sapendo cosa la precede. Vedi §0-quater.

---

## 7. Verifica obbligatoria prima di committare

```bash
# 1. TypeScript pulito
cd frontend && npx tsc --noEmit

# 2. Backend si avvia
cd backend && venv/bin/python -c "from app.main import app; print('OK')"

# 3. Test automatici (se il cambio tocca calcoli, modelli o API)
cd backend && venv/bin/python -m pytest tests/unit -x

# 4. (sempre) prova manuale del flusso toccato dal cambio
```

Se TS o startup o i test falliscono, **non committare**. Se commit, **non pushare**.

---

## 8. Commit / push / PR

- Conventional Commits in italiano: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Body: max 72 char per riga, focus sul **perché** del cambiamento, non solo sul cosa
- Footer: `Co-Authored-By: Claude <noreply@anthropic.com>` quando è co-scritto con Claude
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
| Nuovo campo nel modello senza riga in `_run_migrations` | DB esistente non ha la colonna, errore runtime | Modello + migration insieme, sempre. Verifica con `grep <nome_col> backend/app/main.py` prima di committare. |
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
| useEffect deps incomplete + `eslint-disable` | Bug latente: l'effect non rifirà quando dovrebbe | Includi le deps che rappresentano gli input semantici dell'effect |
| `DELETE` su catalog senza `block_if_in_use` | Orfani in tabelle child (SQLite FK non enforced) o `IntegrityError` opaco | Helper `block_if_in_use` da `app.core.catalog_protect`, sempre |
| Backup del DB con copia semplice del solo `.db` | Backup incompleto: le ultime scritture nel `.db-wal` vengono perse | Usare `sqlite3 .backup` (WAL-aware), mai `cp mechquote.db`. Vedi §2.E |
| Password admin di default (`admin`) lasciata sul server | Falla di sicurezza grave: accesso amministratore a chiunque | Sul server, cambiare la password admin subito dopo il bootstrap. Vedi §3 |
| Modificare una formula del cost engine in un solo layer | Anteprima e prezzo salvato divergono | I gemelli DRY backend↔frontend si modificano insieme, stesso commit. Vedi §0-quater e §4 |

---

## 10. Struttura cartelle

```
backend/app/
  api/             # Un file per resource group:
                   #  Quotes/Costing: quotes, quotes_archive, parts, phases, pdf
                   #  Stampi: dies, die_normalized_items, die_settings
                   #  Catalog: customers, materials, machines, treatments, catalog,
                   #           operations, workflow_templates, normalized_suppliers
                   #  Officina: officina
                   #  Orders: orders, orders_pdf, orders_tools
                   #  Tools: tools, tools_pdf
                   #  EDM: edm
                   #  Sistema: auth, roles, users, company, dashboard, notifications, backup
  core/
    config.py      # Settings env-driven (SECRET_KEY, DATABASE_URL, ALLOWED_ORIGINS)
    database.py    # engine, SessionLocal, Base
    permissions.py # PERMISSION_KEYS + DEFAULT_ROLE_PERMISSIONS
    security.py    # JWT, get_current_user (carica permissions[]), require_role, require_permission
    catalog_protect.py # block_if_in_use helper per DELETE su tabelle catalog
    csv_import.py     # motore import CSV cataloghi (engine + template + parse_decimal_it)
  models.py        # SQLAlchemy ORM, single source of truth schema DB
  schemas.py       # Pydantic Base/Create/Update/Out
  services/
    calculation.py # recalculate_part — cost engine autoritativo
    dxf_parser.py  # parse_dxf — analisi DXF in-memory per wizard 2D
    notifications.py # create_notification helper generico
  main.py          # startup, _run_migrations, _seed_categories/_seed_roles/_seed_edm_defaults, router register

frontend/src/
  pages/           # 1 file per route. Top-level domini:
                   #  Dashboard / QuoteEditor / QuoteArchivePage / NewQuotePage / NewQuote2DPage
                   #  ToolsPage / ActivityPage / LoginPage
                   #  officina/   (OfficinaHub, DocumentsPage, MaterialsPage)
                   #  orders/     (OrdersMaterialsPage, OrdersToolsPage)
                   #  settings/   (Materials, Machines, Operations, Workflows,
                   #               Treatments, *Suppliers, edm/*, Users, Roles, ecc.)
  components/
    layout/        # AppLayout, Sidebar, NotificationPanel
    quotes/        # PartCard, PhaseEditor, QuoteWizard, EdmPhaseFields, Dxf/*
    ui/            # shadcn primitives
  lib/
    api.ts            # Axios instance + interceptor
    auth.tsx          # AuthProvider, useAuth, hasRole, hasPermission
    constants.ts      # STATUS_LABELS/COLORS (PHASE_TYPES rimosso post-refactor Operation)
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
| `backend/app/services/calculation.py` | Cost engine — sincrono col frontend. ZONA FRAGILE (§0-quater) |
| `backend/app/services/notifications.py` | `create_notification()` helper generico |
| `backend/app/api/quotes.py` | CRUD preventivi, PATCH /status, ensure_editable, auto-mark completato |
| `backend/app/api/operations.py` | CRUD catalogo Lavorazioni utente |
| `backend/app/api/workflow_templates.py` | CRUD WorkflowTemplate + endpoint apply (clean-slate sulla Part) |
| `backend/app/api/notifications.py` | Lista, unread-count, read, confirm, clear-read |
| `backend/app/api/dashboard.py` | KPI, monthly multi-metrica, workflow-stats, my-quotes, to-review, activity |
| `backend/app/api/company.py` | CompanySettings GET/PUT |
| `backend/app/core/permissions.py` | `PERMISSION_KEYS`, `DEFAULT_ROLE_PERMISSIONS` |
| `backend/app/core/catalog_protect.py` | `block_if_in_use()` per DELETE su tabelle catalog |
| `backend/app/api/officina.py` | CRUD `OfficinaDocument` + `OfficinaCategory` (multi-MIME, viewer DXF) |
| `backend/app/api/orders.py` + `orders_tools.py` | Material/Tool orders, lista + aggregate + low-stock |
| `backend/app/api/tools.py` | CRUD `Tool` + factory CRUD attributi (Type/Brand/Location) con cascade rename |
| `backend/app/api/edm.py` | EdmConfig singleton + EdmCutSpeed + CuttingCycle + DrillingTime |
| `backend/app/api/dies.py` | CRUD preventivo stampo + clone (rev2/3) + apply-template + find-similar |
| `backend/app/api/die_normalized_items.py` | CRUD normalizzati su preventivo stampo |
| `backend/app/api/die_settings.py` | DieSettings singleton + DieDimensionBracket + DieTemplate CRUD |
| `frontend/src/pages/NewDieQuotePage.tsx` | Wizard creazione stampo (2 step + DXF + render live) |
| `frontend/src/pages/DieQuoteEditor.tsx` | Editor preventivo stampo (form + cost table L1-L7 con override matita) |
| `frontend/src/pages/settings/DiesSettingsPage.tsx` | Impostazioni Stampi (3 tab: tariffe, fasce, template) |
| `frontend/src/lib/dieCalc.ts` | computeDieGeometry / bracketCoefficient / computeDiePreviewCosts (gemelli backend) |
| `frontend/src/pages/QuoteEditor.tsx` | Editor preventivo (~600 righe) |
| `frontend/src/pages/DashboardPage.tsx` | Dashboard role-aware (KPI + grafico multi-metrica + sezioni di lavoro) |
| `frontend/src/pages/ToolsPage.tsx` | Anagrafica utensili + filtri + scan codice |
| `frontend/src/pages/officina/*.tsx` | Hub officina + Documenti + Materiali (scheda PDF) |
| `frontend/src/pages/orders/*.tsx` | Ordini materiali + Ordini utensili (mini-dashboard KPI inline) |
| `frontend/src/components/quotes/PhaseEditor.tsx` | Lista fasi + calcPhase() (gemello di calculation.py) |
| `frontend/src/lib/quoteCalc.ts` | Calc material/treatment/part/quote |
| `frontend/src/lib/auth.tsx` | AuthContext, hasPermission |

---

## 12. Spec docs (`docs/specs/`)

Le spec sono **target storici/documentati**, non sempre allineate al codice corrente. In caso di divergenza: il codice ha priorità. Aggiorna la spec quando la divergenza è intenzionale, altrimenti pianifica con l'utente.

`02`, `04`, `06`, `10` sono marcate **DEPRECATED — DRIFT** in testa al file: non usarle come riferimento operativo. `04_data_model.md` → leggi `models.py`. `06_cost_engine_formulas.md` → leggi §4 "Cost engine" qui sopra + `services/calculation.py`. `10_settings_and_rules.md` → `CompanySettings` singleton + UI Catalogo/Sistema.

`16_legacy_columns.md` archeologia DB (campi deferred / colonne orfane / campi rimossi).

`docs/ROADMAP.md` è stato ritirato come diario di stato: lo stato vive in `MECHQUOTE_RIFERIMENTO.md` §0 e `MECHQUOTE_LISTA_LAVORI.md`.

> Nota: la cartella `PRV/` contiene il vecchio sito aziendale — un progetto
> diverso, completamente estraneo a MechQuote. È isolata (esclusa da Git) e il
> codice di MechQuote non la tocca. **Ignorala** per qualsiasi modifica.

---

## 13. Quando chiamare l'utente

- Decisioni di prodotto (es. "il preventivo si può eliminare anche dopo l'invio?")
- Trade-off non risolvibili dal contesto (es. due implementazioni equivalenti)
- Refactor non triviale (chiedi prima di iniziare)
- Operazioni distruttive su DB / git (drop, force-push, hard reset)
- Prima di toccare una "zona fragile" (§0-quater)
- Quando ti viene in mente un lavoro in più rispetto al task assegnato: proponilo, non eseguirlo (§0-ter, regola 2)
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
2. Leggi `MECHQUOTE_RIFERIMENTO.md` §0 per lo stato corrente (cosa e' fatto / da fare).
3. Per il quadro completo del progetto e il piano di lavoro, fai riferimento
   a `MECHQUOTE_RIFERIMENTO.md` e `MECHQUOTE_LISTA_LAVORI.md` (§0).
4. Se l'utente cita un dominio specifico, leggi la spec relativa in `docs/specs/`.
5. **Solo poi** proponi/agisci.
