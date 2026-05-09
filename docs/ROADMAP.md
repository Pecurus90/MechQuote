# MechQuote — Roadmap

> **Diario di stato.** Cosa è fatto, cosa manca, in quale ordine. Aggiornare al chiudere ogni sprint significativo.

## Concetto fondamentale

MechQuote è uno strumento di **preventivazione interna** per officina meccanica di precisione. Il preventivo è il prodotto; la geometria (2D/3D) è un acceleratore per compilarlo più velocemente. Il "vero gestionale" che gestisce ordine/cliente/vinto-perso vive altrove — questo strumento traccia solo il ciclo di vita interno del preventivo.

Tre modalità target, tutte convergenti su `Quote → Parts → ManufacturingPhases`:

| Modalità | Input | Stato |
|----------|-------|-------|
| **Manuale** | Nessun file | ✅ Completo |
| **2D** | DXF (Wire EDM) | ✅ Completo per Wire EDM (parser + wizard + auto-calc tempi) |
| **3D** | STEP | 🔜 Modello dati pronto, parser non implementato |
| **Stampi/trance** | — | 🔜 Schema da progettare |

---

## ✅ Fatto (in produzione)

### Preventivazione manuale
- CRUD preventivi (single + commessa con N parti `_01…_NN`)
- Wizard: numero preventivo (CCC-YYCAT_PPP), cliente, data, margine globale
- Editor preventivo: parti, fasi, materiali, trattamenti
- Cost engine completo (backend autoritativo + preview live frontend identico)
  - Materiale: costo grezzo + spedizione + taglio + scrap (gemello DRY backend↔frontend)
  - Fasi: setup amortizzato + cycle × rate + fixed amortizzato + variable per pezzo
  - Trattamenti: cost_per_kg × peso totale, soglia minima
  - Totali: total_cost → unit_price (con margine) → total_price (× quantity)
  - Default operativi (margine, prezzo minimo, transport, packaging) applicati al create
- PDF export (cliente + interno) via Playwright/Chromium headless, dati azienda configurabili
- Archivio: filtro per anno + stato + ricerca per codice/cliente, paginato 20/pag
- Backup/restore completo (23 tabelle, payload Pydantic validato, ordine FK-safe)

### Preventivazione 2D — Wire EDM (nuovo)
- **Parser DXF** in-memory (`services/dxf_parser`): supporta LINE, ARC, CIRCLE, LWPOLYLINE, POLYLINE, ELLIPSE, SPLINE
- Stitching profili via union-find su endpoint condivisi (tolleranza configurabile)
- Endpoint `POST /api/dxf/analyze` (auth=`quotes.create`): ritorna profili (id, lunghezza, chiuso/aperto, bbox, SVG path), bbox globale, `n_closed_profiles`, `suggested_pierce`
- **Wizard "Nuovo Preventivo 2D"**: upload DXF → viewer SVG con click-to-toggle profili → form (cliente, materiale, altezza, ciclo EDM, modalità foratura) → crea quote+part+fase Wire EDM con tempi auto-calcolati
- **Cost engine EDM**: dato lunghezza × altezza × ciclo passate (rough/semi/finish) + N pierce, calcola `cycle_hours_per_part` automaticamente in `recalculate_part`. Lookup velocità per **famiglia materiale** (no FK a Material specifico): una riga famiglia copre tutti i materiali della stessa famiglia
- **Modalità foratura**: pre-fori (genera fase Foratura aggiuntiva con tempo da `DrillingTime[famiglia, Ø, h]`) o pierce diretto in EDM
- **Settings EDM**: 4 pagine (Velocità di taglio, Cicli di taglio, Tempi foratura, Parametri globali) — sotto-sezione sidebar dedicata
- **PhaseEditor**: blocco evidenziato con i 4 campi extra (lunghezza/altezza/ciclo/n_pierce) quando `phase_type=='wire_edm'`. `cycle_hours_per_part` read-only quando l'auto-calc è attivo + bottone "Modifica manualmente"

### Workflow stati interno (3 stati)
- `bozza → inviato → completato`
- Pulsante "Invia per revisione" (gating `quotes.send`)
- Auto-mark `completato` quando un utente con `quotes.complete` apre un `inviato`
- Lock post-invio: solo admin modifica preventivi non in bozza
- Eliminazione: solo creatore o admin
- Header con "Inviato da X · 2h fa" / "Completato da Y · 1g fa"

### RBAC dinamico
- Ruoli configurabili da UI (`Impostazioni → Sistema → Ruoli e Permessi`)
- 12 permessi keyed (dashboard, quotes.*, customers, settings, company, users, backup, notifications)
- `require_permission(key)` backend, `hasPermission(key)` frontend
- Anti-lockout per admin
- Bootstrap primo admin via script

### Notifiche in-app
- Sistema generico (`create_notification(...)`) estensibile a qualsiasi feature futura
- Trigger automatici: `quote_submitted` (broadcast a admin/amministrazione), `quote_completed` (1-a-1 al creatore)
- UNIQUE INDEX parziale anti-race su `quote_completed`
- Campanella in sidebar con badge polling 60s
- Pannello slide-in (via Portal, sopra qualsiasi pagina)
- Notifiche con `requires_action` + pulsante "Fatto ✓"
- Pulsante "Svuota lette" (per-utente, non rimuove globalmente)

### Dashboard
- KPI finanziari (valore totale, mese, trend, media)
- Grafico mensile multi-metrica (valore / margine / costo materiali / costo lavorazioni)
- Stato workflow globale (counts per stato)
- Sezioni di lavoro personali ("Le mie bozze", "I miei inviati") + "Da leggere" per chi ha `quotes.complete`
- Card "Attività recente" alimentata dalle notifiche personali

### Settings
- **Catalogo** (gating `settings`): Materiali, Macchine, Trattamenti, Template Fasi, Categorie
- **Wire EDM** (gating `settings`): Velocità di taglio, Cicli di taglio, Tempi foratura, Parametri globali
- **Azienda** (gating `company`): Dati Azienda + 4 default operativi
- **Sistema** (gating `users`/`backup`): Utenti, Ruoli e Permessi, Backup
- Sidebar riorganizzata: Operatività (Dashboard, Preventivazione, Clienti) + Impostazioni (collapse unico)

---

## 🔜 Prossime priorità

### Modalità 3D (STEP)
- Parsing STEP: bounding box, volume, area
- Riconoscimento colori facce → `StepColorRule` per suggerire fasi (tabella e API già pronte, `complexity_coefficient` già esposto in UI)
- Cablare `Material.edm_coefficient` / `Material.cnc_machinability_coefficient` (oggi esposti UI ma non applicati nel calcolo)
- Cablare `Machine.setup_minimum_hours` come pavimento per setup auto-calcolato
- Riattivare la NavLink "Colori STEP" in sidebar

### Wire EDM — affinamenti
- Estrarre diametro foro da CIRCLE entity nei profili chiusi (per pre-popolare `drill_diameter_mm`)
- Cache persistente del risultato `parse_dxf` (oggi è in-memory, ricomputata ad ogni open) — modello dedicato `DxfAnalysisCache`?
- Override per materiale specifico (oggi solo per famiglia) se servirà precisione su singoli inox/utensili

### Bounding box materiale grezzo (Step 4 originale)
Wizard 2D oggi popola raw_x/y/z da bbox globale DXF + altezza utente. Refinement:
- Offset configurabile (mm extra su X/Y per il ritaglio)
- Modalità tondo (Ø grezzo + lunghezza barra) come alternativa
- Suggerire automaticamente la modalità in base alla geometria (rapporto Y/X)

### Preventivazione stampi e trance lamiera
Modulo dedicato — schema da progettare. Possibilmente come `quote_type` aggiuntivo con campi specifici.

---

## 📋 Debito tecnico noto (gestito)

Lo stato post-audit (chiuso 2026-05-09):

- **Test automatici**: zero. Da affrontare prima di un deploy multi-cliente.
- **CI**: zero. Minimal: `tsc --noEmit` + backend startup OK su push a main.
- **Logging strutturato**: oggi nessuno (solo eccezioni in HTTP response). Per produzione: `logging` builtin + opzionalmente Sentry.
- **File frontend borderline**: `QuoteEditor` (601), `NewQuote2DPage` (592), `PhaseEditor` (557), `PartCard` (434). PartCard non estratto perché richiederebbe 8+ props (vedi CLAUDE.md §5).
- **Migrazioni manuali in `_run_migrations()`** (66 statement): riorganizzate in sezioni semantiche, ma nessun versioning Alembic. Ok per un'istanza singola; passare ad Alembic se nasce un team o un branch lungo.
- **`uploads/` non incluso nel backup**: il backup JSON contiene il record `PartFile` ma non il blob fisico. Per restore completo serve archivio zip (DB + uploads).
- **Notification/NotificationRead**: ephemeral, esclusi dal backup (decisione esplicita).

### Audit chiuso
4 sprint completati:

| Sprint | Fix | Riassunto |
|---|---|---|
| 1 | A1, A2, A3, B5, B6 | Backup/restore completo + Pydantic, mini-parser DXF rimosso, PDF labels coerenti |
| 2 | M1, M5, M4, M6 | Type re-definitions rimosse, calcMaterialCost backend (DRY), seed.py legacy droppato, GeometryAnalysis legacy droppato |
| 3 | B1, B2, B3, M2 | Campi DB dormienti rimossi, app/__init__.py svuotato, datetime.utcnow→utc_now, componenti oversize estratti |
| 4 | M3, M7 | Migrazioni riorganizzate in sezioni, Supplier vs MaterialSupplier documentato |

---

## 🎯 Pre-deploy checklist

Quando si decide di "spedire":
- [ ] Setup ambiente produzione (env vars, DB, ALLOWED_ORIGINS)
- [ ] SECRET_KEY reale settato (oggi `config.py` rifiuta startup se default + non-localhost)
- [ ] Backup automatico DB schedulato (oggi solo manuale via UI) + archivio uploads/
- [ ] Logging strutturato (almeno `logging` builtin + livello INFO)
- [ ] Test smoke su flussi critici (login, crea preventivo, invia, completa, PDF, wizard 2D)
- [ ] CI minimal (`tsc --noEmit` + backend startup) su push a main
- [ ] Documentazione di deploy (README aggiornato con istruzioni reverse proxy / SSL / first admin)
- [ ] `playwright install chromium` documentato come step di setup post-deploy (per PDF)
