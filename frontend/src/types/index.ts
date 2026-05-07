export interface MaterialSupplier {
  id: number
  name: string
  address?: string | null
  shipping_cost: number
  cutting_cost_per_part?: number
  active: boolean
}

export interface Treatment {
  id: number
  name: string
  treatment_type: string | null
  cost_per_kg: number
  minimum_cost: number
  minimum_weight_kg?: number | null
  supplier_id: number | null
  supplier?: { id: number; name: string; shipping_cost: number } | null
  active: boolean
  notes: string | null
}

export interface Phase {
  id?: number
  sequence_number: number
  phase_type: string
  description: string
  machine_id?: number
  supplier_id?: number
  treatment_id?: number
  is_shared?: boolean
  setup_hours: number
  cycle_hours_per_part: number
  fixed_cost: number
  variable_cost_per_part: number
  hourly_rate_override?: number
  calculated_cost: number
  customer_visible: boolean
}

export interface Machine {
  id: number
  name: string
  hourly_rate: number
  machine_type: string
}

export interface Material {
  id: number
  name: string
  family: string
  density_kg_dm3: number
  cost_per_kg: number
  default_scrap_percent: number
  supplier_id?: number | null
  material_supplier?: MaterialSupplier | null
}

export interface Category {
  id: number
  code: string
  name: string
}

export interface Customer {
  id: number
  customer_number: number
  name: string
  email?: string
}

export interface PartFile {
  id: number
  file_type: string
  filename: string
  path: string
}

export interface Part {
  id?: number
  part_code: string
  revision: string
  description: string
  quantity: number
  quote_mode: string
  material_id?: number
  raw_x_mm?: number
  raw_y_mm?: number
  raw_z_mm?: number
  raw_diameter_mm?: number
  finished_weight_kg?: number
  raw_weight_kg?: number
  material_cost: number
  material_delivery_cost?: number
  margin_percent?: number
  minimum_price?: number
  rounding_rule?: string
  confidence_level?: string
  total_cost: number
  unit_price: number
  total_price: number
  phases: Phase[]
  files?: PartFile[]
  material?: Material
}

export interface Quote {
  id?: number
  quote_number: string
  quote_type: string
  customer_id?: number
  customer_name: string
  customer_reference?: string
  global_margin_percent: number
  global_discount_percent: number
  transport_cost: number
  packaging_cost: number
  validity_days: number
  delivery_text?: string
  quote_date: string
  status: string
  notes_customer?: string
  notes_internal?: string
  parts: Part[]
}

// Minimal shape returned by the archive/list endpoints
export interface QuoteListItem {
  id: number
  quote_number: string
  customer_name: string
  quote_date: string
  status: string
  parts: { total_price?: number }[]
}

export interface PhaseTemplate {
  id: number
  name: string
  phase_type: string
  default_machine_id: number | null
  default_supplier_id: number | null
  setup_hours: number
  cycle_hours_per_part: number
  fixed_cost: number
  variable_cost_per_part: number
  customer_visible: boolean
  is_shared: boolean
  notes?: string | null
}

export interface DashboardKPI {
  total_quotes: number
  total_quotes_this_month: number
  total_quoted_value: number
  quoted_value_this_month: number
  quoted_value_prev_month: number
  percentage_diff: number
  avg_quote_value: number
  total_part_codes: number
  cnc_quoted_value: number
  edm_quoted_value: number
}
