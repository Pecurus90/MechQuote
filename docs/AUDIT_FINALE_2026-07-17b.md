# AUDIT FINALE END-TO-END — MechQuote · 2026-07-17 (run "b")

> Secondo passaggio dell'audit finale go/no-go, condotto seguendo
> `docs/AUDIT_FINALE_PROMPT.md`. Diagnostica **read-only** su codice reale +
> harness di test. Non sostituisce `AUDIT_FINALE_FINDINGS.md` (checklist F1–F27
> del run precedente, quasi tutta chiusa): questo file è lo snapshot del
> ri-controllo. Ogni voce è marcata [CONFERMATO] o [PLAUSIBILE] con `file:riga`.

**Metodo:** 6 stream read-only paralleli (calcolo · workflow/permessi ·
ordini-materiale · import-file/normalizzati · notifiche · DXF/STEP/frontend).

**Harness (baseline):** `pytest tests/unit` → **125 passed**; `tsc --noEmit` →
**pulito**; `vitest` → **34 passed**.

**Regressione fix precedenti (F1–F27):** verificati **tutti reggenti**.

---

## 🔴 BLOCCANTI — nessuno
Nessun vicolo cieco, nessuno stato-trappola, nessuna perdita dati silenziosa.
Macchina a 7 stati con uscita da ogni stato (incl. reversibilità di
`non_ordinato`/`in_attesa_cliente`), timestamp puliti su ogni revert,
`ensure_editable`/`ensure_quote_visible` su tutti gli endpoint per-id.

## 🟠 ALTA — nessuna

## 🟡 MEDIA (3 — nessuna è un vicolo cieco)

- [x] **M1 · DELETE catalogo `NormalizedItem` lasciava una FK orfana su
  `NormalizedOrderItem`.** [CONFERMATO] · `backend/app/api/normalized_items.py:134`.
  **FATTO** in questo giro: prima di `db.delete(item)` la DELETE azzera
  esplicitamente `normalized_item_id` sulle righe d'ordine storiche (snapshot
  article/description indipendenti dal catalogo → storico leggibile, nessun
  puntatore orfano). Scelta allineata al precedente autoritativo `delete_material`
  (blocca solo su ref *live*, non sullo snapshot d'ordine) e al design
  dello snapshot. Gli alias cascadano con la voce. Verificato: nessun path
  dereferenzia `NormalizedOrderItem.normalized_item`; l'order-write già tratta
  la FK come opzionale.

- [x] **M2 · `quote_completed` era l'unica notifica a target singolo senza guard
  anti-auto-notifica.** [CONFERMATO] · `backend/app/api/quotes.py:288`.
  **FATTO** (commit `c56b901`): aggiunto `if target == actor_user.id: return`,
  coerente con tutte le altre transizioni. Verificato su DB isolato: self→0
  notifiche, altri→1 notifica al creatore.

- [x] **M3 · KPI "da ordinare" (`get_stats`) dipendeva dal flag legacy
  `material_ordered_at`.** [CONFERMATO, debito latente] · `backend/app/api/orders.py:352`.
  **FATTO** (commit `2b3f547`): `to_order` conta i `confermato` con materiale
  NON risolto via `wf.material_is_resolved` (fonte unica spec 18), senza
  dipendere dal flag ponte. Verificato su DB isolato: confermato con materiale
  reale conta, confermato tutto-da-magazzino escluso.

## 🟡 BASSA (10)

- [x] **B1 · GET `/normalized-suppliers` senza permesso** → elenco fornitori +
  recapiti a ogni utente autenticato (il gemello `/normalized-items` richiede
  `settings`). [CONFERMATO] · `backend/app/api/normalized_suppliers.py:27`.
  **FATTO** (commit `22f5789`): gate `require_any_permission('settings',
  'officina')` sul GET (copre catalogo/ordini-da-file + Documenti Officina che
  linka i fornitori). Verificato: settings/officina→200, altri→403.
- [ ] **B2 · Bottone "Salva" visibile ad `amministrazione` (senza
  `quotes.create`) → PUT 403** su preventivo editabile proprio o dopo "Modifica
  comunque". [CONFERMATO] · `frontend/src/pages/QuoteEditor.tsx:449`.
  *Fix:* aggiungere `hasPermission('quotes.create')` alla `show` dell'azione save.
- [ ] **B3 · `revert-await` assente dai bottoni dell'editor** (presente solo in
  lista) → dall'editor l'unica retrocessione da `in_attesa_cliente` è
  `reopen`→bozza. [CONFERMATO] · `frontend/src/pages/QuoteEditor.tsx:441`.
  *Decisione di prodotto* + fix speculare alla lista.
- [ ] **B4 · Doppia notifica su conferma-che-completa** (`quote_confirmed` +
  `quote_completed` per lo stesso click). [CONFERMATO] · `backend/app/api/quotes.py:398-413`.
  Correlata a M2. *Fix (se voluto):* sopprimere `quote_confirmed` quando
  `completed` è True.
- [ ] **B5 · `quote_reopened` da modifica parti: notifica su secondo commit
  (non atomica, unico path non convertito da F7) + manca guard self.**
  [CONFERMATO] · `backend/app/api/parts.py:70-73`.
  *Fix:* `create_notification(..., commit=False)` + commit unico; aggiungere
  guard `target != user.id`.
- [ ] **B6 · Ordini normalizzati non emettono notifica** (materiali/utensili sì)
  → ordini "in silenzio". [CONFERMATO, product decision] · `normalized_from_file.py`.
- [ ] **B7 · `/quote/{id}/csv` (materiali) non controlla lo stato** → scaricabile
  anche su `bozza` (gate UI a confermato/completo). Sola lettura, nessun effetto.
  [CONFERMATO] · `backend/app/api/orders.py:677`.
- [ ] **B8 · `notify-low-stock`: idempotenza "per giorno" read-then-write senza
  UNIQUE** → doppione teorico su doppia invocazione. [PLAUSIBILE] · `backend/app/api/tools.py:514`.
- [ ] **B9 · Modal EDM "Carica da DXF" senza pre-check dimensione client** (il
  wizard 2D ce l'ha) → upload lungo poi 413. [CONFERMATO] ·
  `frontend/src/components/quotes/Dxf/DxfProfilePicker.tsx:108`.
  *Fix:* `checkUploadFile(file, {maxMB:50})` in cima a `handleFile`.
- [ ] **B10 · `analyze-part-file` legge l'intero file in RAM senza cap** (già
  protetto a monte dall'upload). Difesa in profondità. [CONFERMATO] ·
  `backend/app/api/dxf.py:103`.

## ✅ Aree certificate PULITE
- **Motore di calcolo (DRY):** 3 copie formula fase + 2 costo materiale identiche
  riga-per-riga; totali parte/quote, trattamento batch, delivery/cutting per i 3
  rami provenienza allineati backend↔frontend; `total_price = base×qty` a piena
  precisione (niente errore-centesimi).
- **Workflow stati + ACL:** loop completo e reversibile, nessuno stato-trappola,
  timestamp puliti, grant admin idempotenti per ogni chiave, nessun `role==`
  oltre le 2 eccezioni intenzionali.
- **Ordini materiale:** promozione/retrocessione `confermato↔completo`,
  idempotenza `(preventivo,fornitore)` via UNIQUE+409, DELETE selettivo senza
  doppie-demote né orfani, CSV snapshot B6.
- **Import da file:** parse robusto (utf-8/cp1252, 400 pulito su header errato,
  mai mis-mappatura silenziosa), AUD-26 su entrambi i flussi, alias atomici.
  Il K3 ipotizzato (FK supplier non validata) è **falso positivo**: la
  validazione c'è (`normalized_from_file.py:206`, `orders_from_file.py:320`).
- **Notifiche:** dedupe UNIQUE su `quote_completed` regge, destinatari corretti,
  atomicità F7 su tutti i path (eccetto B5), cliente nel dettaglio, deep-link
  ACL-coerente.
- **DXF/STEP/input estremi:** override unità su tutti i percorsi, cap
  entità/facce, rollback orfano, vincoli Pydantic qty/margine/sconto (prezzo
  negativo non raggiungibile → non arriva a valle).

---

## VERDETTO: 🟢 GO — usabile in produzione interna: SÌ

Nessun bloccante, nessuna alta, nessun vicolo cieco o perdita dati. Le MEDIA
sono coerenza/robustezza, non correttezza critica; le BASSA sono rifiniture.

**Condizioni consigliate (non bloccano l'avvio):**
1. M1, M2, M3 e B1 chiusi in questo giro (tutte le MEDIA chiuse). Restano solo
   le BASSA rimanenti (B2/B4/B5/B7/B8/B9/B10) come rifiniture non urgenti +
   le 2 decisioni di prodotto (B3/B6).
2. Decidere i punti di prodotto: B6 (notifiche ordini normalizzati?) e B3
   (`revert-await` nell'editor?).
