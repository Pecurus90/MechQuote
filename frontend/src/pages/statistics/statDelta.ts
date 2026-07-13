// Costruzione delle pill di confronto (MoM/YoY) per i KPI Statistiche.
// Colore = bene/male (non il segno); freccia = direzione del valore.
import type { KpiDelta } from '@/components/dashboard/KpiCard'

export type Better = 'higher' | 'lower' | 'closer_to_1'
export type DeltaFmt = 'eur' | 'pct_rel' | 'point' | 'ratio_point'

const sign = (v: number) => (v >= 0 ? '+' : '−')
const it0 = (v: number) => Math.abs(v).toLocaleString('it-IT', { maximumFractionDigits: 0 })

/**
 * Ritorna la pill delta, o undefined quando non c'è confronto (cmp assente) o
 * il calcolo non è definito (base 0 per una variazione relativa).
 */
export function buildDelta(
  current: number | null | undefined,
  cmp: number | null | undefined,
  fmt: DeltaFmt,
  better: Better,
  vs: string,
): KpiDelta | undefined {
  if (current == null || cmp == null) return undefined
  const diff = current - cmp
  const dir: 'up' | 'down' = diff >= 0 ? 'up' : 'down'
  const good =
    better === 'higher' ? diff >= 0
    : better === 'lower' ? diff <= 0
    : Math.abs(current - 1) <= Math.abs(cmp - 1)

  let value: string
  if (fmt === 'eur') {
    value = sign(diff) + '€ ' + it0(diff)
  } else if (fmt === 'pct_rel') {
    if (cmp === 0) return undefined
    value = sign(diff) + it0((diff / Math.abs(cmp)) * 100) + '%'
  } else if (fmt === 'point') {
    value = sign(diff) + it0(diff) + 'pt'
  } else {
    // ratio_point: differenza di ratio in "punti" (×100)
    value = sign(diff) + it0(diff * 100) + 'pt'
  }
  return { value, dir, good, vs }
}
