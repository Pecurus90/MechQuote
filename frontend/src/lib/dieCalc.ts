// Calcoli geometrici lato client per il modulo Preventivatore Stampi.
// Gemello DRY hard rule di `_compute_castle_dimensions` in
// `backend/app/services/calculation.py`. Le due formule devono restare
// identiche: usate per l'auto-fill X/Y delle piastre (backend) e per il
// render top-view live del wizard (frontend).

export interface DieGeometryInput {
  subtype: 'passo' | 'blocco'
  bboxX: number          // mm — ingombro pezzo X
  bboxY: number          // mm — ingombro pezzo Y
  nStations?: number     // passo: numero stazioni (default 1)
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
    stripX = bx * nSt
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
