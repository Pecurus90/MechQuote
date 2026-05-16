// Calcoli geometrici e di costo lato client per il modulo Preventivatore
// Stampi. Gemello DRY hard rule di:
//   - `_compute_castle_dimensions` in `services/calculation.py`
//   - `_recalculate_die_levels` (limitato a L3/L4) idem
// Usato per: (1) auto-fill X/Y piastre (backend) + render top-view live
// del wizard, (2) live preview di L3/L4 nell'editor — quando l'utente
// cambia difficoltà/feature, vede il nuovo costo aggiornarsi senza
// aspettare il PUT al backend.

import type { DieSpec, DieSettings, DieDimensionBracket } from '@/types'

export interface DieGeometryInput {
  subtype: 'passo' | 'blocco'
  bboxX: number          // mm — ingombro pezzo X
  bboxY: number          // mm — ingombro pezzo Y
  nStations?: number     // passo: numero stazioni (default 1)
  pitchMm?: number       // passo: distanza tra una stazione e l'altra (mm)
                         // — se mancante, fallback a bboxX (pezzi adiacenti senza gap)
  stripOffsetY?: number  // passo: offset Y striscia (mm)
  blockOffset?: number   // blocco: offset striscia attorno al pezzo (mm)
  castleOffsetX?: number // mm
  castleOffsetY?: number // mm
}

export interface DieGeometryOutput {
  stripX: number
  stripY: number
  castleX: number
  castleY: number
  castleAreaDm2: number
}

export function computeDieGeometry(input: DieGeometryInput): DieGeometryOutput {
  const bx = input.bboxX || 0
  const by = input.bboxY || 0
  const offX = input.castleOffsetX || 0
  const offY = input.castleOffsetY || 0

  let stripX: number
  let stripY: number
  if (input.subtype === 'passo') {
    const nSt = input.nStations || 1
    // Passo: distanza tra due ripetizioni del pezzo lungo X. Se manca
    // (preventivi vecchi pre-feature), fallback a bbox X = pezzi adiacenti.
    const pitch = input.pitchMm || bx
    stripX = pitch * nSt
    stripY = by + (input.stripOffsetY || 0)
  } else {
    const off = input.blockOffset || 0
    stripX = bx + off
    stripY = by + off
  }
  const castleX = stripX + 2 * offX
  const castleY = stripY + 2 * offY
  return {
    stripX,
    stripY,
    castleX,
    castleY,
    castleAreaDm2: (castleX * castleY) / 10_000,
  }
}


function bracketCoefficient(areaDm2: number, brackets: DieDimensionBracket[]): number {
  // Lookup fascia dimensionale: area_min ≤ area < area_max. Ultima fascia
  // ha area_max_dm2 = null (= infinito). Gemello di `_bracket_coefficient`.
  for (const b of [...brackets].sort((a, b) => a.sort_order - b.sort_order)) {
    if (b.area_min_dm2 <= areaDm2 && (b.area_max_dm2 == null || areaDm2 < b.area_max_dm2)) {
      return b.coefficient || 1.0
    }
  }
  return 1.0
}


export interface DiePreviewInput {
  spec: DieSpec
  settings: DieSettings
  brackets: DieDimensionBracket[]
  nPlates: number
}

export interface DiePreviewCosts {
  cost_machining: number    // L3
  cost_accessories: number  // L4
}

/** Replica lato client il calcolo di L3 (lavorazioni) e L4 (accessori)
 *  dal backend `_recalculate_die_levels`. Restituisce gli stessi numeri
 *  che produrrebbe il backend dopo un PUT spec, così la UI può mostrare
 *  un valore "live" che riflette le modifiche pending all'utente.
 *
 *  L1 (materiale piastre) e L2 (normalizzati) NON sono qui: dipendono
 *  da Part.total_cost e DieNormalizedItem aggregati che richiedono uno
 *  stato non sempre disponibile lato client. Quelle restano snapshot,
 *  si aggiornano al Save+reload.
 */
export function computeDiePreviewCosts(input: DiePreviewInput): DiePreviewCosts {
  const { spec, settings, brackets, nPlates } = input
  const geom = computeDieGeometry({
    subtype: spec.die_subtype,
    bboxX: spec.bbox_x_mm,
    bboxY: spec.bbox_y_mm,
    nStations: spec.n_stations || undefined,
    pitchMm: spec.pitch_mm || undefined,
    stripOffsetY: spec.strip_offset_y_mm,
    blockOffset: spec.block_strip_offset_mm,
    castleOffsetX: spec.castle_offset_x_mm || undefined,
    castleOffsetY: spec.castle_offset_y_mm || undefined,
  })

  const coeffDim = bracketCoefficient(geom.castleAreaDm2, brackets)
  const coeffDiff = {
    base:   settings.diff_mult_base,
    medium: settings.diff_mult_medium,
    hard:   settings.diff_mult_hard,
  }[spec.difficulty] || 1.0

  // L3: feature × coeff_dim × coeff_diff + cost_per_plate_base × n_plates
  const featureCost =
      spec.n_bends_simple    * settings.cost_bend_simple
    + spec.n_bends_medium    * settings.cost_bend_medium
    + spec.n_bends_complex   * settings.cost_bend_complex
    + spec.n_punches_simple  * settings.cost_punch_simple
    + spec.n_punches_medium  * settings.cost_punch_medium
    + spec.n_punches_complex * settings.cost_punch_complex
  const cost_machining = featureCost * coeffDim * coeffDiff + settings.cost_per_plate_base * nPlates

  // L4: design_hours[diff] × design_rate + assembly_forfeit[diff] + extras
  const designHours = {
    base:   settings.design_hours_base,
    medium: settings.design_hours_medium,
    hard:   settings.design_hours_hard,
  }[spec.difficulty] || 0
  const assembly = {
    base:   settings.assembly_forfeit_base,
    medium: settings.assembly_forfeit_medium,
    hard:   settings.assembly_forfeit_hard,
  }[spec.difficulty] || 0
  const cost_accessories =
    designHours * settings.design_hourly_rate + assembly + (spec.extras_amount || 0)

  return {
    cost_machining: Math.round(cost_machining * 100) / 100,
    cost_accessories: Math.round(cost_accessories * 100) / 100,
  }
}
