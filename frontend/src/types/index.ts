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
  // Trattamenti fatturabili a peso o a volume: cost_unit='kg' (default) o
  // 'dm3' switcha la formula nel cost engine.
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
  supplier_id?: number | null
  treatment_id?: number | null
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
  // TD-7 — foratura a elettrodo (autocalc se la macchina è la foratrice designata)
  electrode_diameter_mm?: number | null
  n_holes?: number | null
  drill_depth_mm?: number | null
  // CAT-1 Fase 2: voci di catalogo agganciate, esposte da PhaseOut per
  // costruire l'option "ritirato" nelle dropdown del preventivatore
  // quando il GET di lista è filtrato `?active=true`.
  machine?: Machine | null
  operation?: Operation | null
  treatment?: Treatment | null
  supplier?: Supplier | null
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
  cost_per_kg: number                  // €/kg prismatico (base)
  cost_per_kg_round?: number | null    // €/kg tondo/tubo (usato se non uniforme)
  uniform_cost_per_kg?: boolean        // spunta "stesso costo tutte le forme"
  edm_coefficient?: number
  cnc_machinability_coefficient?: number
  default_scrap_percent: number
  active?: boolean
  notes?: string | null
  supplier_id?: number | null
  material_supplier?: MaterialSupplier | null
  has_datasheet?: boolean   // true se Material ha una scheda PDF allegata
  aliases?: MaterialAlias[] // nomi alternativi (distinta/ERP) → questo materiale
}

// Alias materiale: nome alternativo che risolve al materiale canonico nel
// flusso "ordini da file". csv_name normalizzato (trim+lower), unico.
export interface MaterialAlias {
  id: number
  csv_name: string
}

// Riga della tabella "Ordini materiale da file" (parse distinta + editing).
export interface FileOrderRow {
  part_code: string
  description: string
  csv_material: string
  material_id: number | null
  material_name: string
  supplier_id: number | null
  supplier_name: string | null
  shape: 'prismatico' | 'tondo' | 'tubo'
  width_mm: number | null
  height_mm: number | null
  thickness_mm: number | null
  diameter_mm: number | null
  inner_diameter_mm: number | null
  length_mm: number | null
  quantity: number
  needs_dimensions: boolean
  needs_material: boolean
}

export interface MaterialAlias {
  id: number
  csv_name: string
  material_id: number
  material_name: string
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
  read_by_user_id?: number | null
  read_at?: string | null
  awaiting_client_at?: string | null
  confirmed_by_user_id?: number | null
  confirmed_at?: string | null
  completed_by_user_id?: number | null
  completed_at?: string | null
  not_ordered_at?: string | null
  not_ordered_by_user_id?: number | null
  created_by?: UserMinimal | null
  submitted_by?: UserMinimal | null
  read_by?: UserMinimal | null
  confirmed_by?: UserMinimal | null
  completed_by?: UserMinimal | null
  not_ordered_by?: UserMinimal | null
  material_ordered_at?: string | null
  material_ordered_by_user_id?: number | null
  material_ordered_by?: UserMinimal | null
  // Sprint G — tracking storico (popolabili solo su status='completo')
  sold_price?: number | null
  actual_cost?: number | null
  // B1 — totale finale persistito dal backend (fonte unica archivio/dashboard).
  final_total?: number | null
  // TD-16 — prezzo baseline al "manda in revisione" (per il confronto editor).
  revision_baseline_total?: number | null
  revision_baseline_at?: string | null
  // Versione dell'aggregato per il rilevamento concorrenza (bump a ogni modifica).
  updated_at?: string
  notes_customer?: string
  notes_internal?: string
  parts: Part[]
}

// ─── Ordini materiali ──────────────────────────────────────────────────────

export interface MaterialOrder {
  id: number
  created_at: string
  created_by: UserMinimal | null
  supplier_name: string | null
  quote_count: number
  quote_numbers: string[]
  source?: string          // 'quotes' | 'file'
  item_count?: number      // righe (ordini da file)
}

// Richiesta materiale manuale (gemello del preventivo per il materiale).
export interface MaterialRequestItem {
  id: number
  material_id: number | null
  material_name: string
  part_code: string
  description: string
  shape: 'prismatico' | 'tondo' | 'tubo'
  width_mm: number | null
  height_mm: number | null
  thickness_mm: number | null
  diameter_mm: number | null
  inner_diameter_mm: number | null
  length_mm: number | null
  quantity: number
  supplier_id: number | null
  supplier_name: string | null
  evaso: boolean                 // riga già confluita in un ordine emesso (bloccata)
  material_order_id: number | null
}

export interface MaterialRequest {
  id: number
  created_at: string
  created_by: UserMinimal | null
  status: 'bozza' | 'inviato'
  sent_at: string | null
  title: string | null
  items: MaterialRequestItem[]
  item_count: number
  open_count: number             // righe ancora da ordinare (non evase)
  supplier_names: string[]       // fornitori distinti delle righe aperte
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
  // TD-3: dimensioni strutturate per il consolidamento in barra dei tondi.
  shape?: string
  diameter_mm?: number | null
  length_mm?: number | null
}

// TD-3: consolidamento in barre inviato a POST /orders/materials.
export interface BarPiece {
  length_mm: number
  quantity: number
}
export interface BarSpec {
  material_id: number | null
  material_name: string
  diameter_mm: number
  lengths: number[]        // spezzoni consolidati (quali togliere)
  pieces: BarPiece[]       // barre da ordinare (lunghezza × quantità)
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
  // Spedizione del fornitore esterno (non usata dal cost engine standard).
  shipping_cost?: number
  active?: boolean
}

/** Catalogo globale di voci normalizzate (viti, cuscinetti, molle, colonne,
 *  boccole, spine). Catalogo autonomo con API CRUD dedicata.
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
  aliases?: { id: number; csv_name: string }[]  // nomi grezzi distinta → questa voce
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

export interface ToolOrder {
  id: number
  created_at: string
  created_by: UserMinimal | null
  triggered_by: string
  supplier_name: string | null
  item_count: number
  total_quantity: number
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
  supplier_id: number | null
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
  created_at: string | null
  created_by: UserMinimal | null
  read_at: string | null
}

export interface WorkflowStats {
  by_status: Record<string, number>
  to_review_count: number
  awaiting_client_count: number
  completed_missing_price_count: number
  in_revision_count: number
  standard_count: number
}

export interface DashboardQuoteRow {
  id: number
  quote_number: string
  customer_name: string | null
  status: string
  quote_type?: string | null
  quote_date: string | null
  total_price: number
  submitted_at?: string | null
  submitted_by?: UserMinimal | null
  material_status?: string | null
  // TD-11: 'quote' (preventivo) | 'request' (richiesta manuale RM) nella lista
  // "materiale da ordinare" della dashboard.
  kind?: 'quote' | 'request'
}

// Minimal shape returned by the archive/list endpoints
export interface QuoteListItem {
  id: number
  quote_number: string
  quote_type?: string             // 'single' | 'commessa'
  customer_name: string
  quote_date: string
  status: string
  global_margin_percent?: number
  global_discount_percent?: number
  transport_cost?: number
  packaging_cost?: number
  // B1 — totale finale persistito dal backend (fonte unica archivio/dashboard).
  final_total?: number | null
  created_by_user_id?: number | null
  created_by?: UserMinimal | null       // autore del preventivo (mostrato in lista)
  material_ordered_at?: string | null
  material_ordered_by?: UserMinimal | null
  // Spec 18: stato materiale derivato (solo lista archivio).
  material_status?: string | null
  has_files?: boolean            // ha almeno un allegato (DXF/PDF/STEP…) → icona occhio in lista
  parts: { total_price?: number }[]
  // Consuntivo commessa (spec G): prezzo venduto al cliente + costo reale.
  // Compilabili solo su status='completo'. Mostrati/editabili in Archivio.
  sold_price?: number | null
  actual_cost?: number | null
}

// Vista espandibile archivio: dettaglio articoli con stato materiale (spec 18).
export interface ArticleMaterialRow {
  part_id: number
  part_code: string
  revision?: string | null
  material_name?: string | null
  family?: string | null
  dimensions: string
  treatments: string[]
  supplier_name?: string | null
  state: string
  /** Costi al pezzo (sola vista). material_cost + treatment_cost NON sommano a
   *  piece_cost: manca la lavorazione. */
  material_cost?: number | null
  treatment_cost?: number | null
  piece_cost?: number | null
}

export interface QuoteMaterialDetail {
  quote_id: number
  material_status: string
  articles: ArticleMaterialRow[]
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

// ─── Wire EDM ───────────────────────────────────────────────────────────────

export interface EdmConfig {
  id: number
  rough_speed_factor: number
  semi_speed_factor: number
  finish_speed_factor: number
  default_pierce_time_s: number
  default_drilling_machine_id?: number | null
  // TD-7: consumo elettrodo = n_fori × profondità × wear × (1 + margin/100)
  electrode_wear_factor: number
  electrode_margin_percent: number
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

// TD-7 — catalogo elettrodi per la foratura (costo per Ø).
export interface Electrode {
  id: number
  diameter_mm: number
  length_mm: number
  price: number
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

export interface DxfPoint { x: number; y: number }
export interface DxfEntity {
  t: 'line' | 'circle' | 'arc' | 'poly'
  x1?: number; y1?: number; x2?: number; y2?: number   // line
  cx?: number; cy?: number; r?: number; a0?: number; a1?: number   // circle/arc
  pts?: number[][]; closed?: boolean                   // poly
}

export interface DxfAnalysis {
  profiles: DxfProfile[]
  bbox_global: DxfBbox
  total_length_mm: number
  n_closed_profiles: number
  suggested_pierce: number
  units: string
  unit_factor?: number   // raw × factor = mm (per l'override mm/pollici nel viewer)
  warnings: string[]
  // Primitive per gli strumenti di misura del viewer (assenti su risposte vecchie).
  snap_points?: DxfPoint[]
  entities?: DxfEntity[]   // entità geometriche vere (line/circle/arc/poly)
}

export interface MonthlyData {
  month: string
  year: number
  quoted_cost: number  // Σ costo stimato dei preventivi venduti nel mese
  sold: number         // Σ prezzo di vendita reale (sold_price)
}

/** Vendita diretta (extra-preventivo): codice + prezzo/costo unitari + qta. */
export interface DirectSale {
  id: number
  code: string
  customer_id?: number | null
  customer_name?: string | null
  category_code?: string | null
  customer_order?: string | null
  customer_article?: string | null
  description?: string | null
  sale_date: string
  unit_price: number
  unit_cost: number
  /** Valore preventivato unitario (preventivo al volo). null = vendita secca. */
  quoted_value?: number | null
  quantity: number
  notes?: string | null
  created_by?: { id: number; full_name?: string | null; username?: string } | null
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
  standard: number      // € preventivati (tutti i preventivi standard)
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

export interface StatsHoursRow {
  label: string
  hours: number
}

export interface StatsOutcome {
  won_count: number
  lost_count: number
  open_count: number
  won_value: number
  lost_value: number
  open_value: number
  conversion_rate: number         // % sul numero di preventivi decisi
  conversion_rate_value: number   // % sul valore € dei preventivi decisi
}

export interface StatsCmpPoint {
  month: string
  value: number
}

export interface StatsQuotesComparison {
  total_value: number
  count: number
  conversion_rate: number
  avg_margin: number | null
  trend_total: StatsCmpPoint[]
  margin_by_month: StatsCmpPoint[]
}

export interface Statistics {
  period: 'year' | '12m' | 'prev_year' | 'all'
  standard_count: number
  outcome?: StatsOutcome
  trend_monthly: StatsTrendPoint[]
  top_customers: StatsCustomerRow[]
  by_category: StatsCategoryRow[]
  margin_monthly: StatsMarginPoint[]
  hours_by_machine: StatsHoursRow[]
  hours_by_operation: StatsHoursRow[]
  lost_by_customer: StatsCustomerRow[]
  lost_monthly: StatsTrendPoint[]
  comparison?: StatsQuotesComparison | null
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

export interface StatsMaterialSupplierRow {
  supplier_name: string
  material_cost: number
  weight_kg: number
  shipping_cost: number
  orders_count: number
}

export interface StatsMaterialRow {
  material_name: string
  material_cost: number
  weight_kg: number
  lines: number
}

export interface MaterialsStats {
  period: string
  total_material_cost: number
  total_weight_kg: number
  total_shipping: number
  orders_count: number
  trend_monthly: StatsCountPoint[]
  top_suppliers: StatsSupplierRow[]
  lead_time_avg_days: number
  lead_time_monthly: StatsLeadTimePoint[]
  by_supplier: StatsMaterialSupplierRow[]
  by_material: StatsMaterialRow[]
}

// Tab "Utensili" — statistiche ordini utensili
export interface StatsToolRow {
  code: string
  total_quantity: number
}

export interface StatsToolTypeRow {
  label: string
  quantity: number
}

export interface StatsToolBrandRow {
  name: string
  value: number
}

export interface ToolsStats {
  period: string
  orders_count: number
  total_quantity: number
  distinct_tools: number
  low_stock_total: number
  trend_monthly: StatsCountPoint[]
  top_suppliers: StatsSupplierRow[]
  top_tools: StatsToolRow[]
  by_type: StatsToolTypeRow[]
  low_stock_by_brand: StatsToolBrandRow[]
}

// ── Statistiche: tab Marginalità & taratura ──
export interface MarginMonthlyPoint {
  month: string
  preventivato: number
  venduto: number
  costo: number
}

export interface MarginProfitPoint {
  month: string
  profit: number
}

export interface IncassatoMonthlyPoint {
  month: string
  preventivi: number
  vendite_dirette: number
}

export interface MarginBandRow {
  band: string
  count: number
}

export interface MarginWorstRow {
  quote_number: string
  customer_name: string
  preventivato: number
  venduto: number
  costo_reale: number | null
  delta_percent: number
}

export interface MarginComparison {
  guadagno_reale: number | null
  taratura_prezzo: number | null
  taratura_costo: number | null
  profit_by_month: MarginProfitPoint[]
}

export interface MarginStats {
  period: string
  guadagno_reale: number | null
  taratura_prezzo: number | null
  taratura_costo: number | null
  incassato: number
  completed_count: number
  with_sold_count: number
  with_cost_count: number
  monthly: MarginMonthlyPoint[]
  profit_monthly: MarginProfitPoint[]
  incassato_monthly: IncassatoMonthlyPoint[]
  top_customers_sold: StatsCustomerRow[]
  distribution: MarginBandRow[]
  worst: MarginWorstRow[]
  comparison?: MarginComparison | null
}

// Tab "Vendite dirette" — statistiche delle sole vendite extra-preventivo
export interface DirectSalesMonthlyPoint {
  month: string
  venduto: number
  costo: number
  guadagno: number
}

export interface DirectSalesCategoryRow {
  category_code: string
  venduto: number
}

export interface DirectSalesStats {
  period: string
  venduto: number
  costo: number
  guadagno: number
  margine_percent: number | null
  count: number
  with_quote_count: number
  monthly: DirectSalesMonthlyPoint[]
  top_customers: StatsCustomerRow[]
  by_category: DirectSalesCategoryRow[]
}


export interface OfficinaCategory {
  id: number
  name: string
  icon: string         // nome lucide-react, mappato via lib/icons.ts
  sort_order: number
  created_at?: string
}

// Registro risultati tempra (Officina). Misure tutte opzionali: l'operatore
// registra solo i valori che ha. Deformazioni derivate in UI (vedi tempraCalc).
export type HeatTreatmentShape = 'tondo' | 'quadrato'

export interface HeatTreatmentResult {
  id: number
  material: string
  shape: HeatTreatmentShape
  temp_insertion_c: number | null
  temp_quench_c: number | null
  temp_temper_c: number | null
  temper_time_min: number | null
  // forma 'tondo'
  outer_dia_pre_mm: number | null
  outer_dia_post_mm: number | null
  inner_dia_pre_mm: number | null
  inner_dia_post_mm: number | null
  // forma 'quadrato'
  width_pre_mm: number | null
  width_post_mm: number | null
  height_pre_mm: number | null
  height_post_mm: number | null
  // comune
  length_pre_mm: number | null
  length_post_mm: number | null
  hardness: string | null
  notes: string | null
  created_at?: string
  created_by?: UserMinimal | null
}
