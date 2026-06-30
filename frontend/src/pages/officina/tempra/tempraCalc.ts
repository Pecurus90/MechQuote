import type { HeatTreatmentResult } from '@/types'

/**
 * Deformazioni rilevate dopo la tempra: delta = misura post − misura pre.
 *
 * Derivate dalle misure, non salvate a DB (una sola fonte di verità). `null`
 * se manca una delle due misure della coppia. Valore negativo = ritiro,
 * positivo = dilatazione.
 */
export interface Deformations {
  outerDelta: number | null   // Ø esterno
  innerDelta: number | null   // Ø interno
  lengthDelta: number | null  // lunghezza
}

const delta = (pre: number | null, post: number | null): number | null =>
  pre != null && post != null ? post - pre : null

export function computeDeformations(r: HeatTreatmentResult): Deformations {
  return {
    outerDelta: delta(r.outer_dia_pre_mm, r.outer_dia_post_mm),
    innerDelta: delta(r.inner_dia_pre_mm, r.inner_dia_post_mm),
    lengthDelta: delta(r.length_pre_mm, r.length_post_mm),
  }
}

/** Formatta un delta in mm con segno esplicito (+/−), o '—' se assente. */
export function formatDelta(d: number | null): string {
  if (d == null) return '—'
  const sign = d > 0 ? '+' : ''
  return `${sign}${d.toFixed(3)} mm`
}
