# Audit uso + DRY — MechQuote

> Audit read-only (codice morto + duplicazione/DRY), 2026-09-02. Metodo:
> workflow multi-agente a fasi (6 mappatori per layer → verificatore
> avversariale per candidato → sintesi). 45 candidati, 6 confermati, 36
> refutati, 2 incerti, 1 non verificato. Complementare a `METODO_AUDIT.md`
> (che copre la correttezza, non l'uso/DRY).

## Sintesi

| Categoria | Conteggio |
|---|---|
| CONFERMATI (problemi reali) | 6 |
| REFUTATI (falsi positivi scartati) | 36 |
| INCERTI (da guardare a mano) | 2 |
| NON VERIFICATI (secondo giro) | 1 |

I problemi reali sono **piccoli e localizzati**. Nessun bug di calcolo, nessun
endpoint rotto, nessuna divergenza di prezzo backend↔frontend. Resta debito DRY
leggero (formattatori copia-incollati) + un pugno di codice morto. L'unica voce
con impatto sull'utente è `fmtUnitPrice` (prezzi unitari troncati a 2 decimali
contro il fix C4).

## Codice morto rimovibile (CONFERMATI unused)

| Superficie | file:line | Gravità | Azione |
|---|---|---|---|
| Endpoint `GET /officina/categories` | `backend/app/api/officina.py:101-112` | BASSA | Rimuovere: nessun chiamante; il frontend usa solo `/categories-full`. |
| Campo `top_suppliers` (`StatsSupplierRow`) | `frontend/src/types/index.ts:832` (+ `MaterialsStats:864`, `ToolsStats:894`; `schemas.py:952,985`; `dashboard.py:954,1165`) | BASSA | Calcolato ma mai renderizzato: rimuovere da tipi + schemi + query. **Prima: decisione di prodotto (residuo o feature da finire?).** |
| `fmtUnitPrice` (via conservativa) | `frontend/src/lib/utils.ts:12` | BASSA | Alternativa: se "2 decimali è la norma", rimuoverlo come morto. Vedi §fmtUnitPrice. |

## Duplicazioni da unificare (CONFERMATI duplicate)

### 1. `dateShort` — data corta IT (MEDIA)
5 copie: `DirectSalesPage.tsx:12`, `OrderHistoryView.tsx:82`,
`MaterialOrdersView.tsx:102`, `QuotesListView.tsx:109`, `QuotesDataTable.tsx:22`.
→ Centralizzare in `lib/utils.ts` come `dateShort(iso: string | null)` (variante
nullable con fallback `—`), rimuovere le 5 copie.

### 2. `eur2` — euro 2 decimali (BASSA)
4 copie identiche: `PartCostSummary.tsx:34`, `QuoteArticleRows.tsx:32`,
`QuotesDataTable.tsx:18`, `CommessaSummaryTable.tsx:31`. +1 variante voluta senza
`€ ` in `PhaseListView.tsx:78` (da lasciare/rinominare locale).
→ Unificare le 4 in `lib/utils.ts`.

### 3. `fmtUnitPrice` — incoerenza prezzo unitario (MEDIA, tocca l'utente)
Definito in `lib/utils.ts:12` ma **mai usato**; i punti che mostrano `unit_price`
usano `eur2()` → troncano a 2 decimali (`PartCostSummary.tsx:148`,
`CommessaSummaryTable.tsx:92`). Il fix C4 (commit `fa4594d`) voleva fino a 4
decimali quando significativi. Integrazione rimasta a metà.
→ **Decisione di prodotto**: usare `fmtUnitPrice` (2 punti) oppure rimuoverlo.

### 4. `MaterialAlias` — tipo definito due volte (MEDIA)
`types/index.ts` righe 105-108 `{id, csv_name}` (mai usata) e 131-136
`{id, csv_name, material_id, material_name}` (usata). → Tenere la completa,
rimuovere la lightweight; se serve, `MaterialAliasBrief` (nome esplicito).

## Incoerenze / da guardare (INCERTI)

| Voce | file:line | Nota |
|---|---|---|
| `eur0` (euro 0 dec) | `QuoteEditor.tsx:25` + 5 file | 6 copie: verificare se identiche → `fmtPrice0Decimals`, o variante UX distinta (vedi refutato `eur`). |
| `kg` (peso) | `StatisticsPage.tsx:45` + `OrdersMaterialsPage.tsx:28` | 2 copie stessa firma: se identiche centralizzare come `fmtKg`. |

## Falsi positivi scartati (con motivo) — non ri-segnalare

- **smart/dumb**: `QuotesListView` (pages/) importato dal container come `QuotesListTable`.
- **Endpoint con proposito distinto** (tutti usati): `GET /api/quotes` (test e2e; diverso da `list_archive`), `GET /quotes/{id}/version` (polling concorrenza M6), `POST /parts/{id}/phases/reorder`, `GET /quotes/{id}/material-detail`, `POST /parts/{id}/clone-onto`, `POST /orders/materials/from-file/parse`, alias CRUD, `POST /dxf/analyze`, `POST /quotes/{id}/apply-margin`, `DELETE /parts/{id}`, `GET /quotes/years`, `POST /officina/heat-treatments`, `GET /orders/materials/quote/{id}/csv`, `POST /workflow-templates`, `POST /users`, `GET /dashboard/queue-counts`, `POST /tools/scan`, `DELETE /orders/{id}`.
- **Funzioni peso domini diversi**: `_estimate_weight_kg`, `_request_item_weight_kg` (supporta tubo), `raw_weight_kg` (puro, cost engine) — non unificabili (spec 17 F2; `orders.py` non importa da `calculation.py`).
- **Tipi via API**: `ToolLowStockPreview*`, `StatsCountPoint`, `StatsLeadTimePoint`, `StatsMaterialSupplierRow`, `StatsMaterialRow` (renderizzati; solo `StatsSupplierRow` è orfano).
- **Formattatori con semantica distinta**: `eur`/`eur0`/`eurSigned`, `pct`, `num` (propositi diversi, non unificabili a forza).

## Non verificati (secondo giro)

| Voce | file | Nota |
|---|---|---|
| `eur0` | `pages/dashboard/QuoteTable.tsx` | Oltre il cap. Da chiudere col cluster `eur0` incerto. |

## Raccomandazione — da quale modulo partire coi deep-dive

**Statistiche** (`StatisticsPage.tsx` + `dashboard.py` get_*_stats + tipi `Stats*`):
1. unico modulo con codice morto in catena completa (`top_suppliers`);
2. concentra più tipi `Stats*` a bassa visibilità (mappare una volta cosa è reso);
3. ci vivono gli INCERTI `kg`/`eur0`;
4. rischio basso e isolato (nessuna zona fragile §0-quater).

Ordine suggerito: **1) Statistiche** (rimuovi `top_suppliers`, chiudi `kg`/`eur0`,
mappa tipi `Stats*`) · **2) Prezzi/format preventivi** (decidi `fmtUnitPrice` 2/4
dec, poi unifica `dateShort`/`eur2`) · **3) Tipi condivisi** (dedup `MaterialAlias`)
· **4) Officina** (rimuovi endpoint morto). Tutto in commit piccoli e separati.

### Due decisioni di prodotto da prendere prima di agire
- **(a)** Prezzo unitario: **2 o 4 decimali** quando significativi? (`fmtUnitPrice`)
- **(b)** `top_suppliers`: **residuo da rimuovere** o **feature da completare** (grafico top fornitori nelle Statistiche)?
