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

- [x] **F3 — STEP: peso finito "stantìo" se si cambia materiale col viewer aperto.**
  FATTO in `cc6f4b6`: volume esatto conservato in un ref, peso ricalcolato da
  un effect leggero su `[densityKgDm3]` (senza ri-tessellare). Formula in
  `stepWeightKg()`.

- [x] **F4 — STEP: assiemi grossi freezano il main thread, senza feedback né cap.**
  FATTO in `becef85`: cap `MAX_STEP_FACES=4000` prima della tassellazione — oltre
  soglia il viewer si ferma con messaggio esplicito invece di freezare (scelto il
  cap, non la migrazione a Web Worker).

- [x] **F5 — Wire-EDM autocalc → 0 ore in silenzio nel percorso MANUALE.**
  FATTO in `b3d1b05`: `warnIfEdmZero` in `EdmPhaseFields` — dopo il salvataggio
  (import DXF e riselezione profili), se i due input EDM sono valorizzati ma il
  ciclo torna ≤ 0 → `toast.warning`. Speculare all'avviso già presente nel 2D.

- [x] **F6 — Auto-notifica su eventi broadcast per ruolo.** FATTO in `35aaddd`:
  filtro in `_is_target` (escluso se `created_by_user_id == user.id`). Copre
  `quote_submitted`/`materials_ordered`/`tools_ordered`. E2e: chi invia un
  proprio preventivo vede 0 notifiche `quote_submitted`.
  Nello stesso commit anche il guard anti-auto-notifica su **conferma** quando
  submitter == confermatore (finding notifiche senza numero).

- [x] **F7 — Notifica non atomica col cambio di stato.** FATTO: aggiunto
  `create_notification(commit=False)` (aggiunge alla sessione, il chiamante fa un
  solo commit → stato + notifica atomici). Convertiti tutti i cambi-stato quote
  (submit, read, confirm, reopen, unconfirm, await-client, revert-await,
  not-ordered, restore) e gli ordini (materials_ordered, tools_ordered, da-file).
  `quote_completed` resta su commit proprio (UNIQUE dedupe + doppia sorgente: un
  duplicato su commit condiviso annullerebbe il cambio stato). `tools_low_stock`
  non ha cambio stato → invariato. E2e su copia isolata: ogni transizione crea la
  sua notifica (verificato per tutti i tipi). Nota: su SQLite le FK non sono
  enforce, quindi l'`add` non solleva sul commit del chiamante.

- [ ] **F8 — Guardia "modifiche non salvate" assente sulla navigazione in-app
  dei wizard.** MEDIA · [CONFERMATO] · **DIFERITO** (richiede migrazione router).
  `useBlocker`/`unstable_usePrompt` funzionano solo con un data-router
  (`createBrowserRouter`); l'app usa `<BrowserRouter>` (`main.tsx:11`). Il fix
  proprio implica migrare tutto il routing → cambio grosso e rischioso per una
  MEDIA. La navigazione hard (refresh/chiusura tab) è già coperta da
  `useUnsavedGuard`. Da fare insieme a un'eventuale migrazione a data-router.

---

## 🟡 BASSA — rifiniture

- [x] **F9 — Fallback `_quote_to_row` (final_total NULL) perde trasporto/
  imballaggio/sconto.** FATTO in `218e79f`: il ramo fallback usa `quote_total`
  (formula autoritativa) includendo trasporto/imballaggio/sconto.

- [x] **F10 — Tab Marginalità: revenue = Σ(`unit_price×qty`) ≠ Σ`total_price`
  (scarto di centesimi).** FATTO in `218e79f`: revenue = `SUM(p.total_price)`
  in entrambe le serie di marginalità mensile.

- [x] **F11 — `round4` half-away vs `Math.round` half-up sul mezzo negativo
  esatto.** FATTO: `round4 = math.floor(x*10000 + 0.5)/10000` → identico a
  `Math.round` su TUTTO l'asse (verificato: `-0.00025→-0.0002`, `0.00025→0.0003`).
  Golden invariati (per costi ≥ 0 il risultato non cambia).

- [x] **F12 — Breakdown "di cui spedizione" mostra solo il primo trattamento
  della parte.** FATTO in `8f504e8`: somma la spedizione di tutti i trattamenti.
  Solo display, prezzo invariato.

- [ ] **F13 — Costo trattamento via PartCard ignora il batch tra sorelle**
  (anteprima transitoria, backend riconverge). [PLAUSIBILE] · `PartCard.tsx:90`.
  **SALTATO** (per ora): transitorio e a basso valore; instradare la select
  della PartCard sul percorso batch-aware di `PhaseEditor` è un refactor che
  rischia una divergenza nel gemello DRY del costo trattamento. Meglio farlo
  insieme all'eventuale rimozione del selettore trattamento doppio.

- [x] **F14 — `applyProvenance` non ri-deriva `material_cost` lato client sul
  toggle provenienza.** FATTO in `7052b8b`: allinea `material_cost` come il
  backend (conto-lavoro → 0, magazzino/normale → `calcMaterialCost`).

- [x] **F15 — Eliminando una parte non selezionata precedente, la selezione
  salta.** FATTO in `8f504e8`: sposta la selezione solo se elimini la parte
  selezionata; per le parti salvate `applyQuoteData` rimappa per id.

- [ ] **F16 — `validateQuote` segnala ma non blocca invio/conferma**
  (probabilmente voluto — "conferma morbida"). [PLAUSIBILE] · `QuoteEditor.tsx:407`.
  *Decisione prodotto:* se indesiderato, includere `partsWithIssues.size` nel
  dialog di conferma/invio.

- [x] **F17 — `detectStockShape` può confondere tondo/prismatico con un foro
  grande.** FATTO: considera solo i cilindri il cui asse è ∥ alla dimensione più
  lunga del bbox (parete esterna), scartando fori radiali/raccordi che potrebbero
  combaciare per caso con la sezione (usa `axisDirection` già esposto dal kernel).
  Filtro conservativo: nel dubbio → prismatico (grezzo impostabile a mano), mai un
  costo tondo silenziosamente sbagliato. Non verificato in browser (serve uno STEP
  reale con foro): logica tsc-pulita.

- [x] **F18 — SPLINE/ELLIPSE senza snap-point nel viewer misure DXF.** FATTO:
  in `_measure_primitives` gli estremi della curva appiattita (`make_path().
  flattening()`) sono aggiunti come snap per SPLINE ed ELLIPSE. Verificato:
  spline → 2 estremi, ellisse → centro + 2 estremi (prima 0 e 1).

- [x] **F19 — `in_attesa_cliente` non ha ritorno diretto a `letto`.** FATTO:
  nuovo endpoint `POST /quotes/{id}/revert-await` (in_attesa_cliente → `letto`
  se `read_at`, altrimenti `inviato`; azzera `awaiting_client_at`; notifica il
  creatore) + azione lista (icona Undo2, gated `quotes.confirm`, solo su
  in_attesa_cliente). E2e: read→await→revert→letto, `awaiting_client_at` NULL,
  revert da stato errato → 400. (Non passa più da bozza.)

- [x] **F20 — `unconfirm` atterra sempre su `letto`** anche per quote confermate
  da `inviato` mai lette. FATTO in `406ed1c`: atterra su `letto` se `read_at`,
  altrimenti `inviato` (come `restore`). E2e: confermato-da-inviato → unconfirm
  → inviato.

- [x] **F21 — `QuoteStatusActions.tsx` con gating divergente su "Annulla
  conferma".** FATTO in `ef3739a`: il componente era morto (nessun import; la
  logica è inlinata in `QuoteEditor` col gating corretto) → eliminato.

- [x] **F22 — `quote_confirmed` non parte se `submitted_by_user_id` è NULL**
  (manca fallback al creatore). FATTO in `35aaddd`: `confirm_target =
  submitted_by_user_id or created_by_user_id`, con guard anti-auto-notifica.

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

- [x] **F26 — `quote_number` senza whitelist di caratteri.** FATTO: `field_validator`
  su `QuoteCreate.quote_number` che ammette solo `[A-Za-z0-9._-]` ('/' escluso,
  anti-traversal). E2e: formati reali OK, `../../…`/markup/spazi → 422.

- [x] **F27 — `quantity` enorme (2³¹) accettata.** FATTO: `le=1_000_000` su
  `PartBase.quantity` e `QuoteCreate.default_quantity` (verificato: `1000001` e
  `2³¹` → 422; `500` OK).

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
