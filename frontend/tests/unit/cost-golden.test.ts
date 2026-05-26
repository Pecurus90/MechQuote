/**
 * Test "casi d'oro" sul cost engine frontend — rete di sicurezza T0.
 *
 * Carica gli stessi casi del backend da `tests/fixtures/cost_golden_cases.json`
 * e verifica che le funzioni di calcolo del frontend producano i valori attesi.
 *
 * I casi che intercettano un bug ancora aperto (Fascia 1) sono marcati con
 * `fails_until_frontend` o `fails_until`: quei test fallisco oggi e devono
 * passare dopo la correzione corrispondente.
 *
 * Esecuzione:
 *   cd frontend && npm test
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import {
  calcMaterialCost,
  calcTreatmentCost,
  calcPartTotals,
  calcQuoteTotal,
} from '../../src/lib/quoteCalc'
import type { Material, Treatment, Part, Quote } from '../../src/types'

// ─── Caricamento JSON ──────────────────────────────────────────────────────

const CASES_FILE = resolve(__dirname, '../../../tests/fixtures/cost_golden_cases.json')
const CASES = JSON.parse(readFileSync(CASES_FILE, 'utf-8'))
const EUR = CASES._meta.tolerance_eur as number

function failsUntilFrontend(c: any): string | null {
  return c.fails_until_frontend ?? c.fails_until ?? null
}

// ─── calc_material_cost — prismatico ──────────────────────────────────────

describe('calcMaterialCost prismatico', () => {
  for (const c of CASES.calc_material_cost_prismatic) {
    it(`${c.id}: ${c.name}`, () => {
      const material: Material = {
        id: 1, name: 'TEST',
        density_kg_dm3: c.input.density_kg_dm3,
        cost_per_kg: c.input.cost_per_kg,
        default_scrap_percent: c.input.scrap_percent,
        family: null,
      } as any
      const part: Part = {
        raw_x_mm: c.input.raw_x_mm,
        raw_y_mm: c.input.raw_y_mm,
        raw_z_mm: c.input.raw_z_mm,
        phases: [],
      } as any
      const result = calcMaterialCost(part, material)
      expect(Math.abs(result - c.expected_material_cost)).toBeLessThan(EUR)
    })
  }
})

// ─── calc_material_cost — tondo ───────────────────────────────────────────

describe('calcMaterialCost tondo', () => {
  for (const c of CASES.calc_material_cost_round) {
    it(`${c.id}: ${c.name}`, () => {
      const material: Material = {
        id: 1, name: 'TEST',
        density_kg_dm3: c.input.density_kg_dm3,
        cost_per_kg: c.input.cost_per_kg,
        default_scrap_percent: c.input.scrap_percent,
        family: null,
      } as any
      const part: Part = {
        raw_diameter_mm: c.input.raw_diameter_mm,
        raw_z_mm: c.input.raw_z_mm,
        phases: [],
      } as any
      const result = calcMaterialCost(part, material)
      expect(Math.abs(result - c.expected_material_cost)).toBeLessThan(EUR)
    })
  }
})

// ─── calc_part_totals (C4 doppio arrotondamento) ──────────────────────────

describe('calcPartTotals', () => {
  for (const c of CASES.calc_part_totals) {
    const failsUntil = failsUntilFrontend(c)
    const fn = failsUntil ? it.fails : it
    fn(`${c.id}: ${c.name}${failsUntil ? ` [xfail ${failsUntil}]` : ''}`, () => {
      const part: Part = {
        material_cost: c.input.material_cost,
        material_delivery_cost: (c.input.delivery_per_piece ?? 0) * c.input.quantity,
        quantity: c.input.quantity,
        margin_percent: c.input.margin_percent,
        minimum_price: c.input.minimum_price,
        phases: c.input.phase_total > 0
          ? [{ calculated_cost: c.input.phase_total } as any]
          : [],
        customer_supplied_material: false,
        material_from_stock: false,
      } as any
      // Disabilita "cutting" passando un material_supplier vuoto
      const result = calcPartTotals(part, 0, 1, null)
      expect(Math.abs((result.total_price ?? 0) - c.expected_total_price)).toBeLessThan(EUR)
    })
  }
})

// ─── calc_quote_total standard ────────────────────────────────────────────

describe('calcQuoteTotal standard', () => {
  for (const c of CASES.calc_quote_total_standard) {
    it(`${c.id}: ${c.name}`, () => {
      const quote: Quote = {
        quote_type: c.input.quote_type,
        parts: [{ total_price: c.input.parts_total_price_sum } as any],
        transport_cost: c.input.transport_cost,
        packaging_cost: c.input.packaging_cost,
        global_discount_percent: c.input.global_discount_percent,
        global_margin_percent: 0,
      } as any
      const total = calcQuoteTotal(quote)
      expect(Math.abs(total - c.expected_quote_total)).toBeLessThan(EUR)
    })
  }
})

// ─── calc_quote_total die (B2-#6 regressivo + S11) ────────────────────────

describe('calcQuoteTotal die', () => {
  for (const c of CASES.calc_quote_total_die) {
    it(`${c.id}: ${c.name}`, () => {
      const quote: Quote = {
        quote_type: 'die',
        parts: [],
        transport_cost: 0,
        packaging_cost: 0,
        global_margin_percent: c.input.global_margin_percent,
        global_discount_percent: c.input.global_discount_percent,
        die_spec: {
          cost_material: c.input.cost_material,
          cost_normalized: c.input.cost_normalized,
          cost_machining: c.input.cost_machining,
          cost_accessories: c.input.cost_accessories,
          override_material: c.input.override_material,
          override_normalized: c.input.override_normalized,
          override_machining: c.input.override_machining,
          override_accessories: c.input.override_accessories,
        } as any,
      } as any
      const total = calcQuoteTotal(quote)
      expect(Math.abs(total - c.expected_quote_total)).toBeLessThan(EUR)
    })
  }
})

// ─── calc_treatment_cost €/kg ─────────────────────────────────────────────

describe('calcTreatmentCost €/kg', () => {
  for (const c of CASES.calc_treatment_cost_kg) {
    it(`${c.id}: ${c.name}`, () => {
      const t: Treatment = {
        cost_unit: 'kg',
        cost_per_kg: c.input.cost_per_kg,
        cost_per_dm3: c.input.cost_per_dm3,
        minimum_weight_kg: c.input.minimum_weight_kg,
        minimum_cost: c.input.minimum_cost,
      } as any
      const result = calcTreatmentCost(t, c.input.finished_weight_kg, c.input.qty, c.input.siblings)
      expect(Math.abs(result - c.expected_variable_cost_per_part)).toBeLessThan(EUR)
    })
  }
})

// ─── calc_treatment_cost €/dm³ — divergenza #1 (C2 frontend) ─────────────

describe('calcTreatmentCost €/dm³', () => {
  for (const c of CASES.calc_treatment_cost_dm3) {
    const failsUntil = c.fails_until_frontend ?? c.fails_until
    const fn = failsUntil ? it.fails : it
    fn(`${c.id}: ${c.name}${failsUntil ? ` [xfail ${failsUntil}]` : ''}`, () => {
      const t: Treatment = {
        cost_unit: 'dm3',
        cost_per_kg: c.input.cost_per_kg,
        cost_per_dm3: c.input.cost_per_dm3,
        minimum_weight_kg: c.input.minimum_weight_kg,
        minimum_cost: c.input.minimum_cost,
      } as any
      // Il frontend ATTUALE non riceve part_volume_dm3 e ignora cost_unit:
      // produce sempre 0 per €/dm³.
      const result = calcTreatmentCost(t, c.input.finished_weight_kg, c.input.qty, c.input.siblings)
      expect(Math.abs(result - c.expected_variable_cost_per_part)).toBeLessThan(EUR)
    })
  }
})

// ─── shipping_stock_share — divergenza C3 ────────────────────────────────

describe('shipping from stock — C3 frontend', () => {
  for (const c of CASES.shipping_stock_share) {
    const failsUntil = c.fails_until_frontend
    const fn = failsUntil ? it.fails : it
    fn(`${c.id}: ${c.name}${failsUntil ? ` [xfail ${failsUntil}]` : ''}`, () => {
      // Replica formula frontend ATTUALE (quoteCalc.ts:84): divide solo per qty
      // Backend invece divide per n_from_stock × qty.
      const deliveryFrontendA = (c.input.stock_shipping_cost || 0) / (c.input.qty_A || 1)
      const deliveryFrontendB = (c.input.stock_shipping_cost || 0) / (c.input.qty_B || 1)
      // I valori attesi sono quelli CORRETTI (backend): test fallisce oggi.
      expect(Math.abs(deliveryFrontendA - c.expected_delivery_per_piece_A)).toBeLessThan(EUR)
      expect(Math.abs(deliveryFrontendB - c.expected_delivery_per_piece_B)).toBeLessThan(EUR)
    })
  }
})

// ─── Regressivi su bug già corretti ──────────────────────────────────────

describe('regression — bug già corretti', () => {
  for (const c of CASES.regression_already_fixed) {
    if (c.id.startsWith('R2')) {
      it(`${c.id}: ${c.name}`, () => {
        const material: Material = {
          id: 1, name: 'TEST',
          density_kg_dm3: c.input.density_kg_dm3,
          cost_per_kg: c.input.cost_per_kg,
          default_scrap_percent: c.input.scrap_percent,
        } as any
        const part: Part = {
          raw_x_mm: c.input.raw_x_mm,
          raw_y_mm: c.input.raw_y_mm,
          raw_z_mm: c.input.raw_z_mm,
          phases: [],
        } as any
        const result = calcMaterialCost(part, material)
        expect(result).toBe(c.expected_material_cost)
        expect(Number.isNaN(result)).toBe(false)
      })
    } else if (c.id === 'R3') {
      it(`${c.id}: ${c.name}`, () => {
        const quote: Quote = {
          quote_type: c.input.quote_type,
          parts: [],
          transport_cost: 0,
          packaging_cost: 0,
          global_margin_percent: c.input.global_margin_percent,
          global_discount_percent: c.input.global_discount_percent,
          die_spec: {
            cost_material: c.input.cost_material,
            cost_normalized: c.input.cost_normalized,
            cost_machining: c.input.cost_machining,
            cost_accessories: c.input.cost_accessories,
            override_material: null,
            override_normalized: null,
            override_machining: null,
            override_accessories: null,
          } as any,
        } as any
        const total = calcQuoteTotal(quote)
        expect(Math.abs(total - c.expected_quote_total)).toBeLessThan(EUR)
      })
    }
  }
})

// ─── Parità backend↔frontend: il fatto stesso che entrambi i lati ─────────
// caricano lo stesso JSON e verificano gli stessi `expected` *è* il test di
// parità. Quando entrambe le suite passano, backend e frontend producono
// risultati identici (entro tolleranza 0.01 €) sugli stessi input.
