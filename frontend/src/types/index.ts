export interface Supplier {
  id: number
  name: string
  supplier_type?: string | null
  address?: string | null
  shipping_cost?: number
  notes?: string | null
  active?: boolean
}

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
  supplier?: Supplier | null
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
  operation_id?: number | null
  is_shared?: boolean
  setup_hours: number
  cycle_hours_per_part: number
  fixed_cost: number
  variable_cost_per_part: number
  hourly_rate_override?: number
  calculated_cost: number
  internal_notes?: string | null
  customer_notes?: string | null
  // Wire EDM extra (popolati solo se phase_type === 'wire_edm')
  cut_length_mm?: number | null
  cut_height_mm?: number | null
  cutting_cycle_id?: number | null
  n_pierce?: number | null
  dxf_profile_ids?: number[] | null
}

export interface Machine {
  id: number
  name: string
  hourly_rate: number
  setup_hourly_rate?: number | null  // costo orario attrezzaggio, NULL → fallback a hourly_rate
  machine_type?: string | null       // optional — backend Pydantic Optional[str]
  setup_minimum_hours?: number
  active?: boolean
  notes?: string | null
}

export interface Material {
  id: number
  name: string
  family: string
  density_kg_dm3: number
  cost_per_kg: number
  edm_coefficient?: number
  cnc_machinability_coefficient?: number
  default_scrap_percent: number
  active?: boolean
  notes?: string | null
  supplier_id?: number | null
  material_supplier?: MaterialSupplier | null
}

export interface Category {
  id: number
  code: string
  name: string
  active?: boolean
  sort_order?: number
}

export interface Customer {
  id: number
  customer_number: number
  name: string
  vat_number?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  contact_person?: string | null
  notes?: string | null
  active?: boolean
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
  customer_supplied_material?: boolean  // conto lavoro: materiale fornito dal cliente
  material_from_stock?: boolean         // a magazzino: override shipping/cutting da CompanySettings
  margin_percent?: number
  minimum_price?: number
  total_cost: number
  unit_price: number
  total_price: number
  phases: Phase[]
  files?: PartFile[]
  material?: Material
}

export interface UserMinimal {
  id: number
  username: string
  full_name: string | null
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
  created_by_user_id?: number | null
  submitted_by_user_id?: number | null
  submitted_at?: string | null
  completed_by_user_id?: number | null
  completed_at?: string | null
  submitted_by?: UserMinimal | null
  completed_by?: UserMinimal | null
  material_ordered_at?: string | null
  material_ordered_by_user_id?: number | null
  material_ordered_by?: UserMinimal | null
  notes_customer?: string
  notes_internal?: string
  parts: Part[]
}

// ─── Ordini materiali ──────────────────────────────────────────────────────

export interface MaterialOrder {
  id: number
  created_at: string
  created_by: UserMinimal | null
  quote_count: number
  quote_numbers: string[]
}

export interface MaterialItemAggregated {
  material_id: number | null
  material_name: string
  family: string | null
  dim_str: string
  total_qty: number
  total_weight_kg: number
  quote_refs: string[]
  from_stock?: boolean
}

export interface MaterialAggregateBySupplier {
  supplier_id: number | null
  supplier_name: string
  items: MaterialItemAggregated[]
}

export interface MaterialAggregateResult {
  groups: MaterialAggregateBySupplier[]
}

// ─── Utensili ──────────────────────────────────────────────────────────────

export interface ToolSupplier {
  id: number
  name: string
  address?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
  active?: boolean
}

export interface Tool {
  id: number
  code: string
  tool_type?: string | null
  brand?: string | null
  model?: string | null
  diameter_mm?: number | null
  toroidal_mm?: number | null
  quantity: number
  minimum_quantity: number
  location?: string | null
  tool_supplier_id?: number | null
  tool_supplier?: ToolSupplier | null
  notes?: string | null
  active?: boolean
}

export interface ToolAttribute {
  id: number
  name: string
  active: boolean
}

export interface ToolOrderItem {
  id: number
  tool_id?: number | null
  code_snapshot: string
  tool_type_snapshot?: string | null
  brand_snapshot?: string | null
  model_snapshot?: string | null
  diameter_snapshot?: number | null
  supplier_name_snapshot?: string | null
  quantity_at_time: number
  minimum_at_time: number
  quantity_to_order: number
}

export interface ToolOrder {
  id: number
  created_at: string
  created_by: UserMinimal | null
  triggered_by: string
  item_count: number
  total_quantity: number
}

export interface ToolOrderDetail extends ToolOrder {
  items: ToolOrderItem[]
}

export interface ToolLowStockPreviewItem {
  tool_id: number
  code: string
  tool_type: string | null
  brand: string | null
  model: string | null
  diameter_mm: number | null
  quantity: number
  minimum_quantity: number
  quantity_to_order: number
}

export interface ToolLowStockPreviewGroup {
  supplier_name: string
  items: ToolLowStockPreviewItem[]
}

export interface ToolLowStockPreview {
  groups: ToolLowStockPreviewGroup[]
  total_tools: number
  total_quantity: number
}

export interface ActivityRow {
  id: number
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  requires_action: boolean
  created_at: string | null
  created_by: UserMinimal | null
  read_at: string | null
  confirmed_at: string | null
}

export interface WorkflowStats {
  by_status: Record<string, number>
  my_drafts_count: number
  my_pending_count: number
  to_review_count: number
}

export interface DashboardQuoteRow {
  id: number
  quote_number: string
  customer_name: string | null
  status: string
  quote_date: string | null
  total_price: number
  submitted_at?: string | null
  submitted_by?: UserMinimal | null
}

// Minimal shape returned by the archive/list endpoints
export interface QuoteListItem {
  id: number
  quote_number: string
  customer_name: string
  quote_date: string
  status: string
  created_by_user_id?: number | null
  material_ordered_at?: string | null
  material_ordered_by?: UserMinimal | null
  parts: { total_price?: number }[]
}

// Template di flusso lavoro: sequenza di (Macchina + Lavorazione).
// Apply su una parte del preventivo crea N fasi pre-popolate (clean slate).
// machine_id può essere null per fasi senza macchina dedicata
// (es. "Progettazione CAD" manuale).
// operation_id punta al catalogo Lavorazioni (Operation): l'utente sceglie
// da una lista personalizzabile invece dall'enum fisso.
export interface WorkflowTemplateStep {
  id?: number
  sequence_number: number
  machine_id?: number | null
  operation_id: number
  machine?: { id: number; name: string; machine_type: string } | null
  operation?: Operation | null
}

export interface WorkflowTemplate {
  id: number
  name: string
  description?: string | null
  active: boolean
  steps: WorkflowTemplateStep[]
}

// Catalogo lavorazioni utente (UI: "Lavorazioni"). Etichette libere
// usate da Workflow e select "Tipo fase" del preventivatore manuale.
// Niente categoria sotto: i behavior speciali del cost engine (autocalc
// EDM) sono dedotti da machine.machine_type, non dall'Operation.
export interface Operation {
  id: number
  name: string
  active: boolean
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

// ─── Wire EDM ───────────────────────────────────────────────────────────────

export interface EdmConfig {
  id: number
  rough_speed_factor: number
  semi_speed_factor: number
  finish_speed_factor: number
  default_pierce_time_s: number
  default_drilling_machine_id?: number | null
  updated_at?: string
}

export interface EdmCutSpeed {
  id: number
  material_family: string  // slug da MATERIAL_FAMILIES
  thickness_min_mm: number
  thickness_max_mm: number
  speed_mm_per_min: number
  pierce_time_s: number | null
  notes: string | null
}

export type PassType = 'rough' | 'semi' | 'finish'

export interface CuttingPass {
  id?: number
  sequence_number: number
  pass_type: PassType
}

export interface CuttingCycle {
  id: number
  name: string
  description: string | null
  active: boolean
  passes: CuttingPass[]
}

export interface DrillingTime {
  id: number
  material_family: string  // slug da MATERIAL_FAMILIES
  electrode_diameter_mm: number
  speed_mm_per_sec: number
  notes: string | null
}

// ─── DXF analysis (in-memory) ───────────────────────────────────────────────

export interface DxfBbox {
  x: number
  y: number
  w: number
  h: number
}

export interface DxfProfile {
  id: number
  closed: boolean
  length_mm: number
  bbox: DxfBbox
  svg_path: string
  point_count: number
}

export interface DxfAnalysis {
  profiles: DxfProfile[]
  bbox_global: DxfBbox
  total_length_mm: number
  n_closed_profiles: number
  suggested_pierce: number
  units: string
  warnings: string[]
}

export interface MonthlyData {
  month: string
  year: number
  value: number     // valore preventivato (prezzo finale)
  margin: number    // margine = prezzo - costo
  material: number  // costo materiali (grezzo + delivery + taglio)
  labor: number     // costo lavorazioni (escluso trattamenti)
}

// ─── Role / User / Settings server-side ─────────────────────────────────────

export interface Role {
  id: number
  name: string         // slug: 'admin', 'ufficio_tecnico', ...
  label: string
  color: string
  permissions?: string[]
}

export interface ApiUser {
  id: number
  username: string
  full_name: string | null
  email: string | null
  role: string
  is_active: boolean
  created_at?: string
}

export interface CompanySettings {
  id: number
  name: string
  address: string
  vat: string
  phone: string
  email: string
  website: string
  default_margin_percent: number
  default_minimum_part_price: number
  default_transport_cost: number
  default_packaging_cost: number
  stock_shipping_cost: number
  stock_cutting_cost_per_part: number
  updated_at?: string
}

export interface StepColorRule {
  id: number
  color_hex: string
  color_name: string | null
  meaning: string | null
  suggested_phase_type: string | null
  complexity_coefficient?: number
  notes: string | null
  active: boolean
}
