# AUDIT FINALE END-TO-END — Preventivazione MechQuote (decisione go/no-go produzione)

> Prompt pronto da dare a un agente per l'ultimo controllo prima di iniziare a
> usare l'app. Costruito sulla conoscenza reale del repo (percorsi, convenzioni,
> harness di test, cosa è già stato corretto). Copiare da "RUOLO E OBIETTIVO" in giù.

---

## RUOLO E OBIETTIVO
Sei un auditor esperto di QA + code review + sicurezza + UX. Devi verificare che
**l'intero flusso di preventivazione E il suo downstream operativo** di MechQuote
(backend FastAPI/SQLAlchemy/SQLite + frontend React/TS/Vite) funzionino end-to-end e
siano pronti per l'uso reale in officina. È l'ULTIMO controllo prima di iniziare a
usare l'app.

Il perimetro NON è solo il preventivo: un preventivo confermato non è "finito"
finché il **materiale non è ordinato**. Copri quindi anche:
- **Ordini materiale** (spec 18): evasione per fornitore, stato materiale del
  preventivo (`da ordinare`/`parziale`/`evaso`), promozione/retrocessione
  automatica `confermato↔completo`, CSV per ordine/per preventivo, eliminazione
  ordine (ri-apertura), import da file (distinta) con alias appresi.
- **Normalizzati** (viti/bulloni/cuscinetti): catalogo + fornitori normalizzati +
  ordini da file. Sono ORTOGONALI ai preventivi (nessuna parte li referenzia).
- **Ordini utensili** (`orders_tools.py`) dove tocca lo stesso schema di ordine.

Priorità assoluta, in quest'ordine:
1. **Situazioni BLOCCANTI / vicoli ciechi / stati senza via di ritorno**: un utente
   che resta incastrato, un preventivo che si "impianta" in uno stato da cui non
   esce, un form che non si può inviare, un campo obbligatorio non compilabile, un
   modale che intrappola, un errore senza recovery, un'azione irreversibile senza
   conferma, perdita di lavoro non salvato cambiando pagina.
2. **Perdita/incoerenza dati**: anteprima ≠ valore salvato ≠ PDF; ricalcoli mancati;
   last-write-wins; orfani in DB.
3. **Bug di logica del motore di calcolo** e dei motori DXF/STEP.
4. **Buchi di permessi/ACL** e contraddizioni del workflow stati.
5. **Ciclo notifiche** (destinatario giusto, mancante, doppia, race).
6. **Attrito UX** e messaggi fuorvianti.

**Modalità**: DIAGNOSTICA (read-only). NON correggere il codice. Proponi i fix nel
report ma non applicarli. Verifica ogni finding leggendo il codice reale + con test
concreti: niente supposizioni. Marca ogni voce [CONFERMATO] o [PLAUSIBILE].

---

## MAPPA FILE (dove guardare)
Backend:
- Calcolo: `backend/app/services/calculation.py` (recalculate_part/quote — ZONA FRAGILE),
  `backend/app/services/costing/primitives.py` (formule pure = fonte autoritativa)
- Workflow: `backend/app/services/quote_workflow.py`, `backend/app/api/quotes.py`,
  `backend/app/api/quotes_archive.py`, `backend/app/api/parts.py`, `backend/app/api/phases.py`
- DXF: `backend/app/services/dxf_parser.py`, `backend/app/api/dxf.py`
- Notifiche: `backend/app/services/notifications.py`, `backend/app/api/notifications.py`
- **Ordini materiale (spec 18)**: `backend/app/api/orders.py` (crea/lista/CSV/DELETE ordine,
  aggregazione per fornitore), `backend/app/api/orders_from_file.py` (import distinta + alias),
  `backend/app/services/material_status.py` (stato materiale parte/preventivo),
  `backend/app/services/quote_workflow.py` (`reconcile_material_state`, `material_is_resolved`,
  `quote_material_status` — promozione/retrocessione stato). Modelli: `MaterialOrder`,
  `MaterialOrderQuote`, `MaterialOrderItem`, `QuoteSupplierOrder` (record evasione N:M, UNIQUE
  `(quote_id, material_supplier_id)`), `MaterialAlias`.
- **Ordini utensili**: `backend/app/api/orders_tools.py`. Modelli `ToolOrder`/`ToolOrderItem`.
- **Normalizzati**: `backend/app/api/normalized_items.py` (catalogo), `normalized_suppliers.py`
  (fornitori), `normalized_from_file.py` (import distinta + alias + ordini). Modelli:
  `NormalizedSupplier`, `NormalizedItem`, `NormalizedAlias`, `NormalizedOrder`, `NormalizedOrderItem`.
- **Motore CSV condiviso**: `backend/app/core/csv_import.py` (`normalize_alias`, parse, template).
- Supporto: `backend/app/api/{materials,machines,treatments,operations,workflow_templates}.py`
- Migrazioni/seed: `backend/app/main.py` (`_run_migrations`, ZONA FRAGILE), `backend/app/models.py`, `backend/app/schemas.py`

Frontend:
- Manuale: `frontend/src/pages/QuoteEditor.tsx`, `frontend/src/components/quotes/{PartCard,PhaseEditor,EdmPhaseFields,PartsSidebar,PartAttachments,ClonePartModal,QuoteWizard,QuoteBottomBar,QuoteDataPanel,QuoteStatusActions,StatusStepper}.tsx`
- 2D/DXF: `frontend/src/pages/NewQuote2DPage.tsx`, `frontend/src/pages/quotes/Dxf2dWizardView.tsx`, `frontend/src/components/quotes/Dxf/*`
- STEP 3D: `frontend/src/lib/step/stepKernel.ts`, `frontend/src/components/quotes/Step/StepViewerCad.tsx`
- Calcolo (gemelli DRY): `frontend/src/lib/quoteCalc.ts`, `frontend/src/lib/quoteValidation.ts`, `PhaseEditor.calcPhase()`, parte "setup" in `PartCard.tsx`
- Liste/archivio: `frontend/src/components/quotes/QuotesListView.tsx`, `frontend/src/pages/quotes/QuotesListView.tsx`
- **Ordini materiale**: `frontend/src/pages/orders/{OrdersMaterialsPage,MaterialOrdersView,
  OrdersHistoryPage,OrderHistoryView,OrdersMaterialFilePage,MaterialsFileView}.tsx` +
  la mini-dashboard KPI inline; l'azione "CSV materiali del preventivo" in `QuotesListView`.
- **Ordini utensili / normalizzati**: `frontend/src/pages/orders/{OrdersToolsPage,ToolOrdersView,
  OrdersNormalizedFilePage,NormalizedFileView}.tsx`.
- **Catalogo normalizzati**: `frontend/src/pages/settings/{NormalizedItemsPage,
  NormalizedItemFormModal,NormalizedSuppliersPage}.tsx`.
- Rotte + gating (`App.tsx`): `/orders/materials`→`orders.materials`, `/orders/materials-file`→
  `orders.materials`, `/orders/normalized-file`→`orders.normalized`, `/orders/tools`→`orders.tools`,
  `/orders/history`→any di `[orders.materials, orders.normalized, orders.tools]`,
  `/settings/normalized-items`→`settings`.

---

## INVARIANTI DI DOMINIO — NON segnalare come bug (sono voluti)
- **Tempi fase**: inseriti in MINUTI nella UI, salvati/calcolati in ORE (`lib/timeUnits`).
- **Decimali in virgola IT**: campi nuovi usano `DecimalField`/`parseDecimal`, mai `type=number`.
- **divisor = quantity SEMPRE** nel cost engine (il vecchio `is_shared` è RIMOSSO — non cercarlo).
- Formula costo fase: `(setup_h*setup_rate)/qty + cycle_h_per_part*work_rate + fixed/qty + var_per_part`,
  con `work_rate = phase.hourly_rate_override ?? machine.hourly_rate ?? 0`,
  `setup_rate = machine.setup_hourly_rate ?? work_rate`.
- Totali parte: `total_cost = material + delivery/pz + cutting/pz + Σfasi`;
  `unit_price = max(total_cost, minimum_price)*(1+margin/100)`; `total_price = unit_price*qty`.
- La formula fase vive in 3 copie DRY che DEVONO combaciare (primitives.py ↔ PhaseEditor.calcPhase ↔ PartCard); material cost in 2 (primitives.material_cost ↔ quoteCalc.calcMaterialCost).
- **Modulo Stampi RIMOSSO**: `quote_type` è solo `single`/`commessa`; colonne `parts.die_*` inerti (SQLite no DROP). Non segnalarle.
- SQLite non enforce le FK; concorrenza last-write-wins = scelta nota (banner avviso, non blocco).
- Token di login non scadono (scelta, tool interno). `/uploads` static mount rimosso (auth). SECRET_KEY rifiuta l'avvio in prod se debole.

**Ordini materiale / normalizzati (scelte volute — non segnalare):**
- **Stato materiale = righe `QuoteSupplierOrder`**: la presenza di `(preventivo, fornitore)` = "ordine
  emesso" (evaso), NON arrivo fisico del materiale. Non esiste un flag "arrivato".
- **Auto-transizioni**: `confermato` + materiale risolto (totalmente evaso O non necessario) → `completo`;
  `completo` + materiale non più risolto (es. dopo DELETE ordine) → `confermato` (auto-riapertura), via
  `reconcile_material_state`. È VOLUTO.
- **Parti che "servono ordine"**: solo con `material_id` set, NON `customer_supplied_material`, NON
  `material_from_stock`. Conto-lavoro e magazzino esclusi di proposito.
- **`material_ordered_at/_by`**: flag LEGACY ponte-dashboard, NON fonte di verità (lo è `QuoteSupplierOrder`).
  Impostato solo se totalmente evaso; sul demote non è azzerato (retro-compat). Non basarci ragionamenti nuovi.
- **Idempotenza ordine per `(preventivo, fornitore)`**: check applicativo + UNIQUE DB → 409 su race (AUD-25
  mitigato a livello DB). Un secondo POST sulla stessa coppia non deve creare doppioni.
- **Ordini da file NON legati ai preventivi**: `orders_from_file`/`normalized_from_file` creano ordini
  `source='file'` senza `QuoteSupplierOrder` né reconcile → nessun impatto sullo stato preventivo.
- **Snapshot B6 (`MaterialOrderItem`)**: congela codice/dim/qty all'emissione → CSV fedele alla ri-stampa.
  Ordini pre-B6 ri-aggregano dal preventivo live (possono divergere): limite noto, non bug nuovo.
- **Alias (`MaterialAlias`/`NormalizedAlias`)**: append-only, upsert idempotente, appresi SOLO su creazione
  ordine riuscita; `csv_name` normalizzato e globalmente unico.
- **Normalizzati ORTOGONALI ai preventivi**: catalogo standalone (viti/bulloni/cuscinetti), nessuna `Part`
  li referenzia, nessun costo/BoM/consumo. Esistono solo per l'import distinta→ordine. Non cercare un legame
  con i preventivi.

## GIÀ CORRETTO in un audit precedente — NON ri-segnalare (verifica solo che regga):
- Duplica parte preserva `customer_supplied_material`/`material_from_stock`; togliere trattamento invia `treatment_id:null`; override unità mm/pollici su tutti i percorsi DXF (wizard + reselect + picker) via `lib/dxfUnits`; ACL `ensure_quote_visible` sui 6 endpoint di transizione; "letto" via `POST /quotes/{id}/read` (non più side-effect su GET); reselect avvisa se la selezione profili non combacia; parser esplode i blocchi INSERT; rollback preventivo orfano su submit 2D fallito; anteprima ricalcola tutte le parti (stock shipping); banner concorrenza con re-sync `bumpVersion` su tutte le scritture; validazione magic-byte upload; codice morto `circles`/margine 20.0 rimosso.

## BACKLOG NOTO (BASSA) — puoi confermarli ma non sono la priorità:
SPLINE/ELLIPSE senza snap-point; `detectStockShape` può confondere tondo/prismatico
con foro grande; STEP parse/tessellate sincroni sul main thread → freeze UI su assiemi
grossi; autocalc wire-EDM restituisce 0 in silenzio se `edm_cut_speeds` è vuota;
`margin_percent`/`global_discount_percent` senza limite superiore (sconto >100% →
prezzo negativo fino al PDF); `unit_price` arrotondato poi ×qty → errore di centesimi su qty alte.

---

## HARNESS DI TEST (usa questo, NON toccare il DB/istanza dell'utente)
Ambiente: Windows, backend con venv in `backend/venv/Scripts/python.exe`, Node 24/npm 11,
Playwright chromium GIÀ installato, backend dell'utente probabilmente attivo su :8000.

1. **Istanza isolata** (mai il DB live):
   ```bash
   cd backend
   # copia WAL-aware del DB in una copia usa-e-getta
   ./venv/Scripts/python.exe -c "import sqlite3;s=sqlite3.connect('mechquote.db');d=sqlite3.connect('mechquote_audit.db');s.backup(d);d.close();s.close()"
   # reset admin/admin sulla COPIA
   DATABASE_URL="sqlite:///./mechquote_audit.db" ./venv/Scripts/python.exe -c "from app.models import User; from app.core.security import get_password_hash; from app.core.database import SessionLocal; db=SessionLocal(); u=db.query(User).filter(User.username=='admin').first(); u.hashed_password=get_password_hash('admin'); u.is_active=True; u.role='admin'; db.commit()"
   # avvia su porta alternativa
   DATABASE_URL="sqlite:///./mechquote_audit.db" ./venv/Scripts/python.exe -m uvicorn app.main:app --port 8001 --log-level warning
   ```
   A fine audit: ferma l'istanza ed elimina `mechquote_audit.db*`.
2. **Test unit / golden / tsc**: `cd backend && ./venv/Scripts/python.exe -m pytest tests/unit -q`;
   `cd frontend && npx tsc --noEmit`; `npx vitest run` (test in `frontend/tests/unit/`).
3. **Script e2e API** (`backend/tests/integration/scripts/*.py`): hardcodano `localhost:8000`
   → copiali e fai `sed 's/localhost:8000/localhost:8001/g'`, ed esegui con `PYTHONIOENCODING=utf-8`
   (stampano glyph ✓/✗ che rompono la console cp1252). Alcuni assumono dati di catalogo:
   verifica i prerequisiti (es. `edm_cut_speeds` può essere vuota → autocalc 0).
4. **Test BROWSER simulati (Playwright)**: guida Chromium sul frontend (vite dev). Nota: il
   proxy Vite è hardcodato su :8000 (`frontend/vite.config.ts`); per puntare all'istanza
   isolata :8001 crea un config temporaneo o avvia il backend isolato sulla porta attesa dal
   frontend in un ambiente dedicato — NON usare il DB dell'utente. Copri: login (token in
   localStorage), navigazione, submit reali, due schede per la concorrenza, cattura di
   `console.error`/`pageerror` come segnali. Fai screenshot degli stati bloccanti.

---

## SCENARI DA SIMULARE (esaustivi — copri OGNI ramo)
### A. Creazione preventivo
- Nuovo preventivo **singolo** e **commessa** (con N componenti); da zero e da wizard.
- Numero preventivo: duplicato → 400 gestito; caratteri strani/path-traversal.
- Cliente: da anagrafica e a mano; campi obbligatori vs opzionali.

### B. Parti e fasi (manuale)
- Aggiungi/duplica/clona-onto/elimina parte; riordino; selezione che salta.
- Materiale: fornitore normale / **conto lavoro cliente** / **a magazzino** (mutex);
  cambio provenienza → prezzo coerente; materiale senza fornitore → blocco conferma.
- Grezzo: prismatico / tondo / tubo; dimensioni mancanti; peso finito.
- Fasi: aggiungi/riordina/elimina; macchina vs manuale; `hourly_rate_override`;
  trattamento (add + **remove** → deve sparire davvero) e batch/soglia tra sorelle;
  fase Wire-EDM autocalc (macchina wire_edm + 3 campi) e il caso 0-silenzioso.
- **Anteprima live vs salvato vs PDF**: verifica parità numerica su ogni combinazione
  (qty, margine parte vs globale, minimo, trasporto, imballaggio, sconto globale).

### C. Preventivatore 2D / DXF
- Import DXF: rettangolo chiuso; profili aperti+chiusi; cerchi/archi; polilinee con bulge;
  SPLINE/ELLIPSE; **geometria dentro un BLOCK/INSERT** (deve NON essere vuoto); file vuoto;
  file corrotto; non-DXF con estensione .dxf; DXF enorme (cap 50MB / MAX_ENTITIES).
- **Override unità**: DXF con header che mente (pollici dichiarati, mm reali) su TUTTI i
  percorsi (wizard 2D, measure modal, reselect fase EDM, picker fase EDM) → lunghezza taglio
  e grezzo corretti, non ×25.4. Unità cm/dm/m (override nascosto) → comportamento sensato.
- Selezione profili → creazione parti; misura (distanza/diametro, snap); reselect su file
  cambiato → avviso. Submit 2D con fallimento intermedio → nessun preventivo orfano.

### D. STEP / 3D
- Carica `.step`/`.stp`, apri il viewer misure, "Applica al preventivo" (grezzo tondo vs
  prismatico da `detectStockShape`); STEP senza geometria; STEP corrotto; assieme grosso
  (freeze main-thread); cambio materiale col modale aperto (peso stantìo).

### E. Workflow stati (tutti i rami e le REVERSIBILITÀ)
`bozza→inviato→letto→confermato→completo`, più `in_attesa_cliente` e `non_ordinato`.
Per OGNI transizione verifica: chi può (permesso), da quali stati, effetti (blocco modifica,
azzeramento evasioni, notifiche), e la **reversibilità** (unconfirm/reopen/restore) —
cercando stati "trappola" da cui non si esce e timestamp che restano sporchi.
`ensure_editable` e `ensure_quote_visible` su ogni endpoint per-id.

### F. Permessi/ruoli
Prova con ruoli diversi (admin, amministrazione, ufficio_tecnico, officina, **ruolo custom
tipo ufficio_tecnico_plus** con confirm/edit_locked ma senza view_all): ACL liste vs azioni
per-id; gating frontend (bottoni) coerente con l'enforcement backend; grant permessi via UI
che sopravvivono al riavvio.

### G. Notifiche
Per ogni evento (inviato, letto, confermato, completo, riaperto, in_attesa, non_ordinato,
ordine materiali, ordine utensili, scorte utensili): destinatario corretto, niente auto-notifica
a se stessi (broadcast di ruolo di cui l'attore fa parte → escluso), niente doppioni/race, il
cliente compare nel dettaglio, deep-link funzionante e visibile al destinatario (ACL).
- **Atomicità**: la notifica deve committare nella stessa transazione del cambio stato/ordine
  (nessuna notifica persa se il processo muore fra due commit). `quote_completed` resta su commit
  proprio (dedupe UNIQUE + doppia sorgente): verifica che non produca doppioni.
- **Ordini normalizzati NON mandano notifiche** (a differenza di materiali/utensili) → verifica se
  è voluto o un buco UX (ordini creati "in silenzio", nessuno guarda la lista).

### H. Input estremi / vicoli ciechi
qty 0 e negativa (→422), qty enorme; margine negativo e sconto >100% (prezzo negativo fino
al PDF?); decimali con virgola; campi vuoti; navigazione con modifiche non salvate (avviso?);
upload oversize/tipo errato (magic-byte); PDF con dati minimi/mancanti (`quote_date`).
Concorrenza: due schede sullo stesso preventivo → banner solo per modifiche ALTRUI, non per
le proprie (anche modifiche di fase).

### I. Ordini materiale (per fornitore — spec 18)
- Da un preventivo **confermato** con parti di fornitori diversi: crea ordine per il fornitore
  A → stato materiale `parziale`; crea per il fornitore B → `evaso` → il preventivo passa **auto**
  a `completo`. Verifica la **promozione** e i timestamp.
- **Idempotenza**: ricrea l'ordine per la stessa coppia `(preventivo, fornitore)` → nessun
  doppione (400 "già ordinato"); due POST/schede paralleli sulla stessa coppia → una sola
  evasione (UNIQUE + **409** concorrente, AUD-25).
- **Anteprima `POST /aggregate`** (nessun effetto) somma le stesse parti dell'ordine reale;
  parti **conto-lavoro** e **magazzino** ESCLUSE.
- **Eliminazione ordine** (DELETE — DISTRUTTIVO → **backup prima**, §HARNESS): rimuove SOLO le
  evasioni di QUEL ordine, poi `reconcile` → se il materiale non è più risolto il preventivo
  **retrocede** `completo→confermato` (auto-riapertura), i flag materiale si azzerano, l'ordine
  sparisce dallo storico ma le evasioni di altri ordini restano. Cerca stati sporchi / doppie
  demote / preventivi che restano completi con materiale mancante.
- **CSV**: `/{order_id}/csv` usa lo snapshot B6 se presente (fedele), altrimenti ri-aggrega dal
  preventivo live (può divergere per ordini pre-B6); `/quote/{id}/csv` è sola lettura e non
  cambia stato. Verifica colonne, encoding IT, filename.
- **Sblocco flag materiale** e ogni azione scrivente → gate `orders.materials`; ACL per-id.
- Preventivo con parti **senza fornitore** (`senza_fornitore`): non ordinabile/evaso; la
  conferma è già bloccata a monte (scenario B) — verifica coerenza.

### J. Import da file — materiali e normalizzati (distinta → ordine)
- **Parse** (`/from-file/parse`, nessuna scrittura): CSV con header variabile (utf-8 **e**
  cp1252), colonne mescolate / separatore errato → **400 pulito**, MAI mis-mappatura silenziosa;
  calcolo grezzo (`+5`, spessore `ceil/5*5`); match via **alias** poi catalogo.
- **Crea da file** (`/from-file`): righe senza fornitore → blocco; dimensioni mancanti per forma
  (prismatico w/h/t · tondo d/l · tubo d/t/l) → blocco; **`material_id`/`normalized_item_id`
  inesistente nel payload → rifiutato (AUD-26)**, niente item orfani né alias avvelenati.
- **Alias appresi** (`MaterialAlias`/`NormalizedAlias`): solo su creazione riuscita, upsert
  idempotente, `csv_name` globalmente unico; DELETE alias per correggere un match errato.
- **Atomicità apprendimento alias**: nei normalizzati gli alias sono imparati **dopo** il commit
  dell'ordine (finestra non transazionale) → un crash lascia l'ordine senza alias (ri-submit
  risolve): verifica che non produca stato incoerente peggiore.
- Un ordine da file NON tocca alcun preventivo (nessuna `reconcile`).

### K. Normalizzati (catalogo + fornitori) — e differenze da SEGNALARE
- **Catalogo `NormalizedItem`** (gate `settings`): create con `code` unico (400 se duplicato),
  edit con collisione code. **DELETE senza `block_if_in_use`** → prova a eliminare un item ancora
  referenziato da `NormalizedOrderItem`: se lascia orfani **è un finding** (a differenza dei
  cataloghi protetti da `block_if_in_use`).
- **Fornitori normalizzati**: `GET /normalized-suppliers` risulta **senza permesso** (aperto) →
  verifica se è intenzionale o un buco ACL. DELETE protetto da `block_if_in_use` (doc Officina).
- **`normalized_from_file` POST non ri-verifica `supplier_id`** contro la tabella prima di scrivere
  → un id errato nel payload crea un ordine con FK orfana: valuta.
- **Ordini utensili** (`orders_tools.py`): crea + CSV + elimina, snapshot codice/marca/qty;
  gate `orders.tools`; low-stock alert (`tools_low_stock_alert`, idempotente per giorno).

---

## OUTPUT RICHIESTO
Una lista di findings ordinata per gravità, con conteggio finale e un **verdetto go/no-go**.
Per ogni voce:
- **Titolo** (1 frase) · gravità [BLOCCANTE | ALTA | MEDIA | BASSA] · [CONFERMATO | PLAUSIBILE]
- Area (manuale / 2D-DXF / STEP / calcolo / workflow / ordini-materiale / normalizzati / notifiche / permessi / UX) · `file:riga`
- **Scenario di riproduzione concreto**: passi esatti / input → cosa va storto (output errato, crash, stato bloccato)
- **Impatto per l'utente** e, se applicabile, se è un vicolo cieco/senza-ritorno
- Fix proposto (1-2 righe, NON applicarlo)

Chiudi con: elenco BLOCCANTI (se presenti l'app NON è pronta), poi ALTA/MEDIA/BASSA, e la
raccomandazione finale "usabile in produzione interna: sì/no + condizioni".

## REGOLE
- Verifica ogni finding sul codice reale e/o con un test riproducibile. Distingui CONFERMATO da PLAUSIBILE.
- Backup del DB prima di qualsiasi test che scrive; usa solo l'istanza isolata, mai il DB live dell'utente.
- Non correggere codice. Non committare. Non toccare le migrazioni.
- Se un'area è pulita, dillo esplicitamente (serve a certificare il go).
