// Calcoli geometrici e di costo lato client per il modulo Preventivatore
// Stampi. Gemello DRY hard rule di:
//   - `_compute_castle_dimensions` in `services/calculation.py`
//   - `_recalculate_die_levels` (limitato a L3/L4) idem
// Usato per: (1) auto-fill X/Y piastre (backend) + render top-view live
// del wizard, (2) live preview di L3/L4 nell'editor — quando l'utente
// cambia difficoltà/feature, vede il nuovo costo aggiornarsi senza
// aspettare il PUT al backend.

import type {
  DieSpec, DieSettings, DieDimensionBracket, Part,
  EdmConfig, EdmCutSpeed, CuttingCycle, Material,
} from '@/types'

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
 *  in `services/calculation.py`. Sprint F: scala piastra via lookup
 *  `DieDimensionBracket` invece di soglia binaria. */
export function estimateDiePlateHours(
  plate: Part,
  spec: DieSpec,
  settings: DieSettings,
  brackets: DieDimensionBracket[] = [],
): number {
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
  // Sprint F — scala piastra da fascia configurabile (gemello _bracket_coefficient).
  if (brackets && brackets.length > 0) {
    const sorted = [...brackets].sort((a, b) => a.sort_order - b.sort_order)
    for (const b of sorted) {
      if (b.area_min_dm2 <= areaDm2 && (b.area_max_dm2 == null || areaDm2 < b.area_max_dm2)) {
        ore *= b.coefficient || 1.0
        break
      }
    }
  }
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


// Sprint G — gemello DRY di `_compute_edm_hours_pure` (calculation.py).
// Calcola ore EDM da geometria pura. Ritorna null se mancano dati per il
// lookup (no family/cycle/speed match): il chiamante usa fallback.
export function computeEdmHoursPure(
  cutLengthMm: number,
  cutHeightMm: number,
  materialFamily: string | null | undefined,
  cycleId: number | null | undefined,
  nPierce: number,
  edmCfg: EdmConfig | null,
  edmSpeeds: EdmCutSpeed[],
  cycles: CuttingCycle[],
): number | null {
  if (!cutLengthMm || !cutHeightMm || !cycleId || !materialFamily || !edmCfg) return null
  const speedRow = edmSpeeds.find(s =>
    s.material_family === materialFamily
    && s.thickness_min_mm <= cutHeightMm
    && s.thickness_max_mm >= cutHeightMm
  )
  if (!speedRow || !speedRow.speed_mm_per_min) return null
  const cycle = cycles.find(c => c.id === cycleId)
  if (!cycle || !cycle.passes || cycle.passes.length === 0) return null
  const factorFor: Record<string, number> = {
    rough: edmCfg.rough_speed_factor,
    semi: edmCfg.semi_speed_factor,
    finish: edmCfg.finish_speed_factor,
  }
  const baseSpeed = speedRow.speed_mm_per_min
  const pierceTime = speedRow.pierce_time_s ?? edmCfg.default_pierce_time_s
  let totalMin = 0
  for (const p of cycle.passes) {
    const factor = factorFor[p.pass_type] ?? 1.0
    const speedPass = baseSpeed * factor
    if (speedPass > 0) totalMin += cutLengthMm / speedPass
  }
  totalMin += (nPierce || 0) * pierceTime / 60
  return Math.round(totalMin / 60 * 10000) / 10000
}

// Sprint G — gemello DRY di `_estimate_die_edm_hours` (calculation.py).
// Restituisce ore EDM per piastra (mappa plate_id → ore).
export function estimateDieEdmHours(
  spec: DieSpec,
  plates: Part[],
  materials: Material[],
  settings: DieSettings,
  edmCfg: EdmConfig | null,
  edmSpeeds: EdmCutSpeed[],
  cycles: CuttingCycle[],
): Record<number, number> {
  if (!plates.length || !edmCfg) return {}
  // Perimetro: esplicito o fallback 2*(X+Y)*complexity_factor
  let perimeter = spec.perimeter_pezzo_mm ?? 0
  if (!perimeter || perimeter <= 0) {
    const cf = spec.complexity_factor ?? 1.2
    perimeter = 2 * ((spec.bbox_x_mm || 0) + (spec.bbox_y_mm || 0)) * cf
  }
  if (perimeter <= 0) return {}

  const nStations = spec.n_stations || 1
  let cycleId = settings.wire_edm_cycle_id ?? null
  if (!cycleId) {
    const firstActive = cycles.find(c => c.active)
    cycleId = firstActive ? firstActive.id : null
  }
  if (!cycleId) return {}

  const extractorF = settings.edm_extractor_factor ?? 0.6
  const punchF = settings.edm_punch_factor ?? 0.3
  const nPunchesWeighted = (spec.n_punches_medium || 0) + 1.5 * (spec.n_punches_complex || 0)
  const punchExtraLength = perimeter * nPunchesWeighted * punchF

  const out: Record<number, number> = {}
  for (const plate of plates) {
    const role = plate.plate_role
    if (role !== 'matrice' && role !== 'porta_punzoni') continue
    if (!plate.material_id) continue
    const mat = materials.find(m => m.id === plate.material_id)
    if (!mat || !mat.family) continue
    const length = role === 'matrice'
      ? perimeter * nStations
      : perimeter * nStations * extractorF + punchExtraLength
    const ore = computeEdmHoursPure(
      length,
      plate.raw_z_mm || 0,
      mat.family,
      cycleId,
      nStations,
      edmCfg,
      edmSpeeds,
      cycles,
    )
    if (ore != null && plate.id != null) out[plate.id] = ore
  }
  return out
}

export interface DiePreviewInput {
  spec: DieSpec
  settings: DieSettings
  /** Sprint G — Materiali del catalogo per lookup family su piastre EDM. */
  materials?: Material[]
  /** Sprint G — Parts/piastre per calcolare ore mech+EDM live. */
  plates?: Part[]
  /** Sprint F — fasce piastra per applicare il moltiplicatore scala. */
  brackets?: DieDimensionBracket[]
  /** Sprint G — config + velocità + cicli EDM per il lookup live. */
  edmCfg?: EdmConfig | null
  edmSpeeds?: EdmCutSpeed[]
  cycles?: CuttingCycle[]
  /** Sprint G — id macchine agganciate (per risolvere tariffe lato client). */
  machineRates?: { mill: number; grind: number; drill: number; edm: number }
}

export interface DiePreviewCosts {
  /** L3 mech: ore meccaniche piastre × tariffe per operazione. */
  cost_machining_mech: number
  /** L3 EDM: ore EDM filo piastre × tariffa EDM. */
  cost_machining_edm: number
  /** L3 totale = mech + EDM (sostituisce snapshot DB nell'editor). */
  cost_machining: number
  /** L4 accessori. */
  cost_accessories: number
}

/** Sprint G — preview live L3 (mech+EDM) + L4 lato client. Gemello DRY del
 *  blocco `_recalculate_die_levels` in calculation.py. L1/L2 restano
 *  snapshot DB (richiedono aggregazione Part.total_cost + DieNormalizedItem).
 */
export function computeDiePreviewCosts(input: DiePreviewInput): DiePreviewCosts {
  const { spec, settings, materials, plates, brackets, edmCfg, edmSpeeds, cycles, machineRates } = input

  // L3 mech: somma breakdown per ogni piastra × tariffe per op (Sprint F).
  let cost_machining_mech = 0
  const rates = machineRates ?? { mill: 0, grind: 0, drill: 0, edm: 0 }
  if (plates && plates.length > 0) {
    for (const p of plates) {
      if (!p.plate_role) continue
      const areaDm2 = ((p.raw_x_mm || 0) * (p.raw_y_mm || 0)) / 10_000
      if (areaDm2 <= 0) continue
      const defaults = PLATE_ROLE_DEFAULTS[p.plate_role] ?? [0.4, 2, 0, 1, 0]
      const setupH    = p.die_setup_h         ?? defaults[0]
      const nMilled   = p.die_n_milled_faces  ?? defaults[1]
      const nGround   = p.die_n_ground_faces  ?? defaults[2]
      const nDrilled  = p.die_n_drilled_faces ?? defaults[3]
      const stationBn = p.die_station_bonus_h ?? defaults[4]
      const oreSetup  = setupH
      const oreMill   = areaDm2 * nMilled  * (settings.milling_h_per_dm2  ?? 0.15)
      const oreGrind  = areaDm2 * nGround  * (settings.grinding_h_per_dm2 ?? 0.10)
      const oreDrill  = areaDm2 * nDrilled * (settings.drilling_h_per_dm2 ?? 0.20)
      const oreStation = (spec.n_stations || 1) * stationBn
      // Scala piastra
      let scale = 1.0
      if (brackets && brackets.length > 0) {
        const sorted = [...brackets].sort((a, b) => a.sort_order - b.sort_order)
        for (const b of sorted) {
          if (b.area_min_dm2 <= areaDm2 && (b.area_max_dm2 == null || areaDm2 < b.area_max_dm2)) {
            scale = b.coefficient || 1.0
            break
          }
        }
      }
      cost_machining_mech += scale * (
          oreSetup   * rates.mill
        + oreMill    * rates.mill
        + oreGrind   * rates.grind
        + oreDrill   * rates.drill
        + oreStation * rates.mill
      )
    }
  }

  // L3 EDM: ore_edm × tariffa_edm
  let cost_machining_edm = 0
  if (plates && plates.length > 0 && materials && edmCfg && edmSpeeds && cycles) {
    const edmMap = estimateDieEdmHours(spec, plates, materials, settings, edmCfg, edmSpeeds, cycles)
    const totalEdmH = Object.values(edmMap).reduce((s, v) => s + v, 0)
    cost_machining_edm = totalEdmH * rates.edm
  }

  // L4: (design_hours[diff] + bonus piega × n + bonus punzone × n) × design_rate
  //     + assembly_forfeit[diff] + extras
  const baseDesignHours = {
    base:   settings.design_hours_base,
    medium: settings.design_hours_medium,
    hard:   settings.design_hours_hard,
  }[spec.difficulty] || 0
  const nBendsTotal = spec.n_bends_simple + spec.n_bends_medium + spec.n_bends_complex
  const nPunchesTotal = spec.n_punches_simple + spec.n_punches_medium + spec.n_punches_complex
  const bonusBend = settings.design_h_per_bend ?? 0.4
  const bonusPunch = settings.design_h_per_punch ?? 0.3
  const designHours = baseDesignHours + nBendsTotal * bonusBend + nPunchesTotal * bonusPunch
  const assembly = {
    base:   settings.assembly_forfeit_base,
    medium: settings.assembly_forfeit_medium,
    hard:   settings.assembly_forfeit_hard,
  }[spec.difficulty] || 0
  const cost_accessories =
    designHours * settings.design_hourly_rate + assembly + (spec.extras_amount || 0)

  return {
    cost_machining_mech: Math.round(cost_machining_mech * 100) / 100,
    cost_machining_edm: Math.round(cost_machining_edm * 100) / 100,
    cost_machining: Math.round((cost_machining_mech + cost_machining_edm) * 100) / 100,
    cost_accessories: Math.round(cost_accessories * 100) / 100,
  }
}
