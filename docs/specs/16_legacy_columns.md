# Archeologia DB — colonne legacy, campi deferred, campi rimossi

> Documento di sola consultazione storica. **Regola operativa**: la fonte di verità è `backend/app/models.py`. Le colonne SQLite presenti nel DB ma non mappate dal modello vanno trattate come inesistenti (non leggerle, non scriverle, non aggiungerle a query manuali).

Questo file consolida la "memoria archeologica" del DB MechQuote: cose che vivono ancora come colonne SQLite per scelte irreversibili (no DROP COLUMN su SQLite — vedi `CLAUDE.md` §6) ma che il codice Python non vede più, oltre a campi mappati ma intenzionalmente non letti dal cost engine.

---

## 1. Campi deferred (mappati nel modello, NON applicati nel calcolo)

Esistono come colonna + come attributo SQLAlchemy + spesso anche in UI, ma il cost engine li ignora. Sono dormienti in attesa di feature future (tipicamente import 2D/3D).

| Campo | Modello | UI che li compila | Letti da |
|---|---|---|---|
| `edm_coefficient` | `Material` | MaterialsPage | nessuno (riservato import 3D) |
| `cnc_machinability_coefficient` | `Material` | MaterialsPage | nessuno (riservato import 3D) |
| `setup_minimum_hours` | `Machine` | MachinesPage | solo wizard `apply-workflow` (NON cost engine) |
| `complexity_coefficient` | `StepColorRule` | StepColorRulesPage | nessuno (riservato import STEP) |
| `treatment_type` | `Treatment` | TreatmentsPage | nessuno (metadato descrittivo libero) |
| `material_id` | `EdmCutSpeed` | nessuna | nessuno (legacy pre-refactor famiglia, audit#1 sprint EDM 1.5) |

**Quando rimuoverli**: solo quando arriva la feature che li usa. Non aggiungere logica "se valorizzato applicalo" senza requisito esplicito — è la strada che li ha resi deferred.

---

## 2. Colonne legacy DB orfane (NON mappate dal modello)

Tabelle e colonne che esistono nel DB SQLite ma il modello SQLAlchemy non le tocca più. Restano per non perdere dati legacy e perché SQLite non supporta `DROP COLUMN`.

### Modulo Volumetric (prototipato Sprint 13/14, smontato)

- Tabella `operation_speeds`
- Tabella `operation_cycles`
- Tabella `operation_cycle_steps`
- Colonna `manufacturing_phases.input_volume_cm3`

> **Distinzione importante**: la tabella `operations` e la colonna `manufacturing_phases.operation_id`, nominate in commenti storici come "legacy volumetric", sono state **riattivate** dal refactor Operation. Oggi sono il catalogo Lavorazioni utente: vivi e referenziati dal modello.

### Refactor utensili (Sprint utensili)

- Colonna `tools.supplier_id` → sostituita da `tools.tool_supplier_id` (FK su nuova tabella `tool_suppliers`). La vecchia `supplier_id` resta nel DB ma il modello smette di leggerla.

### Audit#2 sprint 3 B1 (campi rimossi dal modello)

Colonne ancora presenti nel DB ma non più mappate da SQLAlchemy:
- `parts.rounding_rule`
- `parts.confidence_level`
- `manufacturing_phases.quantity_multiplier`
- `manufacturing_phases.margin_percent_override`
- `treatments.fixed_cost`
- `treatments.cost_per_part`
- `treatments.cost_per_surface_area`

---

## 3. Tabelle droppate (esistite, ora rimosse dal DB)

- `cost_rules` — sostituita da `CompanySettings` (singleton id=1). Drop esplicito eseguito in `_run_migrations`.

---

## 4. Riferimenti

- `CLAUDE.md` §6 — pattern migrazioni manuali, no DROP COLUMN
- `backend/app/main.py` — `_run_migrations()` con tutta la storia delle ALTER/CREATE
- `backend/app/models.py` — fonte di verità del modello attuale
