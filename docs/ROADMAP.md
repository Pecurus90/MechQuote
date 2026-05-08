# MechQuote — Roadmap

> **Diario di stato.** Cosa è fatto, cosa manca, in quale ordine. Aggiornare al chiudere ogni sprint significativo.

## Concetto fondamentale

MechQuote è uno strumento di **preventivazione interna** per officina meccanica di precisione. Il preventivo è il prodotto; la geometria (2D/3D) sarà un acceleratore per compilarlo più velocemente. Il "vero gestionale" che gestisce ordine/cliente/vinto-perso vive altrove — questo strumento traccia solo il ciclo di vita interno del preventivo.

Tre modalità target, tutte convergenti su `Quote → Parts → ManufacturingPhases`:

| Modalità | Input | Stato |
|----------|-------|-------|
| **Manuale** | Nessun file | ✅ Completo |
| **2D** | DXF/DWG | 🔜 In arrivo (parsing presente, autocompilazione no) |
| **3D** | STEP | 🔜 In arrivo (modello dati pronto, import non implementato) |

---

## ✅ Fatto (in produzione)

### Preventivazione manuale
- CRUD preventivi (single + commessa con N parti `_01…_NN`)
- Wizard: numero preventivo (CCC-YYCAT_PPP), cliente, data, margine globale
- Editor preventivo: parti, fasi, materiali, trattamenti
- Cost engine completo (backend autoritativo + preview live frontend identico)
  - Materiale: costo grezzo + spedizione + taglio + scrap
  - Fasi: setup amortizzato + cycle × rate + fixed amortizzato + variable per pezzo
  - Trattamenti: cost_per_kg × peso totale, soglia minima
  - Totali: total_cost → unit_price (con margine) → total_price (× quantity)
  - Default operativi (margine, prezzo minimo, transport, packaging) applicati al create
- PDF export (cliente + interno) con dati azienda configurabili
- Archivio: filtro per anno + stato + ricerca per codice/cliente, paginato 20/pag
- Backup/restore database

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
- **Azienda** (gating `company`): Dati Azienda + 4 default operativi
- **Sistema** (gating `users`/`backup`): Utenti, Ruoli e Permessi, Backup
- Sidebar riorganizzata: Operatività (Dashboard, Preventivazione, Clienti) + Impostazioni (collapse unico)

---

## 🔜 Prossime priorità

### Modalità 2D (DXF)
- Parsing DXF: lunghezza profili totale, conteggio entità (già presente in `parts.py upload_file`)
- UI: selezione profili dalla preview → assegnazione operazioni 2D (EDM filo, laser, waterjet, rettifica profili)
- Autocompilazione tempi fase (cycle_hours) da `dxf_total_length / velocità_macchina`
- Cablare `Material.edm_coefficient` e `Material.cnc_machinability_coefficient` nel calcolo

### Modalità 3D (STEP)
- Parsing STEP: bounding box, volume, area
- Riconoscimento colori facce → `StepColorRule` per suggerire fasi (tabella e API già pronte)
- Aggiungere `complexity_coefficient` a `ManufacturingPhase` (modello + UI + formula)
- Aggiungere `Machine.setup_minimum_hours` come pavimento per setup auto-calcolato
- Riattivare la NavLink "Colori STEP" in sidebar

### Cost engine — campi deferred
Quando arrivano DXF/STEP, cablare:
- `Part.rounding_rule` su `unit_price` (none / 1€ / 5€ / 10€ / 50€)
- `Treatment.cost_per_part` (forfait per pezzo)
- `Treatment.cost_per_surface_area` (per m², richiede `GeometryAnalysis.surface_area_mm2`)
- `Treatment.fixed_cost` (oggi usato come "spedizione fornitore" nelle fasi, ma il campo del modello Treatment in sé non è usato)

### Preventivazione stampi e trance lamiera
Modulo dedicato — schema da progettare. Possibilmente come `quote_type` aggiuntivo con campi specifici.

---

## 📋 Debito tecnico noto (gestito)

- `QuoteEditor.tsx` ~640 righe, 14 useState — refactor opportuno (estrarre Header / Sidebar / Footer / `useQuoteEditing` hook). Non urgente.
- `dashboard.py` `get_monthly` carica tutto in RAM e fa loop in Python. Per <10k preventivi accettabile; oltre serve query SQL aggregata.
- Zero test automatici. Zero CI. Da affrontare prima di un deploy multi-cliente.
- Logging strutturato assente (oggi solo print/warnings). Per produzione: `logging` builtin + opzionalmente Sentry.
- `playwright` in `requirements.txt` da verificare se serve davvero (PDF è generato da WeasyPrint? Ricontrollare).

---

## 🎯 Pre-deploy checklist

Quando si decide di "spedire":
- [ ] Setup ambiente produzione (env vars, DB, ALLOWED_ORIGINS)
- [ ] SECRET_KEY reale settato (oggi `config.py` rifiuta startup se default + non-localhost)
- [ ] Backup automatico DB schedulato (oggi solo manuale via UI)
- [ ] Logging strutturato (almeno `logging` builtin + livello INFO)
- [ ] Test smoke su flussi critici (login, crea preventivo, invia, completa, PDF)
- [ ] CI minimal (`tsc --noEmit` + backend startup) su push a main
- [ ] Documentazione di deploy (README aggiornato con istruzioni reverse proxy / SSL / first admin)
