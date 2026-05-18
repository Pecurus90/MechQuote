// Calcoli geometrici e di costo lato client per il modulo Preventivatore
// Stampi. Gemello DRY hard rule di:
//   - `_compute_castle_dimensions` in `services/calculation.py`
//   - `_recalculate_die_levels` (limitato a L3/L4) idem
// Usato per: (1) auto-fill X/Y piastre (backend) + render top-view live
// del wizard, (2) live preview di L3/L4 nell'editor — quando l'utente
// cambia difficoltà/feature, vede il nuovo costo aggiornarsi senza
// aspettare il PUT al backend.

import type { DieSpec, DieSettings, DieDimensionBracket, Part } from '@/types'

// Sprint B — default produttività per ruolo piastra (fallback se lo snapshot
// su Part è NULL). Coerente con `_PLATE_ROLE_DEFAULTS` in calculation.py.
const PLATE_ROLE_DEFAULTS: Record<string, [number, number, number, number, number]> = {
  cappello:      [0.3, 1, 0, 1, 0.0],
  porta_punzoni: [0.5, 2, 1, 2, 0.4],
  premilamiera:  [0.4, 2, 1, 1, 0.0],
  matrice:       [0.5, 2, 2, 2, 0.5],
  base:          [0.3, 1, 0, 1, 0.0],
}

/** Stima ore meccaniche per una piastra. Gemello di `_estimate_die_plate_hours`
 *  in `services/calculation.py`. Usato nell'editor stampi per mostrare le ore
 *  per ogni piastra senza dover aspettare il PUT al backend. */
export function estimateDiePlateHours(plate: Part, spec: DieSpec, settings: DieSettings): number {
  if (!plate.plate_role) return 0
  const areaDm2 = ((plate.raw_x_mm || 0) * (plate.raw_y_mm || 0)) / 10_000
  if (areaDm2 <= 0) return 0
  const defaults = PLATE_ROLE_DEFAULTS[plate.plate_role] ?? [0.4, 2, 0, 1, 0]
  const setupH    = plate.die_setup_h         ?? defaults[0]
  const nMilled   = plate.die_n_milled_faces  ?? defaults[1]
  const nGround   = plate.die_n_ground_faces  ?? defaults[2]
  const nDrilled  = plate.die_n_drilled_faces ?? defaults[3]
  const stationBn = plate.die_station_bonus_h ?? defaults[4]
  let ore =
      setupH
    + areaDm2 * nMilled  * (settings.milling_h_per_dm2  ?? 0.15)
    + areaDm2 * nGround  * (settings.grinding_h_per_dm2 ?? 0.10)
    + areaDm2 * nDrilled * (settings.drilling_h_per_dm2 ?? 0.20)
    + (spec.n_stations || 1) * stationBn
  const threshold = settings.large_plate_threshold_dm2 ?? 80
  const factor = settings.large_plate_factor ?? 1
  if (areaDm2 > threshold && factor > 1) ore *= factor
  return Math.round(ore * 1000) / 1000
}

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


export interface DiePreviewInput {
  spec: DieSpec
  settings: DieSettings
  /** @deprecated Sprint D — non più usato dal preview (L3 deriva dai driver
   *  geometrici via mech+EDM lato backend). Mantenuto per retro-compat dei
   *  call site, ignorato. */
  brackets?: DieDimensionBracket[]
  /** @deprecated Sprint D — non più usato. */
  nPlates?: number
}

export interface DiePreviewCosts {
  /** L4 accessori (preview live di design ore × tariffa + assembly + extras
   *  + bonus feature). L3 (mech+EDM) richiede il lookup EdmCutSpeed lato
   *  backend, quindi non è qui — l'utente vede gli snapshot DB aggiornati
   *  dopo il save. */
  cost_accessories: number
}

/** Sprint D — preview live di L4 lato client. L3 (mech+EDM) richiede il
 *  lookup EdmCutSpeed e l'aggregazione su tutte le piastre, troppo per il
 *  preview live: si refreshano al save+reload via snapshot DieSpec.
 */
export function computeDiePreviewCosts(input: DiePreviewInput): DiePreviewCosts {
  const { spec, settings } = input

  // L4: (design_hours[diff] + n_bends*0.4 + n_punches*0.3) × design_rate
  //     + assembly_forfeit[diff] + extras
  const baseDesignHours = {
    base:   settings.design_hours_base,
    medium: settings.design_hours_medium,
    hard:   settings.design_hours_hard,
  }[spec.difficulty] || 0
  const nBendsTotal = spec.n_bends_simple + spec.n_bends_medium + spec.n_bends_complex
  const nPunchesTotal = spec.n_punches_simple + spec.n_punches_medium + spec.n_punches_complex
  const designHours = baseDesignHours + nBendsTotal * 0.4 + nPunchesTotal * 0.3
  const assembly = {
    base:   settings.assembly_forfeit_base,
    medium: settings.assembly_forfeit_medium,
    hard:   settings.assembly_forfeit_hard,
  }[spec.difficulty] || 0
  const cost_accessories =
    designHours * settings.design_hourly_rate + assembly + (spec.extras_amount || 0)

  return {
    cost_accessories: Math.round(cost_accessories * 100) / 100,
  }
}
