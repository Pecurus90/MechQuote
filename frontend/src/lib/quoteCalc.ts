import type { Part, Quote, Material } from '@/types'

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

export function calcPartTotals(part: Part, globalMargin: number): Part {
  const phaseTotal = part.phases.reduce((s, p) => s + (p.calculated_cost || 0), 0)
  const totalCost = Math.round(((part.material_cost || 0) + phaseTotal) * 100) / 100
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
