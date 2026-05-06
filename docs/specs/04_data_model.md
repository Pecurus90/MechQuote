# Data Model

## Quote

Fields:
- id
- quote_number
- customer_name
- customer_reference
- date
- validity_days
- delivery_text
- currency
- global_margin_percent
- global_discount_percent
- transport_cost
- packaging_cost
- notes_customer
- notes_internal
- status
- created_at
- updated_at

Status values:
- draft
- sent
- accepted
- rejected
- archived

Status is optional and should not turn the app into an ERP.

## Part

Fields:
- id
- quote_id
- part_code
- revision
- description
- quantity
- quote_mode: manual / dxf / step / mixed
- material_id
- raw_x_mm
- raw_y_mm
- raw_z_mm
- raw_diameter_mm
- finished_weight_kg
- raw_weight_kg
- material_cost
- margin_percent
- minimum_price
- rounding_rule
- confidence_level
- customer_notes
- internal_notes
- total_cost
- unit_price
- total_price

## PartFile

Fields:
- id
- part_id
- file_type: step / dxf / pdf / image / other
- filename
- path
- uploaded_at

## GeometryAnalysis

Fields:
- id
- part_id
- source_file_id
- bounding_box_x
- bounding_box_y
- bounding_box_z
- volume_mm3
- surface_area_mm2
- detected_holes_count
- detected_pockets_count
- detected_colors_json
- dxf_total_length_mm
- dxf_profile_count
- confidence_level
- warnings_json
- raw_analysis_json

## ManufacturingPhase

Fields:
- id
- part_id
- sequence_number
- phase_type
- description
- machine_id
- supplier_id
- setup_hours
- cycle_hours_per_part
- quantity_multiplier
- fixed_cost
- variable_cost_per_part
- hourly_rate_override
- calculated_cost
- margin_percent_override
- customer_visible
- internal_notes
- customer_notes

## Material

Fields:
- id
- name
- family
- density_kg_dm3
- cost_per_kg
- edm_coefficient
- cnc_machinability_coefficient
- default_scrap_percent
- active
- notes

## Machine

Fields:
- id
- name
- machine_type
- hourly_rate
- setup_minimum_hours
- active
- notes

Machine types:
- cnc_3_axis
- cnc_5_axis
- turning
- wire_edm
- sinker_edm
- grinding
- manual
- inspection

## Treatment

Fields:
- id
- name
- treatment_type
- fixed_cost
- cost_per_kg
- cost_per_part
- cost_per_surface_area
- minimum_cost
- supplier_id
- active
- notes

## Supplier

Fields:
- id
- name
- supplier_type
- notes
- active

## CostRule

Fields:
- id
- key
- value
- description

Examples:
- default_margin_percent
- default_scrap_percent
- minimum_quote_price
- minimum_part_price
- default_rounding
- packaging_default
- transport_default

## PhaseTemplate

Fields:
- id
- name
- phase_type
- default_machine_id
- default_supplier_id
- setup_hours
- cycle_hours_per_part
- fixed_cost
- variable_cost_per_part
- customer_visible
- notes

## StepColorRule

Fields:
- id
- color_hex
- color_name
- meaning
- suggested_phase_type
- complexity_coefficient
- notes
- active
