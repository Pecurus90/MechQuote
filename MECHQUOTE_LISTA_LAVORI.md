# MechQuote — Lista lavori

> Questo è il piano di battaglia. Raccoglie i problemi emersi dalle cinque
> ricognizioni, **filtrati** (il rumore è stato tolto) e **ordinati per
> priorità**. Ogni voce è un lavoro delimitato: si affronta uno alla volta,
> con verifica.
>
> I lavori sono divisi in tre blocchi da **due linee**:
>
> - **PRIMA DELLA LINEA 1** — da completare prima di inserire dati reali sul
>   server.
> - **PRIMA DELLA LINEA 2** — da completare prima di far usare MechQuote a
>   più persone insieme.
> - **DOPO** — manutenzione e miglioramenti, senza fretta.
>
> Le stime di tempo sono quelle indicate da Claude Code: indicative.

---

## 🔍 AUDIT FUNZIONALE — findings (registro `docs/audit/AUDIT_FUNZIONALE.md`)

Voci emerse eseguendo gli audit per-modulo. Ogni fix si affronta uno alla
volta, con verifica. Il registro è la fonte dello stato di copertura.

### §5 Cost engine — audit 2026-07-22 (motore solido, nessun bug di calcolo)

- **F1 — clamp difensivo prezzi nelle primitive** ✅ **FATTO 2026-07-22**: floor a
  0 in `part_totals` (`base = max(0, …)`) e `quote_total` (`max(0, after − sconto)`),
  gemellato in `quoteCalc.ts` (calcPartTotals/calcQuoteTotal). Margine < −100% o
  sconto > 100% non producono più prezzi negativi. 2 casi golden condivisi
  (`F1-clamp-margin`, `F1-clamp-discount`); 154 backend + 38 vitest verdi. Decisione
  utente: clamp (non solo warning). I casi normali (anche in perdita) invariati.
- **F2 — parità rounding trattamento** ✅ **FATTO 2026-07-22**: `round4` aggiunto
  ai due return di `calcTreatmentCost` (gemello byte del backend); golden vitest
  36/36 verdi.
- **F4 — terza copia rate/setup in PartCard** *(Blocco C, riduzione debito)*.
  `PartCard.tsx:116-121` ri-risolve a mano `workRate`/`setupRate` per il breakdown
  setup↔ciclo (display-only, §0-quater). Esporre da `quoteCalc` `resolveRates()` +
  `phaseSetupCost()` e riusarle così la copia diventa riuso. Refactor → concordare
  prima (§2.D).
- **F3 — golden frontend nella verifica** ✅ **FATTO 2026-07-22**: aggiunto
  `cd frontend && npm test` alla §7 e alla skill `/verifica` (il pytest testa solo
  il backend; senza, una rottura di parità in `quoteCalc.ts` passava inosservata).
- **Doc §4 stale** ✅ **FATTO 2026-07-22**: corretta la nota su "errore centesimi
  per qty alte" (già risolto da C4); mantenuta la parte prezzi negativi (→ F1).

### §1 Ciclo di vita preventivo — audit 2026-07-22 (eccellente, nessun bug funzionale)

- **G4 — destinatario notifica: split per transizione** ✅ **DECISO 2026-07-22
  (tenere il nuance, by design)**. `read/confirm/reopen/completed` → mittente-prima;
  `unconfirm/await/revert/not-ordered/restore` → creatore-prima. NON è un bug:
  semantica voluta (chi ha *inviato* sa come è stata processata la sua sottomissione;
  il *proprietario* sa dei cambi di stato). Pinnato da
  `test_notifica_reopen_va_a_chi_ha_inviato`. Nessuna modifica al codice.
- **G3 — helper notifiche transizione** *(DRY, opzionale, deferito)*. Il guadagno
  (~8 blocchi) non vale il rischio di ri-toccare 8 transizioni critiche ora;
  fattibile in futuro con `target` come parametro. Non prioritario.
- **G1 — transizioni non atomiche (last-write-wins)** *(noto, spec 21 Blocco B)*.
  `confirm/reopen/unconfirm/await/revert/not-ordered/restore` fanno read-then-write
  senza guardia atomica. Mitigazione a basso costo: replicare il pattern
  UPDATE-guardato + rowcount di `mark_quote_read` (già race-safe), in attesa
  dell'optimistic lock completo di spec 21.

### §3 Parti — audit 2026-07-22 (molto solido; sicurezza upload completa)

- **H1 + H3 — clone-fase unificato** ✅ **FATTO 2026-07-22**: `duplicate_part` ora
  usa `_clone_phase` (come `clone_part_onto`), che azzera `dxf_profile_ids` →
  niente più dangling reference sul duplicato; `cut_length_mm` (costo EDM)
  preservato. Nuovo test `test_duplicate_droppa_i_profili_dxf`. 152/152 verdi.
- **H2 — helper `_load_part_full`** ✅ **FATTO 2026-07-22**: estratto in `parts.py`,
  blocco `joinedload` PartOut deduplicato (add/get/update/duplicate).
- Minore: verificare in `models.py` che il cascade delete di `Part` faccia
  scattare il listener `before_delete` di `PartFile` (cleanup blob), altrimenti
  orfani su `delete_part`.

### §4 Fasi — audit 2026-07-22 (pulito, nessun bug)

- Nessuna voce di lavoro. Solo nota di robustezza: `reorder_phases` non valida che
  la lista id copra tutte le fasi (lista parziale → gap `sequence_number`); non è
  un problema oggi (l'editor manda sempre la lista completa).

### §10 Ordini materiali — audit 2026-07-22 (complesso ma molto solido, nessun bug)

- **I1 + I2 — pulizie import** ✅ **FATTO 2026-07-22**: rimosso `__import__('app.models'…)`
  inline (`Material` già importato) e i due `from sqlalchemy import or_` locali
  ridondanti in `orders.py`.
- **I3 — N+1 in `get_stats`** *(Blocco C, perf)*. `to_order` chiama
  `material_is_resolved(db, q)` per ogni `confermato` → N query. Batchare lo stato
  materiale come fa già `list_selectable_quotes` (`ordered_map` in una query).
- **I4 — aggregazione parti replicata ~4×** *(Blocco C, DRY, bassa priorità)*.
  `aggregate_materials` / `_supplier_order_data` / `_persist_order_snapshot` /
  `_quote_material_rows`: generatore condiviso "parti ordinabili raggruppate"
  (output diversi → priorità bassa).

### §11 Richieste materiale — audit 2026-07-22 (pulito; 1 finding di sicurezza)

- **J2 — CSV formula injection** ✅ **FATTO 2026-07-22** *(SICUREZZA)*: aggiunto
  `_csv_safe_cell` in `csv_import._csv_streaming_response` (punto unico di TUTTI
  gli export CSV) che prefissa con `'` le celle che iniziano con `= + - @ \t \r`
  (mitigazione OWASP). Copre ordini materiali/utensili/normalizzati + cataloghi.
  12 test nuovi (unit + body). Header non toccati (costanti di codice).
- **J1 — `parse_distinta` senza cap dimensione** *(Blocco C, robustezza)*.
  `await file.read()` carica l'intero CSV in memoria senza limite (gli altri upload
  cappano a 50 MB). Aggiungere un cap coerente.

### §13 Ordini utensili — audit 2026-07-22 (pulito, nessun bug)

- Nessuna voce. Design corretto (snapshot puro, delete cascade netto, nessuna
  riconciliazione perché l'ordine non tocca lo stock).

### §14 Anagrafica utensili — audit 2026-07-22 (2 problemi di case)

- **K1 — cascade rename / delete-in-use case-sensitive** *(Blocco C, integrità)*.
  `UPDATE tools SET {col}=:new WHERE {col}=:old` e il count in-use usano match
  esatto, ma i valori su `Tool` possono avere case diverso dal nome canonico
  (l'import salva il case del CSV). → valore orfano su rename, o delete di un
  attributo "in uso" non rilevato. Fix: normalizzare `Tool.tool_type/brand/location`
  al canonico su create/import, oppure confronto case-insensitive.
- **K3 — scan `.upper()` vs create non normalizzato** *(UX + decisione)*. `scan_tool`
  fa `code.upper()` ma `create_tool` salva il codice grezzo: un utensile con codice
  minuscolo non è scansionabile. Imporre codici maiuscoli al create o match scan
  case-insensitive. Verificare la convenzione codice con l'utente.

### §29–31 Sistema & Sicurezza — audit 2026-07-22 (solido; tema lockout)

- **M1 + N1 — footgun di lockout admin** ✅ **FATTO 2026-07-22**: guardia
  `_ensure_not_last_active_admin` (auth.py, su update/delete) rifiuta
  demote/deactivate/delete dell'**ultimo admin attivo**; guardia
  `_ensure_users_perm_survives` (roles.py, su toggle singolo + bulk) rifiuta di
  togliere `users` all'ultimo ruolo che ce l'ha. 9 test nuovi.
- **M4 — password create senza min-length** ✅ **FATTO 2026-07-22**:
  `Field(min_length=8)` su `UserCreate.password` (coerente con ChangePasswordIn).
- **M6 — default `UserCreate.role='admin'`** ✅ **FATTO 2026-07-22** *(scoperto nel
  fix)*: era un default pericoloso (creare un utente senza role esplicito lo rendeva
  admin; il fallback `or 'ufficio_tecnico'` era codice morto). Portato a `None`
  (least-privilege; il fallback vive in create_user/register).
- **M3 — `/api/auth/register` legacy** *(pulizia, aperto)*. Duplica `create_user` e
  ritorna un token per l'utente creato (residuo self-registration). Valutare la
  rimozione.
- **L2 — token non revocato al cambio password** *(design, basso)*. Mitigato dal
  check `is_active` per-request. Per esposizione pubblica: `exp` > 0 + token-version.

---

## 🗺️ PIANO DI ESECUZIONE CORRENTE (2026-07-02)

Ordine di esecuzione approvato dall'utente il 2026-07-02, che accorpa una
grande lista di richieste in 14 temi su 6 fasi. È la **cornice corrente**: i
blocchi A/B/C e i cantieri qui sotto restano validi come dettaglio e vengono
assorbiti nei temi corrispondenti.

- **Fase 0** ✅ **COMPLETA** — N: doc allineati + spec obsolete retrocesse · L1:
  audit read-only codice morto / colonne DB.
- **Fase 1** ✅ **COMPLETA** — A: dark mode grigio · B: nuovo CSV ordine
  materiale · H: layout impostazioni unificato · J: permessi/utenti/ruoli
  ridisegnati (+ pagina Ruoli raggruppata).
- **Fase 2** ✅ **COMPLETA** — K1: test permessi/auth + parità cost-engine BE↔FE
  completa (golden→codice reale, incl. dieCalc/calcPhase).
- **Fase 3** ✅ **COMPLETA** — L2: rimozione codice morto · I: revisione notifiche.
- **Fase 4** — 🟢 **E FATTO** (motore unico in `costing/primitives.py`) · 🟡 **D
  parziale**: D1 collega NormalizedItem ✅, D2 anti-doppioni ✅; restano D4 (policy
  Customer), D5 (tempra/attributi utensile), + micro (autocomplete normalizzati
  nei template) · ⏳ **F** modularizzazione a mini-app *(spec 17)*.
- **Fase 5** — ⏳ **C** import ordine materiale (manuale + CSV SolidWorks):
  **DOCUMENTATO E SOSPESO** (vedi sez. "📋 C" sotto) · ⏳ **G** riscrittura stampi
  *(= P2/P3 + cantiere stampi)*.
- **Fase 6** — ⏳ **M** ottimizzazione *(= Blocco C performance)* · **K2** copertura
  test estesa + bug hunting.

> Nota: questo piano non cancella i Blocchi A/B/C — il **Blocco A** (messa in
> sicurezza server) resta prerequisito prima di dati reali in produzione, in
> parallelo/prima delle fasi qui sopra.

---

## 🗒️ TODO DESKTOP 2026-07-21 — batch 3 (workflow revisione)

- **TD-16** — ✅ **FATTO 2026-07-21** (resta prova a mano nel browser).
  **Stato "in revisione" + conferma + prezzo vecchio.**
  Fatto: nuovo stato `in_revisione` (editable, in `EDITABLE_STATUSES`/
  `QUOTE_STATUSES`); `/reopen` → `in_revisione` + snapshot `revision_baseline_total`;
  invio consentito da bozza O in_revisione; migrazione 2 colonne; liste "in
  corso"/validazione stati aggiornate. FE: token colore `state-revisione`,
  label/badge/chip, `StatusStepper` (primo nodo "In revisione"), editor (azioni
  come bozza, "Manda in revisione" con ConfirmDialog "Sei sicuro…", badge
  "prezzo precedente → attuale (Δ)"), filtro lista. Collaudo:
  `test_revision_flow.py` (3) + `test_quote_workflow`/`test_quote_acl` aggiornati,
  **150 unit pass**, tsc pulito, backend OK.
  <!-- design storico sotto -->
  **Storico design.** Oggi "Rimanda in bozza"
  (da inviato/letto/in_attesa_cliente → bozza) confonde un preventivo revisionato
  con uno nuovo e perde il prezzo precedente.
  **Decisioni utente:** reopen va **sempre** in `in_revisione` (mai più bozza);
  prezzo = **baseline singolo** (ultimo); "annulla conferma" resta → letto.
  **Design:**
  1. Nuovo stato `in_revisione` (editable come bozza; bozza = mai inviato,
     in_revisione = rimandato indietro). `EDITABLE_STATUSES` lo include; non
     ordinabile.
  2. `/reopen` (rinominato UX "Manda in revisione", da inviato/letto/
     in_attesa_cliente) → `in_revisione`, con **ConfirmDialog** "Sei sicuro di
     mandare in revisione?"; azzera invio/lettura/attesa + ordini come oggi;
     **snapshot** `revision_baseline_total = final_total` + `_at`.
  3. `PATCH /status` (invia per revisione): consentito da **bozza O in_revisione**
     → inviato (oggi solo bozza). Resto del ciclo invariato.
  4. Editor: `in_revisione` ha le azioni di un nuovo preventivo (modifica +
     "Invia per revisione"). Stepper: **In revisione → Inviato → Letto →
     Confermato → Completo** (il primo nodo è "In revisione" quando
     `revision_baseline_at` è valorizzato). Badge "Prezzo precedente X →
     attuale Y (Δ)".
  **Tocco:** BE `quote_workflow.py` (+stato/editable), `quotes.py` (reopen +
  snapshot, send da in_revisione), `models.py`+migrazione (2 colonne
  `revision_baseline_total`/`_at`), commento stato. FE `types`, `StatusStepper`,
  `constants.ts` (label/colore in_revisione), `QuoteEditorTopBar`/`QuoteEditor`
  (azioni + conferma + rinomina), badge prezzo. Collaudo: unit su workflow +
  tsc.

---

## 🗒️ TODO DESKTOP 2026-07-21 — richieste utente (file "to do .txt")

Dieci richieste raccolte dall'utente. Analizzate contro il codice (5
ricognizioni read-only, 2026-07-21). Classificate per natura: **quick-win**
(codice a basso rischio), **feature da progettare insieme**, **da chiarire**,
**ops server**. Da affrontare una alla volta con verifica (§7 CLAUDE.md).
Le feature EDM (TD-7/TD-8) toccano `services/calculation.py` = **zona fragile**
(§0-quater): piano prima, poi codice.

### Quick-win (codice, basso rischio)

- **TD-5** — ✅ **FATTO 2026-07-21** — Pipeline stati "in attesa cliente" non va
  più a capo. Causa: l'etichetta "Attesa cliente" senza `whitespace-nowrap`
  andava su due righe. Fix: aggiunto `whitespace-nowrap` al label in
  `StatusStepper.tsx`. (NB: i nodi max sono 6, non 7.)
- **TD-6** — ✅ **FATTO 2026-07-21** — Pulsante "Svuota lette" nel pannello
  notifiche (top-bar, dropdown campanello). Espone `clearRead`
  (`useNotifications.ts` → `AppLayout` → `TopBar`); appare solo se ci sono
  notifiche già lette; usa l'endpoint esistente `clear-read` (dismiss, non
  distruttivo: non tocca le non lette).
- **TD-9** — ✅ **FATTO 2026-07-21** — Cestino per eliminare una richiesta
  materiale manuale nel pool ordini. Aggiunto pulsante Trash2 accanto alla
  matita in `MaterialOrdersView.tsx` (+ `onDeleteRequest`), handler nel
  container `OrdersMaterialsPage.tsx` che chiama il DELETE esistente con
  `ConfirmDialog`; il 400 "ha righe già ordinate" viene mostrato col `detail`
  del backend. Refresh lista + stats dopo l'eliminazione.

### Feature da progettare insieme (serve una decisione prima)

- **TD-3** — ✅ **IMPLEMENTATO 2026-07-21** (collaudato con test automatici;
  resta il click-through browser con dati reali). Popup "raggruppa in barre"
  al "Crea CSV". **Multi-barra**: per ogni candidato l'utente sceglie quali
  lunghezze includere e compone le **barre da ordinare** (lunghezza × quantità:
  es. fabbisogno 4000 → 3000×1 + 1000×1 oppure 2000×2), con fabbisogno/coperto/
  avanzo live. Backend: `BarSpec{lengths, pieces:[BarPiece]}` + campo `bars` su
  `MaterialOrderCreate`; `aggregate_materials` espone shape/diametro/lunghezza
  numerici; helper `_apply_bars` rimuove gli spezzoni tondi consolidati e li
  sostituisce con una riga item per barra (riferimento = unione codici).
  Frontend: `BarConsolidationModal` (editor barre) + `requestCreateOrder`/
  `postOrder` in `OrdersMaterialsPage`. Nessuna migrazione, cost engine intatto.
  Collaudo: `tests/unit/test_bar_consolidation.py` (6 casi: barra singola,
  split multi-barra, esclusione, ref cross-preventivo, isolamento Ø, no-op) +
  suite completa **133 unit pass**, tsc pulito, backend OK.
  **Decisioni utente:** (1) raggruppo i tondi con **stesso materiale +
  diametro** sommando le lunghezze; (2) **lunghezza barra = Σ(lunghezza×qtà)
  dei componenti inclusi + un offset manuale** (una sola barra, niente calcolo
  n° barre); (3) **popup al "Crea CSV"** del fornitore, con possibilità di
  **escludere singoli pezzi** (interpretato a livello di riga/lunghezza:
  l'utente esclude una lunghezza dalla barra; resta come spezzone singolo).
  **Rappresentazione:** una barra = un `MaterialOrderItem` tondo (diametro,
  `length_mm`=lunghezza barra, `quantity`=1). **Nessuna migrazione** (nessuna
  colonna nuova), nessun tocco a cost engine/aggregazione/idempotenza.
  **Piano implementativo:**
  1. `schemas.py`: aggiungere a `MaterialItemAggregated` i campi strutturati
     `shape`/`diameter_mm`/`length_mm` (oggi c'è solo `dim_str` stringa);
     nuovo `BarSpec {material_id?, material_name, diameter_mm, bar_length_mm,
     lengths[]}`; campo opzionale `bars: List[BarSpec]` su `MaterialOrderCreate`.
  2. `orders.py` `aggregate_materials`: riempire i nuovi campi numerici.
  3. `orders.py` `create_order`: dopo i due snapshot + flush, helper
     `_apply_bars(order, payload.bars, db)` che, per ogni BarSpec, rimuove gli
     item tondi (match material+diametro+lunghezza∈lengths) e inserisce l'item
     barra unico (part_code = refs uniti). CSV e storico ereditano da soli.
  4. Frontend: estendere il tipo aggregato; nuovo `BarConsolidationModal`;
     in `OrdersMaterialsPage`, al "Crea CSV" rilevare i candidati barra
     (tondi con stesso material_id+diametro) → se presenti aprire il modale,
     altrimenti creare l'ordine com'è. Il modale raccoglie inclusioni +
     offset e passa `bars` a `createOrder`.
  Stima: ~mezza giornata. File: `schemas.py`, `api/orders.py`,
  `types/index.ts`, `pages/orders/OrdersMaterialsPage.tsx` + nuovo modale.
- **TD-7** — ✅ **IMPLEMENTATO 2026-07-21** (collaudo automatico; resta il
  click-through browser). Foratura a elettrodo: **tempo** (via DrillingTime) +
  **consumo/costo elettrodo** ora calcolati dal motore. Backend: modello
  `Electrode` (electrodes) + 2 fattori su `EdmConfig` + 3 campi su
  `ManufacturingPhase`; migrazioni idempotenti; helper `_compute_drill_edm`
  (gemello del wire) agganciato nel loop fasi (additivo, gate su foratrice
  designata); schemi + CRUD `/electrodes` + EdmConfig. Frontend: tipi;
  `ElectrodesPage` (tab in hub EDM); 2 fattori in `EdmConfigPage`;
  `DrillPhaseFields` mostrato quando la macchina della fase è la foratrice
  designata (Ø elettrodo/n° fori/profondità → il backend ricalcola).
  Collaudo: `tests/unit/test_drill_edm.py` (6 casi) + suite **144 unit pass**,
  golden costo intatti, tsc pulito, backend OK. Design/decisioni sotto.
  <!-- DESIGN STORICO -->
  **Zona fragile** (`recalculate_quote`) — modifica additiva verificata.
  **Decisioni utente:**
  - Costo elettrodo → **nuovo mini-catalogo `Electrode`** con righe *(Ø,
    lunghezza barretta mm, prezzo €)*; €/mm = prezzo / lunghezza.
  - **Lunghezza foratura** = **campo separato** sulla fase (non lo spessore).
  - **Tempo foratura** calcolato in automatico via `DrillingTime` (oggi
    catalogo esistente ma non collegato al motore).
  - Fattore consumo **configurabile** in `EdmConfig`: `electrode_wear_factor`
    (default 2), `electrode_margin_percent` (default 5).
  - Fase di foratura riconosciuta se `phase.machine_id ==
    EdmConfig.default_drilling_machine_id` (foratrice designata, già esistente).
  **Formule** (per pezzo, `n`=n° fori, `d`=profondità):
  - consumo_mm = `n × d × wear × (1 + margin/100)` → costo = `consumo_mm × €/mm(Ø)`
    → `phase.variable_cost_per_part`
  - tempo_h = `n × d / speed(famiglia, Ø) / 3600` → `phase.cycle_hours_per_part`
  **Piano:**
  1. `models.py`: nuovo `Electrode` (electrodes) + `EdmConfig.electrode_wear_factor`/
     `electrode_margin_percent` + `ManufacturingPhase.electrode_diameter_mm`/
     `n_holes`/`drill_depth_mm`.
  2. `main.py _run_migrations`: CREATE TABLE electrodes + 5 ADD COLUMN idempotenti.
  3. `calculation.py`: helper `_compute_drill_edm(phase, part, db)` (mirror di
     `_compute_edm_cycle_hours`) che ritorna (ore, costo_elettrodo); aggancio di
     ~5 righe nel loop fasi, dopo il blocco wire. Backend-only (come il wire):
     nessun gemello frontend del calcolo.
  4. `schemas.py`: Electrode Base/Create/Update/Out; EdmConfig + i 2 fattori;
     Phase + i 3 campi foratura.
  5. `api/edm.py`: CRUD `Electrode` (lookup catalog, no block_if_in_use — la
     fase referenzia per valore Ø); EdmConfig PUT + i 2 fattori.
  6. Frontend: tipi; pagina catalogo Elettrodi (gemella di DrillingTimesPage);
     EdmConfigPage + 2 fattori; `EdmPhaseFields` mostra i campi foratura quando
     la macchina della fase è la foratrice designata → salva → il backend
     ricalcola ore + costo e li restituisce.
  Collaudo: unit test su `_compute_drill_edm` (in-memory) + suite + tsc.
- **TD-8 — Consumo filo (taglio a filo EDM).**
  Consumo filo in base a **lunghezza taglio (mm)** e **altezza taglio**.
  `cut_length_mm`/`cut_height_mm` esistono già sulla fase; manca il costo filo
  (per m) e la formula di consumo. Anche questo tocca `calculation.py` (zona
  fragile) + gemello frontend. Da definire formula e dove vive il costo filo.
- **TD-10** — ✅ **IMPLEMENTATO 2026-07-21** (SSE; resta la prova live nel
  browser + verifica buffering proxy sul server). Notifiche in tempo reale via
  **Server-Sent Events** (scelto vs WebSocket: unidirezionale basta, niente
  `mod_proxy_wstunnel`). Backend: broker in-process `services/notification_stream.py`
  (subscribe/unsubscribe + `queue_publish` emesso su `after_commit`, scartato su
  rollback → push solo a notifica persistita, gestisce anche `commit=False`);
  endpoint `GET /api/notifications/stream` (token in query param via
  `get_user_from_token`, keepalive 20s, chiude subito la sessione DB). Frontend:
  `useNotifications` apre un `EventSource`, all'evento `notify` rifà il conteggio;
  polling sceso a 120s come sola rete di sicurezza. **Limite noto**: broker in
  memoria → richiede uvicorn a **1 worker** (ok per uso interno); più worker
  → servirebbe un bus esterno. Collaudo: `tests/unit/test_notification_stream.py`
  (5 casi: emesso al commit, gate commit=False, drop su rollback, filtro ruolo,
  match per utente) + suite **138 unit pass**, tsc pulito, backend OK.

### Da chiarire prima di toccare

- **TD-1** — ✅ **FATTO 2026-07-21** — Rimossa l'icona `Copy` "Duplica in un
  nuovo articolo" da ogni parte in `PartsSidebar.tsx` (+ prop `onDuplicate` e
  funzione `duplicatePart` in `QuoteEditor.tsx`). Restano `CopyPlus` "Clona la
  ricetta su altri articoli" (quello con selezione) e il cestino. L'endpoint
  backend `POST /parts/{id}/duplicate` resta ma è ora **inerte** (nessun
  caller frontend): lasciato per non allargare lo scope; eventuale rimozione
  = cleanup separato.

### Domanda (non un lavoro di codice)

- **TD-2 — Comportamento commessa con più pezzi stesso materiale/trattamento.**
  Non è un task ma una domanda dell'utente: come si comportano spedizioni e
  trattamenti quando più parti condividono materiale/fornitore. **Risposta
  data il 2026-07-21** (vedi sintesi in chat): spedizione materiale aggregata
  per fornitore e ripartita sul peso grezzo; costo trattamento in batch per
  `(trattamento, materiale)` sul peso finito; spedizione trattamento aggregata
  per fornitore. Se da qui emerge un cambio di comportamento voluto, diventa
  un task a sé.

### Ops server (nessun codice)

- **TD-4** — ✅ **CHIUSO 2026-07-21** (decisione utente: **va bene alle 23:00**).
  Il backup automatico giornaliero WAL-aware esiste già (Task Scheduler
  "MechQuote Backup", rotazione 30, `INSTALLAZIONE.md` §9): nessuna modifica.
  (Resta valida A1: le copie sono sullo stesso disco → sync off-disk.)

---

## 🗒️ TODO DESKTOP 2026-07-21 — batch 2 (nuove richieste)

Seconda tornata dal file "to do .txt" (riscritto dall'utente). Analizzate
contro il codice (5 ricognizioni read-only, 2026-07-21). Numerazione continua
da TD-10.

- **TD-13** — ✅ **FATTO 2026-07-21** (bug data-loss risolto). I template di
  flusso (e le lavorazioni custom) non spariscono più al riavvio. Causa: in
  `main.py _run_migrations()` c'erano `DROP TABLE` **incondizionati** su
  `workflow_template_steps`/`workflow_templates`/`phase_templates`/`operations`
  (giravano a OGNI avvio → cancellavano i dati utente ogni restart). Fix:
  rimossi i DROP + `CREATE TABLE IF NOT EXISTS` (le tabelle hanno da mesi il
  nuovo schema; `_seed_operations` è idempotente → non re-semina se non vuota).
  Verifica concreta: inserito template+operation, ri-eseguito `_run_migrations`,
  entrambi **sopravvivono** (prima venivano azzerati); 144 unit pass. Backup DB
  `mechquote.db.bak-*` creato prima del test.
- **TD-11** — ✅ **FATTO 2026-07-21** — Dashboard rivista. Rimossa la card
  "Utensili da ordinare" dal rail (+ fetch `/orders/tools/preview`); il KPI
  "Utensili da ordinare" resta. "Materiale da ordinare" portata **in cima al
  rail** e **alta** (fino a 20 righe, scroll interno `max-h-[560px]`).
  Backend `/dashboard/awaiting-materials`: ora include **anche le richieste
  materiale manuali** (RM inviate con righe aperte) come righe `kind='request'`
  (portano al pool `/orders/materials`), oltre ai preventivi confermati. Collaudo:
  `tests/unit/test_dashboard_awaiting_materials.py` + 147 unit pass, tsc pulito.
  NB: il KPI utensili è stato lasciato; se lo vuoi togliere anche quello, 1 riga.
- **TD-14** — ✅ **FATTO 2026-07-21** — Ricerca anche sulla descrizione (ILIKE
  parziale). Preventivi (`quotes_archive.py`): aggiunto match su
  `Part.description` + `Part.part_code` via `Quote.parts.any()` (EXISTS,
  niente duplicati/paginazione rotta). Ordini (`orders.py list_orders`):
  aggiunto join `MaterialOrderItem` + match su `material_name`/`description`/
  `part_code` + `MaterialOrder.supplier_name` (con `.distinct()` già presente).
  Placeholder aggiornati (TopBar + storico ordini). Collaudo:
  `tests/unit/test_search_description.py` (2 casi) + 146 unit pass, tsc pulito.
- **TD-12** — ✅ **FATTO 2026-07-21** — Badge "materiali da ordinare"
  (`ordersBadge`) replicato sulla voce figlia **"Ordini materiali"** in sidebar
  (oltre che sul genitore "Ordini"), così l'utente vede dov'è il lavoro.
  `Sidebar.tsx` (dato sul leaf) + `SidebarView.tsx` (render badge sulle voci
  figlie, prima non previsto). tsc pulito.
- **TD-15** — ✅ **FATTO 2026-07-21** (v1; restano generici + unificazione P20).
  Alias materiali da designazioni equivalenti verificate online (fonti:
  steelnumber, Böhler, virgamet…). Dati in `core/material_aliases_seed.py`
  (mappa nome→alias per 23 materiali). Applicati da `_seed_material_aliases()`
  in `main.py`: seed **UNA-TANTUM** (marker `seed_markers/material_aliases_v1`)
  → gira una volta per DB e **non re-inserisce alias eliminati a mano** (evita
  l'errore inverso del bug TD-13); salta collisioni (alias già usato o = nome di
  un altro materiale). Applica su dev + server (al prossimo update).
  **160 alias** totali. Decisioni utente: 316→316L; K455 include ~1.2550/~S1.
  ✅ **Generici** (Bronzo/Ottone/Rame): tutti i gradi comuni della famiglia →
  voce generica (l'officina ordina generico), passata `generics_v1` (49 alias).
  ✅ **Unificazione P20**: `_seed_merge_p20()` (marker `merge_p20_v1`) unifica
  `40CrMnMo7` in `1.2311` (sopravvive 1.2311): riassegna parti/righe ordine/
  righe richiesta/alias, elimina 40CrMnMo7, e ne conserva il nome come alias di
  1.2311. Verificato: 26 materiali, 0 parti orfane, idempotente, 147 unit pass.

---

## 🔎 AUDIT 2026-07-13 — findings consolidati (3 audit paralleli)

Tre revisioni parallele di **sola lettura** (logica/bug backend · estetica
frontend · walkthrough utente su tutti i workflow) su tutto il progetto.
Findings **verificati** nel codice, falsi positivi scartati. Raggruppati in
sprint per esecuzione "un lavoro alla volta". Diverse voci rimandano a ID già
esistenti (A4, B1, CAT-5, cantiere Stampi): **non duplicare**, si chiudono lì.

### Sprint 1 — quick-win sicuri — ✅ FATTO 2026-07-13 (AUD-1…6)
- **AUD-1** — KPI margine di confronto = 0 con filtro "Stampi" nella tab
  Preventivi (`dashboard.py` `_quotes_comparison`, introdotto col Batch C
  Statistiche): la query margine eredita `AND quote_type='die'` → sempre falsa.
  Fix: saltare il margine di confronto quando `quote_type='die'`. ~2 righe.
- **AUD-2** — `statistics/statsShared.tsx`: toolkit grafico **morto**
  (CHART_COLORS/useChartColors/EmptyChart/TrendArea/RankBars/FineDonut) che
  duplica `components/charts/*` con palette hardcoded. Rimuovere, lasciare solo
  `Period`/`Loading`. Previene drift.
- **AUD-3** — `transport_cost`/`packaging_cost` senza `Field(ge=0)`
  (`schemas.py:~395`) → valori negativi abbassano/negano `final_total` fino a
  PDF/dashboard. Aggiungere floor 0 (ovvio, come gli altri campi €). Affine A4/D2.
- **AUD-4** — doc↔codice: gli stati preventivo sono **7** nel codice
  (`quote_workflow.py`), **5** in CLAUDE.md §4 e RIFERIMENTO. Allineare i doc
  (`in_attesa_cliente`, `non_ordinato`).
- **AUD-5** — doc↔codice: ruolo `officina` — RIFERIMENTO §4 dice "sola lettura +
  archivio", il codice dà `officina.write`+`tools` e **non** `quotes.archive`.
  Allineare il doc al codice.
- **AUD-6** — errori delete catalogo a volte generici (Machines/Operations
  scartano `err.response.data.detail`): propagare sempre il detail. Affine CAT-5.

### Sprint 2 — sicurezza azioni / conferme uniformi
- **AUD-7** — ✅ **FATTO 2026-07-13** — OGNI azione di workflow / avanzamento del
  preventivo (editor standard, editor stampi, azioni rapide in lista) mostra un
  `ConfirmDialog` che **dichiara la conseguenza**, non un generico "stai
  modificando". Mai `confirm()` nativo. Include AUD-11 (Ripristina in Archivio).
  Inventario (fotografia 2026-07-13 — cosa manca oggi):
  - `QuoteEditor.tsx` (standard): mancano conferma su **Conferma** (normale, oggi
    dialog solo su totale≤0/margine<0), **In attesa cliente**, **Non ordinato**,
    **Ripristina**, **Rimanda in bozza**. Già ok: Invia, Annulla conferma.
  - `QuoteStatusActions.tsx` (usato da editor Stampi): mancano su **Conferma** e
    **Rimanda in bozza**. Già ok: Annulla conferma.
  - `components/quotes/QuotesListView.tsx` (azioni rapide lista): manca su **In
    attesa cliente**; **Ripristina** assente del tutto (= AUD-11). Già ok:
    Conferma, Non ordinato, Elimina.
  - Approccio suggerito: un unico "gate" di conferma (stato `pendingAction` +
    un solo `ConfirmDialog`) per azione, invece di N dialog sparsi.
- **AUD-8** — ✅ **FATTO 2026-07-13** — `window.confirm()` nativo → `ConfirmDialog`:
  applica workflow template + sblocco EDM manuale (`PhaseEditor`), elimina ordine
  materiali/utensili/normalizzati (`OrdersHistoryPage`). Nessun `window.confirm`
  vivo resta nel frontend.
- **AUD-9** — ✅ **FATTO 2026-07-13** — elimina fase (`PhaseEditor`): ora conferma
  + toast di successo. NB: elimina scheda PDF materiale (`officina/MaterialsPage`)
  **aveva già** il `ConfirmDialog` → falso positivo del walkthrough, non toccato.
- **AUD-10** — ✅ **FATTO 2026-07-13** — tile del chooser `/quotes/new` gated per
  permesso: i modi senza permesso sono **nascosti** (non disabilitati con "In
  sviluppo" fuorviante); il 3D resta "In sviluppo". Niente più click morto.
- **AUD-11** — `Ripristina` un preventivo "non ordinato" non è nella lista
  Archivio (solo dentro l'editor). Aggiungere `onRestore` alla lista Archivio.

### Sprint 3 — decisioni di prodotto (servono all'utente)
- **AUD-12** — ✅ **FATTO 2026-07-13** (decisione: **floor 0%**) — margine parte e
  globale a `Field(ge=0)`: non si salva più un margine negativo. Verificato che
  nessun preventivo esistente ha margine <0. Chiude anche **A4**.
- **AUD-13** — ✅ **FATTO 2026-07-13** — cambio password self-service: endpoint
  `POST /api/auth/change-password` (verifica vecchia + min 8) + `ChangePasswordModal`
  aperto dal footer sidebar ("Cambia password"). Affine A7.
- **AUD-14** — ✅ **FATTO 2026-07-13** — gating Backup separato: route
  `/settings/system` ammette `users` OPPURE `backup`; i tab sono gate per
  permesso (Utenti/Ruoli = `users`, Backup = `backup`). Niente più bottoni
  inefficaci / link morti per ruoli custom.
- **AUD-15** — ❌ **FALSO POSITIVO** (verificato 2026-07-13) — `cost_industrial`
  (L5) NON è una base di prezzo: è il **costo stimato pre-margine** (L1 usa
  `Part.total_cost`, il margine è L6 applicato solo a UI/PDF). Il grafico "Costo
  **preventivato** vs Venduto" quindi usa correttamente L5 come costo degli
  stampi. Nessun cambio: rietichettarlo sarebbe meno chiaro.

### Bundle Stampi — DIFFERITO col cantiere stampi (Fase 5 "G" / P2 / P3)
Non toccare ora: si accorpano alla riscrittura funzionale del modulo stampi.
- **AUD-16** — die `clone` (rev2/3) e `apply-template`: endpoint backend esistono
  (`dies.py:~255,365`), **zero caller frontend** → feature non raggiungibile.
  Aggiungere i bottoni nell'editor (o documentare come non-esposto di proposito).
- **AUD-17** — `DieQuoteEditor`: colori hardcoded che rompono il dark mode
  (`border-gray-800`/`text-green-700`/`bg-rose-100`…) + badge stato/tipo rifatti
  a mano invece di `StatusBadge`/`TypeBadge`. Tokenizzare.
- **AUD-18** — editor Stampi con set azioni stato **ridotto** (manca
  await-client/non-ordinato/restore; stato mostrato come testo grezzo, non
  `StatusStepper`) vs editor standard.

### Minori (en passant, quando si tocca la zona)
- **AUD-19** — ✅ **FATTO 2026-07-13** — tokenizzati gli alert "chiari fissi":
  `DxfPreviewModal` (box errore/avviso → danger/warning token), `TempraFormModal`
  (emerald/gray → success/border), `StepColorRulesPage` (blue/red → info/danger),
  `UploadModal` (blue-100 → primary/20). NB: il toggle `bg-white` di `ToolFormModal`
  è **corretto** (thumb bianco su track colorato in entrambi i temi; `bg-card` lo
  renderebbe invisibile in dark) → non toccato. `NewDieQuotePage` **spostato al
  bundle Stampi** (AUD-17): si tokenizza col resto del modulo.
- **AUD-20** — ✅ **FATTO 2026-07-13** — `dashboard/MonthlyChart.tsx` ora prende
  grid/assi/tooltip/cursor da `useChartTheme()` (fonte unica); restano locali solo
  i colori serie venduto/costo.
- **AUD-21** — `<Alert variant>` e `<Modal>` wrapper condivisi mancanti (~10
  form-modali duplicano `fixed inset-0 flex…`): refactor da concordare (§13,
  affine CAT-3).

> Nota: nessun file di codice è stato modificato dall'audit. Le voci qui sono
> solo pianificazione. Verifica per singola voce prima di chiuderla.

---

## 🔎 AUDIT 2026-07-14 — findings consolidati (4 audit paralleli)

Quattro revisioni parallele di **sola lettura** (logica/funzioni backend ·
UI grafica · UX/flussi · sicurezza & produzione) su tutto il progetto, in vista
del go-live. Findings **verificati** nel codice, falsi positivi scartati.
Numerazione continua da AUD-21. Le voci del **modulo Stampi** sono marcate
**DIFFERITE**: su decisione utente (2026-07-14) il modulo preventivo stampi
verrà **totalmente riscritto**, quindi non ci si interviene ora.

### Sprint A — Sicurezza / integrità dati — ✅ FATTO 2026-07-14 (AUD-22…27)
- **AUD-22** — ✅ **FATTO** — `_run_migrations()` ingoia ogni errore con `try/except: pass`
  (`main.py:~909`). Va bene per gli `ADD COLUMN` idempotenti, ma la stessa lista
  ha grant di permessi, indici UNIQUE e backfill: un fallimento reale lascia il
  DB *sbagliato* in silenzio (permesso mai concesso, indice anti-doppione
  inesistente). Fix: `logger.warning(sql, exc)` invece del `pass`. ~1 riga.
- **AUD-23** — IDOR: `GET /api/parts/{part_id}` (`parts.py:~125-143`) non prende
  `current_user`, nessun permesso, nessun controllo proprietà → chiunque legge
  costi/fasi/materiale di parti altrui iterando l'id. Fix: `current_user` +
  `ensure_quote_visible(quote, current_user)` (le scritture del file lo fanno già).
- **AUD-24** — Upload `parts.py:~319-367` senza whitelist estensioni (accetta
  qualsiasi tipo) + `/uploads` montato statico **senza auth** (`main.py:~1226`)
  → stored XSS same-origin (carico `evil.html/.svg`, giro il link). Fix:
  whitelist estensioni (come `officina.py`/`materials.py`) + nome con uuid +
  `Content-Disposition: attachment`. Affine B4.
- **AUD-25** — Doppio ordine materiale sotto concorrenza (`orders.py:~474-514`):
  check idempotenza legge-poi-inserisce non atomico → 2 click rapidi creano
  documenti d'ordine duplicati. Fix: UNIQUE su
  `QuoteSupplierOrder(quote_id, material_supplier_id)` + catch `IntegrityError`.
- **AUD-26** — Import "da file" scrivono `material_id`/`normalized_item_id` dal
  payload senza verificarne l'esistenza, sia negli order item sia negli **alias
  appresi** (`orders_from_file.py:~316-343`, `normalized_from_file.py:~205-232`)
  → item orfani + alias avvelenati che sbagliano i match futuri. Fix: batch-
  validare gli id prima di creare item/alias; null o rifiuto se assenti.
- **AUD-27** — Import CSV clienti costruisce `Customer(...)` da CSV grezzo
  saltando il validatore `normalize_phone` di `CustomerCreate`
  (`customers.py:~264-271`). Fix: passare le righe per `CustomerCreate` (valida
  poi `model_dump()`).

### Sprint B — UX / flussi (non-stampi) — ✅ FATTO 2026-07-14 (AUD-28…34)
- **AUD-28** — ✅ **FATTO** — Lavoro perso nei wizard su refresh/back: stato solo in `useState`,
  nessun `beforeunload`/guard (`NewQuote2DPage.tsx`, `QuoteWizard.tsx`). Fix:
  avviso `beforeunload` quando il wizard è "dirty". *(NewDieQuotePage → DIFFERITO
  col modulo stampi.)*
- **AUD-29** — Delete degli alias appresi senza conferma, click singolo
  (`MaterialsFileView.tsx:~383`, `NormalizedFileView.tsx:~224`). Fix: passare per
  `ConfirmDialog` mostrando `csv_name → material_name`.
- **AUD-30** — Qty degli ordini "da file" è un `<input>` testo che accetta
  0/negativi/garbage (`MaterialsFileView.tsx:~327`, `NormalizedFileView.tsx:~187`).
  Fix: `type="number" min="1" step="1"` + bordo rosso se invalido.
- **AUD-31** — Errori scan generici e campo già svuotato (`ToolScanBar.tsx`): non
  si sa quale codice ha fallito. Fix: includere il codice nel messaggio, non
  svuotare il campo in errore.
- **AUD-32** — Upload senza pre-check client di dimensione/tipo (officina
  `UploadModal`, datasheet `officina/MaterialsPage`, `ToolImportButtons`, DXF):
  file oversize inviati interi poi rifiutati con errore generico. Fix: validare
  `file.size`+estensione prima della POST.
- **AUD-33** — `ConfirmDialog` (confirm-dialog.tsx) non disabilita il pulsante
  durante l'azione async → doppio-tap = doppia esecuzione (è il dialog condiviso
  dietro quasi tutti i delete). Fix: prop `busy` che disabilita entrambi i bottoni.
- **AUD-34** — Bottoni di workflow della top-bar editor cliccabili durante
  `saving` (`QuoteEditorTopBar.tsx` + `QuoteEditor.tsx`): `doStatus`/`doSubmit`
  ri-entrabili. Fix: passare `saving` e disabilitare le azioni in transito.

### Sprint C — UI / estetica (non-stampi) — ✅ FATTO 2026-07-14 (AUD-35/36/39)
- **AUD-35** — ✅ **FATTO** — `EdmPhaseFields.tsx:~173-257`: pannello parametri EDM con palette
  ambra hardcoded (`bg-amber-50/50`, `text-amber-*`, `bg-blue-100`) mentre esiste
  il token `warning`. In dark resta giallo pallido "rotto". Fix: migrare a
  `border-warning/30 bg-warning/[0.12] text-warning`.
- **AUD-36** — Pattern "light-tint" che non inverte in dark (~12 spot): alone
  `bg-red-50` in `confirm-dialog.tsx:43` (in OGNI delete), chip
  `bg-blue-100/amber-100/red-100` in `SettingsPageHeader.tsx:13/16/22`, hover
  tint in `Dxf2dProfileList`, `DxfProfilePicker`, `CategoryFormModal`,
  `NotificationPanel`. Fix: forma a token/opacità (`bg-destructive/10`, ecc.).
- **AUD-37** — ⏳ **DA CONCORDARE** (refactor a rischio diffuso, fuori quick-win) — Nessun primitive `dialog.tsx`: **19 modali** fatte a mano
  ripetono lo scrim `fixed inset-0 bg-gray-900/50…` con drift (`/50`÷`/70`,
  z-index vari). I body usano `bg-card` (ok in dark) → è tech-debt/DRY, non
  rottura visiva. Fix: un `ModalShell` condiviso. Assorbe/estende AUD-21.
- **AUD-38** — ⏳ **DA CONCORDARE** (cosmetico, tocca interazione su 5 punti) — 5 `<select>` nativi dove lo standard è shadcn `Select`
  (`QuotesListView:201-227`, `ActivityPage:68`, `DirectSalesPage:40`,
  `MaterialFormModal:112`, `EdmPhaseFields:240`). Token-corretti (dark-safe) →
  solo coerenza visiva.
- **AUD-39** — ✅ **FATTO** (empty state MaterialOrdersView; skeleton-consistency lasciata come polish minore) — Loading a testo "Caricamento…" invece di skeleton in modo
  incoerente (QuoteEditor, NewQuote2DPage, ecc.; solo ToolsPage/DocumentsTable
  usano skeleton); empty state solo-testo in `orders/NormalizedFileView`,
  `orders/MaterialOrdersView`. Fix: uniformare a skeleton + empty con icona.
- **AUD-40** — ✅ **CHIUSO** (verificato 2026-07-14) — `DirectSalesPage` ha già
  `overflow-x-auto`+`min-w` (falso positivo). `QuotesListView` usa una grid con
  `minmax(0,…)` che adatta le colonne (clip solo <~640px, non nell'uso desktop);
  wrapper min-width entrerebbe in conflitto con i pannelli riga espandibili →
  non toccato per §0-bis.

### Sprint D — Minori (non-stampi) — ✅ FATTO 2026-07-14 (AUD-41/42/43)
- **AUD-41** — ✅ **FATTO** — Alcuni `catch { toast.error('Errore') }` scartano il `detail`
  utile del backend (es. "in uso in 3 preventivi"): `WorkflowTemplatesPage`,
  `officina/documenti/DocumentsPage` (delete), `QuoteCategoriesPage`. Fix: usare
  l'helper esistente `getApiErrorDetail(e, 'fallback')`. Affine AUD-6/CAT-5.
- **AUD-42** — Controlli icona-only come `<Trash2 onClick>`/`<FileDown onClick>`
  nudi: non focusabili, senza `aria-label`/`title` (`MaterialsFileView`,
  `NormalizedFileView`, `OrderHistoryView:67-80`). Fix: wrappare in `<button>`
  con `title`/`aria-label`.
- **AUD-43** — `.env.example:10` dice `ACCESS_TOKEN_EXPIRE_MINUTES=1440` ma il
  default del codice è `0` (mai scade): allineare l'esempio al default intenzionale.

### Sprint E — Performance / robustezza — ✅ FATTO 2026-07-14 (AUD-44…47)
- **AUD-44** — ✅ **FATTO** — Indici mancanti sulle colonne più filtrate di `quotes`:
  `created_by_user_id` (ogni lista/archivio/dashboard per chi non ha `view_all`),
  `status` (~5 COUNT per dashboard), `quote_date`/`completed_at`, +
  `notifications.created_at` (`main.py:~545-553`). Fix: blocco additivo
  `CREATE INDEX IF NOT EXISTS`. Concretizza B7. *(tocca §0-quater — aggiungere con
  cura.)*
- **AUD-45** — ✅ **FATTO** — `list_quotes` (`quotes.py:~103-121`) fa collection-joinedload
  dell'albero parts→phases→material → prodotto cartesiano per la lista.
  `quotes_archive.py` usa già `selectinload`. Fix: `selectinload` o schema header
  leggero.
- **AUD-46** — ✅ **FATTO** (params opzionali, default invariato) — `list_customers` (`customers.py:~26`) senza limit/skip →
  materializza tutta la tabella a ogni pagina/picker clienti. Fix: paginazione
  (pattern già in `list_quotes`).
- **AUD-47** — ✅ **FATTO** — Seed a import-time non protetti (`main.py:~1212-1217`): un seed che
  fallisce fa fallire `import app.main` → uvicorn non parte. Fix: spostare in
  lifespan/startup o wrappare ogni seed in try/except con log.
- **AUD-48** — ⏳ **DA CONCORDARE** (op DB rischiosa: serve audit orfani prod PRIMA) — `PRAGMA foreign_keys` OFF (`database.py:~26-27`): nessun backstop
  DB agli orfani (è la modalità dell'incidente 2026-05). Fix: audit orfani su
  prod, poi `PRAGMA foreign_keys=ON` nel connect listener. *(Da fare con cautela,
  non a cuor leggero.)*

### ⛔ MODULO STAMPI RIMOSSO (2026-07-14) — da ricostruire da zero

**Decisione utente 2026-07-14**: il preventivatore stampi è stato **rimosso
interamente** (frontend + backend + tabelle DB) per essere **riscritto da
capo**. Snapshot completo del codice recuperabile dal tag git
**`stampi-pre-rimozione`** (`git checkout stampi-pre-rimozione -- <path>`).

Rimosso: pagine `NewDieQuotePage`/`DieQuoteEditor`/`DiesSettingsPage`,
`lib/dieCalc.ts`, `components/quotes/die/*`, router `dies`/`die_normalized_items`/
`die_settings`, 7 modelli `Die*` (+ tabelle droppate), schemi `Die*`, cost engine
stampi (`_recalculate_die_levels` ecc.), permessi `dies.*`, tile chooser
"Stampi" e "Preventivo 3D", split standard/stampi in dashboard/statistiche.
Restano (SQLite no DROP COLUMN, non mappate): colonne `parts.die_*`/`plate_role`.

#### Residui inerti — audit + cleanup 2026-07-15 ✅ FATTO

L'audit del 2026-07-15 ha confermato che **nessun preventivo può più essere di
tipo `die`** e che il workflow standard (single/commessa) funziona senza il
modulo. La rimozione del 2026-07-14 però non era totale: c'erano residui inerti
e **un test rotto**. Tutto ripulito il 2026-07-15 (3 commit):

- **✅ Test frontend rotto** — `cost-golden.test.ts` importava il cancellato
  `src/lib/dieCalc` → `npm test` falliva in blocco. Rimossi import + casi `die_*`/
  `calc_quote_total_die`/R3 dal test e dal fixture `cost_golden_cases.json`; tolti
  i test backend `test_die_l3_mech/edm/l4`. (commit `fix(stampi): ripara golden test`)
- **✅ Backend dead code** — rimosso `core/quote_types.py` (`is_die`/`is_standard`)
  e tutte le chiamate (rami sempre-falsi) in quotes/parts/orders/quotes_archive/
  quote_workflow; rimosso il param dead `quote_type` nelle statistiche e il filtro
  difensivo `quote_type != 'die'`; puliti i commenti "Stampi" in models/dashboard;
  cancellati `test_quote_types.py` + i test die in `test_quote_workflow`.
  (commit `chore(stampi): rimuovi residui inerti … backend`)
- **✅ Frontend dead code** — cancellato `components/charts/TypeDonut.tsx` (non
  importato); rimosso il token accent `dies`/`--dies`/`bg-dies` (SettingsPageHeader,
  PrimaryCtaButton, crud, SettingsTabs, index.css, tailwind.config); ripuliti il
  testo utente in `NormalizedItemsPage` e i commenti in `types/index.ts`/stats/lista.
- **✅ Docs orfani** — cancellati `docs/import_historical_dies_{README.md,template.csv}`;
  banner "modulo rimosso" sul Modo 3 di `docs/guide/TUTORIAL_PREVENTIVATORI.md`.

**Lasciato intenzionalmente** (non è debito attivo):
- Colonne DB `parts.die_*`/`plate_role`: SQLite non fa DROP COLUMN, restano inerti.
- La colonna `quotes.quote_type` (valori `single`/`commessa`) e la relativa
  migration restano: sono il tipo preventivo standard, non un residuo stampi.
- Commenti di migrazione in `main.py` che documentano i DROP TABLE die (storia).
- Voci die storiche in `docs/history/CORREZIONI_PREZZI.md` e nelle spec 16/17/18/19:
  sono record di lavoro/design già rimandati al "cantiere stampi", non fuorvianti.

Verifica finale: backend startup OK, `pytest tests/unit` 92 pass, `tsc --noEmit`
pulito, `vitest` 19 pass.

Gli AUD-49…56 sotto sono quindi **SUPERATI dalla rimozione** (il codice che
descrivevano non esiste più): vanno riconsiderati **al momento della
riscrittura**, non prima. Restano qui come memoria dei problemi noti del
vecchio modulo, da non ripetere nel nuovo.

**➜ Lavoro futuro: Ricostruire il modulo Preventivatore Stampi** — quando si
riparte, partire dalla spec utente (P2/P3 sotto) e dal tag `stampi-pre-rimozione`
come riferimento di ciò che c'era; NON ripristinarlo così com'era (aveva i
problemi AUD-49…56 + zone fragili). Reintrodurre i permessi `dies.*`, il
`quote_type='die'`, i modelli e le migrazioni da capo.
- **AUD-49** — ✅ **FATTO 2026-07-14** (read diretti) — `ensure_quote_visible`
  aggiunto a `get_die_quote` (`dies.py:204`) e `list_items`
  (`die_normalized_items.py:35`): niente più lettura di stampi/BoM altrui per id.
  Le scritture erano già coperte da `ensure_editable`. ⏳ **Resta aperto il ramo
  find-similar** (`dies.py:475/509`): mostra top-5 stampi storici (con margini)
  per riferimento prezzo; restringerlo ai propri svuoterebbe la feature →
  decisione di prodotto, si valuta col rifacimento del modulo.
- **AUD-50** — `apply_template` bulk-delete (`dies.py:~387`) bypassa il cascade
  ORM e il cleanup file → fasi/`part_files` orfani + blob DXF leakati su disco.
  Fix: iterare `db.delete(part)`.
- **AUD-51** — `create_die_quote` (`dies.py:~163-196`) committa Quote+DieSpec
  prima di validare `template_id` → template errato lascia un `bozza` orfano e il
  retry dà "numero già esistente". Fix: validare il template prima del commit.
- **AUD-52** — `DieNormalizedItem.normalized_supplier_id` mai validato
  (`die_normalized_items.py:~47-92`) → id inesistente fa saltare in silenzio lo
  shipping L2 (`calculation.py:~694`) → prezzo stampo sottostimato. Fix: 400 se
  supplier assente.
- **AUD-53** — `find_similar` ordina per `created_at` eventualmente NULL
  (`dies.py:~449-453`) → `TypeError`/500 su righe legacy. Fix: `key=lambda q:
  q.created_at or datetime.min`.
- **AUD-54** — Selezione template stampo sovrascrive gli input manuali senza
  conferma (`NewDieQuotePage.tsx:~244-254`): azzera difficoltà + 6 conteggi
  feature. Fix: auto-fill solo campi vuoti o `ConfirmDialog`.
- **AUD-55** — Dark-mode rotto nel modulo stampi: `DieSideView.tsx`,
  `DieTopView.tsx` (`bg-white`/`bg-gray-50`/`text-gray-*` → etichette invisibili),
  `DieQuoteEditor.tsx` L399/439/820/829. Estende AUD-17 al resto del modulo.
- **AUD-56** — Delete "Fasce dimensionali" senza conferma (`DiesSettingsPage.tsx:228`),
  incoerente col resto delle impostazioni. Fix: `ConfirmDialog`.

> Nota: nessun file di codice è stato modificato da questo audit. Le voci sono
> pianificazione; verifica per singola voce prima di chiuderla.

---

## 📋 C — Import ordine materiale (manuale + tabella SolidWorks) — SOSPESO (2026-07-02)

Feature concordata con l'utente il 2026-07-02, **sospesa su sua richiesta**
(da riprendere). Design deciso; manca solo un dato per il parser CSV.

**Cosa deve fare.** La pagina *Ordini materiali* avrà **due modalità**:
1. **Da preventivi** (già esistente): seleziona preventivi → aggrega per
   fornitore → ordine.
2. **Manuale** (nuova): righe inserite a mano con i campi **materiale** (scelto
   dalla lista Materiali), **codice articolo**, **forma** (tondo/quadro),
   **dimensioni**, **quantità**, con "+ aggiungi voce" (multi-riga). Più un
   pulsante "**Importa da CSV SolidWorks**" che popola le righe.

Entrambe le modalità producono un **ordine salvato**, editabile, esportabile in
CSV (formato di B: `Materiale · Forma · Dimensioni · Riferimento · Quantità`) e
presente nello **storico** (ri-scaricabile).

**Materiali (find-or-create + popup).** Nell'import CSV, ogni materiale della
tabella viene cercato a catalogo con `find_by_name` (helper di D2); se esiste si
aggancia, se **manca** si apre un **popup** per crearlo (poi disponibile in
tutta l'app). Nella modalità manuale il materiale si sceglie dalla lista → già
agganciato (popup non necessario).

**Come spezzarla:**
- **C1 — Modalità manuale** (costruibile subito, nessun blocco):
  - **C1.1** modello: nuova tabella `MaterialOrderItem` (righe manuali:
    `material_id` FK opzionale, nome materiale snapshot, forma, dimensioni,
    riferimento, quantità) + `MaterialOrder.source` ('manual' | 'quotes');
    migration idempotente.
  - **C1.2** backend: endpoint crea-ordine-manuale da righe; export CSV che usa
    le righe manuali se presenti, altrimenti l'aggregazione da preventivi;
    storico che mostra anche gli ordini manuali.
  - **C1.3** frontend: modalità "Manuale" nella pagina ordini materiali
    (tabella righe: dropdown materiale + forma + dimensioni + qty + aggiungi/
    rimuovi) → crea ordine → CSV.
- **C2 — "Importa da CSV SolidWorks"** (BLOCCATO): il pulsante che parsa il CSV
  e riempie le righe, con match+popup per i materiali mancanti.
  **⛔ Serve prima un esempio reale del CSV SolidWorks dell'utente**
  (intestazioni + 1-2 righe): senza, il parser è indovinato. Riusa il motore
  `app.core.csv_import` per il parsing.

**Riuso:** motore `csv_import` (parsing), `catalog_protect.find_by_name` (D2,
match), formato CSV output (B). **Nota audit:** oggi NON esiste alcun import "da
tabella SolidWorks" nei preventivi (l'unico import da file è il wizard DXF 2D,
che sono disegni, non distinte base) → C è greenfield.

---

## ⭐ PROSSIMA SESSIONE — DA FARE SUBITO (aggiornato 2026-06-30)

**1. Pulizia file/doc obsoleti** ← la prima cosa da fare.
Tanti file accumulati, diversi probabilmente obsoleti/inutili. Metodo:
ricognizione a sola lettura (specie `docs/specs/` — 02/04/06/10 marcati
DEPRECATED-DRIFT — il ROADMAP ritirato, i file di root) → proposta
*cancella / unisci / tieni* con il perché → cancellare **solo dopo ok**, in un
commit dedicato (git tiene la storia). NON cancellare alla cieca: alcuni doc
possono essere ancora autoritativi.

**2. Piano architettura (consolidamento motore + "tutto collegato").**
Documento completo: `docs/specs/17_architettura_target.md`. Principio: motore
preventivi come **cuore puro** (monolite modulare, non microservizio). Roadmap
per rischio: **F1** guard-rail → **F2** nucleo costi unico → **F3** collega
normalizzati → C1/C2 coerenza → P1 decisioni prodotto → D1 differito. Partire
da **F1** (rischio basso).
> Nota: **F3 = Step 4/5 del "Cantiere Catalogo Normalizzati" qui sotto**
> (aggancio FK `NormalizedItem`): è lo stesso lavoro, da fare una volta sola.

---

## ░░░ CANTIERI APERTI (lavori in corso oltre i blocchi) ░░░

### Cantiere Catalogo Normalizzati 🚧 IN CORSO (aperto 2026-05-27)
Nuovo modulo: catalogo globale dei pezzi normalizzati (viti, cuscinetti,
molle, colonne, boccole, ecc.). Oggi i normalizzati esistono solo dentro
template stampo (`DieTemplateNormalized`) e dentro singoli preventivi
stampo (`DieNormalizedItem`) — niente catalogo centrale da cui pescarli.
Risultato: un componente ricorrente viene digitato a mano N volte, con
prezzi che divergono e zero memoria storica.

Cantiere in 6 step incrementali, commit separato per ogni step. Opzione di
aggancio scelta: **Opzione A — snapshot**: i template/preventivi avranno
una FK opzionale al catalogo; al collegamento i valori vengono copiati;
preventivi storici restano congelati ai loro numeri.

**Stato avanzamento**:
- ✅ **Step 1** — modello `NormalizedItem` + migration (`ca738ab`, 27/05)
- ✅ **Step 2** — endpoint CRUD (`f430eb4`)
- ✅ **Step 3** — pagina UI catalogo (`26e7ab8`)
- ⏸ **Step 4** — aggancio `DieTemplateNormalized` (FK + autocomplete) (~1 giornata)
- ⏸ **Step 5** — aggancio `DieNormalizedItem` (FK + autocomplete) (~1 giornata)
- ⏸ **Step 6** — import CSV + modello scaricabile (~½ giornata) — il
  motore condiviso `app.core.csv_import` esiste già (cantiere import
  cataloghi chiuso il 2026-06-04), quindi è ora un lavoro breve: serve
  solo cablare un mapper su `NormalizedItem` e i due endpoint.
- ⏸ **Step 7** (opzionale) — estrazione automatica voci da template esistenti (~½ giornata)

**Stima residua**: restano Step 4-5-6 (+7 opzionale), ~2½-3 giornate di
lavoro effettivo. Cantiere a sé, indipendente da altri lavori in corso. Si
procede 1 step alla volta, ogni step richiede ok esplicito prima di partire.

---

### Blindatura import CSV 🔴 APERTO (2026-06-05, dopo incidente produzione)
Un import CSV materiali ha messo **offline l'app** in produzione: il motore
`import_catalog_csv` scrive nel DB **senza passare dallo schema Pydantic**, e
un valore `family` non valido (etichetta invece di slug) ha fatto crashare
con 500 ogni lettura dei materiali. Asimmetria scrittura↔lettura presente in
**tutti** i moduli CSV (materiali, trattamenti, utensili, macchine,
lavorazioni, fornitori — e clienti, endpoint a parte).

Dettaglio completo, runbook d'emergenza e fix strutturale in
**`docs/history/NOTA_IMPORT_CSV_VALIDAZIONE.md`**.

- ✅ Incidente 2026-06-05 riparato (dati corretti, app operativa).
- ⏸ **Livello 1** — validazione di ogni riga via schema `...Create` nel motore
  condiviso (azzera il rischio di blocco app; una modifica protegge tutti).
- ⏸ **Livello 2** — normalizzazione per-campo nei mapper (etichetta→slug) così
  gli import legittimi non vengono scartati.
- ⏸ **Livello 3** — template scaricabili allineati ai valori ammessi reali.

Da fare un modulo alla volta, con verifica (CLAUDE.md §7). Priorità alta:
è un guasto già occorso su dati reali.

---

## ░░░ BLOCCO A — PRIMA DI INSERIRE DATI REALI SUL SERVER ░░░

*Questi sono il minimo indispensabile. Finché non sono fatti, MechQuote non
va usato con clienti e preventivi veri.*

> **Ricognizione 04/06/2026**: rispetto al testo originale, A5 e A6 sono
> già chiuse nel codice; A1/A3/A4/A9 hanno la parte di codice già fatta e
> resta solo l'aspetto server; A2/A7/A8 erano e restano azioni server. La
> lista delle azioni server pendenti è consolidata in fondo al Blocco A
> nella sezione "Checklist server — config una-tantum".

### A1 — Backup off-disk (NAS / disco diverso dal server) 🔴

**Codice / template** ✅ FATTO (04/06/2026):
- script di backup notturno **WAL-aware** in `INSTALLAZIONE.md` §9.1 (template
  `backup.ps1` che usa `sqlite3.backup()` via Python del venv);
- rotazione automatica a 30 backup (`INSTALLAZIONE.md:634-635`);
- backup WAL-aware pre-aggiornamento anche in `update.ps1:208`.

**Resta** (server, non codice): le copie finiscono in `C:\MechQuote\backups\`,
sullo stesso disco del server. Se quel disco muore, anche i backup spariscono.
Va configurata una copia/sync periodica su **NAS aziendale o disco esterno**.
Vedi "Checklist server" in fondo al blocco. *Stima azione server: ~30 min.*

### A2 — Diagnosticare il crash del modulo stampi sul server 🔴
Aprire `C:\MechQuote\logs\uvicorn.log` sul server, cercare l'ultimo errore
registrato quando lo stampo crasha. Il messaggio dirà quale delle 5 piste è
quella vera (Chromium mancante, cartella di avvio sbagliata, tabelle non
create...). Solo *dopo* la diagnosi si decide la correzione.
**Perché qui:** è il bug originale da cui è partito tutto; e se la causa è
"Chromium mancante" o "cartella sbagliata", riguarda l'installazione del
server, che va sistemata prima di usarlo. *Stima diagnosi: ~5 min.*

### A3 — `SECRET_KEY` forte nel `.env` del server 🔴

**Codice** ✅ FATTO: `backend/app/core/config.py:50-65` ha un guard che
rifiuta lo startup (`sys.exit(1)`) se `SECRET_KEY` è la default / troppo
corta / placeholder *e* `ALLOWED_ORIGINS` suggerisce production (non
localhost).

**Resta** (server, non codice): generare la chiave forte e metterla nel
`.env` del SERVER. Vedi "Checklist server" in fondo al blocco. *Stima
azione server: ~5 min (`openssl rand -base64 32` + notepad).*

### A4 — Soglia minima di margine 🟡

**Sconto** ✅ FATTO: `global_discount_percent` è già vincolato
`Field(ge=0, le=100)` in `backend/app/schemas.py:373`.

**Resta** (codice, dopo decisione di prodotto): margine oggi a
`Field(ge=-99, le=1000)` (`schemas.py:318, 372`). Il floor di -99% è
troppo permissivo: si può ancora salvare un preventivo con margine
fortemente negativo e arrivare a PDF con prezzo negativo. Richiede una
**decisione di prodotto** (qual è la soglia minima sensata: 0%? -5%?
0% sotto i preventivi commessa?), poi un cambio di una riga nel
`Field(ge=...)`. Collegata in spirito a D1/D2 (decisioni su sconto e
prezzo minimo). *Stima: ~5 min dopo decisione.*

### A5 — `busy_timeout` SQLite ✅ FATTO

Confermato 04/06/2026: `backend/app/core/database.py:40` →
`PRAGMA busy_timeout=5000` impostato a ogni connessione (insieme a
`PRAGMA journal_mode=WAL`). **Voce chiusa.**

### A6 — `python-jose` aggiornato ✅ FATTO

Confermato 04/06/2026: `backend/requirements.txt:7` →
`python-jose[cryptography]==3.5.0` (versione corrente). Salvo verifica
mirata con `pip audit` o test login post-deploy, **voce chiusa.**

### A7 — Verificare e cambiare la password dell'utente admin sul server 🔴
Lo script di creazione del primo admin (descritto nel CLAUDE.md) imposta una
password di default debole: la parola `admin`. Va bene sul PC di sviluppo, è
una **falla grave** sul server: chiunque provi "admin/admin" entra come
amministratore e vede tutti i dati aziendali — annullando tutta la sicurezza
(bcrypt, permessi).
**Cosa fare:** verificare che password ha oggi l'admin sul server; se è
quella di default o un'altra banale, cambiarla con una forte. Verificare
anche che eventuali altri utenti già creati non abbiano password banali.
**Perché qui:** è una porta aperta. Va chiusa prima di mettere dati veri.
*Stima: pochi minuti.*

### A8 — Bug server: PDF preventivi dà errore 500 🔴 (scoperto 2026-05-27)
Sul server, generare il PDF di un preventivo restituisce **HTTP 500
Internal Server Error**. Sul PC di sviluppo funziona. Sintomi tipici per
questa classe di errore: Chromium di Playwright non installato (la
generazione PDF dipende da un browser headless che pesa ~150 MB e va
installato a parte rispetto a Python/Node), oppure permessi sulla cartella
temporanea, oppure cartella di avvio del servizio sbagliata.
**Cosa fare:** aprire `C:\MechQuote\logs\uvicorn.log` sul server al momento
del tentativo PDF, identificare l'eccezione. La causa più probabile è
Chromium mancante. Stesso check incrociato con A2 (crash stampi): se è
Chromium, A2 e A8 hanno la stessa radice e si risolvono insieme con
`playwright install chromium` nel venv del server.
*Stima diagnosi: ~5 min. Stima correzione: ~10 min se è Chromium.*

### A9 — Apache proxy route `/api/dashboard/alerts` 🔴 (scoperto 2026-05-27)

**Codice** ✅ FATTO: endpoint esiste, `backend/app/api/dashboard.py:553`
(`@router.get("/dashboard/alerts")`).

**Resta** (server, non codice): sul server il browser riceve **GET
`/api/dashboard/alerts` → 404**. Il 404 viene da Apache (la regola
`ProxyPass /api ...` di `C:\Apache24\conf\extra\httpd-vhosts.conf` non
inoltra questa sotto-route), non da FastAPI. Verifica:
- `nssm status MechQuoteBackend` (servizio acceso?);
- `curl http://localhost:8000/api/dashboard/alerts` dal server (risponde
  il backend?);
- regola di proxy in `httpd-vhosts.conf`.

Vedi "Checklist server" in fondo al blocco. Affine ad A2 (stesso ambiente
server, possibile stessa radice). *Stima diagnosi/fix server: ~15 min.*

---

### ░░░ Checklist server — config una-tantum ░░░

Lavori che NON sono nel codice ma sul server. Da fare in azienda, una sola
volta, poi tracciati come fatti. Tutti hanno il codice già pronto:
l'intervento è solo di configurazione/operatività sul PC server.

- [ ] **Collaudo `update.bat` / `update.ps1`** sul server. Lanciare,
      leggere l'output, confermare che la versione si aggiorna e il
      backend ripartisce. Prerequisito di tutto il resto.
- [ ] **A8 — Chromium per i PDF**: nel venv del server lanciare
      `playwright install chromium` (~150 MB). Causa più probabile del
      PDF 500 e potenzialmente del crash stampi (A2).
- [ ] **A3 — `SECRET_KEY` forte nel `.env`**: generare con
      `openssl rand -base64 32`, scrivere in `C:\MechQuote\backend\.env`,
      riavviare il servizio. Il guard nel codice
      (`backend/app/core/config.py:50-65`) si attiva automaticamente.
- [ ] **A7 — Password admin di default**: collegarsi al server,
      verificare la password dell'utente `admin` nel DB. Se è ancora
      `admin` o banale, sostituire con una forte. Stesso check su altri
      utenti già creati.
- [ ] **A2 — Diagnosi crash stampi**: aprire
      `C:\MechQuote\logs\uvicorn.log` durante il crash, identificare
      l'eccezione. Causa probabile: stessa di A8 (Chromium mancante).
- [ ] **A9 — Apache proxy `/api/dashboard/alerts`**: verificare la regola
      `ProxyPass /api ...` in `C:\Apache24\conf\extra\httpd-vhosts.conf`
      (vedi `INSTALLAZIONE.md` §6.4); attualmente non inoltra la
      sotto-route. Confermare con `curl http://localhost:8000/api/dashboard/alerts`
      dal server (risposta del backend = 200/json).
- [ ] **A1 — Backup off-disk**: il backup WAL-aware notturno
      (`backup.ps1`, vedi `INSTALLAZIONE.md` §9.1) gira già, ma scrive
      su `C:\MechQuote\backups\` (stesso disco del server). Configurare
      una copia/sync periodica su NAS aziendale o disco esterno — se il
      disco del server muore, anche i backup spariscono.

---

## ═══ LINEA 1 — qui si possono inserire i primi dati reali ═══

---

## ░░░ BLOCCO B — PRIMA DELL'USO DA PARTE DI PIÙ PERSONE ░░░

*MechQuote nasce per più utenti. Questi lavori rendono quella promessa vera.*

### B1 — Gestire le modifiche in contemporanea sui preventivi 🔴
Oggi, se due persone modificano lo stesso preventivo, l'ultimo che salva
**cancella in silenzio** il lavoro dell'altro. Va aggiunta una protezione che
almeno **avvisa** ("attenzione, qualcuno ha modificato dopo di te").
**Da decidere con l'utente:** quante persone useranno davvero MechQuote
insieme, e quanto spesso capiterà che lavorino sullo stesso preventivo. La
risposta determina quanto è urgente. *Stima: media.*

### B2 — Riallineare le due "calcolatrici" dei prezzi 🔴
Anteprima a schermo e calcolo del server devono dare lo stesso numero; in
piu' punti non lo fanno. **Stato e dettaglio completo in
`docs/history/CORREZIONI_PREZZI.md`** (fonte unica sul calcolo prezzi).
Sintesi: **Fascia 1 CHIUSA** (C1-C5 applicate; C6 -> P3, C7 -> P2, spostate
al cantiere stampi). Restano la **Fascia 2** (fragilita' medie: anteprime
stantie, calcoli che vanno a 0 in silenzio, forma pezzo nel wizard 2D,
validazioni mancanti) e la **Fascia 3** (decisioni azienda: D1/D2,
arrotondamento). Elenco puntuale in CORREZIONI_PREZZI.

### B3 — Test automatici sui punti che fanno male
Esiste già una base di 48 test che passano. Mancano in due punti precisi:
**login/permessi** (la parte sicurezza non ha rete di sicurezza) e un **test
di parità** che confronti le due calcolatrici dei prezzi. Da aggiungere test
mirati lì — non "una suite completa", solo i punti critici.
*Stima: ~1 giorno.*

### B4 — Proteggere la cartella `/uploads` + validazione file
La cartella dei file caricati (disegni tecnici, schede) è oggi scaricabile
**senza login** da chi indovina l'indirizzo. Va messa dietro autenticazione.
Insieme: far controllare i file caricati dal *contenuto reale* e non solo dal
nome. *Stima: ~mezza giornata.*

### B5 — Chiudere la lettura dei preventivi "dalla porta di servizio"
L'interfaccia nasconde i preventivi che non competono a un utente, ma chi fa
chiamate tecniche dirette potrebbe leggerli lo stesso. Da verificare e
chiudere. *Stima: piccola/media.*

### B6 — Nascondere i campi che non hanno effetto
Esistono campi nell'interfaccia che un utente può compilare credendo di
influenzare il prezzo, ma che il calcolo **ignora**. Vanno nascosti, per non
ingannare chi li compila. *Stima: piccola.*

### B7 — Aggiungere gli indici mancanti al database
Mancano alcuni "indici" (`quote_date`, `status`, `quote_type`,
`created_by_user_id`). Senza, con molti preventivi la dashboard e l'archivio
rallenteranno. Poche righe. *Stima: ~10 min. Conviene farlo presto, costa poco.*

---

## ═══ LINEA 2 — qui MechQuote è pronto per l'uso quotidiano in più persone ═══

---

## ░░░ BLOCCO C — MANUTENZIONE E MIGLIORAMENTI (senza fretta) ░░░

*Cose vere ma non urgenti: si affrontano quando c'è tempo.*

### Performance (problemi del "futuro", con la crescita dei dati)
- **C1** — La ricerca nell'archivio rallenterà oltre ~1000 preventivi.
- **C2** — La dashboard ricalcola tutto ad ogni apertura: lenta con molti dati.
- **C3** — La ricerca "stampi simili" carica tutto in memoria: lenta con
  centinaia di stampi.
- **C4** — La generazione PDF riavvia Chromium ogni volta (2-5 secondi a PDF).

### Robustezza e operatività
- **C5** — Il file di log cresce all'infinito: va configurata una "rotazione".
- **C6** — Nessun "controllo del battito": se MechQuote si pianta in silenzio,
  nessuno se ne accorge.
- **C7** — File caricati possono restare "orfani" su disco: serve una pulizia.
- **C8** — Il database non controlla i collegamenti tra i dati ("foreign
  keys"): rischio di dati scollegati, soprattutto durante import/ripristino.
- **C9** — Procedura di aggiornamento dal PC al server: documentata ma
  migliorabile (test su porta separata prima del passaggio, `npm ci`,
  endpoint `/api/version` per sapere che versione gira).

### Codice
- **C10** — La formula del costo fase è in TRE copie invece di due: ridurle.
- **C11** — Errori del lettore DXF troppo "chiacchieroni" verso l'utente.
- **C12** — File possono sovrascriversi se hanno lo stesso nome.
- **C13** — Piccole imprecisioni di arrotondamento (differenze di centesimi).
- **C14** — Dati che restano "vecchi" se si cambia materiale e si cancellano
  le dimensioni.
- **C15** — Riordino dei file più grandi (lavoro estetico, ultima priorità).
- **C16** — Backup WAL-aware: la logica `sqlite3.backup()` e' oggi
  duplicata inline in `update.bat` e in `backup.ps1` (§9.1 di
  INSTALLAZIONE.md). Consolidarla in un unico `backend/backup_db.py`
  richiamato da entrambi.

---

## ░░░ DA CHIARIRE CON L'AZIENDA (non sono lavori di codice) ░░░

Domande a cui solo l'azienda può rispondere — vanno sciolte, idealmente prima
del Blocco B:

- **D1** — Lo sconto può portare il totale sotto il "prezzo minimo" delle
  parti? Il minimo è invalicabile o no?
- **D2** — Lo sconto deve applicarsi anche a trasporto e imballaggio?
- **D3** — Quante persone useranno MechQuote insieme, e quanto spesso sullo
  stesso preventivo? (Determina l'urgenza di B1.)
- **D4** — Confermare se il server è raggiungibile solo da rete interna
  (idealmente verificandolo con chi gestisce la rete).

---

## ░░░ DECISIONI DI PRODOTTO ░░░

Cose che **non sono bug** del codice, ma rappresentazioni del dominio che
vanno discusse e potenzialmente riviste con l'officina. Sono "P" (prodotto),
distinte dalle "D" (domande operative all'azienda) e dalle voci A/B/C
(lavori di codice). Da affrontare **dopo il Blocco B**: prima si chiude
la messa in sicurezza, poi si rivedono le modellazioni.

### P1 — Separare Trattamenti e Rivestimenti
Nell'officina sono due famiglie distinte: **trattamenti termici** pagati a
**peso** (kg) e **rivestimenti** pagati a **volume** (dm³), con fornitori
diversi. MechQuote oggi li tiene in un'unica categoria "Trattamenti", con
un flag `cost_unit = 'kg' | 'dm3'` che switcha la formula del costo.

Non è un bug — il calcolo funziona — ma è una rappresentazione poco fedele:
**due famiglie con dinamiche e fornitori diversi sono fuse in una sola
voce di catalogo**. L'UX risulta meno chiara per chi compila il preventivo,
i report aggregati per "trattamento" mescolano cose diverse, e il campo
`cost_per_dm3` su un "trattamento" può essere fuorviante per chi pensa
all'asportazione truciolo (concetto **non** presente nel codice).

**Da verificare prima con l'officina**: i rivestimenti vanno **davvero a
dm³** o vanno a **superficie** (dm²)? Nel database SQLite esiste una colonna
**legacy** `cost_per_surface_area` sul modello `Treatment` — mappata in
passato, mai più letta dal cost engine — che suggerisce un modello "per
superficie" considerato e poi accantonato. Se i rivestimenti reali vanno a
superficie, l'attuale `cost_per_dm3` è una semplificazione che approssima
ma non rappresenta il prezzo vero del fornitore.

**Esito atteso**: una decisione su come modellare in MechQuote i due mondi
(due tabelle separate? una sola con tipologia? formula a superficie per i
rivestimenti?). Decisione di prodotto da affrontare **dopo il Blocco B**.

### P2 — Forma del pezzo negli stampi (rettangolare / tondo)
Il calcolo del perimetro pezzo a fallback (in `_estimate_die_perimeter`,
backend `services/calculation.py:~641-649` + gemello frontend
`lib/dieCalc.ts:~167-171`) usa oggi la formula rettangolare
`2 × (bbox_x + bbox_y) × complexity_factor` **per qualunque pezzo**, anche
quelli di sagoma tonda. Per un disco Ø 100 mm la sovrastima è di circa il
**53%** (perimetro vero π × 100 ≈ 314 mm; fallback 480 mm) → ore EDM filo
gonfiate, prezzo dello stampo sovrastimato. Conseguenza pratica: stampi
per pezzi tondi (dischi, rondelle, flange) quotati molto più cari del
dovuto.

Per correggerla servirebbe la formula del cerchio (`π × diametro`) nel
ramo "tondo", ma per scegliere il ramo il codice deve sapere **che forma
ha il pezzo**: oggi il modello `DieSpec` non lo dice. Le uniche
dimensioni del pezzo sono `bbox_x_mm`, `bbox_y_mm`, `perimeter_pezzo_mm`
(opzionale) e `complexity_factor` — niente campo `shape`, `forma`, o
`raw_diameter`. Dal punto di vista del codice un disco Ø 100 e un
quadrato 100×100 sono indistinguibili.

Originariamente questa voce era in Fascia 1 come "C7" nelle correzioni
prezzo. Spostata qui in Decisioni di prodotto perché non è una correzione
di codice come le altre (C1-C6): è una **modifica di modello + UX** che
deve essere parte naturale del ripensamento del calcolo stampi.

**Esito atteso**: decidere come dichiarare la forma del pezzo (campo
`shape` enum su `DieSpec` con radio nel wizard? altra rappresentazione?),
applicare la formula del cerchio nel ramo "tondo" sia nel backend che nel
gemello frontend, attivare il caso d'oro S7 (oggi xfail con
`fails_until: P_die_shape`). Da affrontare **dopo il Blocco B**, come
parte del cantiere stampi.

### P3 — Ripensare il calcolo lavorazioni piastre stampo
La voce "foratura piastre" del cost engine stampi (in
`_estimate_die_plate_breakdown`, backend `services/calculation.py:~569-619`
+ gemello frontend `lib/dieCalc.ts:~34`) ha **tre problemi che si tengono
insieme** e che non si possono affrontare separatamente:

1. **Tariffa foratura inesistente come campo dedicato.** In
   `_recalculate_die_levels` (~`calculation.py:777`) il fallback di
   `rate_drill` è `settings.hourly_rate_milling` (tariffa fresatura). La
   colonna `hourly_rate_drilling` **non esiste** nel modello `DieSettings`.
   Se l'utente non aggancia esplicitamente una `drilling_machine_id`, la
   foratura piastre costa quanto la fresatura. Era originariamente la
   "C6" in Fascia 1.

2. **Doppio conteggio foratura + EDM filo su matrice e porta_punzoni.**
   Ogni piastra (compresa la matrice) riceve la voce "ore foratura" come
   stima generica `area × n_facce × ore/dm²` con `n_drilled ≥ 1` di
   default per tutti e cinque i ruoli (cappello, porta_punzoni,
   premilamiera, matrice, base). Le matrici e i porta_punzoni ricevono
   in più la voce EDM filo, calcolata separatamente. Risultato: una
   matrice viene pagata sia per la foratura che per il filo, mentre in
   officina (a quanto dice l'esperto interpellato) le matrici temprate
   si fanno tutte al filo e la foratura non c'è.

3. **Ruoli piastra disallineati dalla realtà di officina.** Il codice
   conosce solo 5 ruoli (`cappello`, `porta_punzoni`, `premilamiera`,
   `matrice`, `base`); termini come "montante" o "accompagnatrice" che
   in officina sono distinti non esistono. In più, nel codice la
   premilamiera **non** va al filo (`continue` esplicito in
   `_estimate_die_edm_hours:701` per `cappello/premilamiera/base`),
   mentre l'esperto di officina dice che la premilamiera va al filo
   come matrice e accompagnatrice. C'è uno scarto da chiarire fra
   modello e officina.

Correggere solo il punto 1 (rinominare/aggiungere `hourly_rate_drilling`)
risolverebbe un sintomo lasciando i punti 2 e 3 intatti: la foratura
sarebbe pagata alla tariffa giusta, ma continuerebbe a essere addebitata
su piastre che non la fanno. Ha più senso ripensare insieme: ruoli
piastra ↔ lavorazioni applicabili ↔ tariffe.

**Esito atteso**: una conversazione con l'officina per chiarire ruoli
reali e lavorazioni per ciascuno, poi rivedere `_PLATE_ROLE_DEFAULTS` e
la branca EDM filo, e in coda aggiungere `hourly_rate_drilling` a
`DieSettings` con la sua migration. Da affrontare **dopo il Blocco B**
insieme a P2 (forma del pezzo): sono entrambi pezzi dello stesso
cantiere stampi.

### P4 — Dare significato pieno al campo "active" in tutto il progetto
Oggi il campo `Tool.active` / `Material.active` / `Supplier.active` /
`MaterialSupplier.active` / `ToolSupplier.active` / `NormalizedSupplier.active`
/ `NormalizedItem.active` è presente in tutti i modelli catalogo e ha
una checkbox nel form di edit, ma è consultato **solo** dalle 6 pagine
catalogo (toggle "Solo attivi", introdotto il 2026-05-27 con il commit
`669b2f9`). In tutti gli altri posti il campo è ignorato.

**Risultato attuale**: "ritirare" una voce la nasconde nella sua pagina
catalogo, ma **NON** la esclude da:
- generazione ordini utensili (utensili inattivi sotto scorta vengono
  comunque proposti per il riordino — `OrdersToolsPage` chiama
  `/api/tools?low_stock_only=true` senza filtrare per `active`)
- alert dashboard "sotto scorta" (`/api/tools/low-stock-count` conta
  anche gli inattivi)
- notifiche low-stock generate dallo scan barcode
  (`tools.scan_tool` → `services/notifications.py`, nessun check su
  `active`)
- dropdown materiali nei preventivi (materiali ritirati comunque
  selezionabili)
- dropdown fornitori vari (`NormalizedSupplier`, `MaterialSupplier`,
  `ToolSupplier`, `Supplier` trattamenti — nessuno filtra per `active`)
- dropdown trattamenti nelle fasi di preventivo
- dropdown macchine nelle fasi
- dropdown lavorazioni (`Operation`) nelle fasi
- (futuro) autocomplete `NormalizedItem` quando arriveranno gli
  Step 4-5 del cantiere normalizzati — andrà deciso lì

**Esito atteso**: voce di prodotto, da affrontare come cantiere a sé
**dopo che MechQuote sarà in uso in azienda**. L'uso reale dirà quali
di questi punti pesano davvero e in che ordine vanno sistemati (es. è
plausibile che l'esclusione dagli ordini utensili sia la priorità #1,
mentre il filtro sui dropdown materiali sia meno urgente: dipende da
quanti articoli si ritirano e con che frequenza). Decisione di prodotto
da rimandare al feedback dell'utenza reale, non da affrontare a freddo.

**Scoperta**: emersa il 2026-05-29 come domanda dell'utente sugli
ordini utensili. La fotografia completa dello stato attuale (quali
endpoint filtrano `active`, quali no) è stata fatta lo stesso giorno
e vive in questo documento — l'elenco dei "non filtra `active`" sopra
è la fotografia, non un'ipotesi.

### Visione utente registrata per P2 + P3 (2026-05-27)
Durante la sessione del 27 maggio è emersa una **visione di prodotto**
condivisa con cui affrontare insieme P2 e P3 quando si aprirà il
cantiere stampi:

> **Template stampo configurabili con lavorazioni abilitabili per piastra.**
> L'utente (anziché vincolare le piastre ai 5 ruoli fissi attuali con i
> default hardcoded `_PLATE_ROLE_DEFAULTS`) definisce **un proprio
> template di stampo dove per ogni piastra dichiara quali lavorazioni si
> applicano**: fresatura sì/no, rettifica sì/no, foratura sì/no, EDM
> filo sì/no, station_bonus sì/no — con i propri parametri (n. facce,
> ore di setup, ecc.).
>
> Questo risolve in un colpo solo:
> - **P3.2** doppio conteggio foratura + EDM filo su matrice/porta_punzoni
>   → se la matrice non fa la foratura, l'utente la disabilita nel template
> - **P3.3** ruoli officina disallineati (montante, accompagnatrice, ecc.)
>   → l'utente dichiara i ruoli che gli servono, non c'è più una lista
>   fissa di 5
> - **P2** forma del pezzo → diventa una proprietà del template (o del
>   preventivo), formula del perimetro decisa lì
> - **P3.1** tariffa foratura → resta come è (tariffa per lavorazione),
>   ma ora la lavorazione è opzionale per piastra, quindi se non c'è la
>   tariffa non viene applicata
>
> È una **decisione di prodotto futura**, non un piano operativo. Vale
> come orientamento quando si entrerà nel cantiere stampi (dopo il
> Blocco B).

---

## ░░░ IDEE DA BRAINSTORMING DEL 27 MAGGIO 2026 ░░░

Idee di prodotto emerse durante la sessione del 27 maggio, registrate qui
come "candidate" — non ancora pianificate, da valutare a freddo per
priorità e impatto.

- **Descrizione completa dei trattamenti nella selezione** (oltre al
  nome). Oggi quando l'utente sceglie un trattamento da una `<select>`
  vede solo il nome, non se è €/kg o €/dm³, non il fornitore. Sarebbe
  utile vedere subito il dettaglio per evitare ambiguità (es. "Tempra
  HRC60 — Haerta — 2,00 €/kg, minimo 50 kg / 50 €").

- **Pulsante "duplica riga" nelle anagrafiche**. Per voci di catalogo
  simili a una esistente, ora bisogna ricompilare tutto a mano. Un
  bottone "duplica" che cloni la riga con nome "(copia)" velocizza
  l'inserimento.

- **Allargare la finestra delle pagine impostazioni per leggibilità**.
  Le tabelle delle pagine settings (catalog, materiali, utensili...)
  oggi hanno larghezza ridotta e su molti monitor sprecano spazio ai
  bordi. Da valutare un layout fluid con larghezza piena.

- **Pulizia file del progetto**. Ricognizione sistematica di file non
  più utilizzati nel repo (componenti orfani, pagine deprecate, asset
  vecchi). Pulizia da fare a freddo, una sola passata.

---

## ░░░ STRUMENTI DI LAVORO ░░░

### `update.bat` — script di aggiornamento manuale del server (creato 2026-05-27)
Sta in radice del repo (`C:\MechQuote\update.bat` sul server). Va lanciato
**a mano** da CMD aperto **come amministratore**:

```
cd C:\MechQuote
update.bat
```

Cosa fa (in ordine, fail-fast): backup DB WAL-aware → verifica
prerequisiti (git, npm, venv, servizio NSSM, branch == main, working
tree pulito) → `git fetch` + `git pull --ff-only` → `pip install` e
`npm install` solo se le dipendenze sono cambiate → `npm run build` →
`nssm restart MechQuoteBackend` → health check via curl → riepilogo +
comando di rollback stampato (non eseguito).

Niente automatismi a tempo (no Task Scheduler), niente `git reset
--hard` cieco, niente push automatici. Lo script è rilanciabile in
sicurezza dopo un fallimento parziale (tutti i passi idempotenti). Commit
`261883e`.

---

## ░░░ CONSOLIDAMENTO MODULI — CATALOGO (fotografia 04/06/2026) ░░░

Esito della fotografia "sola lettura" del modulo Catalogo (materiali,
fornitori grezzi, macchine, lavorazioni, trattamenti, fornitori esterni,
normalizzati item + suppliers). Le voci sotto sono i disallineamenti
emersi, NON un cantiere unico: alcune richiedono decisioni di prodotto
prima del codice, altre sono pulizia "en passant" da fare quando si tocca
la zona.

### CAT-1 — Semantica del campo `active` ✅ COMPLETATO (04/06/2026)

**Sintesi**: una voce di catalogo con `active=false` non compare più
nelle dropdown di nuova scelta del preventivatore (manuale, 2D, stampi);
i preventivi che la usano già la mostrano col suffisso "(ritirato)" sulla
riga interessata e restano ricalcolabili invariati. Implementato in 4
commit (`3b11e7f` backend, `c88058b` manuale, `febc2ec` 2D, `9a3defc`
stampi). Dettaglio dell'implementazione in `MECHQUOTE_RIFERIMENTO.md`
§10, sessione 2026-06-04 (CAT-1).

Contesto pre-fix (mantenuto per memoria): una voce non-attiva
(materiale / macchina / lavorazione / trattamento / fornitore) restava
nelle dropdown del preventivatore ed era usata dal cost engine
(`services/calculation.py` non filtrava `active`, tranne
`CuttingCycle.active` riga 681). Il toggle "Solo attivi" era solo
client-side e incoerente: presente in 6 pagine (MaterialSuppliers,
TreatmentSuppliers, NormalizedSuppliers, ToolSuppliers, MaterialsPage
sezione Materiali, NormalizedItems), assente in 3 (Machines, Operations,
Treatments). I filtri server-side `?active=…` esistevano solo per
`/normalized-items` e `/customers`.

**DECISO (04/06/2026)**: "ritirare" una voce di catalogo la **toglie dai
menu di SELEZIONE** del preventivatore (nuove scelte); **lo storico resta
intatto e ricalcolabile**. Il filtro `active=true` si applica **solo alle
liste di nuova scelta**, MAI al caricamento o al ricalcolo delle voci
già agganciate a parti/fasi di preventivi esistenti.

### CAT-2 — Doppione gestione fornitori

`MaterialSupplier` e `Supplier` (esterni/trattamenti) si gestiscono da
**due punti UI ciascuno**:
- pagina **combo** (`MaterialsPage` / `TreatmentsPage`, sezione fornitori
  con inline-edit in tabella);
- pagina **standalone** (`MaterialSuppliersPage` / `TreatmentSuppliersPage`,
  modale, in tab dentro `/settings/suppliers`).

Le due viste lavorano sullo stesso endpoint ma sono **asimmetriche**: la
versione co-locata è più povera (manca il toggle "Solo attivi", manca
`notes` per entrambi, manca `supplier_type` per Supplier esterni). Stessa
entità, due esperienze diverse a seconda della rotta.

Candidato pulizia: **un solo punto per fornitore** (tenere la pagina
standalone, rimuovere o ridurre la sezione co-locata a link). Impatto
UX + chiusura della doppia manutenzione.

### CAT-3 — Tre "scuole" UI nei cataloghi

In compresenza:
1. **Inline-edit in tabella** (stile `QuoteCategoriesPage`) — usata nelle
   sezioni fornitori dentro `MaterialsPage` e `TreatmentsPage`.
2. **Modale** (overlay `fixed inset-0`) — usata da tutte le pagine
   standalone e dalle sezioni "Materiali" / "Trattamenti" delle pagine
   combo.
3. **Modale + toolbar avanzata** (debounce, multi-filtro, sort) — solo
   `NormalizedItemsPage`.

Approccio consigliato: **fissare uno standard** (probabilmente "modale
semplice", che è il pattern di maggioranza) e allineare le pagine
gradualmente quando le si tocca per altri motivi. **Non un cantiere
unico**: il costo di un refactor en bloc supera il valore di consistenza
finché le pagine restano funzionali.

### CAT-4 — Quattro anagrafiche fornitori separate (DECISO: non intervenire)

Coesistono `MaterialSupplier`, `Supplier` (esterni), `NormalizedSupplier`,
`ToolSupplier` con campi parzialmente sovrapposti (tutti hanno `name` +
`address` + `active`; `shipping_cost` in 3 su 4; `phone`/`email` in 2 su
4; `cutting_cost_per_part` solo su `MaterialSupplier`; `supplier_type`
solo su `Supplier`).

Commento esplicito in `models.py:622-626` (ToolSupplier): *"Distinto da
Supplier (trattamenti) e da MaterialSupplier (materiale grezzo). Domini
diversi, niente sovrapposizioni voluta dal cliente."* La frammentazione è
una **scelta di prodotto**, non un difetto tecnico. **Non accorpare**.

### CAT-5 — Cosmetici / tecnici (bassa priorità, ripulire en passant)

Da affrontare opportunisticamente quando si tocca la zona:

- **Due convenzioni di naming endpoint FastAPI**: path completo nei
  decoratori (`materials.py`, `machines.py`, `operations.py`,
  `treatments.py`) vs prefix-per-router (`normalized_items.py`,
  `normalized_suppliers.py`). Nuovi catalog usano il secondo,
  nessuna regola dichiarata in `CLAUDE.md`.
- **Due stili di gating permessi**: inline `dependencies=[require_permission('settings')]`
  vs variabile factorizzata `_can_settings = require_permission(...)`.
- **Search con debounce** solo in `NormalizedItemsPage`. Filtri backend
  (`?q=&active=&supplier_id=&category=`) **pronti ma non cablati** dal
  frontend; `limit(500)` hard-coded solo lì. Le altre pagine cercano
  senza debounce, niente cap.
- **Colonne legacy** in `treatments`: `fixed_cost`, `cost_per_part`,
  `cost_per_surface_area`, `treatment_supplier_id` esistono nel DB
  (SQLite non droppa), non sono mappate dal modello (vedi
  `16_legacy_columns.md`).
- **`MACHINE_TYPES` hardcoded** in `MachinesPage.tsx` (13 valori). Niente
  tabella backend; aggiungere/rinominare un tipo = code change frontend.
- **Uniqueness DB**: solo `Operation.name` è `UNIQUE`. Gli altri
  cataloghi (Material, Machine, Treatment, Supplier, MaterialSupplier,
  NormalizedSupplier) non hanno unique constraint; dedup vive solo
  nell'app (UI + motore CSV).

### CAT-6 — NormalizedItem senza `block_if_in_use` (rimando)

`DELETE /api/normalized-items/{id}` non chiama `block_if_in_use`: già
**TODO Step 4-5 del cantiere normalizzati** (vedi `normalized_items.py:137-142`).
Si chiude naturalmente quando arriveranno le FK opzionali da
`DieTemplateNormalized` e `DieNormalizedItem`. Non riaprire qui.

### CAT-7 — `treatments` dead state in `DieQuoteEditor.tsx` (rimando)

`DieQuoteEditor.tsx` fetcha `/treatments` e lo mette in stato
(`useState<Treatment[]>([])` riga 44, `setTreatments` riga 107), ma il
valore **non è mai letto** da nessuna parte nel file: nessun `<select>`
lo usa, nessun `useMemo` lo legge, non viene passato come prop a
componenti figli. Emerso durante la fotografia per CAT-1 Fase 2 stampi.
Da rivedere col cantiere stampi: o si rimuove (semplificazione), o si
cabla (probabilmente la scelta del trattamento sulle piastre / sul
castello, oggi non esposta in UI). Non urgente, fuori dal perimetro di
CAT-1.

---

## ░░░ IDEE PER IL FUTURO (non pianificate) ░░░

- IVA opzionale attivabile dalle impostazioni (oggi i preventivi sono al netto;
  questa funzione andrebbe costruita da zero).
- Spostare la cartella `PRV/` (vecchio sito) fuori dal progetto.
- ~~**Interruttore manuale mm/pollici nel wizard 2D**~~ ✅ FATTO (2026-07-16):
  toggle mm/pollici sia nel viewer misura DXF sia nel preventivatore 2D
  (`NewQuote2DPage`). Override che annulla la conversione errata quando l'header
  mente sull'unità (es. `$INSUNITS=1` pollici ma disegno in mm) — il backend
  espone `unit_factor`, il frontend riporta ai mm reali grezzo + lunghezza taglio.
- Audit UX — dopo qualche settimana di uso reale.
- Aggiornare esbuild/vite (rischio solo sul PC di sviluppo, costo alto: per ora
  non conviene).
- **Import CSV per i lookup utensili** (`ToolType` / `ToolBrand` /
  `ToolLocation`), se servirà a popolarli in massa. Motore condiviso
  `app.core.csv_import` già pronto.
- **Preventivatore 3D (da modello STEP)** — modulo separato dal preventivo
  manuale (dove il viewer 3D resta uno strumento di sola *misura*). Idea: dal
  solido STEP estrarre automaticamente i dati per preventivare. Il kernel CAD
  esatto (opencascade.js, già integrato: `frontend/src/lib/step/stepKernel.ts`)
  fornisce già i mattoni. Feature candidate:
  - **Tabella fori automatica**: rileva tutti i fori e li raggruppa per
    diametro (`4× Ø6.5 · 2× Ø10`) con posizione → base per quotare la foratura.
  - **Superficie totale + area faccia** (`BRepGProp.SurfaceProperties`) → si
    aggancia ai trattamenti/rivestimenti (a superficie/volume nel cost engine).
  - **Conteggio feature / indice di complessità** (n. facce, fori, tipi
    superficie) come aiuto al prezzo.
  - **Suggerimento fasi da geometria**: tondo → tornitura; prismatico con N
    fori → fresatura + N forature, pre-compilando le fasi (feature recognition,
    ambizioso).
  - **Sezione (piano di taglio)** per vedere le feature interne.

---

*Lista basata sulle cinque ricognizioni del 22 maggio 2026. Va aggiornata
spuntando i lavori completati.*
