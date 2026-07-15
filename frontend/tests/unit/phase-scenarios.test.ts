/**
 * Casi d'uso del costo fase nel preventivatore + regressione del bug
 * "le ore del cnc5 non vengono ricalcolate" (fase macchina azzerata quando il
 * catalogo macchine non è ancora caricato).
 *
 * Il cost engine è già coperto dai golden (cost-golden.test.ts); qui isoliamo
 * gli scenari fase per parlare la lingua dell'utente (macchina, conto lavoro a
 * lotto, conto lavoro cad1, override, trattamento) e blindare la causa del bug.
 */
import { describe, expect, it } from 'vitest'
import { calcPhaseCost, calcPartTotals } from '../../src/lib/quoteCalc'
import type { Part } from '../../src/types'

const EUR = 0.01

// Helper: costo fase con default a 0, si sovrascrive solo ciò che serve.
const phase = (o: Partial<Parameters<typeof calcPhaseCost>[0]>) =>
  calcPhaseCost({
    setup_hours: 0, cycle_hours_per_part: 0, fixed_cost: 0,
    variable_cost_per_part: 0, work_rate: 0, setup_rate: 0, qty: 1, ...o,
  })

describe('costo fase — casi d\'uso', () => {
  it('macchina CNC: setup ammortizzato su qty + ciclo a tariffa lavoro', () => {
    // Caso reale (Mazak cnc_5_axis): setup 0.5h × 40€/h / 10pz + 1.0h × 100€/h
    const cost = phase({
      setup_hours: 0.5, cycle_hours_per_part: 1.0,
      setup_rate: 40, work_rate: 100, qty: 10,
    })
    expect(Math.abs(cost - 102)).toBeLessThan(EUR) // 2 + 100
  })

  it('tariffa override sostituisce la tariffa macchina sul ciclo', () => {
    const cost = phase({ cycle_hours_per_part: 2, work_rate: 80, setup_rate: 0, qty: 1 })
    expect(cost).toBe(160)
  })

  it('conto lavoro esterno a LOTTO: costo fisso ammortizzato su qty', () => {
    // 460€ per l'intero lotto di 10 pezzi → 46 €/pz (come nell'ultimo preventivo)
    expect(phase({ fixed_cost: 460, qty: 10 })).toBe(46)
  })

  it('conto lavoro esterno CAD1: costo variabile per pezzo, non ammortizzato', () => {
    // 46 €/pz resta 46 €/pz a qualunque quantità
    expect(phase({ variable_cost_per_part: 46, qty: 10 })).toBe(46)
    expect(phase({ variable_cost_per_part: 46, qty: 1 })).toBe(46)
  })

  it('combinato: setup + ciclo + fisso + variabile', () => {
    const cost = phase({
      setup_hours: 1, cycle_hours_per_part: 0.5, fixed_cost: 100,
      variable_cost_per_part: 2, work_rate: 60, setup_rate: 40, qty: 10,
    })
    // 40/10 + 30 + 100/10 + 2 = 4 + 30 + 10 + 2 = 46
    expect(Math.abs(cost - 46)).toBeLessThan(EUR)
  })
})

describe('REGRESSIONE bug "cnc5 non ricalcolato" — fase macchina senza tariffa', () => {
  // Meccanismo del bug: se calcPhase gira col catalogo macchine ancora vuoto,
  // la macchina non viene trovata → work_rate/setup_rate = 0 → il costo LAVORO
  // collassa a 0 anche se le ore sono scritte. Il fix mette una guardia
  // (`if (!machines.length) return`) in PhaseEditor perché questo non accada.
  it('ore presenti ma tariffa 0 → costo lavoro = 0 (ecco perché serve la guardia)', () => {
    const cost = phase({ setup_hours: 0.5, cycle_hours_per_part: 1.0, work_rate: 0, setup_rate: 0, qty: 10 })
    expect(cost).toBe(0)
  })

  it('con la tariffa presente lo stesso input dà il costo giusto', () => {
    const cost = phase({ setup_hours: 0.5, cycle_hours_per_part: 1.0, work_rate: 100, setup_rate: 40, qty: 10 })
    expect(Math.abs(cost - 102)).toBeLessThan(EUR)
  })

  it('una fase SENZA macchina (conto lavoro) non è toccata dal problema', () => {
    // Solo fisso/variabile → indipendente dalla tariffa macchina.
    expect(phase({ fixed_cost: 460, qty: 10 })).toBe(46)
  })
})

describe('totale parte con fase macchina + margine', () => {
  it('materiale + fasi, poi margine → prezzo unitario e totale', () => {
    const part: Part = {
      material_cost: 20, material_delivery_cost: 0, quantity: 10,
      margin_percent: 30, minimum_price: 0,
      customer_supplied_material: false, material_from_stock: false,
      phases: [{ calculated_cost: 102 } as never],
    } as never
    const res = calcPartTotals(part, 0, 1, null)
    // total_cost = 20 + 102 = 122 ; unit = 122×1.30 = 158.6 ; totale = ×10
    expect(Math.abs((res.unit_price ?? 0) - 158.6)).toBeLessThan(EUR)
    expect(Math.abs((res.total_price ?? 0) - 1586)).toBeLessThan(EUR)
  })

  it('se la fase macchina è azzerata (bug), il totale crolla — la parte perde 102€/pz', () => {
    const part: Part = {
      material_cost: 20, material_delivery_cost: 0, quantity: 10,
      margin_percent: 30, minimum_price: 0,
      customer_supplied_material: false, material_from_stock: false,
      phases: [{ calculated_cost: 0 } as never],
    } as never
    const res = calcPartTotals(part, 0, 1, null)
    expect(Math.abs((res.unit_price ?? 0) - 26)).toBeLessThan(EUR) // 20×1.30
  })
})
