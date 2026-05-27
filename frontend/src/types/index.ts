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
  // Modulo Stampi: trattamenti come nitrurazione fatturati a €/dm³.
  // cost_unit='kg' (default) o 'dm3' switcha la formula nel cost engine.
  cost_unit?: 'kg' | 'dm3'
  cost_per_dm3?: number
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
  has_datasheet?: boolean   // true se Material ha una scheda PDF allegata
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
  // Modulo Stampi: ruolo piastra nel castello.
  plate_role?: string | null
  // Sprint B — snapshot produttività piastra (NULL = fallback default per ruolo).
  die_setup_h?: number | null
  die_n_milled_faces?: number | null
  die_n_ground_faces?: number | null
  die_n_drilled_faces?: number | null
  die_station_bonus_h?: number | null
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
  // Sprint G — tracking storico (popolabili solo su status='completato')
  sold_price?: number | null
  actual_cost?: number | null
  notes_customer?: string
  notes_internal?: string
  parts: Part[]
  // Modulo Stampi: popolati solo per quote_type='die'.
  die_spec?: DieSpec | null
  die_normalized_items?: DieNormalizedItem[]
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

export interface NormalizedSupplier {
  id: number
  name: string
  address?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
  // Modulo Stampi: spedizione aggregata in L2 cost engine.
  shipping_cost?: number
  active?: boolean
}

/** Catalogo globale di voci normalizzate (viti, cuscinetti, molle, colonne,
 *  boccole, spine). Step 2 cantiere catalogo normalizzati: API CRUD pronta;
 *  Step 4-5 introdurranno FK opzionali su DieTemplateNormalized e
 *  DieNormalizedItem con strategia snapshot (preventivi storici congelati).
 */
export interface NormalizedItem {
  id: number
  code: string
  description: string
  category?: string | null
  supplier_id?: number | null
  unit_price?: number
  notes?: string | null
  active?: boolean
  supplier?: NormalizedSupplier | null
  created_at?: string
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
  quote_type?: string             // 'single' | 'commessa' | 'die'
  customer_name: string
  quote_date: string
  status: string
  global_margin_percent?: number
  global_discount_percent?: number
  created_by_user_id?: number | null
  material_ordered_at?: string | null
  material_ordered_by?: UserMinimal | null
  parts: { total_price?: number }[]
  // Modulo Stampi: presente solo per quote_type==='die'. Usato per calcolare
  // il `display_price` dell'archivio (cost_industrial × margin × discount).
  die_spec?: { cost_industrial: number } | null
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
  // Modulo Stampi: prezzo finale (industriale × margine × sconto) cumulato.
  dies_quoted_value?: number
  // Margine medio % sui preventivi standard (non die).
  avg_margin_percent?: number
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

export interface OfficinaDocument {
  id: number
  title: string
  category: string | null
  filename: string
  size_bytes: number
  uploaded_at: string
  uploaded_by?: UserMinimal | null
  customer?: { id: number; customer_number: number; name: string } | null
  material_supplier?: { id: number; name: string } | null
  tool_supplier?: { id: number; name: string } | null
  normalized_supplier?: { id: number; name: string } | null
}

// ─── Statistics page (4 dataset aggregati) ──────────────────────────────

export interface StatsTrendPoint {
  month: string         // YYYY-MM
  standard: number      // € preventivati per quote_type single+commessa
  dies: number          // € preventivati per quote_type='die'
}

export interface StatsCustomerRow {
  customer_id: number | null
  customer_name: string
  total: number
}

export interface StatsCategoryRow {
  category_code: string
  count: number
  total: number
}

export interface StatsMarginPoint {
  month: string
  margin_percent: number
}

export interface Statistics {
  period: 'year' | '12m' | 'prev_year' | 'all'
  trend_monthly: StatsTrendPoint[]
  top_customers: StatsCustomerRow[]
  by_category: StatsCategoryRow[]
  margin_monthly: StatsMarginPoint[]
}

// Tab "Materiali" — statistiche ordini materiali
export interface StatsCountPoint {
  month: string
  count: number
}

export interface StatsSupplierRow {
  supplier_name: string
  count: number
}

export interface StatsLeadTimePoint {
  month: string
  avg_days: number
}

export interface MaterialsStats {
  period: string
  trend_monthly: StatsCountPoint[]
  top_suppliers: StatsSupplierRow[]
  lead_time_avg_days: number
  lead_time_monthly: StatsLeadTimePoint[]
}

// Tab "Utensili" — statistiche ordini utensili
export interface StatsToolRow {
  code: string
  total_quantity: number
}

export interface ToolsStats {
  period: string
  trend_monthly: StatsCountPoint[]
  top_suppliers: StatsSupplierRow[]
  top_tools: StatsToolRow[]
}


export interface OfficinaCategory {
  id: number
  name: string
  icon: string         // nome lucide-react, mappato via lib/icons.ts
  sort_order: number
  created_at?: string
}

// ─── Modulo Preventivatore Stampi ───────────────────────────────────────────

export type DieSubtype = 'passo' | 'blocco'
export type DieDifficulty = 'base' | 'medium' | 'hard'

export interface DieSpec {
  quote_id: number
  die_subtype: DieSubtype
  bbox_x_mm: number
  bbox_y_mm: number
  sheet_thickness_mm: number
  // Perimetro pezzo (Sprint A): driver chiave per stima ore EDM filo.
  // NULL → cost engine usa fallback 2*(X+Y)*complexity_factor.
  perimeter_pezzo_mm?: number | null
  // Moltiplicatore complessità per fallback senza DXF.
  // 1.0 rettangolare / 1.3 sagoma media / 1.6 sagoma complessa / 1.9 molto articolato
  complexity_factor?: number | null
  // Passo
  n_stations?: number | null
  pitch_mm?: number | null
  strip_offset_y_mm: number
  // Blocco
  n_operations?: number | null
  block_strip_offset_mm: number
  // Castello
  castle_offset_x_mm?: number | null
  castle_offset_y_mm?: number | null
  // Feature
  difficulty: DieDifficulty
  n_bends_simple: number
  n_bends_medium: number
  n_bends_complex: number
  n_punches_simple: number
  n_punches_medium: number
  n_punches_complex: number
  // Misc
  delivery_days?: number | null
  technical_notes?: string | null
  extras_amount: number
  extras_description?: string | null
  // Snapshot costi (popolati dal cost engine)
  cost_material: number
  cost_normalized: number
  cost_machining: number
  cost_machining_edm: number   // Sprint A: breakdown EDM (incluso in cost_machining)
  cost_machining_mech: number  // Sprint B: breakdown lavorazioni meccaniche piastre
  cost_accessories: number
  cost_industrial: number
  // Override matita (NULL = usa calcolato)
  override_material?: number | null
  override_normalized?: number | null
  override_machining?: number | null
  override_accessories?: number | null
}

export interface DieNormalizedItem {
  id: number
  quote_id: number
  normalized_supplier_id?: number | null
  description: string
  quantity: number
  unit_price: number
  notes?: string | null
  supplier?: NormalizedSupplier | null
}

export interface DieSettings {
  id: number
  hourly_rate_milling: number
  hourly_rate_grinding: number
  hourly_rate_edm_wire: number
  hourly_rate_edm_die: number
  cost_bend_simple: number
  cost_bend_medium: number
  cost_bend_complex: number
  cost_punch_simple: number
  cost_punch_medium: number
  cost_punch_complex: number
  cost_per_plate_base: number
  diff_mult_base: number
  diff_mult_medium: number
  diff_mult_hard: number
  design_hours_base: number
  design_hours_medium: number
  design_hours_hard: number
  design_hourly_rate: number
  assembly_forfeit_base: number
  assembly_forfeit_medium: number
  assembly_forfeit_hard: number
  default_margin_percent: number
  default_castle_offset_x_mm: number
  default_castle_offset_y_mm: number
  // Sprint A — driver EDM filo per piastre stampo
  wire_edm_cycle_id?: number | null
  edm_extractor_factor: number
  edm_punch_factor: number
  // Sprint B — produttività macchine officina (h/dm² per operazione)
  milling_h_per_dm2: number
  grinding_h_per_dm2: number
  drilling_h_per_dm2: number
  // Sprint F: dormienti (la scala piastra ora usa DieDimensionBracket lookup).
  // Lasciati nel type per retro-compat (qualche record DB potrebbe ancora avere
  // valori). Non usati dal cost engine.
  large_plate_threshold_dm2: number
  large_plate_factor: number
  // Sprint F — aggancio Machine FK (NULL = usa hourly_rate_* esplicita)
  milling_machine_id?: number | null
  grinding_machine_id?: number | null
  drilling_machine_id?: number | null
  edm_wire_machine_id?: number | null
  // Sprint F — bonus design configurabile
  design_h_per_bend: number
  design_h_per_punch: number
}

export interface DieDimensionBracket {
  id: number
  label: string
  area_min_dm2: number
  area_max_dm2?: number | null
  coefficient: number
  sort_order: number
}

export interface DieTemplatePlate {
  id: number
  plate_role: string
  default_thickness_mm: number
  default_material_id?: number | null
  default_treatment_id?: number | null
  sort_order: number
  // Sprint B — costanti "tipiche per ruolo" per stima ore meccaniche piastra.
  setup_hours_fixed: number
  n_milled_faces: number
  n_ground_faces: number
  n_drilled_faces: number
  station_bonus_hours: number
}

// Sprint C — BoM normalizzati scalabile sul template stampo.
// Le formule scalano i pezzi con dimensioni/feature dello stampo
// (variabili: n_stations, n_bends_total, n_punches_total, area_castello_dm2,
//  castle_x_mm, castle_y_mm, bbox_x_mm, bbox_y_mm).
export interface DieTemplateNormalized {
  id: number
  description: string
  normalized_supplier_id?: number | null
  quantity_formula: string
  unit_price_default: number
  sort_order: number
}

export interface DieTemplate {
  id: number
  name: string
  description?: string | null
  die_subtype: DieSubtype
  suggested_stations?: number | null
  suggested_pitch_mm?: number | null
  suggested_n_bends_simple: number
  suggested_n_bends_medium: number
  suggested_n_bends_complex: number
  suggested_n_punches_simple: number
  suggested_n_punches_medium: number
  suggested_n_punches_complex: number
  default_difficulty: DieDifficulty
  active: boolean
  created_at: string
  plates: DieTemplatePlate[]
  normalized_items: DieTemplateNormalized[]
}

