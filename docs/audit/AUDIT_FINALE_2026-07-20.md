# AUDIT FINALE END-TO-END — 2026-07-20 (decisione go/no-go produzione)

> Esecuzione del prompt `docs/audit/METODO_AUDIT.md`. Modalità **DIAGNOSTICA
> read-only**: nessun file di codice modificato, nessun commit, DB live non
> toccato. Audit condotto su 6 aree in parallelo, ogni finding verificato sul
> codice reale e/o con test riproducibili su copia isolata WAL-aware del DB
> (`mechquote_audit.db`, poi eliminata). Ogni voce è marcata
> **[CONFERMATO]** o **[PLAUSIBILE]**.

## Baseline di verifica (verde)
- Backend `pytest tests/unit`: **125 passed**.
- Frontend `tsc --noEmit`: **pulito**.
- Frontend `vitest run`: **34 passed** (3 file).
- Golden cost test (parità BE↔FE): **26 BE + 34 FE passati**.

---

## VERDETTO FINALE

**Usabile in produzione interna: SÌ**, con le condizioni sotto.

- **BLOCCANTI: 0** — nessun vicolo cieco, nessuno stato-trappola, nessuna
  perdita/corruzione dati silenziosa, nessun IDOR, nessun orfano/doppione in DB.
- **ALTA: 1** — è un rischio **già noto e documentato** (import CSV cataloghi),
  non una regressione nuova, e non tocca i flussi di preventivazione/ordini.
- **MEDIA: 3** · **BASSA: 13**.

**Condizioni consigliate prima dell'uso quotidiano** (nessuna è bloccante):
1. Chiudere **M-1** (guard modifiche non salvate nell'editor) — è l'unica voce
   nella categoria a priorità massima "perdita lavoro non salvato".
2. Chiudere **M-3** (auto-riapertura silenziosa da eliminazione ordine): impatto
   operativo diretto (materiale che torna "da ordinare" senza avviso a nessuno).
3. Valutare **M-2** (divergenza di arrotondamento sub-centesimo BE↔FE): cosmetica
   ma è una violazione formale della hard-rule DRY §0-quater, fix a basso costo.
4. Implementare almeno il **Livello 1** di `NOTA_IMPORT_CSV_VALIDAZIONE.md` (voce
   **A-1**) prima di dare l'import CSV cataloghi in mano a utenti non tecnici.

---

## ALTA

### A-1 · Import CSV cataloghi scrive in DB bypassando i validatori Pydantic · [CONFERMATO]
- **Area**: normalizzati / motore CSV condiviso · `backend/app/core/csv_import.py:313` + `backend/app/api/materials.py:319-325`
- **Scenario**: `import_catalog_csv` fa `db.add(config.model(**fields))` senza passare da uno schema `...Create`. Un CSV materiali con `Famiglia` valorizzata a **etichetta** ("Alluminio") invece che slug ("alluminio") entra in DB; alla prima `GET /api/materials` il `response_model=MaterialOut` rifiuta il valore → **500 su ogni lettura** → catalogo materiali + editor preventivo + ogni pagina che carica materiali va offline.
- **Impatto**: è l'**incidente di produzione del 2026-06-05** (`docs/history/NOTA_IMPORT_CSV_VALIDAZIONE.md`). La classe di guasto è ancora aperta (fix strutturale marcato "⏸ DA IMPLEMENTARE"). Colpisce tutti i moduli col motore condiviso (materiali, trattamenti, utensili, macchine, lavorazioni, fornitori). Non irreversibile (runbook ~5 min), ma è un blocco-app a portata di un import sbagliato. **Nota**: i flussi normalizzati-da-file e richieste-materiale NON usano questo motore → immuni.
- **Fix**: aggiungere `create_schema: Optional[type] = None` a `CsvImportConfig` e validare `create_schema.model_validate(fields)` prima di `db.add` (Livello 1 della nota), cablando `create_schema=MaterialCreate` ecc.

---

## MEDIA

### M-1 · Editor preventivo senza guard modifiche non salvate: edit non "blurrato" perso cambiando pagina · [CONFERMATO]
- **Area**: manuale / UX · `frontend/src/pages/QuoteEditor.tsx` (nessun `useUnsavedGuard`) + `frontend/src/components/ui/decimal-field.tsx:49-52`
- **Scenario**: in un campo numerico (margine, qty, dimensione grezzo, costo materiale, prezzo minimo, trasporto/imballaggio) digiti un valore e — **senza togliere il focus** — clicchi "Indietro"/un link della sidebar/cambi rotta. `DecimalField` committa solo su `onBlur`; `QuoteEditor` non monta alcun `beforeunload`/guard di navigazione (a differenza di `NewQuote2DPage` e `QuoteWizard` che usano `useUnsavedGuard`). Il valore digitato è perso, senza avviso.
- **Impatto**: perdita di lavoro non salvato senza preavviso — la categoria a priorità massima del prompt. Non è un vicolo cieco (la maggior parte degli edit auto-salva su blur), ma la finestra "campo a fuoco non ancora committato" è reale e ricorrente.
- **Fix**: montare un guard in `QuoteEditor` (react-router `useBlocker` + `beforeunload`) quando c'è un edit pendente; in alternativa forzare il blur del campo attivo prima di navigare, o commit on-change con debounce.

### M-2 · Divergenza di arrotondamento BE↔FE: `round()` banker's (backend) vs `Math.round()` half-up (frontend) · [CONFERMATO]
- **Area**: calcolo · `backend/app/services/costing/primitives.py:102,111,154,159,209` ↔ `frontend/src/lib/quoteCalc.ts:106,113,171,179,180,188`
- **Scenario** (verificato numericamente): parte con fase €0,50, margine 25%, qty 1 → `base = 0.625`. Backend `round(0.625, 2)` = **€0,62** (banker's: .5→pari); frontend `Math.round(0.625*100)/100` = **€0,63** (half-up). L'anteprima mostra 0,63, il salvato/`final_total` è 0,62. Analogo in `material_cost` (`2.675`→ BE 2,67 / FE 2,68) e `quote_total`. Root cause: `round4`/`phase_cost` fu convertito a half-up (F11) per combaciare con JS, ma i gemelli `part_totals`/`material_cost`/`quote_total` sono rimasti su `round()` nativo Python.
- **Impatto**: split di 1 centesimo tra anteprima e salvato/PDF, raggiungibile con input "tondi" (0,50 · 25% · qty 1) frequenti. Il backend resta autoritativo (nessuna corruzione), ma è la violazione della hard-rule DRY §0-quater/§4. La golden net non lo cattura (nessun caso-fixture cade su un tie `.xx5`). **Distinto** dal backlog "unit_price×qty accumula centesimi" (quello è accumulo su qty alte; questo è un tie-break a monte).
- **Fix**: sostituire i `round(x, n)` in `part_totals`/`material_cost`/`quote_total` con la semantica half-up già in `round4` (es. `round2(x) = math.floor(x*100+0.5)/100`); aggiungere un caso golden con tie `.xx5`.

### M-3 · `delete_order` riapre un preventivo `completo→confermato` SENZA notificare il creatore · [CONFERMATO]
- **Area**: notifiche / ordini-materiale · `backend/app/api/orders.py:832-900` (demote `:890-895`, commit `:897`; nessuna `create_notification`)
- **Scenario**: admin/amministrazione elimina un ordine materiali dallo storico (`DELETE /api/orders/{id}`). Un preventivo che era `completo` perde la risoluzione del materiale e viene auto-riaperto a `confermato`. Il creatore (ufficio tecnico) **non riceve alcuna notifica**: il materiale è di nuovo "da ordinare" ma lui non lo sa.
- **Impatto**: cambio di stato silenzioso su un preventivo altrui, incoerente con TUTTI gli altri percorsi di retrocessione che notificano (`unconfirm` `quotes.py:522`, `reopen` `quotes.py:451`, e `_reconcile_after_write` `parts.py:71-81` che per lo STESSO evento emette `quote_reopened`). Non è un vicolo cieco (l'ordine si ricrea), ma il materiale può restare non ordinato senza che nessuno se ne accorga.
- **Fix**: dopo `reconcile_material_state`, per ogni `q` riaperto con `q.created_by_user_id`, chiamare `create_notification(type='quote_reopened', target_user_id=q.created_by_user_id, commit=False)` prima di `db.commit()` (stesso pattern di `parts.py`).

---

## BASSA

### B-1 · `_reconcile_after_write` emette `quote_reopened` su commit separato (finestra non atomica) · [CONFERMATO]
- **Area**: notifiche / atomicità · `backend/app/api/parts.py:58-81`
- **Scenario**: una modifica a una Part riapre un preventivo `completo→confermato`. Lo stato è committato (`:70`) e POI la notifica in un secondo commit (`:73-81`). Crash tra i due → stato riaperto, notifica persa. A differenza di `quote_completed` questo tipo non ha UNIQUE dedupe, quindi non c'è la ragione documentata per il commit proprio.
- **Fix** (opzionale): non committare in `reconcile` quando serve poi la notifica, e passare `commit=False`.

### B-2 · Notifica `quote_completed` da ordine materiale non recuperabile su crash post-commit · [CONFERMATO]
- **Area**: notifiche / ordini-materiale · `backend/app/api/orders.py:684-689`
- **Scenario**: l'ultimo ordine porta il preventivo a `completo`; commit di stato+ordine+`materials_ordered`, poi `notify_quote_completed` su commit proprio. Crash tra i due → preventivo `completo` ma notifica di completamento persa. Via ordine materiale la sorgente è unica (nessuna "doppia sorgente" come nel percorso confirm).
- **Impatto**: perdita di una singola notifica in-app in caso di crash nell'intervallo (finestra minima); nessuna incoerenza dati. È il pattern post-commit documentato come invariante — segnalato per completezza.
- **Fix** (opzionale): spostare `quote_completed` a `commit=False` mantenendo la dedupe UNIQUE, o lasciarlo come scelta accettata.

### B-3 · Anteprima pool mostra `RM-xxxx` come riferimento ma il CSV lo stampa vuoto · [CONFERMATO]
- **Area**: ordini-materiale · `backend/app/api/orders.py:246` (aggregate) vs `:384/:411` (`_req_ref`)
- **Scenario**: richiesta materiale con riga senza codice articolo e senza titolo ordine, inviata e selezionata nel pool. L'anteprima mostra `RM-0002 ×1` (fallback `f"RM-{id:04d}"` in `aggregate_materials`), ma `_persist_request_snapshot` scrive `part_code=_req_ref(it)` che NON ha quel fallback → CSV/snapshot con riferimento **vuoto**.
- **Impatto**: cosmetico — riferimento "fantasma" in anteprima che sparisce nel CSV emesso.
- **Fix**: allineare l'anteprima al fallback reale del CSV (mostrare vuoto/"—"), o aggiungere lo stesso fallback `RM` in `_req_ref` per coerenza bidirezionale.

### B-4 · `revert-await` non raggiungibile dall'editor preventivo · [CONFERMATO]
- **Area**: workflow / UX · `frontend/src/pages/QuoteEditor.tsx:441-450`
- **Scenario**: un preventivo `in_attesa_cliente` aperto nell'editor mostra solo `confirm`/`notordered`/`reopen`. Manca "Annulla attesa cliente" (`revert-await`), presente solo nella lista (`QuotesListView.tsx:137`). Dall'editor l'unica uscita "morbida" è `reopen`, che riporta a **bozza** azzerando `submitted_at`/`read_at` e obbliga a re-inviare — proprio l'attrito che `revert-await` (F19) evita.
- **Impatto**: incoerenza FE (bottone in una vista, assente nell'altra); non un vicolo cieco (la lista offre l'uscita pulita).
- **Fix**: aggiungere l'azione `revert-await` in `QuoteEditor.tsx` con `show: canConfirm && st === 'in_attesa_cliente'`.

### B-5 · Azioni workflow di lista senza guardia di doppio submit · [CONFERMATO]
- **Area**: workflow · `frontend/src/components/quotes/QuotesListView.tsx:131-145`
- **Scenario**: `doRevertAwait` (e `doAwaitClient`/`doRestore`) parte senza flag `busy`/disabled; doppio click → due POST. Il backend è idempotente (secondo POST → 400 mostrato come toast d'errore fuorviante).
- **Impatto**: nessun danno dati; attrito UX (toast d'errore spurio).
- **Fix**: disabilitare il bottone durante l'in-flight (come `confirming`/`markingNotOrdered`) o ignorare il 400 "stato non valido" su queste azioni.

### B-6 · `update_request` su richiesta materiale senza guardia di stato · [CONFERMATO]
- **Area**: ordini-materiale · `backend/app/api/material_requests.py:194-223`
- **Scenario**: `PUT /orders/material-requests/{id}` accetta modifiche a titolo/righe aperte in qualsiasi stato, anche su una richiesta `inviato` con tutte le righe già evase (nessuna riga aperta) — il titolo resta modificabile silenziosamente. Le righe evase non vengono toccate (`material_order_id is None` filtra correttamente).
- **Impatto**: trascurabile e per lo più voluto; nessuna perdita dati.
- **Fix** (opzionale): rifiutare il PUT quando `open_count == 0`.

### B-7 · "Modifica selezione DXF" salva la fase ma non aggiorna il grezzo della parte · [CONFERMATO]
- **Area**: 2D-DXF · `frontend/src/components/quotes/EdmPhaseFields.tsx:90-112` (`handleReselectConfirm`) vs `:169-185` (`confirmDxf`)
- **Scenario**: riselezione profili/override unità su una fase EDM con DXF. `handleReselectConfirm` salva `cut_length_mm` + `dxf_profile_ids` (unitScale corretto) ma — a differenza di `confirmDxf` — non ricalcola `raw_x_mm/raw_y_mm` dalla nuova bbox. Se la selezione cambia l'ingombro, il grezzo resta vecchio.
- **Impatto**: possibile incoerenza grezzo↔selezione; basso (grezzo spesso impostato a mano, riselezione tipica tocca la lunghezza).
- **Fix**: aggiornare la bbox del grezzo in reselect quando `!partHasRawStock` (coerente con `confirmDxf`), o documentare la scelta.

### B-8 · Upload allegati dalla PartCard senza pre-check client (size/tipo) · [CONFERMATO]
- **Area**: manuale / UX · `frontend/src/components/quotes/PartAttachments.tsx:45-59`
- **Scenario**: caricando un file da 60 MB o `.exe` in "Disegni & allegati" l'upload parte diretto (a differenza del wizard 2D che usa `checkUploadFile`); il file viene interamente spedito e solo il backend lo rifiuta (413/400 magic-byte).
- **Impatto**: attrito UX (attesa inutile); non un buco di sicurezza — il backend valida comunque (`parts.py:421-468`).
- **Fix**: chiamare `checkUploadFile(file, { maxMB: 50, exts: [...ACCEPT] })` prima del POST.

### B-9 · `quote_number` non sanitizzato lato API (solo controllo duplicato) · [CONFERMATO]
- **Area**: manuale · `backend/app/api/quotes.py:145-176` (UI: `QuoteWizard.tsx:42`, `NewQuote2DPage.tsx:205`)
- **Scenario**: via UI il numero è filtrato (`\D`→'', `toUpperCase().slice`), niente traversal. Il backend però accetta qualunque stringa in `quote_number` (nessuna regex/whitelist): un client custom potrebbe inviare `../../x` o caratteri di controllo. **Nessun path-traversal reale** (i file usano `part_{id}_{uuid}_{basename}` con sanitizzazione propria); il valore finisce solo in DB/PDF/`part_code`.
- **Fix** (facoltativo): aggiungere regex/`max_length` a `quote_number` in `QuoteCreate`.

### B-10 · `notify_low_stock` gated su `tools` invece di `orders.tools` · [CONFERMATO]
- **Area**: permessi / ordini utensili · `backend/app/api/tools.py:514-519`
- **Scenario**: `POST /tools/notify-low-stock` (notifica `tools_low_stock_alert`) è protetto da `require_permission('tools')` (anagrafica), non da `orders.tools` (dominio ordini). In pratica gira dallo scheduler con credenziali admin.
- **Impatto**: incoerenza minore di gating; nessun dato esposto; idempotenza per-giorno regge (`created_at >= today_start`).
- **Fix**: `require_any_permission('orders.tools', 'tools')` o allineare a `orders.tools`.

### B-11 · Ordini normalizzati da file non emettono notifica (asimmetria con materiali/utensili) · [CONFERMATO]
- **Area**: notifiche / normalizzati · `backend/app/api/normalized_from_file.py:165-250`
- **Scenario**: `create_file_orders` crea l'ordine e impara gli alias ma non chiama `create_notification` (a differenza di `tools_ordered` e materiali). Ordine creato "in silenzio".
- **Impatto**: buco UX, non funzionale; coerente col fatto che i normalizzati sono un flusso catalogo standalone self-service. **Da decidere col prodotto** se voluto.
- **Fix**: se voluta, aggiungere `create_notification(type='normalized_ordered', commit=False)` prima del commit; altrimenti documentare la scelta.

### B-12 · `download_document` (Officina) serve QUALSIASI tipo con `media_type="application/pdf"` hardcodato · [CONFERMATO]
- **Area**: UX / sicurezza · `backend/app/api/officina.py:207-224` (media_type fisso `:221`)
- **Scenario**: `ALLOWED_EXT` accetta `.docx/.xls/.png/.jpg/.gif/.dxf` oltre a `.pdf`, ma il download forza `Content-Type: application/pdf`. Aprire un .docx/.xlsx/.dxf lo serve come PDF → il browser mostra un PDF "rotto" o lo scarica male.
- **Impatto**: solo UX (documento non visualizzabile inline). **Non è XSS** (whitelist esclude html/svg, `application/pdf` forzato impedisce l'interpretazione come markup).
- **Fix**: `media_type=mimetypes.guess_type(doc.filename)[0] or "application/octet-stream"` (come `parts.py:522`).

### B-13 · Cap di 200 candidate in `_query_for_user` può nascondere una notifica 1-a-1 · [PLAUSIBILE]
- **Area**: notifiche · `backend/app/api/notifications.py:32-52` (LIMIT 200 `:52`)
- **Scenario**: `target_roles` default `[]` (non NULL) → `target_roles.isnot(None)` è vera per OGNI riga; la query carica le 200 più recenti in assoluto e filtra in Python. In un giorno con >200 notifiche ad altri più recenti della tua notifica personale, la tua cade fuori dalla finestra (né lista né unread-count).
- **Impatto**: teorico ai volumi attuali (officina), ma buco latente.
- **Fix**: filtrare i broadcast lato SQL (colonna scalare/join) invece di `isnot(None)` sempre-vera, o alzare/rendere per-utente il cap.

### B-14 · `create_file_orders` non richiede `normalized_item_id` sulle righe (solo `supplier_id`) · [PLAUSIBILE]
- **Area**: normalizzati · `backend/app/api/normalized_from_file.py:181-186`
- **Scenario**: il backend blocca solo le righe senza `supplier_id`; non richiede `normalized_item_id`/`description` (che il frontend invece esige). Una chiamata API diretta `{supplier_id: X, normalized_item_id: null}` crea un item con `normalized_item_id=None` e `article` eventualmente vuoto, senza apprendere alias.
- **Impatto**: solo via API grezza (la UI non lo permette); FK nullable by-design, nessun crash/orfano pericoloso. Robustezza, non correttezza.
- **Fix** (facoltativo): allineare la validazione backend a quella frontend.

---

## AREE VERIFICATE PULITE (certificano il go)

**Cost engine / parità DRY**
- Formula fase nelle **3 copie DRY** (`primitives.phase_cost` ↔ `PhaseEditor.calcPhase` ↔ `PartCard` setup `:116-122`): identiche (rate split setup/work, divisor=qty, fixed/qty, var_per_part).
- `material_cost` ↔ `calcMaterialCost`: logica tondo/prismatico/tubo, scrap, densità, €/kg identica (unico delta = tie-break M-2).
- Rami provenienza materiale (conto-lavoro cliente → costi materia a 0; magazzino → override stock shipping/cutting, `nFromStock` distribuito): gemelli coerenti.
- Trattamenti €/kg e €/dm³ (soglia su peso batch, distribuzione per peso/volume): coerenti, coperti dai golden.
- Input estremi: qty 0/negativa/>1M → 422; floor `ge=0` su margine parte/globale, sconto `ge=0,le=100`, minimo/transport/packaging tutti presenti. **La voce di backlog "sconto >100% → prezzo negativo fino al PDF" è di fatto risolta a livello schema** (aggiornare il backlog).

**Workflow / ACL**
- `ensure_editable` (che incapsula `ensure_quote_visible`) presente su ogni endpoint per-id di `parts.py`/`phases.py`/`quotes.py`, GET detail inclusi. **Nessun IDOR.**
- Reversibilità completa: `non_ordinato→restore`, `in_attesa_cliente→revert-await/reopen/confirm/notordered`, `confermato/completo→unconfirm`. Nessuno stato-trappola.
- Timestamp puliti su ogni transizione inversa (`awaiting_client_at`/`confirmed_at`/`completed_at`/`not_ordered_at`/`material_ordered_at`/`read_at`/`submitted_at` azzerati/preservati coerentemente); `unconfirm`/`restore` ricostruiscono lo stato reale (`letto if read_at else inviato`).
- Nessun `role == 'admin'` in logica di business oltre le 2 eccezioni note (anti-lockout `security.py`, admin-crea-admin `auth.py`) + un delete-protection in `roles.py` (non gating).
- Gating FE↔BE coerente; editor con `busy={saving}` disabilita le azioni in transito (AUD-34 regge). Scenario `ufficio_tecnico_plus` (confirm+edit_locked senza view_all) coerente.

**Ordini materiale / richieste manuali / reconcile** (testato su copia isolata)
- Promozione `confermato→completo` e retrocessione `completo→confermato` (reconcile) su DELETE: corrette, nessuna doppia demote, nessuno stato sporco, nessun preventivo `completo` con materiale mancante.
- Idempotenza `(preventivo,fornitore)`: 400 pulito su secondo POST, UNIQUE DB regge, mai doppioni persistiti.
- Aggregate (anteprima) = ordine reale; conto-lavoro escluso, magazzino incluso marcato `from_stock`, parti senza `material_id` escluse.
- Richieste manuali (pool unificato): bozza incompleta OK, send valida fornitore+misure per riga, mix preventivi+richieste → un `MaterialOrder` con `source` corretto (`quotes`/`request`/`mixed`), evasione per riga, matita PUT tocca solo righe aperte, DELETE ri-apre le righe, KPI "Da ordinare" corretto.
- CSV: snapshot B6 quando presente, fallback live solo per ordini `quotes` pre-B6; `/quote/{id}/csv` sola lettura.

**Import da file / normalizzati**
- DELETE `NormalizedItem`: **nessun orfano** (`normalized_items.py:129-143` nulla la FK su `NormalizedOrderItem` + cascade alias; le righe d'ordine sono snapshot autonomi) — corretto by-design, `block_if_in_use` non necessario.
- `GET /normalized-suppliers`: **non aperto**, protetto da `require_any_permission('settings','officina')`.
- `normalized_from_file`: `supplier_id` **ri-verificato** contro tabella (404 se assente); `normalized_item_id` validato (AUD-26); alias appresi **nella stessa transazione** dell'ordine (nessuna finestra non-transazionale), `csv_name` globalmente unico.
- Parse distinta: decode utf-8-sig/utf-8/cp1252/latin1; separatore errato/colonne mescolate → **400 pulito**, mai mis-mappatura silenziosa; grezzo `+5`/spessore `ceil/5*5` corretti.
- Ordini utensili: snapshot completo, gate `orders.tools`, notifica `tools_ordered` atomica, delete cascade pulito, low-stock idempotente per giorno.

**Frontend / 2D-DXF / STEP**
- Rollback submit 2D non-atomico: traccia `createdQuoteId`, elimina l'orfano su fallimento, avvisa se anche la delete fallisce. Nessun preventivo orfano.
- Materiale mutex + allineamento `material_cost` alla provenienza; togliere trattamento invia `treatment_id:null` esplicito (sparisce davvero).
- STEP viewer: gestisce STEP senza geometria/corrotto/assieme grosso (cap `MAX_STEP_FACES=4000` prima della tessellazione), cambio materiale col modale aperto (ricalcola peso senza ri-tessellare), free OCCT all'unmount.
- DXF backend: file vuoto → 400, non-DXF con `.dxf` → 400 magic-byte, oversize → 413 stream a chunk, tolleranza `>0` (no ZeroDivisionError).
- Override unità mm/pollici su tutti i percorsi (wizard, reselect, measure, picker); reselect avvisa se i profili non combaciano; banner concorrenza scatta solo su modifiche altrui.
- Modali (STEP/DXF/ConfirmDialog): tutti con Annulla/chiusura, nessuno intrappola; errori → toast + modale riapribile.

**Notifiche / PDF / upload**
- **Generazione PDF preventivo: FEATURE INESISTENTE** (grep esaustivo su jspdf/weasyprint/reportlab/react-pdf/window.print negativo). Tutti gli scenari H sul PDF (`quote.date` vs `quote_date`, prezzo negativo al PDF, crash dati minimi) sono **moot**: nessun PDF viene prodotto. (I "PDF" sono solo allegati caricati.)
- Atomicità notifiche (F7): `commit=False` su tutte le transizioni di `quotes.py`, `orders.py:materials_ordered`, `orders_tools.py:tools_ordered`, `material_requests.py:material_to_order`. Eccezioni giustificate: `quote_completed` (UNIQUE dedupe + doppia sorgente) e i casi B-1/B-2.
- Anti-auto-notifica (F6): attore escluso dai broadcast di ruolo; guard `target != current_user.id` sulle 1-a-1.
- `quote_read` doppioni/race: UPDATE atomico `WHERE status='inviato'` + guard su `rowcount` → una sola notifica.
- Deep-link + ACL destinatario coerenti; cliente arricchito nel dettaglio.
- Upload: whitelist estensioni + MIME + **magic-byte** + nome uuid/timestamp + `os.path.basename` anti-traversal + cap 50MB stream a chunk (413), su tutti e 3 gli endpoint (parts/officina/materials). `/uploads` **non più montato statico** (`main.py:999-1004`); file serviti solo via endpoint autenticati+ACL.

---

## Conteggio finale
| Gravità | N | ID |
|---|---|---|
| BLOCCANTE | 0 | — |
| ALTA | 1 | A-1 |
| MEDIA | 3 | M-1, M-2, M-3 |
| BASSA | 13 | B-1 … B-14 |

**Raccomandazione**: **usabile in produzione interna — SÌ**, chiudendo idealmente
M-1 / M-3 (UX/operatività) prima dell'uso quotidiano e M-2 (parità DRY) quando si
tocca il motore; A-1 va mitigata (Livello 1) prima di esporre l'import CSV
cataloghi a utenti non tecnici. Nessun finding blocca l'avvio.

---

*Audit generato il 2026-07-20 seguendo `docs/audit/METODO_AUDIT.md`. Read-only:
nessun codice modificato, nessun commit, DB live non toccato. Test su copia
isolata `mechquote_audit.db` (eliminata a fine audit).*
