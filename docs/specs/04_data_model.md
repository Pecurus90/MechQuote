# Data Model

> ⚠️ **DRIFT documentato** (CLAUDE.md §12). Questo doc non include:
> `Role` / `RolePermission`, `Notification` / `NotificationRead`,
> `CompanySettings` (singleton), `ToolType` / `ToolBrand` /
> `ToolLocation` (catalogo attributi), `ToolSupplier`, `ToolOrder` /
> `ToolOrderItem`, `MaterialOrder` / `MaterialOrderQuote`,
> `WorkflowTemplate` / `WorkflowTemplateStep`, `Operation`,
> `EdmConfig` / `EdmCutSpeed` / `CuttingCycle` / `CuttingPass` /
> `DrillingTime`, `StepColorRule`. Per la lista completa e i dettagli
> autoritativi vedi `backend/app/models.py` o il diagramma in
> `CLAUDE.md` §4. Mantenuto come storico.

> Fonte di verità: `backend/app/models.py`. Questo doc è una guida di lettura. Se diverge, ha ragione il codice.

## Quote
Il preventivo, contenitore principale.

Campi:
- `id`, `quote_number` (slug univoco, es. `240-26A_001`)
- `quote_type` ('single' | 'commessa')
- `customer_id`, `customer_name`, `customer_reference`
- `quote_date`, `validity_days`, `delivery_text`, `currency`
- `global_margin_percent`, `global_discount_percent`
- `transport_cost`, `packaging_cost`
- `notes_customer`, `notes_internal`
- `status` ('bozza' | 'inviato' | 'completato')
- `created_by_user_id` (FK users) — chi ha creato il preventivo
- `submitted_by_user_id`, `submitted_at` — chi ha premuto "Invia" e quando
- `completed_by_user_id`, `completed_at` — chi ha aperto/completato e quando
- `created_at`, `updated_at`
- Relazioni: `customer`, `parts[]`, `created_by`, `submitted_by`, `completed_by`

## Part
Componente del preventivo. Un preventivo single ha 1 part, una commessa ha N parts.

Campi:
- `id`, `quote_id` (FK quotes)
- `part_code` (es. `240-26A_001` o `240-26A_001_03`)
- `revision`, `description`, `quantity`
- `quote_mode` ('manual' | 'dxf' | 'step' | 'mixed')
- `material_id` (FK materials)
- Dimensioni grezzo: `raw_x_mm`, `raw_y_mm`, `raw_z_mm`, `raw_diameter_mm`
- Pesi: `finished_weight_kg`, `raw_weight_kg`
- Costi: `material_cost`, `material_delivery_cost`
- Margine: `margin_percent` (override del quote.global_margin_percent), `minimum_price`
- `rounding_rule` ('none' | '1' | '5' | '10' | '50') — campo presente, **non ancora applicato nel calcolo**
- `confidence_level`, `customer_notes`, `internal_notes`
- Calcolati (riempiti da `recalculate_part`): `total_cost`, `unit_price`, `total_price`
- Relazioni: `quote`, `phases[]`, `files[]`, `geometry` (1:1), `material`

## ManufacturingPhase
Fase del ciclo di lavorazione di una part.

Campi:
- `id`, `part_id` (FK parts)
- `sequence_number` (ordine, default a step di 10)
- `phase_type` (vedi Spec 05)
- `description`
- `machine_id` (FK machines), `supplier_id` (FK suppliers), `treatment_id` (FK treatments)
- Tempi: `setup_hours`, `cycle_hours_per_part`, `quantity_multiplier`
- Costi: `fixed_cost`, `variable_cost_per_part`, `hourly_rate_override`
- Calcolato: `calculated_cost` (per pezzo, scritto da `recalculate_part`)
- `margin_percent_override`, `customer_visible`, `is_shared` (true → setup/fixed amortizzati su tutte le parts del quote)
- `internal_notes`, `customer_notes`

## PartFile
Allegati al part (DXF, STEP, PDF, immagini).

Campi: `id`, `part_id`, `file_type` ('dxf' | 'step' | 'pdf' | 'image' | 'other'), `filename`, `path`, `uploaded_at`.

## GeometryAnalysis
Analisi automatica della geometria (1:1 con part). Popolata dall'upload di DXF/STEP.

Campi: bounding_box_*, volume_mm3, surface_area_mm2, detected_holes_count, detected_pockets_count, detected_colors_json, dxf_total_length_mm, dxf_profile_count, confidence_level, warnings_json, raw_analysis_json.

## Customer
Anagrafica clienti.

Campi: `id`, `customer_number` (univoco, 3 cifre per quote_number), `name`, `vat_number`, `address`, `phone`, `email`, `contact_person`, `notes`, `active`, `created_at`. Phone con normalizzazione automatica (`+39`, parentesi, ecc.).

## Material
Materiali grezzi.

Campi: `id`, `name`, `family`, `density_kg_dm3`, `cost_per_kg`, `edm_coefficient`, `cnc_machinability_coefficient`, `default_scrap_percent`, `active`, `notes`, `supplier_id` (FK material_suppliers).

`edm_coefficient` e `cnc_machinability_coefficient` sono **dormienti**: presenti per quando arriverà l'autocompilazione tempi da DXF/STEP. UI mostra helper text.

## MaterialSupplier
Fornitori di materiale grezzo.

Campi: `id`, `name`, `address`, `shipping_cost`, `cutting_cost_per_part`, `active`.

## Machine
Macchine officina.

Campi: `id`, `name`, `machine_type`, `hourly_rate`, `setup_minimum_hours` (dormiente), `active`, `notes`.

## Treatment
Trattamenti termici/galvanici/superficiali.

Campi: `id`, `name`, `treatment_type`, `cost_per_kg`, `cost_per_part` (dormiente), `cost_per_surface_area` (dormiente), `fixed_cost`, `minimum_cost`, `minimum_weight_kg`, `supplier_id`, `active`, `notes`.

`calculation.py` usa solo `cost_per_kg + minimum_cost + minimum_weight_kg`. Gli altri sono pronti per implementazione futura.

## Supplier
Fornitori esterni (trattamenti, lavorazioni).

Campi: `id`, `name`, `supplier_type`, `address`, `shipping_cost`, `notes`, `active`.

## CompanySettings (singleton, id=1)
Anagrafica azienda + default operativi applicati ai nuovi preventivi.

Campi anagrafica: `name`, `address`, `vat`, `phone`, `email`, `website`.
Campi default: `default_margin_percent`, `default_minimum_part_price`, `default_transport_cost`, `default_packaging_cost`.
`updated_at`.

I default sono popolati dal POST /quotes (margine/transport/packaging) e POST /parts (minimum_price).

## QuoteCategory
Lettera prefisso del numero preventivo (A-G di default).

Campi: `id`, `code` (1-5 char), `name`, `active`, `sort_order`.

## PhaseTemplate
Template fasi riusabili dal PhaseEditor (pulsante "Applica template").

Campi: `id`, `name`, `phase_type`, `default_machine_id`, `default_supplier_id`, `setup_hours`, `cycle_hours_per_part`, `fixed_cost`, `variable_cost_per_part`, `customer_visible`, `is_shared`, `notes`.

## StepColorRule (dormiente)
Mapping colori facce STEP → fase suggerita. Pronto per quando si implementerà l'import 3D. UI nascosta dalla sidebar.

Campi: `id`, `color_hex`, `color_name`, `meaning`, `suggested_phase_type`, `complexity_coefficient`, `notes`, `active`.

## User
Utenti dell'app.

Campi: `id`, `username` (univoco), `hashed_password` (bcrypt), `full_name`, `email`, `role` (slug ruolo), `is_active`, `created_at`.

## Role
Ruolo configurabile da UI.

Campi: `id`, `name` (slug univoco, es. 'admin'), `label` ("Amministratore"), `color` (per badge), relazione `permissions`.

Default seeded: admin, ufficio_tecnico, officina, amministrazione.

## RolePermission
Assegnazione N-N tra ruoli e chiavi permesso.

Campi: `id`, `role_id` (FK roles), `permission_key` (string, deve corrispondere a una key in `PERMISSION_KEYS`).

## Notification
Notifica in-app generica.

Campi: `id`, `type` (string libera, es. 'quote_submitted'), `title`, `body`, `data_json` (payload), `created_by_user_id`, `target_roles` (JSON array di slug), `target_user_id` (FK users, per notifiche 1-a-1), `requires_action` (boolean), `created_at`.

Una notifica è visibile a un utente se: `target_user_id == user.id` OR `user.role` è in `target_roles`. Ed è esclusa se quell'utente l'ha "svuotata" (NotificationRead.dismissed_at set).

## NotificationRead
Stato di lettura per-utente per ogni notifica.

Campi: `id`, `notification_id`, `user_id`, `read_at`, `confirmed_at` (per `requires_action`), `dismissed_at` (per "svuota lette" per-utente).
