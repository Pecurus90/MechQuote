import type { Part, Quote, Material, Treatment, CompanySettings } from '@/types'

/** Sibling part contribution per le aggregazioni di costi tra parti del
 *  preventivo commessa. Le dim del grezzo servono solo al ramo €/dm³. */
export interface SiblingWeight {
  finishedWeightKg?: number | null
  qty: number
  raw_x_mm?: number | null
  raw_y_mm?: number | null
  raw_z_mm?: number | null
  raw_diameter_mm?: number | null
}

/** Dimensioni del grezzo per il calcolo del volume (trattamenti €/dm³). */
export interface RawDims {
  raw_x_mm?: number | null
  raw_y_mm?: number | null
  raw_z_mm?: number | null
  raw_diameter_mm?: number | null
}

/** Volume del grezzo (dm³) per una singola unità. Gemello byte-per-byte di
 *  `_raw_volume_dm3` in backend/app/services/calculation.py: cilindro se
 *  `raw_diameter_mm`, prismatico altrimenti, 0 se dati insufficienti. */
function rawVolumeDm3(dims: RawDims | undefined): number {
  if (!dims) return 0
  if (dims.raw_diameter_mm) {
    const r = dims.raw_diameter_mm / 2
    const l = dims.raw_z_mm || 0
    if (!r || !l) return 0
    return (Math.PI * r * r * l) / 1_000_000
  }
  const x = dims.raw_x_mm || 0
  const y = dims.raw_y_mm || 0
  const z = dims.raw_z_mm || 0
  if (!x || !y || !z) return 0
  return (x * y * z) / 1_000_000
}

/**
 * Costo trattamento per pezzo.
 *
 * Gemello DRY del backend `services/calculation.recalculate_quote` —
 * stessa formula. Aggrega le parti del preventivo che condividono lo stesso
 * trattamento (`siblings`); la soglia è sempre sul peso (capacità del
 * forno), il costo è distribuito sul peso (€/kg) o sul volume (€/dm³).
 *
 * Per single quote / chiamata senza `siblings` ([] di default), il
 * comportamento è identico al pre-refactor (1 sola parte = 1 sola batch).
 */
export function calcTreatmentCost(
  t: Treatment,
  finishedWeightKg: number | undefined,
  qty: number,
  siblings: SiblingWeight[] = [],
  partDims?: RawDims,
): number {
  const myWeight = (finishedWeightKg || 0) * Math.max(qty, 1)
  const siblingsWeight = siblings.reduce(
    (s, x) => s + (x.finishedWeightKg || 0) * Math.max(x.qty, 1),
    0,
  )
  const totalBatchWeight = myWeight + siblingsWeight
  const belowThreshold = t.minimum_weight_kg != null && t.minimum_weight_kg > 0 && totalBatchWeight < t.minimum_weight_kg

  // Ramo €/dm³ (C2): trattamenti volumetrici tipo nitrurazione. Soglia
  // comunque sul peso (capacità forno) come nel backend.
  if ((t.cost_unit || 'kg') === 'dm3') {
    const myVol = rawVolumeDm3(partDims) * Math.max(qty, 1)
    const sibVol = siblings.reduce(
      (s, x) => s + rawVolumeDm3(x) * Math.max(x.qty, 1),
      0,
    )
    const batchV = myVol + sibVol
    const totalBatchCost = belowThreshold
      ? (t.minimum_cost || 0)
      : (t.cost_per_dm3 || 0) * batchV
    const partShare = batchV > 0 ? totalBatchCost * myVol / batchV : 0
    return partShare / Math.max(qty, 1)
  }

  // Ramo €/kg (default): invariato.
  const totalBatchCost = belowThreshold
    ? (t.minimum_cost || 0)
    : (t.cost_per_kg || 0) * totalBatchWeight
  // batch_w=0 → tutte le parti del gruppo hanno peso 0: stato invalido
  // temporaneo (treatment selezionato ma peso finito non compilato).
  // PartCard mostra warning rosso sul campo peso (needsFinishedWeight).
  // Costo a 0 in attesa che l'utente compili — gemello di calculation.py:425-432.
  const myShare = totalBatchWeight > 0
    ? totalBatchCost * myWeight / totalBatchWeight
    : 0
  return myShare / Math.max(qty, 1)
}

export function calcMaterialCost(part: Part, material: Material | undefined): number {
  if (!material) return part.material_cost || 0
  const scrap = 1 + (material.default_scrap_percent || 10) / 100
  // tondo: usa raw_diameter_mm + raw_z_mm come lunghezza
  if (part.raw_diameter_mm) {
    const r = part.raw_diameter_mm / 2
    const l = part.raw_z_mm || 0
    if (!r || !l) return part.material_cost || 0
    const volDm3 = (Math.PI * r * r * l) / 1_000_000
    const kg = volDm3 * (material.density_kg_dm3 || 0)
    return Math.round(kg * (material.cost_per_kg || 0) * scrap * 100) / 100
  }
  // prismatico
  const x = part.raw_x_mm || 0, y = part.raw_y_mm || 0, z = part.raw_z_mm || 0
  if (!x || !y || !z) return part.material_cost || 0
  const volDm3 = (x * y * z) / 1_000_000
  const kg = volDm3 * (material.density_kg_dm3 || 0)
  return Math.round(kg * (material.cost_per_kg || 0) * scrap * 100) / 100
}

/** Costo per pezzo di una fase, formula pura (rate già risolte).
 *
 * Gemello DRY del backend `services/calculation.py recalculate_part` e della
 * parte setup di `PartCard.tsx`. Le tariffe sono passate già risolte:
 * `work_rate` = override ?? machine.hourly_rate; `setup_rate` =
 * machine.setup_hourly_rate ?? work_rate. `divisor = qty` (is_shared rimosso).
 */
export function calcPhaseCost(input: {
  setup_hours?: number | null
  cycle_hours_per_part?: number | null
  fixed_cost?: number | null
  variable_cost_per_part?: number | null
  work_rate: number
  setup_rate: number
  qty: number
}): number {
  const divisor = input.qty
  const cost =
    (input.setup_hours || 0) * input.setup_rate / divisor +
    (input.cycle_hours_per_part || 0) * input.work_rate +
    (input.fixed_cost || 0) / divisor +
    (input.variable_cost_per_part || 0)
  return Math.round(cost * 10000) / 10000
}

export function calcPartTotals(
  part: Part,
  globalMargin: number,
  nParts = 1,
  companySettings?: CompanySettings | null,
  nFromStock = 1,
): Part {
  void nParts // reserved for future shared-phase recalc; kept for API parity with backend
  const phaseTotal = part.phases.reduce((s, p) => s + (p.calculated_cost || 0), 0)
  // Branch shipping/cutting — gemello DRY di backend/services/calculation.py
  //   recalculate_quote() (cerca elif part.material_from_stock).
  let materialCost: number
  let deliveryPerPiece: number
  let cuttingPerPiece: number
  if (part.customer_supplied_material) {
    materialCost = 0; deliveryPerPiece = 0; cuttingPerPiece = 0
  } else if (part.material_from_stock && companySettings) {
    materialCost = part.material_cost || 0
    // C3: lo stock_shipping_cost è 1 prelievo dal magazzino, distribuito
    // tra le parti from_stock del preventivo (Math.max(nFromStock,1) per
    // restare neutri sul caso single quote / 1 sola parte).
    deliveryPerPiece = (companySettings.stock_shipping_cost || 0)
      / Math.max(nFromStock, 1) / (part.quantity || 1)
    cuttingPerPiece = companySettings.stock_cutting_cost_per_part || 0
  } else {
    materialCost = part.material_cost || 0
    deliveryPerPiece = (part.material_delivery_cost || 0) / (part.quantity || 1)
    cuttingPerPiece = part.material?.material_supplier?.cutting_cost_per_part || 0
  }
  // total_cost accumula intermedi a 4 decimali (gemello backend calculation.py).
  const totalCost = Math.round(
    (materialCost + deliveryPerPiece + cuttingPerPiece + phaseTotal) * 10000
  ) / 10000
  const margin = part.margin_percent ?? globalMargin
  const minimum = part.minimum_price ?? 0
  // C4: niente doppio arrotondamento. base a piena precisione, unit_price a 4
  // decimali per visualizzazione, total_price arrotondato a 2 dal valore esatto.
  const base = Math.max(totalCost, minimum) * (1 + margin / 100)
  const unitPrice = Math.round(base * 10000) / 10000
  const totalPrice = Math.round(base * (part.quantity || 1) * 100) / 100
  return { ...part, total_cost: totalCost, unit_price: unitPrice, total_price: totalPrice }
}

export function calcQuoteTotal(quote: Quote): number {
  const sub = quote.parts.reduce((s, p) => s + (p.total_price || 0), 0)
  const afterExtras = sub + (quote.transport_cost || 0) + (quote.packaging_cost || 0)
  const discount = afterExtras * ((quote.global_discount_percent || 0) / 100)
  return Math.round((afterExtras - discount) * 100) / 100
}
