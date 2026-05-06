# MechQuote — Roadmap

## Concetto fondamentale

MechQuote è uno strumento di preventivazione. Il preventivo è il prodotto; la geometria (2D/3D) è solo un acceleratore per compilarlo più velocemente.

Ci sono **tre modalità di preventivo**, tutte convergenti nella stessa struttura `Quote → Parts → ManufacturingPhases`:

| Modalità | Input | Come accelera il preventivo |
|----------|-------|----------------------------|
| **Manual** | Nessun file | L'operatore inserisce le fasi a mano |
| **2D** | DXF o DWG | Profili estratti → lunghezza calcolata → alimenta qualsiasi operazione 2D (EDM, laser, waterjet, rettifica…) |
| **3D** | STEP | Bounding box + colori + feature → fasi suggerite → operatore revisa |

Il ciclo di lavorazione (`ManufacturingPhase[]`) ha **sempre la stessa struttura**, indipendentemente dalla modalità. La geometria pre-compila valori; l'operatore può sempre sovrascriverli.

---

## Stato attuale (MVP 1 — completato)

### Funzionalità implementate
- CRUD completo: clienti, materiali, macchine, fornitori, trattamenti
- QuoteEditor con wizard (numero preventivo, tipo single/commessa, cliente, data, margine)
- Tipi preventivo: `single` (1 parte) e `commessa` (N parti con suffisso `_01…_NN`)
- Categorie preventivo configurabili (A-G default, gestibili da Settings)
- Motore calcolo costi in tempo reale (frontend) + ricalcolo su salvataggio (backend)
- PDF export, invio email
- Dashboard con KPI e lista preventivi recenti
- Archivio preventivi
- Backup e restore del database
- Impostazioni aziendali (nome, logo per PDF)
- `quote_mode` per parte: `manual` / `dxf` / `step` / `mixed` (campo presente, non ancora usato dalla UI)

---

## Gap rispetto alle spec (da chiudere in MVP 3)

Le spec in `06_cost_engine_formulas.md` prevedono funzionalità non ancora implementate:

| Gap | Spec | Stato |
|-----|------|-------|
| Quote total con trasporto/imballo/sconto | `Σ(parti) + transport + packaging - discount` | Campi in DB, non in UI né nel calcolo |
| `minimum_price` esposto in UI | `max(cost, min) × (1 + margin)` | Usato in backend, non visibile in QuoteEditor |
| `complexity_coefficient` nelle fasi CNC | `cycle_h × qty × rate × complexity_coef` | Non implementato — da esporre come campo manuale per ora |
| Grezzo cilindrico | `π × (d/2)² × h × density` | Solo rettangolare implementato |
| Coefficienti EDM (passate, materiale, precisione) | Tabella pass_coef 1.0/1.45/1.85/2.20 | `CostRule` e `Material.edm_coefficient` esistono, non cablati |
| Phase templates | Applica template da QuoteEditor | Modello `PhaseTemplate` esiste, nessuna UI |
| Grafico trend dashboard | Trend mensile/annuale | Non implementato |
| Regole di arrotondamento | 1/5/10/50 € | Campo `rounding_rule` in DB, nessuna logica |

---

## MVP 2 — Modulo 2D (DXF/DWG)

**Obiettivo:** caricare un file 2D, estrarre i profili, usare la geometria per calcolare qualsiasi operazione che richieda una lunghezza di taglio.

Il modulo 2D non è "il modulo EDM" — è il modulo di geometria 2D. I profili estratti alimentano:
- EDM a filo (lunghezza × altezza × coefficienti)
- Taglio laser (lunghezza × parametri macchina)
- Taglio waterjet (lunghezza × parametri)
- Rettifica di profilo (lunghezza × passate)
- Qualsiasi fase futura che usi una lunghezza contorno

### Backend

**`POST /api/parts/{id}/upload-dxf`**
- Riceve file `.dxf` (o `.dwg` → conversione a DXF tramite tool)
- Usa `ezdxf` (già installato) per estrarre: `LINE`, `ARC`, `CIRCLE`, `LWPOLYLINE`, `POLYLINE`, `SPLINE` (approssimata)
- Classifica contorni: aperti / chiusi
- Calcola lunghezza per ogni contorno
- Genera SVG preview
- Rileva warning: profili aperti, spline non supportate, entità duplicate, segmenti molto piccoli
- Salva in `GeometryAnalysis`: `dxf_total_length_mm`, `dxf_profile_count`, `warnings_json`

**`POST /api/parts/{id}/calculate-2d-operation`**
- Input: profili selezionati, altezza pezzo, tipo operazione, macchina, parametri specifici (es. numero passate per EDM)
- Restituisce costo calcolato + parametri editabili
- Crea fase `ManufacturingPhase` pre-compilata
- L'operatore può modificare tutti i valori prima di confermare

### Frontend

Sezione "File 2D" nella card parte del QuoteEditor:
- Drag & drop o file picker per `.dxf` / `.dwg`
- SVG preview con contorni colorati (chiuso = verde, aperto = arancio)
- Lista contorni: lunghezza, tipo (aperto/chiuso), checkbox selezione
- Dopo selezione profili: form con
  - Altezza pezzo (mm)
  - Tipo operazione (EDM filo, laser, waterjet, rettifica profilo, altro)
  - Macchina → pre-compila tariffa
  - Parametri specifici dell'operazione (es. numero passate se EDM)
  - Setup hours
  - Costo start hole se EDM con fori interni
- Preview costo → pulsante "Aggiungi fase"
- Warning visibili (profili aperti, ecc.)

### Seed dati necessari per EDM
```
CostRule: edm_pass_coef_1 = 1.00
CostRule: edm_pass_coef_2 = 1.45
CostRule: edm_pass_coef_3 = 1.85
CostRule: edm_pass_coef_4 = 2.20
```

---

## MVP 3 — Completamento calcolo manuale

**Obiettivo:** chiudere i gap della tabella sopra senza nuove dipendenze esterne.

1. **Quote total con trasporto/imballo/sconto**
   - Sezione "Riepilogo" in fondo a QuoteEditor
   - Formula: `totale = Σ(parti) + trasporto + imballaggio - (Σ(parti) × sconto/100)`
   - Nuovo `recalculate_quote()` in `services/calculation.py`

2. **`minimum_price` in UI**
   - Campo "Prezzo minimo (€)" nella card parte, accanto al margine

3. **Phase templates**
   - Pagina `Settings > Template di fase` (CRUD inline, stesso pattern di `QuoteCategoriesPage.tsx`)
   - Pulsante "Da template" in `PhaseEditor` → modal lista template → aggiunge fase pre-compilata

4. **Grezzo cilindrico**
   - Toggle "Cilindrico" nella sezione dimensioni grezzo
   - Campi: diametro + lunghezza al posto di X/Y/Z
   - Formula: `π × (d/2)² × h / 1_000_000 × density × cost_per_kg × (1 + scrap/100)`

5. **Dashboard trend**
   - Grafico a barre: ultimi 12 mesi, totale preventivi + conteggio

---

## MVP 4 — Modulo 3D base (STEP)

**Obiettivo:** caricare un STEP, estrarre bounding box e peso, pre-compilare il grezzo.

**Dipendenza da valutare:**
- `pythonocc-core` (OpenCascade, ~300 MB) — completo
- `cadquery` (~100 MB) — API più semplice
- Parser minimo custom — solo bbox, nessuna dipendenza

Passi:
1. `POST /api/parts/{id}/upload-step` → salva file + estrae bbox + volume + peso
2. Pre-compila `raw_x/y/z_mm`, `raw_weight_kg`, `finished_weight_kg` sul Part
3. Frontend: mostra dimensioni estratte nella sezione parte, tutte editabili

---

## MVP 5 — Modulo 3D smart

**Obiettivo:** da STEP con colori → fasi di lavorazione suggerite + profili EDM estraibili.

Passi:
1. Estrazione colori STEP → lookup in `StepColorRule`
2. Profili EDM nel STEP → estratti come contorni 2D → stesso workflow MVP 2
3. Stima tempi CNC con tabella MRR configurabile
4. Auto-generazione fasi proposte con `confidence_level`
5. UI: lista fasi suggerite con checkbox → modifica → conferma

---

## MVP 6 — Gestione magazzino utensili

**Obiettivo:** inventario utensili con lettura barcode, giacenza minima, notifica settimanale in-app.

### Flusso
- Operatore scansiona codice a barre con pistola → aggiunge o rimuove unità dalla giacenza
- Ogni utensile ha una giacenza minima configurabile
- Una volta a settimana (job schedulato) → controlla giacenze sotto soglia → genera notifica in-app
- Le notifiche appaiono in una **sezione Notifiche** dedicata nell'app (accessibile dalla sidebar)
- Rimangono visibili finché non vengono marcate come lette — persistono nel DB
- Badge con contatore nella sidebar per notifiche non lette

### Modello dati da aggiungere
```
Tool
  - id, code (barcode), name, description
  - category, unit_of_measure
  - current_quantity, minimum_quantity
  - location (scaffale/cassetto)
  - notes, active

ToolMovement
  - id, tool_id, timestamp
  - movement_type: "in" | "out" | "adjustment"
  - quantity, operator_notes

Notification
  - id, type, message, created_at, read_at
```

### Note implementative
- Il backend espone endpoint `POST /api/tools/scan` che riceve un barcode e restituisce l'utensile
- Il frontend deve supportare input rapido da tastiera (la pistola barcode simula tastiera)
- Il job settimanale può essere un semplice cron o un endpoint chiamato da cron OS
- Nessuna integrazione ERP — solo tracciamento interno

**Questo modulo è indipendente dal preventivo** — può essere sviluppato in parallelo o dopo MVP 5.

---

## Regola d'implementazione

> Ogni nuovo modulo si innesta nell'architettura `Part + Phase` esistente.  
> La geometria (2D/3D) pre-compila valori; l'operatore decide sempre.  
> Il modo manuale è sempre disponibile e deve rimanere funzionante.
