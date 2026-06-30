import type { HeatTreatmentResult } from '@/types'

/**
 * Una misura geometrica con il suo delta di deformazione (post − pre).
 *
 * Le deformazioni sono derivate dalle misure, non salvate a DB (una sola
 * fonte di verità). `delta` è `null` se manca una delle due misure della
 * coppia. Valore negativo = ritiro, positivo = dilatazione.
 */
export interface DimMeasure {
  key: string
  label: string
  pre: number | null
  post: number | null
  delta: number | null
}

const delta = (pre: number | null, post: number | null): number | null =>
  pre != null && post != null ? post - pre : null

const m = (key: string, label: string, pre: number | null, post: number | null): DimMeasure =>
  ({ key, label, pre, post, delta: delta(pre, post) })

/**
 * Misure geometriche pertinenti alla forma del pezzo, in ordine di
 * visualizzazione. La lunghezza è comune a entrambe le forme.
 * - tondo    → Ø esterno, Ø interno, lunghezza
 * - quadrato → larghezza, altezza, lunghezza
 */
export function dimensionsFor(r: HeatTreatmentResult): DimMeasure[] {
  if (r.shape === 'quadrato') {
    return [
      m('width', 'Larghezza', r.width_pre_mm, r.width_post_mm),
      m('height', 'Altezza', r.height_pre_mm, r.height_post_mm),
      m('length', 'Lunghezza', r.length_pre_mm, r.length_post_mm),
    ]
  }
  return [
    m('outer', 'Ø esterno', r.outer_dia_pre_mm, r.outer_dia_post_mm),
    m('inner', 'Ø interno', r.inner_dia_pre_mm, r.inner_dia_post_mm),
    m('length', 'Lunghezza', r.length_pre_mm, r.length_post_mm),
  ]
}

/** Formatta un valore mm con 3 decimali, o '—' se assente. */
export function fmtMm(v: number | null): string {
  return v == null ? '—' : v.toFixed(3)
}

/** Formatta un delta in mm con segno esplicito (+/−), o '—' se assente. */
export function formatDelta(d: number | null): string {
  if (d == null) return '—'
  const sign = d > 0 ? '+' : ''
  return `${sign}${d.toFixed(3)}`
}

/** Classe colore per il delta: blu = ritiro, arancio = dilatazione. */
export function deltaClass(d: number | null): string {
  if (d == null) return 'text-gray-400'
  if (d < 0) return 'text-blue-600'
  if (d > 0) return 'text-orange-600'
  return 'text-gray-600'
}
