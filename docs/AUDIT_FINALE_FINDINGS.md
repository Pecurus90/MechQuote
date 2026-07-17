# Audit finale end-to-end — Findings da eseguire

> Prodotto dall'audit del 2026-07-17 (diagnostica read-only su copia isolata
> del DB). Prompt sorgente: `docs/AUDIT_FINALE_PROMPT.md`. Ogni voce è marcata
> [CONFERMATO] o [PLAUSIBILE], con `file:riga` e fix proposto.
>
> **Verdetto audit:** usabile in produzione interna **SÌ**, a condizione di
> chiudere F1 (fatto). Tutto il resto qui sotto è MEDIA/BASSA: nessun altro
> vicolo cieco, nessuna perdita dati silenziosa oltre F1.
>
> **Metodo di lavoro:** un intervento alla volta, verifica §7, commit isolato
> (vedi `CLAUDE.md` §0-ter e §7). Le voci sono checkbox: spuntare quando fatte.

---

## ✅ FATTO

- [x] **F1 — Quantità < 1 in creazione preventivo → lista in 500 senza recovery.**
  ALTA · [CONFERMATO]. Fix in commit `175323a`: `QuoteCreate.default_quantity`
  `ge=1`, clamp in `create_quote`, clamp nell'handler del wizard 2D.

- [x] **F1b — `backup.import` costruisce i modelli saltando lo schema.**
  ALTA-latente · [CONFERMATO] · `backend/app/api/backup.py:294`. FATTO in `94261f1`:
  clamp difensivo `max(1, ...)` su `Part.quantity` prima dell'`add`.

- [x] **F1c — Read-path fragile: una sola riga `quantity<1` fa 500 tutta la lista.**
  ALTA-latente · [CONFERMATO]. FATTO in `94261f1`: rimosso il vincolo `ge=1` da
  `PartOut` (resta su `PartCreate`/`PartUpdate`). E2e: con riga `qty=-3` iniettata,
  `GET /api/quotes` → 200 (prima 500).

- [x] **F2 — Dashboard/Statistiche: valore preventivo = Σ`parts.total_price`,
  ignora trasporto/imballaggio/sconto globale.**
  MEDIA · [CONFERMATO] · `backend/app/api/dashboard.py`. FATTO: introdotto
  `_QUOTE_VALUE_SQL = COALESCE(final_total, Σparts)` usato in tutte e 5 le
  aggregazioni "preventivato" (trend, top clienti, per categoria, comparison,
  outcome). E2e: `trend_monthly` ora combacia col totale `final_total`-based.
  Residuo separato: **F9** (fallback Python quando `final_total` è NULL).

---

## 🟠 MEDIA — prossimo giro (nessuna è un vicolo cieco)

- [ ] **F3 — STEP: peso finito "stantìo" se si cambia materiale col viewer aperto.**
  MEDIA · [CONFERMATO] · `frontend/src/components/quotes/Step/StepViewerCad.tsx:196,459`
  `weightKg` è in un effect con deps `[fileId]`; cambiando materiale la densità
  cambia ma il peso no → "Applica al preventivo" salva `finished_weight_kg`
  errato (impatta costo trattamenti €/kg e spedizione).
  *Fix:* aggiungere `densityKgDm3` alle deps / `useMemo` sul peso; oppure
  disabilitare "Applica" se la densità è cambiata dopo l'apertura.

- [ ] **F4 — STEP: assiemi grossi freezano il main thread, senza feedback né cap.**
  MEDIA · [CONFERMATO] (backlog noto) · `StepViewerCad.tsx:123-133`
  Kernel OCCT sincrono sul thread UI.
  *Fix:* Web Worker, oppure cap facce/vertici con messaggio esplicito.

- [ ] **F5 — Wire-EDM autocalc → 0 ore in silenzio nel percorso MANUALE.**
  MEDIA · [CONFERMATO] (backlog, mitigato solo in 2D) ·
  `backend/app/services/calculation.py:81-82`,
  `frontend/src/components/quotes/EdmPhaseFields.tsx`
  Se `edm_cut_speeds` non ha la riga, la fase resta 0 €. Il wizard 2D avvisa
  (`NewQuote2DPage.tsx:284`), il percorso manuale no.
  *Fix:* `toast.warning` nei callback di `EdmPhaseFields` quando
  `cycle_hours_per_part ≤ 0` con i 3 campi valorizzati.

- [ ] **F6 — Auto-notifica su eventi broadcast per ruolo.**
  MEDIA · [CONFERMATO] · `backend/app/api/quotes.py:263`,
  `orders.py:542`, `orders_tools.py:187`, `orders_from_file.py:370`
  `quote_submitted`/`materials_ordered`/`tools_ordered` targettano un ruolo di
  cui l'attore fa parte → riceve la notifica del proprio gesto (rumore).
  *Fix:* filtrare `created_by_user_id == user.id` in serializzazione per i
  broadcast per ruolo.

- [ ] **F7 — Notifica non atomica col cambio di stato.**
  MEDIA · [CONFERMATO] · `backend/app/services/notifications.py:52` + call-site
  Commit dello stato, poi secondo commit per la notifica: crash tra i due →
  destinatario mai avvisato, nessun retry.
  *Fix:* `create_notification(commit=False)` nella stessa transazione del
  cambio stato (rivedere la dedupe IntegrityError con flush/savepoint).

- [ ] **F8 — Guardia "modifiche non salvate" assente sulla navigazione in-app
  dei wizard.**
  MEDIA · [CONFERMATO] · `frontend/src/lib/useUnsavedGuard.ts`,
  `QuoteWizard.tsx:31`, `NewQuote2DPage.tsx:104`
  `useUnsavedGuard` intercetta solo la navigazione hard (refresh/chiusura tab),
  non i link react-router. Nota: `QuoteEditor` salva su blur, quindi lì non c'è
  stato sporco accumulato (rischio residuo: campo digitato e non sfocato prima
  di un `navigate()`).
  *Fix:* `useBlocker`/`unstable_usePrompt` nei due wizard.

---

## 🟡 BASSA — rifiniture

- [ ] **F9 — Fallback `_quote_to_row` (final_total NULL) perde trasporto/
  imballaggio/sconto.** [CONFERMATO] · `dashboard.py:82`. *Fix:* applicare
  `_quote_total(...)` da `costing.primitives` nel ramo fallback.

- [ ] **F10 — Tab Marginalità: revenue = Σ(`unit_price×qty`) ≠ Σ`total_price`
  (scarto di centesimi).** [CONFERMATO] · `dashboard.py:211`. *Fix:* usare
  `SUM(p.total_price)` come revenue e `SUM(p.total_cost*p.quantity)` come costo.

- [ ] **F11 — `round4` half-away vs `Math.round` half-up sul mezzo negativo
  esatto.** [CONFERMATO], trascurabile · `primitives.py:22` vs `quoteCalc.ts:138`.
  *Fix:* allineare il ramo negativo, o correggere il docstring ("parità per
  valori non negativi").

- [ ] **F12 — Breakdown "di cui spedizione" mostra solo il primo trattamento
  della parte** (totale corretto). [CONFERMATO], solo display · `PartCard.tsx:129`.
  *Fix:* `Σ part.phases.filter(p=>p.treatment_id).reduce(...fixed_cost)/qty`.

- [ ] **F13 — Costo trattamento via PartCard ignora il batch tra sorelle**
  (anteprima transitoria, backend riconverge). [PLAUSIBILE] · `PartCard.tsx:90`.
  *Fix:* instradare la select trattamento della PartCard sullo stesso percorso
  batch-aware di `PhaseEditor.changeTreatment`, o togliere il selettore doppio.

- [ ] **F14 — `applyProvenance` non ri-deriva `material_cost` lato client sul
  toggle provenienza** (anteprima transitoria fino a reload). [PLAUSIBILE] ·
  `PartCard.tsx:73`. *Fix:* ricomputare `calcMaterialCost` per la provenienza
  target prima di `onSave`, come fa `applyMaterial`.

- [ ] **F15 — Eliminando una parte non selezionata precedente, la selezione
  salta.** [CONFERMATO], solo UX · `QuoteEditor.tsx:234`. *Fix:* aggiustare
  `selectedPartIdx` solo se `deletedIdx <= selectedPartIdx`.

- [ ] **F16 — `validateQuote` segnala ma non blocca invio/conferma**
  (probabilmente voluto — "conferma morbida"). [PLAUSIBILE] · `QuoteEditor.tsx:407`.
  *Decisione prodotto:* se indesiderato, includere `partsWithIssues.size` nel
  dialog di conferma/invio.

- [ ] **F17 — `detectStockShape` può confondere tondo/prismatico con un foro
  grande.** [CONFERMATO] (backlog) · `StepViewerCad.tsx:26`. *Fix:* filtrare i
  cilindri per asse/raggio ≈ semi-bbox, o confrontare col volume reale.

- [ ] **F18 — SPLINE/ELLIPSE senza snap-point nel viewer misure DXF.**
  [CONFERMATO] (backlog) · `backend/app/services/dxf_parser.py:287`. *Fix:*
  campionare estremi da `make_path(e).flattening()` come snap.

- [ ] **F19 — `in_attesa_cliente` non ha ritorno diretto a `letto`** (per
  annullare un misclick serve `reopen`→bozza, che azzera submit/read).
  [CONFERMATO], nessuno stato-trappola · `quotes.py:520`. *Fix:* aggiungere
  transizione `in_attesa_cliente → letto` su `quotes.confirm`.

- [ ] **F20 — `unconfirm` atterra sempre su `letto`** anche per quote confermate
  da `inviato` mai lette (→ `letto` con `read_at` nullo, cosmetico). [CONFERMATO]
  · `quotes.py:492`. *Fix:* atterrare su `letto` solo se `read_at` è valorizzato,
  altrimenti `inviato` (come fa `restore`).

- [ ] **F21 — `QuoteStatusActions.tsx:51` mostra "Annulla conferma" solo a
  `edit_locked`**, ma il backend la concede anche a `quotes.confirm` (componente
  probabilmente morto — `QuoteEditor` è corretto). [CONFERMATO]. *Fix:* allineare
  a `canEditLocked || canConfirm`, o eliminare il componente se inutilizzato.

- [ ] **F22 — `quote_confirmed` non parte se `submitted_by_user_id` è NULL**
  (manca fallback al creatore, che `quote_completed` ha). [CONFERMATO] ·
  `quotes.py:389`. *Fix:* `target = submitted_by_user_id or created_by_user_id`.

- [ ] **F23 — `_is_target` valuta il ruolo corrente, non quello all'evento**
  (al cambio ruolo notifiche vecchie spariscono/appaiono). [CONFERMATO], raro ·
  `notifications.py:16`. *Fix:* accettato come limite del modello broadcast, o
  snapshot dei destinatari alla creazione.

- [ ] **F24 — `unread_count`/`clear-read` operano sul cap di 200 candidate**
  (badge sottostimato con storico enorme). [CONFERMATO], by-design ·
  `notifications.py:25`. *Fix:* filtro ruolo lato DB (JSON containment) se
  diventa un problema.

- [ ] **F25 — Deep-link notifica → 403/editor vuoto per ruoli custom
  mal-configurati** (senza `view_all`). [PLAUSIBILE] · `AppLayout.tsx:41`. *Fix:*
  intercettare il 403 in `openNotif` con un toast invece di navigare.

- [ ] **F26 — `quote_number` senza whitelist di caratteri** (accetta `../../…`/
  markup; non usato per path su FS, React fa escaping → nessuna injection oggi).
  [CONFERMATO], difesa-in-profondità · `schemas.py:427`. *Fix:* `field_validator`
  che restringe a `[A-Za-z0-9._\-/]`.

- [ ] **F27 — `quantity` enorme (2³¹) accettata** (SQLite INTEGER 64-bit, nessun
  crash; solo totali giganti). Marginale · `schemas.py:350`. *Fix (opz.):* tetto
  ragionevole `le=` su `PartBase.quantity`/`default_quantity`.

---

## ✅ Aree certificate PULITE (nessun intervento)

- **Motore di calcolo (DRY):** 3 copie formula fase + 2 costo materiale
  identiche riga-per-riga; golden test verdi (backend 125, vitest 34, tsc OK).
- **PDF:** non esiste alcun generatore PDF di preventivo → scenari PDF N/A.
- **Workflow stati:** loop completo + reversibilità testati live
  (`bozza→…→completo→unconfirm→letto`), nessuno stato-trappola.
- **Validazioni numeriche:** qty 0/neg → 422; margine `<0`/`>1000` → 422; sconto
  `>100`/`<0` → 422; numero duplicato → 400. Il backlog "prezzo negativo al PDF"
  risulta già mitigato allo strato schema (eccetto il vettore F1, ora chiuso).
- **ACL/permessi:** `ensure_quote_visible`/`ensure_editable` su tutti gli
  endpoint per-id e le 6 transizioni; nessun `role==` oltre le 2 eccezioni
  intenzionali; ogni chiave permesso ha il grant admin idempotente.
- **Upload:** magic-byte + cap 50 MB + ACL su `GET /files/{id}`; `/uploads`
  statico rimosso.
- **DXF 2D:** BLOCK/INSERT esplosi, cap entità → 400 esplicito, override unità
  con conversione singola su tutti e 4 i percorsi, rollback orfano su submit 2D.
- **Concorrenza:** banner solo per modifiche altrui (re-sync `bumpVersion` su
  tutte le scritture, fasi incluse).
