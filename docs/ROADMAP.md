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

## Stato attuale (MVP 1 + MVP 3 parziale — completato)

### Funzionalità implementate
- CRUD completo: clienti, materiali (con fornitori materiali), macchine, fornitori, trattamenti
- QuoteEditor con wizard (numero preventivo, tipo single/commessa, cliente, data, margine)
- Tipi preventivo: `single` (1 parte) e `commessa` (N parti con suffisso `_01…_NN`)
- Categorie preventivo configurabili (A-G default, gestibili da Settings)
- Motore calcolo costi in tempo reale (frontend) + ricalcolo su salvataggio (backend)
- PDF export (cliente + interno), invio email
- Dashboard con KPI mensili
- Archivio preventivi con ricerca e filtri
- Backup e restore del database
- Impostazioni aziendali (nome, indirizzo, P.IVA, contatti per PDF)
- `quote_mode` per parte: `manual` / `dxf` / `step` / `mixed` (campo presente, non ancora usato dalla UI)
- Quote total con trasporto, imballaggio e sconto globale (barra inferiore del QuoteEditor)
- `minimum_price` esposto in UI (card parte, con avviso visivo quando attivo)
- Grezzo cilindrico: toggle quadrato/tondo, formula `π×r²×h×density` nel backend
- Phase templates: CRUD in Settings + pulsante "Da template" in PhaseEditor
- Auth JWT applicata a tutti gli endpoint (get_current_user dependency)
- CORS limitato tramite variabile d'ambiente `ALLOWED_ORIGINS`

---

## Gap rispetto alle spec

Le spec in `06_cost_engine_formulas.md` prevedono funzionalità non ancora implementate:

| Gap | Spec | Stato |
|-----|------|-------|
| Quote total con trasporto/imballo/sconto | `Σ(parti) + transport + packaging - discount` | ✅ Implementato |
| `minimum_price` esposto in UI | `max(cost, min) × (1 + margin)` | ✅ Implementato |
| Grezzo cilindrico | `π × (d/2)² × h × density` | ✅ Implementato |
| Phase templates | Applica template da QuoteEditor | ✅ Implementato |
| `complexity_coefficient` nelle fasi CNC | `cycle_h × qty × rate × complexity_coef` | Da fare — esporre come campo manuale nella fase |
| Coefficienti EDM (passate, materiale, precisione) | Tabella pass_coef 1.0/1.45/1.85/2.20 | Da fare — `CostRule` e `Material.edm_coefficient` esistono, non cablati |
| Grafico trend dashboard | Trend mensile/annuale | Da fare — endpoint `/dashboard/monthly` esiste, manca il grafico frontend |
| Regole di arrotondamento | 1/5/10/50 € | Da fare — campo `rounding_rule` in DB, nessuna logica |

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

Completato: quote total UI, minimum_price UI, phase templates, grezzo cilindrico.

Da implementare:

1. **Dashboard trend**
   - Grafico a barre: ultimi 12 mesi, totale preventivi + conteggio
   - L'endpoint `/api/dashboard/monthly` esiste già — serve solo il frontend (recharts o simile)

2. **Regole di arrotondamento**
   - Campo `rounding_rule` già in DB (`none` / `1` / `5` / `10` / `50`)
   - Logica: `unit_price` arrotondato al multiplo configurato dopo il calcolo margine
   - Va aggiunta in `services/calculation.py` e in `calcPartTotals()` nel frontend

3. **`complexity_coefficient` nelle fasi CNC**
   - Campo aggiuntivo sulla fase (`complexity_coefficient: float = 1.0`)
   - Formula: `cycle_h × qty × rate × complexity_coef`
   - Esposto come input numerico nella riga fase di `PhaseEditor`

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

## MVP pre-deploy — Sistema ruoli (RBAC)

**Obiettivo:** prima di distribuire l'app in azienda, controllare chi può fare cosa.
Priorità: **dopo MVP 2 (DXF), prima del deploy multi-utente**.

### Ruoli

| Ruolo | Preventivi | Archivio | Dashboard | PDF | Impostazioni | Utenti |
|-------|-----------|----------|-----------|-----|-------------|--------|
| `admin` | CRUD | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ufficio_tecnico` | CRUD | ✓ | ✓ | ✓ | ✗ | ✗ |
| `officina` | read-only | ✓ | ✗ | ✓ | ✗ | ✗ |
| `amministrazione` | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |

### Backend

1. `users.role VARCHAR(20) DEFAULT 'admin'` — migration in `_run_migrations()`
2. `require_role(*roles)` — dependency factory da applicare agli endpoint protetti:
   - Endpoint Settings (machines, materials, suppliers, treatments, cost-rules, phase-templates): solo `admin`
   - DELETE preventivi: `admin`, `ufficio_tecnico`
   - Backup/restore: solo `admin`
3. `GET /api/auth/me` già esiste — aggiungere `role` nella risposta
4. `POST /api/users` + `PUT /api/users/{id}` + `DELETE /api/users/{id}`: solo `admin`

### Frontend

1. `AuthContext` + `useAuth()` hook — salva `{ username, role }` dopo il login (da `/api/auth/me`)
2. Sidebar: filtra voci in base al ruolo dell'utente loggato
3. `<ProtectedRoute roles={['admin']}>` — wrappa le rotte protette in `App.tsx`
4. Pagina "Gestione Utenti" in Settings (solo admin): lista utenti, crea/modifica/elimina, assegna ruolo
5. Pagine Settings nascoste completamente per ruoli non-admin

---

## MVP 7 — Preventivo stampi e trance lamiera

**Obiettivo:** supportare la preventivazione di stampi per pressofusione e trance per lamiera —
categorie di lavoro distinte da CNC/EDM con la propria logica di costo.

### Stampi (die casting / injection mould)
- Quote type: `stampo`
- Fasi tipiche: fresatura cavità, EDM a tuffo, lucidatura, assemblaggio
- Campo aggiuntivo: `mould_shots` (vita utile stampo) — influenza ammortamento
- Configurazione materiali stampo separata (acciaio per stampi H13, P20, ecc.)

### Trance lamiera (progressive dies / blanking dies)
- Quote type: `trancia`
- Fasi tipiche: fresatura piastre, EDM filo profili, rettifica, assemblaggio
- Collegamento al modulo 2D (MVP 2): profili DXF → lunghezze taglio EDM/wire
- Numero di stazioni configurabile

### Note implementative
- Entrambi convergono nella struttura `Quote → Parts → ManufacturingPhases` esistente
- Aggiungere `quote_type` values al DB (`stampo`, `trancia`) senza breaking changes
- Valutare se serve una category separata nel numero preventivo (es. lettera S per stampi)

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
