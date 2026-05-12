import type { Part, Quote, Material, Treatment, CompanySettings } from '@/types'

/** Sibling part contribution (peso fisico × qty) per le aggregazioni di
 *  costi tra parti del preventivo commessa. */
export interface SiblingWeight {
  finishedWeightKg?: number | null
  qty: number
}

/**
 * Costo trattamento per pezzo.
 *
 * Gemello DRY del backend `services/calculation.recalculate_quote` —
 * stessa formula. Aggrega i pesi delle parti del preventivo che condividono
 * lo stesso trattamento (`siblings`): la soglia viene applicata sul peso
 * totale del batch, e il costo distribuito proporzionale al peso.
 *
 * Per single quote / chiamata senza `siblings` ([] di default), il
 * comportamento è identico al pre-refactor (1 sola parte = 1 sola batch).
 */
export function calcTreatmentCost(
  t: Treatment,
  finishedWeightKg: number | undefined,
  qty: number,
  siblings: SiblingWeight[] = [],
): number {
  const myWeight = (finishedWeightKg || 0) * Math.max(qty, 1)
  const siblingsWeight = siblings.reduce(
    (s, x) => s + (x.finishedWeightKg || 0) * Math.max(x.qty, 1),
    0,
  )
  const totalBatchWeight = myWeight + siblingsWeight
  const belowThreshold = t.minimum_weight_kg != null && t.minimum_weight_kg > 0 && totalBatchWeight < t.minimum_weight_kg
  const totalBatchCost = belowThreshold
    ? (t.minimum_cost || 0)
    : (t.cost_per_kg || 0) * totalBatchWeight
  const myShare = totalBatchWeight > 0
    ? totalBatchCost * myWeight / totalBatchWeight
    : totalBatchCost / (1 + siblings.length)
  return myShare / Math.max(qty, 1)
}

/**
 * Quota di parte della spedizione (materiale o trattamento) condivisa
 * tra le parti che hanno lo stesso supplier. Distribuzione proporzionale
 * al peso. Edge case nessun peso → parti uguali nel gruppo.
 */
export function calcShippingShare(
  totalShipping: number,
  myWeight: number,
  siblingsWeight: number[] = [],
): number {
  const totalWeight = myWeight + siblingsWeight.reduce((s, w) => s + w, 0)
  if (totalWeight <= 0) {
    return totalShipping / (1 + siblingsWeight.length)
  }
  return totalShipping * myWeight / totalWeight
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
    const kg = volDm3 * material.density_kg_dm3
    return Math.round(kg * material.cost_per_kg * scrap * 100) / 100
  }
  // prismatico
  const x = part.raw_x_mm || 0, y = part.raw_y_mm || 0, z = part.raw_z_mm || 0
  if (!x || !y || !z) return part.material_cost || 0
  const volDm3 = (x * y * z) / 1_000_000
  const kg = volDm3 * material.density_kg_dm3
  return Math.round(kg * material.cost_per_kg * scrap * 100) / 100
}

export function calcPartTotals(
  part: Part,
  globalMargin: number,
  nParts = 1,
  companySettings?: CompanySettings | null,
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
    deliveryPerPiece = (companySettings.stock_shipping_cost || 0) / (part.quantity || 1)
    cuttingPerPiece = companySettings.stock_cutting_cost_per_part || 0
  } else {
    materialCost = part.material_cost || 0
    deliveryPerPiece = (part.material_delivery_cost || 0) / (part.quantity || 1)
    cuttingPerPiece = part.material?.material_supplier?.cutting_cost_per_part || 0
  }
  // total_cost accumula intermedi a 4 decimali (gemello backend calculation.py:290-292).
  // Solo unit_price e total_price finali arrotondano a 2 (mostrati all'utente).
  const totalCost = Math.round(
    (materialCost + deliveryPerPiece + cuttingPerPiece + phaseTotal) * 10000
  ) / 10000
  const margin = part.margin_percent ?? globalMargin
  const minimum = part.minimum_price ?? 0
  const base = Math.max(totalCost, minimum)
  const unitPrice = Math.round(base * (1 + margin / 100) * 100) / 100
  const totalPrice = Math.round(unitPrice * (part.quantity || 1) * 100) / 100
  return { ...part, total_cost: totalCost, unit_price: unitPrice, total_price: totalPrice }
}

export function calcQuoteTotal(quote: Quote): number {
  const sub = quote.parts.reduce((s, p) => s + (p.total_price || 0), 0)
  const afterExtras = sub + (quote.transport_cost || 0) + (quote.packaging_cost || 0)
  const discount = afterExtras * ((quote.global_discount_percent || 0) / 100)
  return Math.round((afterExtras - discount) * 100) / 100
}
