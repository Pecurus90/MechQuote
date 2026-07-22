# MechQuote — Registro Audit Funzionale

> **Cos'è questo file.** L'indice permanente di **tutte** le funzionalità
> dell'app, ognuna con lo scheletro d'audit già pronto accanto. Non è un audit
> in sé: è la **lista da eseguire** per fare gli audit, una voce alla volta.
> Rilanciandolo fra mesi vedi subito cosa non tocchi da tempo.
>
> **Come si usa.**
> 1. Scegli un modulo con stato ⬜ DA FARE.
> 2. Esegui l'audit compilando i campi della sua *Checklist audit* (vedi
>    "Dimensioni d'audit" sotto).
> 3. Scrivi i risultati in *Note audit*; i problemi reali diventano voci in
>    `MECHQUOTE_LISTA_LAVORI.md` (questo file non è il tracker dei lavori).
> 4. Aggiorna lo *Stato* del modulo e la data.
>
> **Un modulo per volta** (§0-ter del `CLAUDE.md`). L'inventario qui sotto è
> estratto dal codice reale, non a memoria — ma il codice cambia: se trovi un
> modulo nuovo non elencato, aggiungilo; se una voce è in drift, correggila.
>
> Ultimo aggiornamento inventario: **2026-07-22**.

---

## Legenda stato

- ⬜ **DA FARE** — audit mai eseguito
- 🟡 **IN CORSO** — audit iniziato, non chiuso
- ✅ **FATTO** — audit completato (con data)
- 🔁 **DA RIVEDERE** — audit fatto ma il modulo è cambiato dopo

## Dimensioni d'audit (le stesse per ogni modulo)

Per ogni modulo si compilano sempre questi punti:

1. **Correttezza** — l'happy path e i casi limite fanno la cosa giusta? I
   totali/valori sono coerenti fra DB, UI e PDF?
2. **Vicoli ciechi** — flussi che non portano da nessuna parte: bottoni che
   non fanno nulla, stati senza uscita, form che non si possono completare,
   errori senza recovery.
3. **Bug noti/sospetti** — difetti osservati o probabili (validazioni
   mancanti, race, N+1, off-by-one, permessi non gated).
4. **Riuso & DRY** — la logica è duplicata dove dovrebbe essere unica? Il
   modulo (o un suo pezzo) è **riutilizzabile altrove** invece di costruire
   nuovo? È usato **ovunque** dovrebbe esserlo, o ci sono punti dove è
   reimplementato a mano?
5. **Migliorie** — proposte concrete (UX, performance, robustezza), senza
   allargare il compito: qui si annotano, non si eseguono.

---

## Riepilogo copertura

| # | Dominio / Modulo | Stato | Ultimo audit |
|---|------------------|-------|--------------|
| 1 | [Ciclo di vita preventivo (stati/workflow)](#1-ciclo-di-vita-preventivo) | ⬜ | — |
| 2 | [Editor preventivo (QuoteEditor)](#2-editor-preventivo) | ⬜ | — |
| 3 | [Parti (Part)](#3-parti-part) | ⬜ | — |
| 4 | [Fasi di lavorazione (Phase)](#4-fasi-di-lavorazione-phase) | ⬜ | — |
| 5 | [Cost engine (gemello DRY back↔front)](#5-cost-engine) | ✅ | 2026-07-22 |
| 6 | [Wire EDM — calcolo fase + wizard](#6-wire-edm-calcolo-fase) | ⬜ | — |
| 7 | [Import/analisi DXF](#7-importanalisi-dxf) | ⬜ | — |
| 8 | [Wizard creazione preventivo](#8-wizard-creazione-preventivo) | ⬜ | — |
| 9 | [Liste & archivio preventivi](#9-liste-e-archivio-preventivi) | ⬜ | — |
| 10 | [Ordini materiali (pool + aggregazione)](#10-ordini-materiali) | ⬜ | — |
| 11 | [Richieste materiale manuali / da file](#11-richieste-materiale) | ⬜ | — |
| 12 | [Ordini normalizzati](#12-ordini-normalizzati) | ⬜ | — |
| 13 | [Ordini utensili](#13-ordini-utensili) | ⬜ | — |
| 14 | [Anagrafica utensili + attributi + scan](#14-anagrafica-utensili) | ⬜ | — |
| 15 | [Catalogo materiali + fornitori grezzi](#15-catalogo-materiali) | ⬜ | — |
| 16 | [Catalogo lavorazioni / macchine / trattamenti](#16-catalogo-lavorazioni-macchine-trattamenti) | ⬜ | — |
| 17 | [Workflow template (sequenze fasi)](#17-workflow-template) | ⬜ | — |
| 18 | [Catalogo normalizzati + fornitori](#18-catalogo-normalizzati) | ⬜ | — |
| 19 | [Wire EDM — cataloghi (settings)](#19-wire-edm-cataloghi) | ⬜ | — |
| 20 | [Officina — documenti](#20-officina-documenti) | ⬜ | — |
| 21 | [Officina — materiali (schede PDF)](#21-officina-materiali) | ⬜ | — |
| 22 | [Officina — tempra e deformazioni](#22-officina-tempra) | ⬜ | — |
| 23 | [Clienti](#23-clienti) | ⬜ | — |
| 24 | [Vendite dirette](#24-vendite-dirette) | ⬜ | — |
| 25 | [Dashboard](#25-dashboard) | ⬜ | — |
| 26 | [Statistiche](#26-statistiche) | ⬜ | — |
| 27 | [Notifiche (in-app + SSE)](#27-notifiche) | ⬜ | — |
| 28 | [Attività (activity feed)](#28-attivita) | ⬜ | — |
| 29 | [Auth / login / sessione](#29-auth-login-sessione) | ⬜ | — |
| 30 | [Utenti](#30-utenti) | ⬜ | — |
| 31 | [Ruoli & permessi (RBAC)](#31-ruoli-e-permessi) | ⬜ | — |
| 32 | [Dati azienda (CompanySettings)](#32-dati-azienda) | ⬜ | — |
| 33 | [Categorie preventivo & regole colore](#33-categorie-e-colori) | ⬜ | — |
| 34 | [Backup / restore](#34-backup-restore) | ⬜ | — |
| 35 | [Tema chiaro/scuro](#35-tema-chiaroscuro) | ⬜ | — |
| 36 | [Guscio app: layout, sidebar, badge, ricerca](#36-guscio-app) | ⬜ | — |
| 37 | [Guide utente](#37-guide-utente) | ⬜ | — |
| 38 | [Librerie trasversali (lib/)](#38-librerie-trasversali) | ⬜ | — |

---
---

# DOMINIO: PREVENTIVI & COSTING

## 1. Ciclo di vita preventivo

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/services/quote_workflow.py` · `backend/app/api/quotes.py` · `frontend/src/components/quotes/CloseoutPanel.tsx` · `frontend/src/lib/constants.ts` (STATUS_LABELS/COLORS)

**Permessi:** `quotes.create` · `quotes.send` · `quotes.confirm` · `quotes.edit_locked`

**Cosa fa:** macchina a stati del preventivo (8 stati) con transizioni gated, audit (submitted_by/read_at/confirmed_at…), notifiche atomiche a ogni transizione, auto-completamento quando il materiale è risolto.

**Sotto-funzioni:**
- Invia per revisione (`PATCH /status`: bozza/in_revisione → inviato)
- Apertura amministrazione (`POST /read`: inviato → letto, automatica)
- Conferma (`POST /confirm`: → confermato, blocca modifica) + auto-completo se materiale ok
- Rimanda in revisione (`POST /reopen`: → in_revisione, con baseline prezzo — TD-16)
- Annulla conferma (`POST /unconfirm`: confermato/completo → letto, azzera evasioni)
- Attesa cliente (`POST /await-client`) e ritorno (`POST /revert-await`)
- Non ordinato / perso (`POST /mark-not-ordered`) e ripristino (`POST /restore`)
- Consuntivo (`PATCH /closeout`: sold_price, actual_cost su completi)
- `is_editable`, `quote_material_status`, `material_is_resolved`, `maybe_complete`, `reconcile_material_state`

**Punti d'ingresso:** CloseoutPanel nell'editor; azioni rapide in QuotesActivePage; apertura da amministrazione.

**Checklist audit:**
- [ ] **Correttezza** — ogni transizione rispetta le regole di §"Workflow stati" del CLAUDE.md? `reconcile_material_state` promuove/retrocede correttamente? Baseline prezzo su reopen coerente?
- [ ] **Vicoli ciechi** — esistono stati senza uscita non voluti? Un preventivo `non_ordinato` è sempre ripristinabile? Errore transizione mostra recovery?
- [ ] **Bug noti/sospetti** — race su doppia conferma; notifica inviata al destinatario giusto (TD-16 già fixato: verificare); atomicità stato↔notifica (F7).
- [ ] **Riuso & DRY** — le costanti di stato sono usate ovunque (niente stringhe status hardcoded sparse)? `is_editable` è l'unico gate di modificabilità?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 2. Editor preventivo

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `frontend/src/pages/QuoteEditor.tsx` (~600 righe) · `backend/app/api/quotes.py` (`update_quote`, `get_quote`, `recalculate`, `version`)

**Permessi:** `quotes.create` (lettura libera, read-only se non autore/senza permesso)

**Cosa fa:** editor principale del preventivo — metadati, sconto/trasporto/imballaggio, lista parti, ricalcolo live, salvataggio incrementale con versione atomica (rilevamento conflitti concorrenti via `updated_at`/If-Match).

**Sotto-funzioni:**
- Composizione/modifica metadati e campi prezzo a livello preventivo
- Auto-save incrementale + `GET /version` per rilevare lost-update
- Ricalcolo totale (`recompute_final_total`) su cambi sconto/trasporto/imballaggio
- Slot PartCard per ogni parte; barra workflow (CloseoutPanel)
- Export PDF (dentro PartCard/editor)

**Punti d'ingresso:** dashboard → click preventivo; liste → riga; wizard → redirect dopo creazione.

**Checklist audit:**
- [ ] **Correttezza** — il totale a schermo coincide sempre con `final_total` persistito (B1/F2)? Conflitto concorrente avvisa davvero l'utente?
- [ ] **Vicoli ciechi** — read-only chiaro quando non-autore/bloccato? Salvataggio fallito lascia stato coerente?
- [ ] **Bug noti/sospetti** — last-write-wins (niente version_id_col, §4): l'If-Match via updated_at copre tutti i path di scrittura o solo alcuni?
- [ ] **Riuso & DRY** — il file supera le ~600 righe: ci sono blocchi con stato proprio estraibili (§5 oversize)? Calcoli live passano SOLO da `quoteCalc.ts` (mai formule inline)?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 3. Parti (Part)

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/parts.py` · `frontend/src/components/quotes/PartCard.tsx` (+ PartCardView, PartCostSummary, PartAttachments, ClonePartModal)

**Permessi:** `quotes.create` (+ `quotes.edit_locked` su bloccati)

**Cosa fa:** CRUD parte + gestione materiale/grezzo/provenienza/peso, clonazione, allegati file (50 MB streaming), riconciliazione stato materiale del preventivo dopo ogni write.

**Sotto-funzioni:**
- `add_part` (auto minimo prezzo da CompanySettings) · `update_part` · `delete_part`
- `clone_part` (stesso o altro preventivo)
- Upload/download/delete file parte (MIME check, sanitizzazione filename, streaming chunked)
- Toggle tipo grezzo (tondo/quadro), provenienza (fornitore/magazzino/cliente), peso finale
- Riconciliazione: demote completo→confermato se una modifica toglie la risoluzione materiale

**Punti d'ingresso:** PartCard nell'editor.

**Checklist audit:**
- [ ] **Correttezza** — `recalculate_part` chiamato dopo OGNI write (§5)? Riconciliazione stato materiale sempre coerente (delete/modifica su quote bloccato)?
- [ ] **Vicoli ciechi** — clona verso altro preventivo: sempre raggiungibile e reversibile? Upload fallito lascia blob orfano?
- [ ] **Bug noti/sospetti** — validazione file oggi per estensione vs magic-byte (verificare stato post sprint sicurezza); guardia edit su quote bloccato.
- [ ] **Riuso & DRY** — `calcMaterialCost` gemello unico usato ovunque? PartCard vs PartCardView: duplicazione presentazione?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 4. Fasi di lavorazione (Phase)

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/phases.py` · `frontend/src/components/quotes/PhaseEditor.tsx` (`calcPhase()`) + EdmPhaseFields

**Permessi:** `quotes.create`

**Cosa fa:** CRUD fase (macchina, operazione, tempi setup/ciclo, costi fissi/variabili, trattamento, ciclo EDM), riordino, ricalcolo costi parte post-modifica.

**Sotto-funzioni:**
- `add_phase` · `update_phase` · `delete_phase` · `reorder_phases` (sequence_number)
- Editing inline + modale espandibile; scelta da catalogo operazioni o da workflow template
- Campi EDM (EdmPhaseFields); sblocco calcolo manuale
- `joinedload` catalogo (machine/operation/treatment/supplier) per PhaseOut

**Punti d'ingresso:** PhaseEditor dentro PartCard.

**Checklist audit:**
- [ ] **Correttezza** — `calcPhase()` (front) == `phase_cost` (back) byte-per-byte? setup_rate fallback a work_rate quando NULL?
- [ ] **Vicoli ciechi** — fase EDM che torna a 0 ore (manca velocità in tabella): l'avviso è chiaro e recuperabile?
- [ ] **Bug noti/sospetti** — reorder concorrente; ricalcolo mancante su qualche path.
- [ ] **Riuso & DRY** — la formula fase vive in 3 copie (calculation.py, PhaseEditor, PartCard setup): sono identiche? (§0-quater)
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 5. Cost engine

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22  ·  ⚠️ ZONA FRAGILE (§0-quater)

**Dove vive:** `backend/app/services/calculation.py` (`recalculate_quote/part`) · `backend/app/services/costing/primitives.py` (formule pure) · `frontend/src/lib/quoteCalc.ts` (gemello) · golden test `tests/fixtures/cost_golden_cases.json`

**Cosa fa:** nucleo deterministico dei costi. Ogni write su parte/fase passa da `recalculate_quote` (transazione unica, bump `updated_at`), che compone i primitives e persiste `final_total` (fonte unica).

**Sotto-funzioni:**
- `material_cost`, `phase_cost`, `part_totals`, `treatment_cost_per_part`, `quote_total`, `round4/round2`
- Aggregazioni commessa: batch trattamento per (treatment,material), spedizione trattamento per fornitore, spedizione materiale per fornitore, conto lavoro, magazzino (override CompanySettings)
- EDM: `_compute_edm_cycle_hours`, `_compute_drill_edm` (ore + costo elettrodo)
- `_apply_quote_final_total`, `recompute_final_total`

**Punti d'ingresso:** ogni endpoint che scrive Part/Phase/Quote; preview live nel frontend.

**Checklist audit:**
- [x] **Correttezza** — ✅ parità gemelli solida. `primitives.py` ↔ `quoteCalc.ts` allineati su material/phase/part/quote/treatment; rete golden a **due gambe** (`test_cost_golden.py` pytest + `cost-golden.test.ts` vitest, stesso `tests/fixtures/cost_golden_cases.json`). Half-up (F11) coerente anche sui negativi; C4 rispettato (`total_price = round2(base×qty)` da base non arrotondata). Margine: backend `if margin is None` == frontend `??` (0% parte NON ricade su global) → nessuna divergenza `or`/`??`. Aggregazioni commessa (batch trattamento per `(treatment,material)`, spedizioni per supplier, override magazzino) coerenti su entrambi i lati.
- [x] **Vicoli ciechi** — ✅ batch/peso = 0 → costo 0 con warning rosso lato frontend (gemello documentato `calculation.py:425-432` ↔ `quoteCalc.ts:86-93`). Nessuno stato che "si incrosta".
- [x] **Bug noti/sospetti** — vedi **F1/F2** sotto (floor mancante nella formula pura; rounding trattamento asimmetrico).
- [x] **Riuso & DRY** — backend fonte unica OK; **F4**: terza copia rate/setup in PartCard (breakdown display).
- [x] **Migliorie** — vedi **F3** (golden frontend fuori dal loop §7) e nota doc §4.

**Note audit (2026-07-22):**

Il cost engine è in **buono stato**: nucleo puro unico backend (`primitives.py`), `calculation.py` compone senza reimplementare, e la parità col frontend è protetta da golden test su entrambi i lati. Nessun bug di calcolo trovato. Rilievi (nessuno bloccante):

- **F1 — floor prezzi solo a input, non nella formula pura.** `part_totals`: `base = max(total_cost, minimum) × (1 + margin/100)` — `margin < −100` → prezzo negativo; `quote_total` con sconto > 100% → totale negativo. Il floor "margine 0%" vive a livello UI/schema, non nella primitiva: un percorso che bypassa la validazione (import backup, scrittura diretta) arriva a prezzi negativi fino al PDF. → proposta Blocco A (clamp difensivo nelle primitive).
- **F2 — rounding trattamento asimmetrico.** Backend `treatment_cost_per_part` → `round4(share/qty)`; frontend `calcTreatmentCost` ritorna `partShare/qty` **non arrotondato**. Divergenza ≤ 0.0001 €, assorbita dalla tolleranza golden, ma i gemelli non sono byte-identici come dichiarato. Fix: `round4` anche nel frontend. → Blocco C (cosmetico).
- **F3 — golden frontend fuori dalla verifica §7.** `frontend/tests/unit/cost-golden.test.ts` (vitest) esiste ma §7/`/verifica` girano solo `pytest` + `tsc`: una rottura di parità in `quoteCalc.ts` passerebbe inosservata. → aggiungere `cd frontend && npm test` alla §7 quando si tocca il cost engine (+ skill `/verifica`).
- **F4 — terza copia rate/setup in PartCard (§0-quater confermato).** `PartCard.tsx:116-121` ri-risolve a mano `workRate`/`setupRate` e ricalcola `setup_hours×setupRate/qty` per il breakdown setup↔ciclo. È **display-only** (il totale autoritativo è `p.calculated_cost`) e oggi consistente, ma è il terzo punto da tenere allineato. Nota positiva: **PhaseEditor NON reimplementa** (delega a `calcPhaseCost`). Mitigazione: esporre da `quoteCalc` una `resolveRates()` + `phaseSetupCost()` riusate dal breakdown → la copia diventa riuso. → Blocco C (riduzione debito).
- **Doc — nota stale in CLAUDE.md §4.** Afferma "unit_price arrotondato poi × quantity → errore centesimi per qty alte (Blocco C)": il codice fa `round2(base×qty)` da base non arrotondata, l'errore **non esiste più** (C4 risolto). Aggiornare la nota §4.

→ Voci proposte per `MECHQUOTE_LISTA_LAVORI.md`: **F1** (Blocco A), **F2/F3/F4** (Blocco C), fix nota doc §4. Nessuna eseguita (audit read-only).

---

## 6. Wire EDM — calcolo fase

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/services/calculation.py` (`_compute_edm_cycle_hours`, `_compute_drill_edm`) · `frontend/src/components/quotes/EdmPhaseFields.tsx` + `Dxf/*`

**Cosa fa:** autocalcolo taglio filo (ore da profilo DXF × velocità per range altezza/famiglia × factor passata) e foratura a elettrodo (ore da DrillingTime + consumo elettrodo con wear/margin).

**Sotto-funzioni:**
- Selezione profili DXF → lunghezza taglio; altezza taglio; ciclo (rough/semi/finish); n_piercing
- Sblocco manuale (bypassa autocalc)
- Costo elettrodo per pezzo (TD-7)

**Punti d'ingresso:** EdmPhaseFields (modale da PhaseEditor); NewQuote2DPage.

**Checklist audit:**
- [ ] **Correttezza** — lookup velocità per (famiglia, spessore) e per passata corretto? Fallback config quando manca la riga?
- [ ] **Vicoli ciechi** — DXF senza profilo utile / famiglia senza velocità: percorso di recupero chiaro?
- [ ] **Bug noti/sospetti** — conversione unità DXF (C5) applicata una sola volta; n_piercing/pierce time coerenti.
- [ ] **Riuso & DRY** — logica EDM condivisa tra editor manuale e wizard 2D o duplicata?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 7. Import/analisi DXF

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/services/dxf_parser.py` (`parse_dxf`) · `backend/app/api/dxf.py` (`POST /dxf/analyze`) · `frontend/src/components/quotes/Dxf/*` (Picker, Canvas, ViewerModal, MeasureModal, UnitToggle, ReselectModal)

**Permessi:** `quotes.create`

**Cosa fa:** parsing DXF (recover, esplosione blocchi, conversione unità, stitching profili via union-find), output profili/snap_points/entities per il viewer interattivo; misurazione (distanza/diametro).

**Sotto-funzioni:**
- Upload streaming (50 MB) + magic-byte check (inizia "0")
- Stitching (tolleranza 0.01mm), bbox, svg_path, closed flag
- Viewer SVG: pan/zoom/hover/click-toggle; toggle unità mm/pollici; riporto bbox al parent
- Re-selezione profili senza re-upload; modale misura

**Punti d'ingresso:** EdmPhaseFields, NewQuote2DPage, OfficinaDocuments (preview DXF).

**Checklist audit:**
- [ ] **Correttezza** — entità supportate (LINE/ARC/CIRCLE/LW/POLY/ELLIPSE/SPLINE) rese bene? Skipped segnalati nei warnings?
- [ ] **Vicoli ciechi** — file non-DXF / >cap entità (50k) / header unità mendace: messaggi e override raggiungibili?
- [ ] **Bug noti/sospetti** — conversione unità doppia; snap_points esatti vs SVG approssimato.
- [ ] **Riuso & DRY** — quanti viewer DXF esistono (DxfViewerModal vecchio per wizard EDM vs viewer nuovo con misure)? Consolidabili?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 8. Wizard creazione preventivo

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `frontend/src/pages/NewQuotePage.tsx` (chooser) · `NewQuote2DPage.tsx` · `components/quotes/QuoteWizard.tsx` · `backend/app/api/quotes.py` (`create_quote`)

**Permessi:** `quotes.create`

**Cosa fa:** scelta modalità (manuale vs 2D-DXF), autocomplete cliente, composizione codice `{cli3}-{aa}{cat}_{prog3}`, tipo single/commessa, POST e redirect all'editor.

**Sotto-funzioni:**
- Chooser modale 2 vie · autocomplete cliente (numero + nome)
- Auto-generazione parti da `num_components`
- Percorso 2D: import DXF diretto in creazione

**Punti d'ingresso:** Sidebar → Nuovo preventivo.

**Checklist audit:**
- [ ] **Correttezza** — progressivo codice univoco/senza collisioni? tipo commessa imposta i default giusti?
- [ ] **Vicoli ciechi** — chooser senza permesso 2D: opzione disabilitata con spiegazione o solo assente?
- [ ] **Bug noti/sospetti** — race sul progressivo; cliente inesistente.
- [ ] **Riuso & DRY** — autocomplete cliente riusa lo stesso componente di CustomersPage?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 9. Liste e archivio preventivi

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/quotes_archive.py` · `frontend/src/pages/QuotesActivePage.tsx` · `QuoteArchivePage.tsx` · `components/quotes/QuotesListView.tsx` + `QuotesDataTable.tsx`

**Permessi:** `quotes.archive` (+ `quotes.view_all` per vedere tutti)

**Cosa fa:** liste paginate server-side con filtri (anno/tipo/fase/stato/ricerca), ACL per-creatore, azioni rapide di conferma con PDF preview senza aprire l'editor, dettaglio stato materiale per preventivo.

**Sotto-funzioni:**
- `GET /quotes/years`, `/archive` (paginato + filtri), `/{id}/material-detail`
- QuotesListView condiviso Active/Archive; espansione articoli; quick-confirm
- Filtri sintetici: phase=active/completed, status=da_confermare/senza_prezzo

**Punti d'ingresso:** Sidebar → Preventivi in corso / Archivio; ricerca globale.

**Checklist audit:**
- [ ] **Correttezza** — ACL: chi non ha view_all vede solo i propri, ovunque (liste, years, archive)?
- [ ] **Vicoli ciechi** — quick-confirm fallita: stato lista coerente?
- [ ] **Bug noti/sospetti** — paginazione + filtri combinati; ricerca full-text.
- [ ] **Riuso & DRY** — QuotesListView davvero condiviso (niente duplicati Active/Archive)?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---
---

# DOMINIO: ORDINI

## 10. Ordini materiali

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/orders.py` · `frontend/src/pages/orders/OrdersMaterialsPage.tsx` (+ MaterialOrdersView, BarConsolidationModal, RequestEditModal)

**Permessi:** `orders.materials`

**Cosa fa:** pool unificato (preventivi confermati + richieste manuali), aggregazione per fornitore (escluso conto lavoro, incluso magazzino), creazione ordine per-fornitore con snapshot articoli, CSV, evasione con auto-completamento preventivo (spec 18/19).

**Sotto-funzioni:**
- `aggregate` (per supplier/material/dim/from_stock) · `create` · `list` · `get` · `csv` · `delete` · `confirm-receipt`
- QuoteSupplierOrder: traccia evasione per (quote, supplier)
- Consolidamento barre (BarConsolidationModal)

**Punti d'ingresso:** Sidebar → Ordini materiali; badge "materiali da ordinare".

**Checklist audit:**
- [ ] **Correttezza** — aggregazione esclude conto lavoro, marca magazzino? Auto-complete preventivo quando tutti i materiali evasi? Delete ordine ripristina il tracciamento?
- [ ] **Vicoli ciechi** — fornitore senza materiali candidati; ordine parzialmente evaso.
- [ ] **Bug noti/sospetti** — snapshot vs dato vivo (prezzo/dimensioni cambiati dopo); FK non enforced su SQLite.
- [ ] **Riuso & DRY** — CSV per-fornitore riusa lo stesso generatore di normalizzati/utensili?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 11. Richieste materiale

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/material_requests.py` · `backend/app/api/orders_from_file.py` · `frontend/src/pages/orders/OrdersMaterialFilePage.tsx` (+ MaterialsFileView, MaterialFormModal) · `frontend/src/lib/materialRows.ts`

**Permessi:** `orders.materials`

**Cosa fa:** richieste materiale non-da-preventivo (a mano o da distinta SolidWorks) → bozza/invia → confluiscono nel pool ordini. Parse CSV con calcolo grezzo e abbinamento catalogo via alias appresi.

**Sotto-funzioni:**
- CRUD richiesta + righe (add/update/delete item) · `send` (bozza→inviato) · `delete`
- `parse_distinta` (regex header, tolleranza markup, calcolo grezzo: +5mm, ceil(x/5)*5)
- Alias: list/learn/delete (`normalize_alias` condiviso)
- Editor righe: forma → campi dims (`materialRows.ts` single source)

**Punti d'ingresso:** Sidebar → Nuovo ordine materiale.

**Checklist audit:**
- [ ] **Correttezza** — calcolo grezzo e abbinamento alias corretti? Righe evase in più ordini tracciate bene?
- [ ] **Vicoli ciechi** — CSV non riconosciuto; materiale senza match e senza nuovo alias.
- [ ] **Bug noti/sospetti** — parse header fragile su varianti SolidWorks; conto lavoro escluso.
- [ ] **Riuso & DRY** — `materialRows.ts` usato sia da OrdersMaterialFilePage sia da RequestEditModal? `normalize_alias` unico tra materiali e normalizzati?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 12. Ordini normalizzati

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/normalized_from_file.py` · `frontend/src/pages/orders/OrdersNormalizedFilePage.tsx` (+ NormalizedFileView, NormalizedItemFormModal)

**Permessi:** `orders.normalized`

**Cosa fa:** gemella di "materiali da file" senza grezzo — import distinta, riga per voce normalizzata, ordine per fornitore, CSV (riferimento = codice articolo), alias appresi.

**Sotto-funzioni:**
- `parse` · `create` · `list` · `get` · `csv` · `delete` · alias list/learn
- Aggregazione per supplier_id; snapshot codice/descrizione/riferimento/qtà

**Punti d'ingresso:** Sidebar → Normalizzati da distinta.

**Checklist audit:**
- [ ] **Correttezza** — parse condiviso con materiali (senza calcolo grezzo) coerente? CSV colonne giuste?
- [ ] **Vicoli ciechi** — voce senza match/alias.
- [ ] **Bug noti/sospetti** — duplicati interni al file.
- [ ] **Riuso & DRY** — quanto codice è condiviso con `orders_from_file`? Il parse SolidWorks è uno solo o due copie?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 13. Ordini utensili

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/orders_tools.py` · `frontend/src/pages/orders/OrdersToolsPage.tsx` (+ ToolOrdersView) · `OrdersHistoryPage.tsx`

**Permessi:** `orders.tools`

**Cosa fa:** pool utensili sotto scorta aggregati per fornitore, KPI inline, preview live senza side-effect, ordine per fornitore con snapshot + CSV; storico con ripristino.

**Sotto-funzioni:**
- `stats` (low_stock, catalogo, ordini mese/all-time, last_order) · `preview` · `create` · `list` · `get` · `csv` · `delete`
- Low-stock: quantity < minimum_quantity AND minimum_quantity > 0

**Punti d'ingresso:** Sidebar → Ordini utensili; Storico ordini.

**Checklist audit:**
- [ ] **Correttezza** — preview senza persistenza; snapshot al momento ordine; soglia low-stock corretta.
- [ ] **Vicoli ciechi** — utensili sotto scorta senza fornitore: avviso e via d'uscita?
- [ ] **Bug noti/sospetti** — KPI vs realtà; delete ordine.
- [ ] **Riuso & DRY** — OrdersHistoryView unifica i 3 tipi di ordine o triplica la logica?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 14. Anagrafica utensili

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/tools.py` · `frontend/src/pages/ToolsPage.tsx` (+ ToolFormModal, ToolScanBar, ToolImportButtons) · `frontend/src/pages/settings/ToolAttributesPage.tsx`

**Permessi:** `tools`

**Cosa fa:** catalogo utensili (codice UNIQUE, quantità/scorta, brand/tipo/posizione/fornitore) + attributi lookup con cascade rename + scan barcode +/- stock + import CSV.

**Sotto-funzioni:**
- CRUD tool · scan (`/scan` −1, `/scan-add` +1) · import CSV · filtri (ricerca/tipo/brand/fornitore/sotto-scorta/attivi)
- CRUD attributi (Type/Brand/Location) con cascade rename via UPDATE manuale
- CRUD ToolSupplier (quarto tipo fornitore)

**Punti d'ingresso:** Sidebar → Utensili; Impostazioni → Attributi utensili; badge sotto scorta.

**Checklist audit:**
- [ ] **Correttezza** — cascade rename attributi aggiorna tutte le child (stringa libera)? Scan non porta quantità negativa?
- [ ] **Vicoli ciechi** — scan di codice inesistente; delete attributo in uso.
- [ ] **Bug noti/sospetti** — `block_if_in_use` su delete attributo/fornitore; codice duplicato.
- [ ] **Riuso & DRY** — factory `_mount_tool_attribute_crud` copre tutti e 3 gli attributi? ToolScanBar riusabile altrove?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---
---

# DOMINIO: CATALOGHI

## 15. Catalogo materiali

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/materials.py` · `frontend/src/pages/settings/MaterialsPage.tsx` · MaterialSuppliersPage (tab)

**Permessi:** `settings`

**Cosa fa:** anagrafica materiali (nome UNIQUE case-insensitive, famiglia, densità, €/kg, fornitore grezzo, scheda PDF opzionale) + fornitori grezzi (spedizione, taglio) + alias CSV + import CSV.

**Sotto-funzioni:**
- CRUD material + CRUD material-supplier (con `block_if_in_use`)
- Alias (per distinte SolidWorks) · datasheet upload/download/delete (uploads/officina/materiali/, MIME PDF)
- Import CSV + template (materiali e fornitori)

**Punti d'ingresso:** Impostazioni → Materiali.

**Checklist audit:**
- [ ] **Correttezza** — UNIQUE case-insensitive robusto? delete blocca se in uso e pulisce datasheet blob?
- [ ] **Vicoli ciechi** — import CSV con righe invalide: report chiaro?
- [ ] **Bug noti/sospetti** — MaterialSupplier vs Supplier confusione (§4); alias duplicati.
- [ ] **Riuso & DRY** — motore CSV condiviso (`core/csv_import.py`) usato qui? datasheet condivide storage/logica con Officina materiali?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 16. Catalogo lavorazioni, macchine, trattamenti

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/operations.py` · `machines.py` · `treatments.py` · `frontend/src/pages/settings/{Operations,Machines,Treatments}Page.tsx` + TreatmentSuppliersPage

**Permessi:** `settings`

**Cosa fa:** cataloghi centrali del costing — Lavorazioni (nome libero), Macchine/centri di costo (tariffe lavoro/setup, minimo setup), Trattamenti (€/kg o €/dm³) + Fornitori esterni (Supplier).

**Sotto-funzioni:**
- CRUD + import CSV + template per ognuno; tutti UNIQUE case-insensitive
- `block_if_in_use` su ogni delete (fasi/template/trattamenti)
- Machine: setup_hourly_rate nullable → fallback work_rate; tipi macchina (CNC, tornio, Wire/Sinker EDM, laser, rettifica, CAD/CAM…)

**Punti d'ingresso:** Impostazioni → Lavorazioni & Macchine (tab); Trattamenti.

**Checklist audit:**
- [ ] **Correttezza** — tariffe applicate come da §4? cost_unit kg/dm³ del trattamento coerente col cost engine?
- [ ] **Vicoli ciechi** — delete voce in uso; import duplicati.
- [ ] **Bug noti/sospetti** — Supplier (trattamenti) vs MaterialSupplier vs ToolSupplier scambiati.
- [ ] **Riuso & DRY** — i 3 cataloghi condividono il pattern CRUD+CSV o è triplicato? `block_if_in_use` ovunque?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 17. Workflow template

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/workflow_templates.py` · `frontend/src/pages/settings/WorkflowTemplatesPage.tsx`

**Permessi:** `settings` (CRUD) · `quotes.create` (apply)

**Cosa fa:** sequenze riusabili di fasi (macchina + operazione) applicate **clean-slate** alla parte (cancella fasi esistenti, crea nuove con sequence 10/20/30…, setup da Machine.setup_minimum_hours).

**Sotto-funzioni:**
- CRUD template (+ replace completo step) · `apply-workflow/{id}` alla parte

**Punti d'ingresso:** Impostazioni → Template flusso; PhaseEditor (applica).

**Checklist audit:**
- [ ] **Correttezza** — apply clean-slate non lascia fasi orfane? setup hours ereditate bene?
- [ ] **Vicoli ciechi** — apply su parte con fasi già valorizzate: conferma di sovrascrittura?
- [ ] **Bug noti/sospetti** — operation/machine cancellate ma referenziate nello step.
- [ ] **Riuso & DRY** — `block_if_in_use` su operation copre gli step template?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 18. Catalogo normalizzati

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/normalized_items.py` · `normalized_suppliers.py` · `frontend/src/pages/settings/NormalizedItemsPage.tsx` + NormalizedSuppliersPage (tab)

**Permessi:** `settings` (write) · lettura fornitori anche con `officina`

**Cosa fa:** catalogo voci normalizzate (viti/bulloni/cuscinetti/molle/spine/colonne/boccole; codice UNIQUE, categoria, fornitore, €/pz, alias) + fornitori normalizzati (quarto tipo, linkabile a documenti officina).

**Sotto-funzioni:**
- CRUD item + alias (add/delete, `normalize_alias`) · CRUD supplier (con `block_if_in_use` su documenti officina)
- Filtri: ricerca/fornitore/categoria/attivi

**Punti d'ingresso:** Impostazioni → Normalizzati.

**Checklist audit:**
- [ ] **Correttezza** — alias condivisi con ordini normalizzati da file? UNIQUE codice.
- [ ] **Vicoli ciechi** — delete fornitore linkato a documenti.
- [ ] **Bug noti/sospetti** — categorie libere vs enumerate.
- [ ] **Riuso & DRY** — pattern gemello di materiali: quanto è condiviso vs duplicato?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 19. Wire EDM — cataloghi

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/edm.py` · `frontend/src/pages/settings/edm/*` (EdmConfig, EdmSpeeds, CuttingCycles, DrillingTimes, Electrodes)

**Permessi:** `settings`

**Cosa fa:** parametri di taglio filo — config singleton (fattori passata, pierce, wear/margin elettrodo), velocità per (famiglia × spessore × passata), cicli multi-pass, tempi foratura per (materiale × Ø elettrodo), catalogo elettrodi.

**Sotto-funzioni:**
- CRUD per: cut-speeds, cutting-cycles (nested passes), drilling-times, electrodes + config singleton
- Import CSV dove previsto

**Punti d'ingresso:** Impostazioni → Wire EDM (5 tab).

**Checklist audit:**
- [ ] **Correttezza** — lookup usati dal cost engine trovano sempre la riga giusta / fallback? Ø elettrodo in Tempi foratura come tendina dal catalogo (recente).
- [ ] **Vicoli ciechi** — range spessore scoperti; ciclo senza pass.
- [ ] **Bug noti/sospetti** — `block_if_in_use` su ciclo/elettrodo referenziati.
- [ ] **Riuso & DRY** — CRUD dei 4 sotto-cataloghi condividono pattern?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 33. Categorie e colori

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/catalog.py` · `frontend/src/pages/settings/QuoteCategoriesPage.tsx` · `StepColorRulesPage.tsx`

**Permessi:** `settings`

**Cosa fa:** categorie preventivo (lettera A–Z, embedded nel codice preventivo) + regole colore step (mapping colore → fase, StepColorRule; dormiente fino a import 3D).

**Sotto-funzioni:**
- CRUD categoria (con `block_if_in_use` sui preventivi) · CRUD color rule

**Punti d'ingresso:** Impostazioni → Categorie / colori step.

**Checklist audit:**
- [ ] **Correttezza** — categoria in uso non cancellabile; codice categoria coerente col numero preventivo.
- [ ] **Vicoli ciechi** — StepColorRule oggi dormiente: la UI lo comunica o sembra rotto?
- [ ] **Bug noti/sospetti** — —
- [ ] **Riuso & DRY** — pattern inline-edit di QuoteCategoriesPage è il riferimento delle settings (§5): dove è replicato?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---
---

# DOMINIO: OFFICINA

## 20. Officina — documenti

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/officina.py` · `frontend/src/pages/officina/OfficinaDocumentsPage.tsx` + OfficinaHub

**Permessi:** `officina` (read) · `officina.write` (upload/categorie)

**Cosa fa:** repository documenti (PDF/Word/Excel/immagini/DXF, MIME filtrato, 50 MB) organizzati per categoria libera e riferimento opzionale (Customer/MaterialSupplier/ToolSupplier/NormalizedSupplier), con preview DXF.

**Sotto-funzioni:**
- CRUD documento (upload/download/delete + cleanup blob) · lista categorie distinte
- Filtri (categoria/riferimento unificato c:/m:/t:/n:/ricerca) con URL sync; preview DXF

**Punti d'ingresso:** Sidebar → Officina → Documenti.

**Checklist audit:**
- [ ] **Correttezza** — MIME filtrato server-side; cleanup blob a delete; link riferimenti corretti.
- [ ] **Vicoli ciechi** — documento con riferimento a entità poi cancellata.
- [ ] **Bug noti/sospetti** — validazione per estensione vs contenuto (verificare post sprint sicurezza); statica uploads/ senza auth (verificare mount rimosso).
- [ ] **Riuso & DRY** — viewer DXF condiviso col preventivatore?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 21. Officina — materiali

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/materials.py` (datasheet) · `frontend/src/pages/officina/MaterialsPage.tsx`

**Permessi:** `officina` (read) · `officina.write` (upload datasheet)

**Cosa fa:** vista officina del catalogo materiali con scheda tecnica PDF scaricabile e upload/delete datasheet.

**Sotto-funzioni:**
- Ricerca/filtro famiglia · download scheda PDF · upload/delete datasheet (con conferma)

**Punti d'ingresso:** Sidebar → Officina → Materiali.

**Checklist audit:**
- [ ] **Correttezza** — stesso storage/endpoint datasheet del catalogo materiali (nessuna divergenza).
- [ ] **Vicoli ciechi** — materiale senza scheda: stato chiaro.
- [ ] **Bug noti/sospetti** — permesso: officina.write sufficiente per toccare datasheet catalogo?
- [ ] **Riuso & DRY** — questa pagina riusa `materials.py` datasheet (§21==§15): confermare fonte unica.
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 22. Officina — tempra

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/heat_treatments.py` · `frontend/src/pages/officina/tempra/` (TempraResultsPage, TempraFormModal, TempraAnalysisModal, tempraCalc.ts)

**Permessi:** `officina` (read) · `officina.write` (write)

**Cosa fa:** registro misure pre/post trattamento termico (dimensioni, temp inserimento/tempra/rinvenimento, tempo, durezza, forma) con calcolo deformazioni e analisi statistica per materiale × forma. Modulo di riferimento "mini-app" (§4).

**Sotto-funzioni:**
- CRUD misura · ricerca per materiale · analisi (grafici deformazione)
- `tempraCalc.ts` logica pura (delta post-pre non persistito)

**Punti d'ingresso:** Sidebar → Officina → Tempra.

**Checklist audit:**
- [ ] **Correttezza** — delta calcolati bene; analisi aggrega per materiale+forma.
- [ ] **Vicoli ciechi** — pochi campioni: analisi degrada bene?
- [ ] **Bug noti/sospetti** — limit 1000 righe.
- [ ] **Riuso & DRY** — è il modello mini-app: rispetta la struttura auto-contenuta?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---
---

# DOMINIO: ANAGRAFICHE & VENDITE

## 23. Clienti

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/customers.py` · `frontend/src/pages/settings/CustomersPage.tsx`

**Permessi:** `customers`

**Cosa fa:** anagrafica clienti (customer_number auto, nome/indirizzo/email/telefono), ricerca accento-insensibile, paginazione server-side, import CSV.

**Sotto-funzioni:**
- CRUD (con `block_if_in_use` sui preventivi) · import CSV + template · normalizzazione telefono

**Punti d'ingresso:** Sidebar → Clienti; autocomplete nel wizard.

**Checklist audit:**
- [ ] **Correttezza** — customer_number = max+1 senza collisioni/buchi problematici; delete blocca se ha preventivi.
- [ ] **Vicoli ciechi** — —
- [ ] **Bug noti/sospetti** — lista visibile a tutti gli autenticati (dropdown): è voluto?
- [ ] **Riuso & DRY** — import CSV clienti NON usa `core/csv_import.py` (upsert diverso): giustificato?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 24. Vendite dirette

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/direct_sales.py` · `frontend/src/pages/DirectSalesPage.tsx` (+ DirectSaleFormModal)

**Permessi:** `sales.direct`

**Cosa fa:** registro vendite extra-preventivo (ricambi), con margine; il venduto/costo confluisce nel grafico dashboard mensile (B4: mutuamente esclusivo con sold_price dei preventivi).

**Sotto-funzioni:**
- CRUD vendita (codice, €/unit, €/unit_cost, qtà) · filtro anno · totali venduto/costo

**Punti d'ingresso:** Sidebar → Vendite dirette.

**Checklist audit:**
- [ ] **Correttezza** — somma nel grafico monthly corretta e non doppia-conta?
- [ ] **Vicoli ciechi** — —
- [ ] **Bug noti/sospetti** — margine con costi/prezzi a 0 o negativi.
- [ ] **Riuso & DRY** — `get_monthly` somma 2 sorgenti: logica in un punto solo?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---
---

# DOMINIO: CRUSCOTTI

## 25. Dashboard

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/dashboard.py` · `frontend/src/pages/DashboardPage.tsx`

**Permessi:** `dashboard`

**Cosa fa:** cockpit role-aware — KPI workflow, grafico mensile multi-metrica, code di lavoro (miei preventivi, da revisionare, in attesa materiali), feed attività, badge sidebar.

**Sotto-funzioni:**
- `activity` · `workflow-stats` (to_review/awaiting_client/missing_price/in_revision) · `my-quotes` (ACL) · `to-review` · `queue-counts` · `awaiting-materials` · `monthly`

**Punti d'ingresso:** Sidebar → Dashboard (home).

**Checklist audit:**
- [ ] **Correttezza** — KPI coerenti con lo stato reale dei preventivi; ACL su my-quotes; valore € = final_total (F2).
- [ ] **Vicoli ciechi** — sezioni vuote comunicate (non sembrano rotte)?
- [ ] **Bug noti/sospetti** — aggregati SQL vs idratazione Python coerenti; awaiting-materials include RM manuali (TD-11).
- [ ] **Riuso & DRY** — DashboardQuoteRow condiviso; niente KPI ricalcolati in due modi.
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 26. Statistiche

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/dashboard.py` (statistics/*) · `frontend/src/pages/StatisticsPage.tsx` (+ QuotesStatsView, MarginStatsView, MaterialsStatsView, ToolsStatsView)

**Permessi:** `statistics`

**Cosa fa:** analitica multi-tab (Preventivi / Marginalità / Materiali / Utensili) con period picker (year/12m/prev_year/all), confronto MoM/YoY, palette centralizzata.

**Sotto-funzioni:**
- `statistics` (trend/top clienti/categoria/margine mensile/ore/esito) · `statistics/margin` (guadagno reale, taratura prezzo/costo, worst 10) · `statistics/orders-materials` · `statistics/tools` · comparison

**Punti d'ingresso:** Sidebar → Statistiche.

**Checklist audit:**
- [ ] **Correttezza** — margine solo su completi; confronto prev/yoy usa la finestra giusta; taratura prezzo/costo definite come da spec.
- [ ] **Vicoli ciechi** — periodo senza dati.
- [ ] **Bug noti/sospetti** — performance su "all"; doppio conteggio venduto (preventivi vs vendite dirette).
- [ ] **Riuso & DRY** — palette grafici centralizzata usata ovunque; aggregati condivisi con Dashboard?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---
---

# DOMINIO: NOTIFICHE & ATTIVITÀ

## 27. Notifiche

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/services/notifications.py` · `backend/app/api/notifications.py` · `frontend/src/lib/useNotifications.ts` · `components/layout/` (NotificationPanel/TopBar)

**Permessi:** `notifications`

**Cosa fa:** notifiche in-app generiche (per ruolo e/o utente), atomiche col cambio stato (commit=False, F7), dedupe via UNIQUE index parziale, push SSE con polling fallback 120s (TD-10).

**Sotto-funzioni:**
- `create_notification` (target_roles/target_user_id/data) · list/read/confirm/dismiss · `stream` (SSE)
- Anti-auto-notifica (creatore ≠ destinatario) · listener after_commit

**Punti d'ingresso:** campanella in TopBar/AppLayout.

**Checklist audit:**
- [ ] **Correttezza** — atomicità stato↔notifica (nessuna persa/duplicata); destinatari corretti; dedupe funziona.
- [ ] **Vicoli ciechi** — notifica che punta a preventivo cancellato; SSE caduto → polling riprende?
- [ ] **Bug noti/sospetti** — SSE con token in query (no header); single-worker uvicorn (broker in-process).
- [ ] **Riuso & DRY** — ogni evento rilevante passa da `create_notification` (nessuna notifica rollata a mano)?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 28. Attività

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/activity.py` · `frontend/src/pages/ActivityPage.tsx`

**Permessi:** `dashboard`

**Cosa fa:** feed globale paginato di eventi (deriva dalle notifiche), filtro per tipo, ricerca per titolo/body/autore, click per aprire il preventivo.

**Sotto-funzioni:**
- `list_activity` (page/page_size max 100, ordinato created_at DESC)

**Punti d'ingresso:** Sidebar → Attività.

**Checklist audit:**
- [ ] **Correttezza** — visibilità: tutti gli autenticati (no ACL) è voluto?
- [ ] **Vicoli ciechi** — click su evento senza target navigabile.
- [ ] **Bug noti/sospetti** — ricerca + paginazione.
- [ ] **Riuso & DRY** — condivide sorgente/rendering con Dashboard activity?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---
---

# DOMINIO: SISTEMA & SICUREZZA

## 29. Auth / login / sessione

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/auth.py` · `backend/app/core/security.py` · `frontend/src/lib/auth.tsx` · `frontend/src/pages/LoginPage.tsx`

**Cosa fa:** login (rate limit 5/min), JWT (token non scade — scelta interna), `get_current_user` che carica i permessi, cambio password self-service, anti-lockout admin.

**Sotto-funzioni:**
- `login` · `me` · `change-password` (verifica vecchia) · AuthProvider/useAuth (hasRole/hasPermission)
- Anti-lockout (§3) · access_token_expire_minutes=0

**Punti d'ingresso:** LoginPage; interceptor 401 → logout.

**Checklist audit:**
- [ ] **Correttezza** — rate limit efficace; token/permessi caricati bene; cambio password verifica la vecchia.
- [ ] **Vicoli ciechi** — utente disattivato con token valido; ruolo cancellato (anti-lockout).
- [ ] **Bug noti/sospetti** — token non scade (per server pubblico va >0); SECRET_KEY default.
- [ ] **Riuso & DRY** — `hasPermission` unico gate lato client (niente `role=='admin'` sparso, §3)?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 30. Utenti

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/auth.py` (users) · `frontend/src/pages/settings/UsersPage.tsx`

**Permessi:** `users`

**Cosa fa:** CRUD utenti con anti-escalation (solo admin crea/modifica admin), self-delete bloccato, password opzionale in update.

**Sotto-funzioni:**
- register/create/update/delete · filtro nome/email · attivo/inattivo

**Punti d'ingresso:** Impostazioni → Sistema → Utenti.

**Checklist audit:**
- [ ] **Correttezza** — anti-escalation (eccezione strutturale §3) rispettata; self-delete bloccato.
- [ ] **Vicoli ciechi** — ultimo admin cancellabile? (lockout)
- [ ] **Bug noti/sospetti** — username duplicato; ruolo inesistente.
- [ ] **Riuso & DRY** — —
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 31. Ruoli e permessi

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/roles.py` · `backend/app/core/permissions.py` · `frontend/src/pages/settings/RolesPage.tsx`

**Permessi:** `users`

**Cosa fa:** ruoli dinamici creabili da UI + matrice permessi (chiavi fisse in `PERMISSION_KEYS`, assegnazione in `role_permissions`), grouping per UI.

**Sotto-funzioni:**
- CRUD ruolo (slug, label, colore, con `block_if_in_use` sugli utenti) · toggle permesso singolo/bulk · list keys/grouped

**Punti d'ingresso:** Impostazioni → Sistema → Ruoli e Permessi.

**Checklist audit:**
- [ ] **Correttezza** — ogni capacità = una chiave (niente hardcoded, §3); nuova chiave assegnata all'admin via migration.
- [ ] **Vicoli ciechi** — ruolo senza permessi; delete ruolo assegnato.
- [ ] **Bug noti/sospetti** — PERMISSION_GROUPS allineato a PERMISSION_KEYS (nessuna chiave orfana/mancante).
- [ ] **Riuso & DRY** — `hasPermission`/`require_permission` unico meccanismo su ogni endpoint e componente protetto.
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 32. Dati azienda

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `backend/app/api/company.py` · `frontend/src/pages/settings/CompanySettingsPage.tsx`

**Permessi:** `company` (PUT; lettura libera)

**Cosa fa:** singleton id=1 — anagrafica azienda + 4 default operativi (margine/prezzo minimo/trasporto/imballaggio) + override magazzino (stock shipping/cutting) letti dal cost engine.

**Sotto-funzioni:**
- GET (get-or-create) · PUT · salvataggio atomico con dirty flag

**Punti d'ingresso:** Impostazioni → Dati azienda.

**Checklist audit:**
- [ ] **Correttezza** — default applicati a POST /quotes e nuove parti; override magazzino usati in recalculate.
- [ ] **Vicoli ciechi** — —
- [ ] **Bug noti/sospetti** — valori negativi/vuoti; singleton duplicato.
- [ ] **Riuso & DRY** — unico punto di lettura settings nel cost engine.
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 34. Backup / restore

**Stato audit:** ⬜ DA FARE — Ultimo audit: —  ·  ⚠️ DISTRUTTIVO (§2.E)

**Dove vive:** `backend/app/api/backup.py` · `frontend/src/pages/settings/BackupSettingsPage.tsx`

**Permessi:** `backup`

**Cosa fa:** export/import JSON dello stato persistente (non i file fisici). Import = DELETE+INSERT in transazione unica, whitelist colonne, preserva ID/FK, cap anti-DoS.

**Sotto-funzioni:**
- `export` (parent→child) · `import` (validazione Pydantic, guard payload non vuoto, clamp qty<1)

**Punti d'ingresso:** Impostazioni → Sistema → Backup.

**Checklist audit:**
- [ ] **Correttezza** — round-trip export→import fedele; ordine tabelle rispetta le FK.
- [ ] **Vicoli ciechi** — import parziale/errore: rollback pulito?
- [ ] **Bug noti/sospetti** — FK non enforced SQLite (episodio 2026-05-10): guard sufficiente? Notification/blob esclusi noti.
- [ ] **Riuso & DRY** — EXPORT_ORDER unica fonte dell'ordine tabelle.
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---
---

# DOMINIO: TRASVERSALE (UI & LIB)

## 35. Tema chiaro/scuro

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `frontend/src/lib/theme.tsx` · `index.css` (token semantici) · toggle in Sidebar

**Cosa fa:** switch light/dark con class="dark" su `<html>`, persistito in localStorage (spec 20).

**Sotto-funzioni:**
- ThemeProvider/useTheme (toggle/setTheme)

**Checklist audit:**
- [ ] **Correttezza** — tutte le pagine reggono dark mode (nessun testo illeggibile)?
- [ ] **Vicoli ciechi** — flash iniziale tema errato.
- [ ] **Bug noti/sospetti** — token hardcoded che ignorano il tema.
- [ ] **Riuso & DRY** — token semantici usati ovunque (niente colori fissi)?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 36. Guscio app

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `frontend/src/components/layout/` (AppLayout, Sidebar, SidebarView, TopBar) · `frontend/src/components/layout/StandardPage` + page-container

**Cosa fa:** guscio principale (Sidebar + TopBar + Outlet), navigazione gated a permessi con badge reali (ordini/utensili/da-revisionare), ricerca globale, dropdown notifiche, profilo/logout/tema/cambio-password. StandardPage = guscio unico delle pagine standard.

**Sotto-funzioni:**
- Costruzione menu con `hasPermission` · badge live · ricerca globale (query archive) · NotificationPanel
- StandardPage (PageContainer + SettingsPageHeader + actions); larghezza lg/xl

**Punti d'ingresso:** ovunque (è il guscio).

**Checklist audit:**
- [ ] **Correttezza** — badge riflettono lo stato reale; ricerca globale porta al risultato giusto.
- [ ] **Vicoli ciechi** — voce di menu visibile ma pagina nega (permesso incoerente sidebar↔route).
- [ ] **Bug noti/sospetti** — gruppi menu vuoti mostrati; badge stantii.
- [ ] **Riuso & DRY** — adozione StandardPage (graduale): quali pagine ancora fuori? Sidebar gating allineato ai ProtectedRoute?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 37. Guide utente

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `frontend/src/pages/` (GuideIndexPage, GuideViewerPage lazy)

**Permessi:** nessuno (accesso libero dentro AppLayout)

**Cosa fa:** indice + viewer delle guide utente (Amministrazione / Ufficio Tecnico Plus).

**Sotto-funzioni:**
- Indice guide · viewer per slug (lazy)

**Checklist audit:**
- [ ] **Correttezza** — le guide riflettono l'app attuale (non in drift con screenshot vecchi)?
- [ ] **Vicoli ciechi** — slug inesistente.
- [ ] **Bug noti/sospetti** — lazy load fallito.
- [ ] **Riuso & DRY** — contenuto duplicato con gli Artifact esterni?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---

## 38. Librerie trasversali

**Stato audit:** ⬜ DA FARE — Ultimo audit: —

**Dove vive:** `frontend/src/lib/` — quoteCalc.ts, quoteValidation.ts, timeUnits.ts, decimalInput.ts, materialStatus.ts, materialRows.ts, constants.ts, api.ts, useNotifications.ts, timeAgo.ts, utils.ts

**Cosa fa:** logica pura condivisa — cost engine gemello, validazione preventivo, conversione ore↔minuti, parsing decimale IT, etichette/colori stato materiale, mapper righe materiale, costanti stato, client Axios.

**Sotto-funzioni:** (una per file — vedi elenco)

**Checklist audit:**
- [ ] **Correttezza** — parseDecimal gestisce "1.300,50"; timeUnits converte solo al bordo (DB in ore); quoteValidation copre i casi di blocco invio.
- [ ] **Vicoli ciechi** — —
- [ ] **Bug noti/sospetti** — decimali con `type=number` residui (convenzione: DecimalField/parseDecimal); ore/minuti confusi in qualche punto.
- [ ] **Riuso & DRY** — ogni lib è usata ovunque serve (niente reimplementazioni inline)? `api.ts` unico client (mai `fetch()` diretto)?
- [ ] **Migliorie** —

**Note audit (da compilare):**
_—_

---
---

## Appendice — moduli non ancora schedati

Se durante gli audit emergono funzionalità non presenti qui sopra, aggiungerle
con lo stesso template (Stato / Dove vive / Permessi / Cosa fa / Sotto-funzioni
/ Punti d'ingresso / Checklist / Note) e inserirle nella tabella di copertura.

_Nessuno al momento._
