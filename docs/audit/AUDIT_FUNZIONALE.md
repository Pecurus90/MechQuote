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
| 1 | [Ciclo di vita preventivo (stati/workflow)](#1-ciclo-di-vita-preventivo) | ✅ | 2026-07-22 |
| 2 | [Editor preventivo (QuoteEditor)](#2-editor-preventivo) | ⬜ | — |
| 3 | [Parti (Part)](#3-parti-part) | ✅ | 2026-07-22 |
| 4 | [Fasi di lavorazione (Phase)](#4-fasi-di-lavorazione-phase) | ✅ | 2026-07-22 |
| 5 | [Cost engine (gemello DRY back↔front)](#5-cost-engine) | ✅ | 2026-07-22 |
| 6 | [Wire EDM — calcolo fase + wizard](#6-wire-edm-calcolo-fase) | ⬜ | — |
| 7 | [Import/analisi DXF](#7-importanalisi-dxf) | ⬜ | — |
| 8 | [Wizard creazione preventivo](#8-wizard-creazione-preventivo) | ⬜ | — |
| 9 | [Liste & archivio preventivi](#9-liste-e-archivio-preventivi) | ⬜ | — |
| 10 | [Ordini materiali (pool + aggregazione)](#10-ordini-materiali) | ✅ | 2026-07-22 |
| 11 | [Richieste materiale manuali / da file](#11-richieste-materiale) | ✅ | 2026-07-22 |
| 12 | [Ordini normalizzati](#12-ordini-normalizzati) | ⬜ | — |
| 13 | [Ordini utensili](#13-ordini-utensili) | ✅ | 2026-07-22 |
| 14 | [Anagrafica utensili + attributi + scan](#14-anagrafica-utensili) | ✅ | 2026-07-22 |
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
| 29 | [Auth / login / sessione](#29-auth-login-sessione) | ✅ | 2026-07-22 |
| 30 | [Utenti](#30-utenti) | ✅ | 2026-07-22 |
| 31 | [Ruoli & permessi (RBAC)](#31-ruoli-e-permessi) | ✅ | 2026-07-22 |
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

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22

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
- [x] **Correttezza** — ✅ ogni transizione ha precondizione esplicita sullo stato di partenza (→ 400 altrimenti). Restore stato-consapevole (F19/F20): `unconfirm`/`revert-await`/`restore` ricostruiscono lo stato reale precedente da `read_at`/`awaiting_client_at`, niente stati fantasma. `confirm` blocca se una parte ha materiale senza fornitore (guardia spec 18 → niente preventivo bloccato per sempre in `confermato`). `update_quote` fa `payload.pop('status')` (transizioni solo dagli endpoint dedicati), closeout gated su `completo`, `quote_type` immutabile. Baseline prezzo `reopen` (TD-16) snapshottata prima di azzerare submitted_by.
- [x] **Vicoli ciechi** — ✅ nessuno: `non_ordinato`→restore, `confermato/completo`→unconfirm, `in_attesa`→revert-await, `reopen`→in_revisione rientra nel ciclo. Ogni stato "terminale" ha un'uscita reversibile documentata.
- [x] **Bug noti/sospetti** — **G1** (race last-write-wins sulle transizioni); nessun bug funzionale trovato. Atomicità F7 corretta; `mark_quote_read` è già race-safe (UPDATE…WHERE status='inviato' + rowcount).
- [x] **Riuso & DRY** — ✅ costanti stato centralizzate (`wf.STATUS_*`), `is_editable` gate unico, `ensure_editable` include l'ACL (ogni sito di scrittura eredita il controllo). Rilievi **G3/G4** (blocchi notifica duplicati + priorità destinatario incoerente).
- [x] **Migliorie** — vedi G3/G4 + estrarre `_prior_open_status(quote)`.

**Note audit (2026-07-22):**

Modulo **eccellente** — il meglio ingegnerizzato visto finora. Macchina a stati coerente con spec 18, precondizioni ovunque, retrocessioni reversibili e stato-consapevoli, notifiche atomiche (F7) con guardia anti-auto-notifica, ACL per-id inclusa in `ensure_editable`. **Nessun bug funzionale.** Rilievi:

- **G4 — priorità destinatario notifica incoerente** *(reale, sottile)*. Le notifiche "positive/di invio" (`read`, `confirm`, `reopen`, `completed`) risolvono il target come `submitted_by_user_id or created_by_user_id` (**mittente prima**); quelle di "reversal/stato" (`unconfirm`, `await-client`, `revert-await`, `not-ordered`, `restore`) come `created_by_user_id or submitted_by_user_id` (**creatore prima**). Se mittente ≠ creatore (un collega invia in revisione il preventivo di un altro), metà delle notifiche vanno al mittente e metà al creatore. Nel caso comune mittente==creatore è invisibile. ⚠️ **NON è un bug ma una scelta di prodotto**: reopen→mittente è pinnato di proposito dal test `test_notifica_reopen_va_a_chi_ha_inviato`. Unificare (o meno) è una **decisione dell'utente** — un tentativo di unificazione a "creatore-prima" (2026-07-22) è stato annullato perché rompeva quel test. → ✅ **DECISO 2026-07-22**: tenere il nuance (by design), nessuna modifica al codice.
- **G3 — blocchi notifica duplicati (~8 copie)** *(DRY)*. Ogni transizione ripete `target = …`, la guardia `if target and target != current_user.id`, e `create_notification(commit=False)`. Un helper `notify_quote_transition(db, quote, actor, type, title, body)` che incapsula risoluzione target + guardia anti-auto + create eliminerebbe ~8 blocchi quasi-identici **e risolverebbe G4 alla radice** (una sola regola di target). Refactor → concordare (§2.D).
- **G1 — transizioni non atomiche (last-write-wins)** *(noto, spec 21 Blocco B)*. A differenza di `mark_quote_read` (UPDATE guardato + rowcount), `confirm/reopen/unconfirm/await/revert/not-ordered/restore` fanno read-then-write senza guardia atomica né versione: due admin concorrenti (o admin + auto-complete da `orders.py`) possono doppio-applicare → notifiche duplicate (`quote_confirmed` NON è dedupata, solo `quote_completed` lo è) e scritture ridondanti. È l'esposizione last-write-wins già pianificata (spec 21). **Mitigazione a basso costo**: adottare sulle altre transizioni lo stesso pattern UPDATE-guardato di `mark_quote_read`, in attesa dell'If-Match completo di spec 21.
- Minore: `notify_quote_completed` gira dopo un commit separato (dedupe `quote_completed`); un crash tra i due commit perde solo la notifica (stato `completo` già persistito). Accettabile.

→ Voci proposte per `MECHQUOTE_LISTA_LAVORI.md`: **G4** (normalizzare target), **G3** (helper notifiche, risolve G4), **G1** (agganciare a spec 21 + mitigazione UPDATE-guardato). Nessuna eseguita (audit read-only; G3/G4 refactor → §2.D).

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

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22

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
- [x] **Correttezza** — ✅ ogni write (add/update/delete/duplicate/clone-onto) ha `ensure_editable` + `recalculate` + `_reconcile_after_write`. Guard spec-18 `_assert_material_supplier_ok` (con rollback) su add/update. `delete_part` salva `quote_id` prima del delete e ricalcola l'intero quote (siblings). `get_part`/`get_part_file` con ACL `ensure_quote_visible` (AUD-23).
- [x] **Vicoli ciechi** — ✅ `clone-onto` valida target (esistono, stesso preventivo, source≠target) con messaggi chiari. Upload oversize → cleanup blob + 413.
- [x] **Bug noti/sospetti** — ✅ validazione file **risolta**: whitelist estensioni (AUD-24, no .svg/.html → stored XSS) **+ magic-byte** (`content_matches_ext`) + cap 50MB streaming + uuid prefix + servito da endpoint autenticato (non dal mount statico). **H1** (clone dxf_profile_ids dangling) sotto.
- [x] **Riuso & DRY** — **H2** (blocco joinedload PartOut ripetuto 4×) e **H3** (due percorsi clone-fase).
- [x] **Migliorie** — vedi H2/H3.

**Note audit (2026-07-22):**

Modulo **molto solido**, denso di fix d'audit già applicati (ACL per-id, XSS upload, provenienza A1, guardie spec-18). Sicurezza upload completa. Rilievi:

- **H1 — `duplicate_part` copia `dxf_profile_ids` senza il file DXF** *(incoerenza reale)*. `duplicate_part` (riga ~290) copia `dxf_profile_ids=ph.dxf_profile_ids` ma **non** copia i `PartFile` → i profili puntano al DXF della parte sorgente, assente sul duplicato (dangling reference). È esattamente ciò che `clone_part_onto`/`_clone_phase` evita di proposito (`dxf_profile_ids=None`, con commento). Il costo è preservato (`cut_length_mm` copiato), è solo il riferimento profili a restare stale. Fix: azzerare `dxf_profile_ids` anche in duplicate (→ risolto da H3). → Blocco C.
- **H3 — due percorsi di clone-fase divergenti** *(DRY, risolve H1)*. `duplicate_part` copia le fasi **inline** (righe 266-292); `clone_part_onto` usa l'helper `_clone_phase`. Divergono proprio su `dxf_profile_ids` (H1). Far usare `_clone_phase` anche a `duplicate_part` unifica e chiude H1. Refactor → concordare (§2.D).
- **H2 — blocco joinedload PartOut ripetuto 4×** *(DRY)*. Lo stesso `options(joinedload(phases→machine/operation/treatment/supplier), material, files)` è copiato in add/get/update/duplicate. Il commento cita "stesso pattern in `quotes._load_quote`" ma l'helper non è applicato qui. Estrarre `_load_part_full(part_id, db)`. → Blocco C.
- Minore: cleanup blob su `delete_part` (cascade PartFile) dipende dal listener `before_delete` ORM — ok sul path `delete_file`; verificare che il cascade su `delete_part` faccia scattare l'evento (altrimenti blob orfani). Da confermare in `models.py`.

→ Voci proposte per `LISTA_LAVORI`: **H1/H2/H3** (Blocco C). Nessuna eseguita.

---

## 4. Fasi di lavorazione (Phase)

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22

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
- [x] **Correttezza** — ✅ ogni write (add/update/delete) ha `ensure_editable` + `recalculate_part`; `_load_phase_with_catalog` con joinedload (no N+1). `reorder` NON ricalcola (corretto: l'ordine `sequence_number` non entra nel costo, che è una somma). Formula fase = §5 (già auditata: gemelli allineati).
- [x] **Vicoli ciechi** — ✅ nessuno nel router (EDM warning è lato frontend, vedi §6).
- [x] **Bug noti/sospetti** — nessuno. **Minore**: `reorder_phases` non valida che `phase_ids` copra tutte le fasi e salta gli id sconosciuti in silenzio → una lista parziale può lasciare gap/collisioni di `sequence_number`. Robustezza, non correttezza (l'editor manda sempre la lista completa).
- [x] **Riuso & DRY** — ✅ la "terza copia" è già tracciata in §5 **F4** (PartCard breakdown); qui `phases.py` non reimplementa nulla.
- [x] **Migliorie** — hardening `reorder` (validare set completo) se mai esposto ad altri client.

**Note audit (2026-07-22):**

Router **pulito e corretto**, nessun bug. Piccolo file, disciplina §5 rispettata ovunque (ensure_editable + recalculate). L'unico rilievo è la robustezza di `reorder_phases` (lista parziale → gap sequence_number), oggi non un problema perché il solo client (l'editor) manda sempre la lista completa. Nessuna voce di lavoro necessaria; il debito DRY della formula fase è già coperto da §5/F4.

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

- **F1 — floor prezzi solo a input, non nella formula pura.** `part_totals`: `base = max(total_cost, minimum) × (1 + margin/100)` — `margin < −100` → prezzo negativo; `quote_total` con sconto > 100% → totale negativo. Il floor "margine 0%" vive a livello UI/schema, non nella primitiva: un percorso che bypassa la validazione (import backup, scrittura diretta) arriva a prezzi negativi fino al PDF. → ✅ **FATTO 2026-07-22**: floor a 0 in `part_totals` e `quote_total` + gemelli `quoteCalc` + 2 casi golden condivisi (154 backend / 38 vitest verdi).
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

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22

**Dove vive:** `backend/app/api/orders.py` · `frontend/src/pages/orders/OrdersMaterialsPage.tsx` (+ MaterialOrdersView, BarConsolidationModal, RequestEditModal)

**Permessi:** `orders.materials`

**Cosa fa:** pool unificato (preventivi confermati + richieste manuali), aggregazione per fornitore (escluso conto lavoro, incluso magazzino), creazione ordine per-fornitore con snapshot articoli, CSV, evasione con auto-completamento preventivo (spec 18/19).

**Sotto-funzioni:**
- `aggregate` (per supplier/material/dim/from_stock) · `create` · `list` · `get` · `csv` · `delete` · `confirm-receipt`
- QuoteSupplierOrder: traccia evasione per (quote, supplier)
- Consolidamento barre (BarConsolidationModal)

**Punti d'ingresso:** Sidebar → Ordini materiali; badge "materiali da ordinare".

**Checklist audit:**
- [x] **Correttezza** — ✅ aggregazione esclude conto lavoro, include+marca magazzino; `create_order` idempotente (check `QuoteSupplierOrder` + vincolo UNIQUE con fallback 409 su race, AUD-25), snapshot congelato (B6), reconcile → completo, solo `ORDERABLE_STATUSES`, notifica atomica (F7). `delete_order` reversibile: rimuove evasioni, riapre righe-richiesta (prima del delete, nota FK SQLite), lascia il m2m alla UoW (evita StaleDataError), reconcile → riapre completo con notifica (M-3). Consolidamento barre (TD-3) sullo snapshot.
- [x] **Vicoli ciechi** — ✅ "nessun materiale da ordinare" → 400 con messaggio chiaro; ordine storico senza fornitore → 400 su CSV. Nessun flusso morto.
- [x] **Bug noti/sospetti** — nessun bug funzionale. Snapshot B6 risolve la divergenza CSV vs dato vivo (i soli ordini pre-B6 ri-aggregano live, limite noto e documentato). FK-non-enforced gestite a mano (delete riapre le righe prima del delete).
- [x] **Riuso & DRY** — **I4**: logica di aggregazione parti replicata ~4×.
- [x] **Migliorie** — **I3** (N+1 in `get_stats`), **I1/I2** (pulizie import).

**Note audit (2026-07-22):**

Modulo **complesso ma molto solido** — denso di fix d'audit (idempotenza+UNIQUE, snapshot fedele, delete reversibile con riconciliazione e notifiche atomiche). Nessun bug funzionale. Rilievi (nessuno bloccante):

- **I3 — N+1 in `get_stats`** *(perf)*. `to_order` carica TUTTI i `confermato` e chiama `material_is_resolved(db, q)` per ognuno (ogni chiamata interroga parti + fornitori evasi) → N query. `list_selectable_quotes` invece batcha già lo stato materiale con una sola query `ordered_map`. Applicare lo stesso batch a `get_stats`. → Blocco C.
- **I4 — aggregazione parti replicata ~4×** *(DRY)*. `aggregate_materials`, `_supplier_order_data`, `_persist_order_snapshot`, `_quote_material_rows` iterano le parti "da ordinare" raggruppando per (materiale, dim) con output diversi (preview / righe CSV / snapshot item / CSV singolo). Un generatore condiviso ridurrebbe la duplicazione; priorità bassa (output genuinamente diversi). → Blocco C.
- **I1 — `__import__` inline** *(pulizia, 1 riga)*. `orders.py:162` usa `joinedload(Part.material).joinedload(__import__('app.models', …).Material.material_supplier)` — `Material` è già importato in cima; sostituire con `joinedload(Material.material_supplier)`.
- **I2 — import `or_` ridondanti** *(pulizia)*. `from sqlalchemy import or_` è già in cima (riga 26) ma ri-importato localmente in `list_selectable_quotes` (604) e `list_orders` (800). Rimuovere i locali.

→ Voci proposte per `LISTA_LAVORI`: **I3** (perf), **I4** (DRY) Blocco C; **I1/I2** pulizie one-line (fattibili subito, §13). Nessuna eseguita (audit read-only).

---

## 11. Richieste materiale

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22

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
- [x] **Correttezza** — ✅ `material_requests.py`: validazione id catalogo (AUD-26) prima di scrivere, snapshot nome fornitore, `_assert_sendable` (fornitore + misure), update sostituisce solo le righe aperte (evase intoccate), delete bloccato se righe evase. `orders_from_file.py`: parse read-only (nessun write), decode utf-8/cp1252, header fuzzy, guardia delimitatore errato, calcolo grezzo (+5 / ceil×5), abbinamento alias→nome via `_norm` condiviso.
- [x] **Vicoli ciechi** — ✅ header non riconosciuto / delimitatore errato → 400 chiari; materiale senza match → riga con `needs_material=True` (l'utente abbina/impara alias). Nessun flusso morto.
- [x] **Bug noti/sospetti** — **J1** (parse senza cap dimensione) sotto; **J2** (CSV injection, cross-cutting). Header parse robusto (tollera markup SolidWorks). Minore: `qty = int(qty_raw)` tronca una qty frazionaria di distinta (raro; BOM sono interi).
- [x] **Riuso & DRY** — ✅ `_norm`/`normalize_alias` fonte unica; `_REQUIRED_DIMS`/`_row_missing_dims` riusati da material_requests. (La condivisione parser con normalized-from-file → verificare in §12/§18.)
- [x] **Migliorie** — J1 (cap), J2 (neutralizzare injection).

**Note audit (2026-07-22):**

`material_requests.py` **pulito, nessun bug**. `orders_from_file.py` ben fatto (parse difensivo). Due rilievi, uno di sicurezza:

- **J2 — CSV formula injection (SICUREZZA, cross-cutting)** ⚠️. `csv_import._csv_streaming_response` (il **punto unico** di TUTTI gli export CSV: ordini materiali/utensili/normalizzati, template, cataloghi) scrive le celle con `csv.writer` **senza neutralizzare** i valori che iniziano con `= + - @ \t \r`. Un nome materiale/codice/fornitore (o un `material_name` dalla distinta) tipo `=HYPERLINK("http://evil","x")` finisce nel CSV ed è **eseguito come formula** all'apertura in Excel/LibreOffice da chi processa gli ordini. MechQuote è interno (utenti autenticati) → rischio limitato ma reale (insider / dato incollato). **Fix centrale e a basso rischio**: nel writer, prefissare con `'` le celle che iniziano con quei caratteri. Un solo punto copre tutti gli export. → ✅ **FATTO 2026-07-22**: `_csv_safe_cell` in `_csv_streaming_response` (mitigazione OWASP), 12 test nuovi, 166 backend verdi.
- **J1 — `parse_distinta` senza cap dimensione** *(robustezza)*. `content = await file.read()` carica l'intero CSV in memoria senza limite, a differenza degli altri upload (parts/officina/dxf cappano a 50 MB). Gated auth + `orders.materials`, ma incoerente. Aggiungere un cap (es. 20 MB) coerente con gli altri. → Blocco C.
- Minore: `qty = int(qty_raw)` tronca (2,9 → 2); le qty di distinta sono interi → impatto trascurabile.

→ Voci proposte per `LISTA_LAVORI`: **J2** (sicurezza, fix centrale consigliato subito), **J1** (cap, Blocco C). Nessuna eseguita (audit read-only).

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

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22

**Dove vive:** `backend/app/api/orders_tools.py` · `frontend/src/pages/orders/OrdersToolsPage.tsx` (+ ToolOrdersView) · `OrdersHistoryPage.tsx`

**Permessi:** `orders.tools`

**Cosa fa:** pool utensili sotto scorta aggregati per fornitore, KPI inline, preview live senza side-effect, ordine per fornitore con snapshot + CSV; storico con ripristino.

**Sotto-funzioni:**
- `stats` (low_stock, catalogo, ordini mese/all-time, last_order) · `preview` · `create` · `list` · `get` · `csv` · `delete`
- Low-stock: quantity < minimum_quantity AND minimum_quantity > 0

**Punti d'ingresso:** Sidebar → Ordini utensili; Storico ordini.

**Checklist audit:**
- [x] **Correttezza** — ✅ `preview` pura (no side-effect), snapshot completo al momento ordine (code/brand/qty/min), CSV dallo snapshot (storico stabile), notifica atomica (F7). `quantity_to_order = max(min − qty, 1)`. Soglia low-stock coerente ovunque (`qty < min AND min > 0`).
- [x] **Vicoli ciechi** — ✅ utensili senza fornitore → gruppo "Senza fornitore" non ordinabile (preview lo mostra); nessun materiale sotto minimo → 400 chiaro.
- [x] **Bug noti/sospetti** — nessuno. L'ordine utensili è uno **snapshot puro**: non tocca lo stock (lo stock cambia solo via scan), quindi il delete è un cascade netto senza riconciliazione — corretto.
- [x] **Riuso & DRY** — CSV via `csv_export_response` (ora J2-protetto). Ricerca coerente con orders materiali.
- [x] **Migliorie** — nessuna.

**Note audit (2026-07-22):**

Modulo **pulito, nessun bug**. Design corretto: ordine = documento "da ordinare" snapshottato, indipendente dallo stock (che si muove solo con lo scan). KPI a conteggi semplici (nessun N+1, a differenza di §10). Nessuna voce di lavoro.

---

## 14. Anagrafica utensili

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22

**Dove vive:** `backend/app/api/tools.py` · `frontend/src/pages/ToolsPage.tsx` (+ ToolFormModal, ToolScanBar, ToolImportButtons) · `frontend/src/pages/settings/ToolAttributesPage.tsx`

**Permessi:** `tools`

**Cosa fa:** catalogo utensili (codice UNIQUE, quantità/scorta, brand/tipo/posizione/fornitore) + attributi lookup con cascade rename + scan barcode +/- stock + import CSV.

**Sotto-funzioni:**
- CRUD tool · scan (`/scan` −1, `/scan-add` +1) · import CSV · filtri (ricerca/tipo/brand/fornitore/sotto-scorta/attivi)
- CRUD attributi (Type/Brand/Location) con cascade rename via UPDATE manuale
- CRUD ToolSupplier (quarto tipo fornitore)

**Punti d'ingresso:** Sidebar → Utensili; Impostazioni → Attributi utensili; badge sotto scorta.

**Checklist audit:**
- [x] **Correttezza** — ✅ factory `_mount_tool_attribute_crud` monta i 3 CRUD con **whitelist** su `tool_column` prima dell'interpolazione in `text()` (no SQL injection). Scan: `max(qty + delta, 0)` (mai negativo). Delete fornitore/attributo bloccato se in uso. Import a validazione stretta (tipo/marca/loc devono esistere; no auto-create). **MA** vedi K1/K3 (case).
- [x] **Vicoli ciechi** — ✅ scan codice inesistente → 404 chiaro; delete attributo in uso → 400 con conteggio.
- [x] **Bug noti/sospetti** — **K1** (cascade/delete case-sensitive vs valori Tool con case diverso), **K3** (scan `.upper()` vs create non normalizzato).
- [x] **Riuso & DRY** — ✅ factory copre i 3 attributi (ottimo pattern). `list/create/update_tool` ricaricano con `joinedload(tool_supplier)` (piccola ripetizione ×3, trascurabile).
- [x] **Migliorie** — normalizzare il case (K1/K3).

**Note audit (2026-07-22):**

Modulo ben strutturato (factory attributi con whitelist SQL, import stretto, scan con floor). Due problemi reali di **normalizzazione case** (edge ma concreti):

- **K1 — cascade rename e delete-in-use case-sensitive** *(integrità dati)*. Il cascade rename (`UPDATE tools SET {col} = :new WHERE {col} = :old`) e il count delete-in-use (`WHERE {col} = :name`) usano match **esatto**, mentre i valori su `Tool` possono avere case diverso dal nome canonico dell'attributo (l'import salva il case del CSV: `v.lower() in allowed` valida, ma memorizza `v`; il create non normalizza). Es.: catalogo "Fresa", tool con `tool_type="fresa"` → rinominando "Fresa" il tool resta "fresa" (valore orfano); e "Fresa" risulterebbe eliminabile pur essendo in uso. Fix: normalizzare `Tool.tool_type/brand/location` al nome canonico su create/import, **oppure** confrontare case-insensitive nel cascade/count. → Blocco C.
- **K3 — scan normalizza il case, create no** *(UX)*. `scan_tool` fa `code.strip().upper()` ma `create_tool` salva il codice così com'è: un utensile con codice minuscolo/misto (`ut-5`) non è scansionabile (lo scan cerca `UT-5` → 404). Se esiste una convenzione "codici maiuscoli" va imposta anche al create; altrimenti fare il match scan case-insensitive. → verificare convenzione con l'utente.
- Minore: K2 (valori attributo su Tool come stringa libera non validati al create via API) è **by-design** (§5 "cataloghi via stringa libera"); il cascade è il meccanismo di sync — reso però fragile da K1.

→ Voci proposte per `LISTA_LAVORI`: **K1** (integrità, Blocco C), **K3** (UX + decisione convenzione codice). Nessuna eseguita (audit read-only).

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

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22

**Dove vive:** `backend/app/api/auth.py` · `backend/app/core/security.py` · `frontend/src/lib/auth.tsx` · `frontend/src/pages/LoginPage.tsx`

**Cosa fa:** login (rate limit 5/min), JWT (token non scade — scelta interna), `get_current_user` che carica i permessi, cambio password self-service, anti-lockout admin.

**Sotto-funzioni:**
- `login` · `me` · `change-password` (verifica vecchia) · AuthProvider/useAuth (hasRole/hasPermission)
- Anti-lockout (§3) · access_token_expire_minutes=0

**Punti d'ingresso:** LoginPage; interceptor 401 → logout.

**Checklist audit:**
- [x] **Correttezza** — ✅ login rate-limited (5/min), `verify_password` bcrypt, `is_active` bloccato al login; JWT decodificato con `algorithms=[algorithm]` (no alg-confusion); `get_user_from_token` ricontrolla `is_active` E ricarica i permessi **a ogni richiesta** → disattivazione utente e cambio permessi sono immediati anche senza scadenza token. `change_password` verifica la vecchia e impone `new != old`.
- [x] **Vicoli ciechi** — ✅ utente disattivato → 401 immediato (check per-request); ruolo inesistente → anti-lockout admin (security.py) copre il caso "ruolo admin assente".
- [x] **Bug noti/sospetti** — token non scade (design interno, per server pubblico va >0 — CLAUDE §3). **L2**: cambio password NON invalida i token già emessi (no versioning). **L1**: bcrypt tronca a 72 byte (minore).
- [x] **Riuso & DRY** — ✅ `get_user_from_token` è il nucleo unico (header + SSE); `require_permission`/`require_any_permission` gate unico.
- [x] **Migliorie** — vedi §30 (M4 password) e L2.

**Note audit (2026-07-22):**

`security.py`/`auth.py` **solidi**. Difese giuste: rate-limit, algorithm ristretto, `is_active` e permessi ricaricati per-request (mitiga la non-scadenza del token). Rilievi minori/design:

- **L2 — nessuna revoca token al cambio password** *(design, basso)*. Un token rubato resta valido dopo il cambio password (non c'è token-version). Mitigato dal check `is_active` per-request (disattivare l'utente invalida subito). Per un tool interno accettabile; per esposizione pubblica aggiungere `exp` > 0 + eventuale token-version.
- **L1 — bcrypt tronca a 72 byte** *(minore)*. Password > 72 byte: la coda è ignorata (comportamento bcrypt). Nessun impatto pratico.

→ Nessuna voce urgente qui; le azioni sono in §30 (M4) e la nota server (token `exp`) è già in `MECHQUOTE_LISTA_LAVORI.md` Blocco A.

---

## 30. Utenti

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22

**Dove vive:** `backend/app/api/auth.py` (users) · `frontend/src/pages/settings/UsersPage.tsx`

**Permessi:** `users`

**Cosa fa:** CRUD utenti con anti-escalation (solo admin crea/modifica admin), self-delete bloccato, password opzionale in update.

**Sotto-funzioni:**
- register/create/update/delete · filtro nome/email · attivo/inattivo

**Punti d'ingresso:** Impostazioni → Sistema → Utenti.

**Checklist audit:**
- [x] **Correttezza** — ✅ anti-escalation (`_guard_admin_role`: non-admin non assegna 'admin') e `_guard_modify_admin` (non-admin non tocca account admin) su create/update/delete. Self-delete bloccato. Username dup check. Lista cappata a 1000 (M5).
- [x] **Vicoli ciechi** — **M1**: l'**ultimo admin** può auto-declassarsi/disattivarsi → lockout.
- [x] **Bug noti/sospetti** — **M4** (password create senza min-length), **M3** (`/register` legacy).
- [x] **Riuso & DRY** — ✅ guardie condivise; `/register` duplica `create_user` (M3).
- [x] **Migliorie** — M4/M1.

**Note audit (2026-07-22):**

Gestione utenti **ben protetta** contro l'escalation (eccezioni strutturali §3 rispettate). Rilievi:

- **M1 — nessuna protezione "ultimo admin"** *(lockout, medio)*. Il self-**delete** è bloccato, ma un admin può **auto-declassarsi** (`update_user` su sé stesso con `role != admin`) o **auto-disattivarsi** (`is_active=False`), oppure declassare/disattivare l'altro (unico) admin. Restare senza admin attivo blocca users/backup/company (recupero solo via script bootstrap). L'anti-lockout di `security.py` copre solo il caso "ruolo admin assente", non "nessun utente admin". → ✅ **FATTO 2026-07-22**: guardia `_ensure_not_last_active_admin` su update/delete (rifiuta demote/deactivate/delete dell'ultimo admin attivo); 9 test.
- **M4 — password create senza vincolo di lunghezza** *(sicurezza, basso-medio)*. `ChangePasswordIn.new_password` ha `min_length=8` ma `UserCreate.password` è `str` nudo → un admin può creare un utente con password di 1 carattere. → ✅ **FATTO 2026-07-22**: `Field(min_length=8)`. **Inoltre M6** (scoperto nel fix): `UserCreate.role` aveva default `'admin'` (creare un utente senza role → admin, col fallback `or 'ufficio_tecnico'` reso codice morto) → portato a `None` (least-privilege).
- **M3 — `/api/auth/register` legacy** *(pulizia)*. Duplica `create_user` ma ritorna un **token per l'utente creato** al chiamante (residuo da quando esisteva la self-registration). Gated `users`, ma è un artefatto: valutare la rimozione (la UI usa `POST /api/users`).

→ Voci proposte per `LISTA_LAVORI`: **M1** (guardia ultimo-admin, Blocco A/B), **M4** (min-length, fix 1 riga), **M3** (cleanup). Nessuna eseguita (audit read-only).
_—_

---

## 31. Ruoli e permessi

**Stato audit:** ✅ FATTO — Ultimo audit: 2026-07-22

**Dove vive:** `backend/app/api/roles.py` · `backend/app/core/permissions.py` · `frontend/src/pages/settings/RolesPage.tsx`

**Permessi:** `users`

**Cosa fa:** ruoli dinamici creabili da UI + matrice permessi (chiavi fisse in `PERMISSION_KEYS`, assegnazione in `role_permissions`), grouping per UI.

**Sotto-funzioni:**
- CRUD ruolo (slug, label, colore, con `block_if_in_use` sugli utenti) · toggle permesso singolo/bulk · list keys/grouped

**Punti d'ingresso:** Impostazioni → Sistema → Ruoli e Permessi.

**Checklist audit:**
- [x] **Correttezza** — ✅ toggle singolo/bulk valida le chiavi contro `PERMISSION_KEYS` (rifiuta ignote); create_role slug + dup; delete_role bloccato se in uso; update_role NON permette il rename del `name` (giusto: è lo slug usato da `User.role`).
- [x] **Vicoli ciechi** — **N1**: si può togliere `users` al ruolo admin → lockout dalla UI.
- [x] **Bug noti/sospetti** — ✅ `PERMISSION_GROUPS` allineato a `PERMISSION_KEYS` (nessuna chiave orfana; le eventuali finiscono in "Altro"). Nessun `role=='admin'` hardcoded nella logica.
- [x] **Riuso & DRY** — ✅ `require_permission` è il meccanismo unico; `PERMISSION_KEYS` fonte unica.
- [x] **Migliorie** — N1 (guardia anti-lockout sui permessi critici).

**Note audit (2026-07-22):**

Sistema permessi **pulito e coerente** (chiavi validate, nessun gating hardcoded). Un rilievo di lockout, gemello di M1:

- **N1 — permessi critici rimovibili dal ruolo admin via UI** *(lockout, medio)*. `toggle_permission`/`set_permissions_bulk` permettono di **togliere `users`** (o tutti i permessi) al ruolo admin: da lì nessuno può più gestire ruoli/utenti → lockout, recuperabile solo via script/DB. L'anti-lockout di `security.py` interviene solo se il ruolo admin **non esiste**, non se esiste con permessi ridotti. Aggiungere una guardia: impedire di rimuovere `users` se lascerebbe **zero ruoli** con quella chiave. → ✅ **FATTO 2026-07-22**: guardia `_ensure_users_perm_survives` su toggle singolo + bulk (rifiuta di togliere `users` all'ultimo ruolo che ce l'ha); test inclusi.

→ Voce proposta per `LISTA_LAVORI`: **N1** (guardia anti-lockout permessi, insieme a M1). Nessuna eseguita (audit read-only).
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
