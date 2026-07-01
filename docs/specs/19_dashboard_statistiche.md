# 19 — Dashboard + Statistiche (Job B)

> **Stato**: spec proposta (2026-07-01), non ancora implementata. Da approvare
> prima di scrivere codice. Segue Spec 18 (stati preventivo + ordini materiale).

## 0. Obiettivo

Arricchire le **Statistiche** (già 3 tab: Preventivi / Materiali / Utensili) e
**allineare la Dashboard** ai nuovi stati (spec 18). Nessuna ricostruzione: si
aggiungono KPI, grafici e breakdown ai contenitori esistenti.

Base già presente (da tenere):
- `StatisticsPage` con 3 tab + selettore periodo (`year|12m|prev_year|all`).
- `/dashboard/statistics` → trend €/mese (std vs stampi), top clienti, per
  categoria, margine mensile.
- `/dashboard/statistics/orders-materials` → trend ordini/mese, top fornitori
  (n° preventivi), lead time confermato→ordine.
- `/dashboard/statistics/tools` → trend ordini/mese, top fornitori, top utensili
  (quantità).

Principi: utensili = **solo quantità, nessun costo** (richiesta utente);
riuso helper esistenti (`_estimate_weight_kg`, `_period_range`); un endpoint
per tab (mini-app), schema `Base/Out` in `schemas.py`, tipo TS in `types`.

**Filtrabilità (richiesta utente):** ogni tab filtrabile oltre al periodo, con
i filtri pertinenti al suo dominio — Preventivi: **tipo + cliente**; Materiali:
**fornitore + tipo materiale**; Utensili: **fornitore + tipo utensile**. I
grafici usano **barre e donut (anello) con colori distinti** (palette
`CATEGORY_COLORS` in `statsShared`).

---

## 1. Tab PREVENTIVI — panoramica generale

Aggiunte a `/dashboard/statistics` (stesso endpoint, campi nuovi nello schema):

### 1a. KPI in cima (nuovi)
- **N° preventivi** nel periodo (totale) + split **Standard / Stampi**.
- **€ preventivato** totale nel periodo.
- **Margine medio** periodo (già calcolato, esposto anche come KPI).

### 1b. Distribuzione ore (nuovo — il cuore della richiesta)
Da `ManufacturingPhase` delle parti dei preventivi **standard** nel periodo
(per `quote_date`). Ore fase = `setup_hours + cycle_hours_per_part × part.quantity`.
- **Ore per macchina** (bar orizzontale): Σ ore raggruppate per `machine.name`
  (NULL → "Senza macchina").
- **Ore per lavorazione** (bar orizzontale): Σ ore raggruppate per
  `operation.name` (NULL → "Senza lavorazione").

> Gli stampi non hanno fasi di lavorazione standard → esclusi da questo grafico.

### 1c. Filtri
- Periodo (già presente).
- **Tipo** (nuovo, opzionale): Tutti / Standard / Stampi — applicato ai grafici
  €/count (le ore restano standard-only per natura).

Restano: trend €/mese, top clienti, per categoria, margine mensile.

---

## 2. Tab MATERIALI — costi, kg, spedizioni, per fornitore/materiale

Aggiunte a `/dashboard/statistics/orders-materials`. Fonte: le coppie
**`quote_supplier_orders`** emesse nel periodo (per `ordered_at`), con le parti
"da ordinare" del relativo fornitore. Aggregazione in **Python** riusando
`_estimate_weight_kg` (peso = volume × densità × qty) e `part.material_cost`.

### 2a. KPI in cima (nuovi)
- **Costo materiale** totale (€) = Σ `part.material_cost × part.quantity` sulle
  parti ordinate nel periodo.
- **Peso totale** (kg) = Σ `_estimate_weight_kg(part)`.
- **Spedizioni** (€) = Σ `material_supplier.shipping_cost` per ogni ordine
  emesso nel periodo (un `MaterialOrder` = un fornitore = una spedizione).
- **N° ordini** materiale nel periodo.

### 2b. Per fornitore (tabella/bar) — "quale fornitore"
Per `material_supplier`: € materiale · kg · € spedizione · n° ordini. Ordinato
per € materiale desc.

### 2c. Per materiale (tabella/bar) — "quale materiale"
Per `material`: € totale · kg · n° righe (quante volte ordinato). Top 10 per €.

Restano: trend ordini/mese, lead time confermato→ordine. (Top fornitori per n°
preventivi → assorbito da 2b, che è più ricco: valutare se rimuoverlo.)

---

## 3. Tab UTENSILI — solo quantità

Aggiunte a `/dashboard/statistics/tools` (nessun costo, per scelta):

### 3a. KPI in cima (nuovi)
- **N° ordini** utensili nel periodo.
- **Quantità totale** ordinata (Σ `quantity_to_order`).
- **Utensili distinti** ordinati.

### 3b. Quantità per tipo (nuovo)
Bar: Σ `quantity_to_order` per `tool_type_snapshot` (NULL → "Senza tipo").

Restano: trend ordini/mese, top fornitori, top 10 utensili per quantità.

---

## 4. DASHBOARD — allineamento ai nuovi stati

La dashboard oggi ha: chip stati (già a 4: Bozze / In revisione / Confermati /
Completi, dal Blocco 4), sezioni "I miei preventivi" e "Da revisionare", alert.

Aggiunte/aggiustamenti:
- **Sezione "Da confermare"** (per chi ha `quotes.confirm`): preventivi in
  `inviato`/`letto`, link alla riga → apre il preventivo; "vedi tutti" →
  `/quotes/active?status=inviato` (o letto). Rimpiazza/estende l'attuale
  "Da revisionare" (che oggi mostra solo `inviato`).
- **Sezione "Confermati in attesa materiale"** (nuovo): preventivi `confermato`
  con stato materiale ≠ evaso/non necessario → link a `/quotes/active?status=confermato`.
  Backend: nuovo mini-endpoint o riuso `my-quotes`/`to-review` con filtro.
- Gli alert e i KPI restano; il conteggio "confermati senza ordine materiale"
  (già rimappato nel Blocco 4) alimenta questa sezione.
- I chip e le sezioni **linkano alla nuova pagina "Preventivi in corso"** (Job
  A) filtrata per stato, non più solo all'archivio.

---

## 5. Backend — riepilogo modifiche

- `dashboard.py`:
  - `get_statistics`: + KPI counts (std/dies/€), + query ore per macchina e per
    lavorazione (JOIN parts→phases→machines/operations, filtro periodo + non-die).
  - `get_materials_stats`: + aggregazione Python costi/kg/spedizioni + breakdown
    per fornitore e per materiale (da `quote_supplier_orders` + parts + supplier).
  - `get_tools_stats`: + KPI quantità + breakdown per tipo.
  - `get_to_review` / nuove sezioni dashboard per gli stati letto/confermato.
- `schemas.py`: estendere `StatisticsOut`, `MaterialsStatsOut`, `ToolsStatsOut`
  con i nuovi campi (KPI + nuovi array); nuovi `StatsHoursRow`,
  `MaterialsBySupplierRow`, `MaterialsByMaterialRow`, `ToolsByTypeRow`.
- Nessuna migrazione (nessun campo DB nuovo): tutto derivato da dati esistenti.

## 6. Frontend — riepilogo modifiche

- `types/index.ts`: estendere `Statistics`, `MaterialsStats`, `ToolsStats`.
- `QuotesStatsTab`: KPI row + 2 grafici ore + filtro tipo.
- `MaterialsStatsTab`: KPI row + tabella/bar per fornitore + per materiale.
- `ToolsStatsTab`: KPI row + bar per tipo.
- `statsShared`: eventuale componente KPI-card riusabile (piccolo).
- `DashboardLists` / `DashboardPage`: sezione "Da confermare" + "Confermati in
  attesa materiale", link a `/quotes/active`.

## 7. Ordine di costruzione (sotto-blocchi, uno alla volta)

1. **B1 — Statistiche Preventivi** (KPI + distribuzione ore + filtro tipo).
2. **B2 — Statistiche Materiali** (KPI costi/kg/spedizioni + per fornitore/materiale).
3. **B3 — Statistiche Utensili** (KPI quantità + per tipo).
4. **B4 — Dashboard** (sezioni nuove + link a Preventivi in corso).

Ogni sotto-blocco: verifica §7 (tsc, startup, eventuali test) e commit separato.

## 8. Decisioni aperte (da confermare prima di partire)

1. **Ore**: raggruppo per **macchina** e per **lavorazione** (2 grafici) — ok?
   Oppure ne vuoi solo uno / un'altra dimensione (es. per fase)?
2. **Materiali**: i 4 KPI (costo €, kg, spedizioni €, n° ordini) + breakdown per
   fornitore e per materiale coprono quello che intendi? Manca qualcosa (es.
   costo taglio grezzo separato)?
3. **Materiali**: il "costo" è il **costo materiale del preventivo**
   (`part.material_cost`, quello che paghiamo il grezzo), non il prezzo di
   vendita — confermi?
4. **Filtro tipo** nel tab Preventivi: lo aggiungo o basta il periodo?
5. **Dashboard**: le sezioni "Da confermare" e "Confermati in attesa materiale"
   linkano alla pagina **Preventivi in corso** filtrata — ok?
