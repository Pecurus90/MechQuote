# 18 — Stati preventivo + ordini materiale per fornitore

> **Stato**: spec approvata (brainstorming utente 2026-07-01), non ancora
> implementata. Fonte di verità del disegno. Tocca una **zona fragile**
> (workflow stati preventivo, `quotes.py`, dashboard) → implementazione a
> blocchi, con verifica in mezzo. Vedi `CLAUDE.md` §0-quater.

## 0. Obiettivo

Due esigenze nate insieme:

1. **Ordini materiale per fornitore.** Il gestionale aziendale tratta ogni
   fornitore come un ordine separato → l'export materiali deve produrre **un
   CSV per fornitore** e tracciare l'evasione **per (preventivo × fornitore)**.
2. **Ciclo di vita del preventivo più fedele alla realtà.** Oggi "completato"
   scatta da solo appena qualcuno apre il preventivo (leggere ≠ completare).
   Si vuole un flusso esplicito con conferma manuale di amministrazione.

Ne escono **due assi di stato ortogonali** su ogni preventivo:
**Stato lavorazione** e **Stato materiale**, più una **tabella riepilogo
espandibile** in Archivio preventivi.

Scope: **solo preventivi normali** (`quote_type` standard). I preventivi
Stampi (`quote_type='die'`) restano **fuori** da questo disegno per ora.

---

## 1. Stato lavorazione (ciclo di vita)

Catena a 5 stati (sostituisce `bozza → inviato → completato`):

```
bozza ──▶ inviato ──▶ letto ──▶ confermato ──▶ completo
(uff.tec)  (uff.tec)  (auto,    (manuale,       (auto)
                       ammin.)   ammin.)
```

| Stato | Come scatta | Note |
|---|---|---|
| **bozza** | alla creazione (ufficio tecnico) | modificabile |
| **inviato** | l'ufficio tecnico "manda in revisione" (`quotes.send`) | modificabile; notifica ad amministrazione |
| **letto** | **automatico** quando **amministrazione** apre un preventivo **già `inviato`** | modificabile; scatta solo da `inviato` in poi (non se si sbircia una bozza) |
| **confermato** | **click manuale** amministrazione — pulsante **"Conferma preventivo"** | **da qui il preventivo si BLOCCA in modifica**; da qui si può ordinare il materiale |
| **completo** | **automatico** quando `confermato` **e** stato materiale ∈ {`totalmente_evaso`, `non_necessario`} | **terminale** (riapertura solo admin, vedi §5) |

- Rispetto ad oggi **non c'è più "creato"** (era indistinguibile da bozza).
- "completato" (vecchio, auto all'apertura) → sostituito da "letto".

### Blocco modifica
`ensure_editable()` in `quotes.py`: modificabile fino a `letto` **compreso**;
bloccato da `confermato` in poi. Admin resta esente (override), come oggi.

---

## 2. Stato materiale (evasione per fornitore)

Tracciamento **per (preventivo × fornitore)**, aggregato a stato di preventivo.

| Stato materiale (preventivo) | Definizione |
|---|---|
| **non_necessario** | nessuna parte da ordinare (tutte magazzino/conto lavoro, o solo lavorazioni) |
| **non_ordinato** | esistono parti da ordinare, nessun fornitore ancora ordinato |
| **parziale** | ordinato il materiale di **alcuni** fornitori, non tutti |
| **totalmente_evaso** | ordinato il materiale di **tutti** i fornitori da ordinare |

"Evaso" = **ordine emesso** (CSV generato), **non** arrivo fisico del materiale.

### Cosa "va ordinato" (a livello di Parte)
Una parte concorre all'ordine solo se:
`material_id` valorizzato **e** `customer_supplied_material=False` **e**
`material_from_stock=False` **e** il materiale ha un fornitore assegnato.

Casi speciali (non concorrono, hanno stato proprio nella vista):
- **Conto lavoro** (`customer_supplied_material=True`) → "Conto lavoro".
- **Da magazzino** (`material_from_stock=True`) → "Da magazzino".
  > Cambio rispetto ad oggi: le parti da magazzino oggi finiscono comunque
  > nell'aggregato con badge; con questa logica sono **fuori dagli ordini**.

### Derivazione stato preventivo
```
fornitori_da_ordinare = { material_supplier distinti delle parti "da ordinare" }
fornitori_ordinati    = { (quote,supplier) presenti in quote_supplier_orders }

se fornitori_da_ordinare == ∅            → non_necessario
altrimenti se ordinati == ∅              → non_ordinato
altrimenti se ordinati ⊃ parziale        → parziale
altrimenti se ordinati == da_ordinare    → totalmente_evaso
```

### Parte con materiale ma SENZA fornitore
Bloccherebbe per sempre il `totalmente_evaso`. **Regola**: la **Conferma** è
impedita se esistono parti "da ordinare" senza fornitore assegnato
(messaggio: "assegna un fornitore a queste parti prima di confermare").

---

## 3. Tabella riepilogo (Archivio preventivi)

**Riga = preventivo**, colonne:
`Codice · Cliente · Stato lavorazione · Stato materiale`

**Espandibile a click** → elenco **articoli (Parti)** del preventivo. Per ogni
articolo (solo visualizzazione, non influenza la logica):

| Campo | Sorgente |
|---|---|
| Codice articolo | `part.part_code` (+ `revision`) |
| Materiale | `part.material.name` |
| Tipo | `part.material.family` |
| Misure | grezzo: `Ø{raw_diameter} × {raw_z}` oppure `{raw_x} × {raw_y} × {raw_z}` mm |
| Trattamenti termici | fasi con `treatment_id` → `treatment.name` (0..N) |
| Fornitore | `part.material.material_supplier.name` |
| Stato materiale parte | derivato: `Ordinato` / `Da ordinare` / `Da magazzino` / `Conto lavoro` / `Senza fornitore` |

---

## 4. Ordini materiali

- **Export CSV per fornitore**: dalla schermata Ordini materiali si selezionano
  i preventivi (già `confermato`), si vede l'aggregato per fornitore, e si
  scarica **un CSV per fornitore** (`AAAAMMGG_HHmm_<fornitore>.csv`, formato
  `;` + UTF-8/BOM, riuso di `csv_export_response` già introdotto per gli
  utensili). Colonne CSV materiali: `Materiale · Dimensioni · Quantità (pz)`
  (dimensioni in una sola cella testo, es. `405x50x100mm` / `Ø50x120`).
- **Effetto**: creare l'ordine marca le coppie `(preventivo, fornitore)` come
  ordinate → ricalcola lo stato materiale dei preventivi coinvolti → notifica.
- **Idempotenza**: creare l'ordine marca lo stato **una volta**; ri-scaricare
  il CSV dallo storico rigenera solo il file (nessun doppio ordine, nessun
  cambio stato) — come per gli utensili.
- **Archivio ordini materiali**: ogni ordine emesso resta nello storico
  (estende il `MaterialOrder` esistente), con i CSV per-fornitore
  ri-scaricabili.
- **Import CSV** su Ordini materiali → **da progettare dopo** (fuori da questa
  spec, annotato come lavoro futuro).
- **PDF materiali**: mantenuto (documento stampabile) accanto al CSV.

---

## 5. Correzioni ed errori

- **Annullo ordine di un singolo fornitore**: **admin** sblocca la coppia
  `(preventivo, fornitore)` → torna ordinabile; l'ordine resta nello storico;
  lo stato materiale si ricalcola (torna a parziale/non_ordinato).
  (Sostituisce l'attuale `DELETE /api/orders/materials/quote-flag/{id}`
  per-preventivo con una variante per-fornitore.)
- **Correzione dopo la Conferma**: solo **admin** può **annullare la
  Conferma** → riapre la modifica. Gli ordini materiale già emessi restano
  nello storico ma le coppie `(preventivo, fornitore)` si azzerano (vanno
  riordinate). ("Don't break the user".)
- **Rimanda in bozza**: azione da `inviato`/`letto` che riporta a `bozza` con
  notifica al creatore (il preventivo è sbagliato, torna all'ufficio tecnico).

---

## 6. Permessi e notifiche

### Permessi
- **`quotes.confirm`** (nuovo) — chi preme "Conferma preventivo" → assegnato ad
  **amministrazione**. Il vecchio `quotes.complete` ("marca completato
  aprendo") **perde senso** e va deprecato/rimosso in migrazione.
- **`orders.materials`** — scarico CSV / creazione ordine → **ufficio tecnico
  e amministrazione** (entrambi).

### Notifiche
| Evento | Destinatari | Testo esempio |
|---|---|---|
| `inviato` | amministrazione | (come oggi) |
| `confermato` | creatore | "Il tuo preventivo NNN è stato confermato" |
| ordine materiale | ufficio tecnico + amministrazione | "Laura ha creato l'ordine materiali per Euroacciai (prev. 001, 002)" |
| `completo` | creatore | "Preventivo NNN completato" |

---

## 7. Modifiche al data model (riassunto)

Da definire in dettaglio a implementazione; qui l'impianto.

- **`quotes.status`**: nuovi valori ammessi `bozza|inviato|letto|confermato|completo`
  (String, non Enum — regola §6 CLAUDE.md). Timestamp/attori: `read_at` +
  `read_by_user_id`, `confirmed_at` + `confirmed_by_user_id` (verificare quali
  già esistono; `completed_at`/`completed_by` riusati).
- **Nuova tabella `quote_supplier_orders`** — una riga per coppia ordinata:
  `id, quote_id (FK), material_supplier_id (FK material_suppliers), material_order_id (FK material_orders), ordered_at, ordered_by_user_id`.
  Vincolo di unicità `(quote_id, material_supplier_id)`.
- Il flag legacy `quotes.material_ordered_at` / `material_ordered_by_user_id`
  resta in DB (SQLite no DROP) ma non è più la fonte dello stato materiale
  (diventa derivato da `quote_supplier_orders`). Va deciso se usarlo come
  cache "primo ordine" o smettere di leggerlo.
- Migrazioni idempotenti in `main.py` `_run_migrations()` (append-only,
  l'ordine conta — §0-quater).
- **Dati esistenti**: i preventivi attuali sono **prove cancellabili** →
  nessun backfill complicato; alla migrazione si può fare reset pulito dei
  preventivi di test (con backup DB WAL-aware prima, §2.E).

---

## 8. Impatti su zone esistenti

- **`quotes.py`**: `ensure_editable()`, transizioni di stato, auto-mark
  all'apertura (da riscrivere: apertura → `letto`, non più `completato`).
- **Dashboard (`dashboard.py`, ~8 query)**: KPI e analitiche usano lo stato e
  `material_ordered_at`; vanno rimappate sui nuovi stati (parte del blocco
  "redisegno stati", non prima).
- **Archivio (`QuoteArchivePage.tsx`)**: badge stato + nuova tabella
  espandibile.
- **`orders.py` / Ordini materiali**: aggregazione già per fornitore; da
  agganciare a `quote_supplier_orders` + CSV per fornitore.
- **Costanti stato** frontend (`constants.ts` `STATUS_LABELS/COLORS`).

---

## 9. Ordine di costruzione (blocchi)

Un blocco alla volta, con verifica (§7 CLAUDE.md) e commit separati:

1. **Evasione per fornitore**: tabella `quote_supplier_orders` + derivazione
   stato materiale (non_necessario/non_ordinato/parziale/totalmente_evaso) +
   regola "senza fornitore blocca la conferma".
2. **Export CSV materiali per fornitore** dallo screen Ordini materiali
   (scarico → marca coppie → aggiorna stato + notifica) + archivio.
3. **Tabella riepilogo espandibile** in Archivio (righe preventivo + vista
   articoli con materiale/tipo/misure/trattamenti/fornitore/stato).
4. **Redisegno stato lavorazione** (letto/confermato/completo + "Conferma
   preventivo" + blocco modifica + `quotes.confirm` + rimanda-in-bozza +
   annulla-conferma admin) — **blocco fragile**: migrazione, riscrittura
   workflow, remap dashboard. Piano dedicato prima di partire.
5. **Import CSV** ordini materiali — futuro, spec separata.

> Nota DRY: il CSV riusa `app/core/csv_import.py` `csv_export_response`
> (gemello di `csv_template_response`). Nessuna nuova infrastruttura CSV.
