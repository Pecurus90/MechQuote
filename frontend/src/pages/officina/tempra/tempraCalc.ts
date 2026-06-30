import type { HeatTreatmentResult, HeatTreatmentShape } from '@/types'

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

// ─── Analisi per materiale (medie + andamento nel tempo) ────────────────────

export interface DimStat {
  key: string
  label: string
  avg: number | null
  min: number | null
  max: number | null
  count: number
}

/** Punto del grafico: una data + il Δ di ciascuna dimensione (chiave → mm). */
export interface TrendPoint {
  date: string
  [dimKey: string]: number | string | null
}

export interface ShapeAnalysis {
  shape: HeatTreatmentShape
  dims: { key: string; label: string }[]
  stats: DimStat[]
  trend: TrendPoint[]
  recordCount: number
}

// Definizione colonne per forma — chiavi allineate a `dimensionsFor`.
const SHAPE_DIMS: Record<HeatTreatmentShape, { key: string; label: string }[]> = {
  tondo: [
    { key: 'outer', label: 'Ø esterno' },
    { key: 'inner', label: 'Ø interno' },
    { key: 'length', label: 'Lunghezza' },
  ],
  quadrato: [
    { key: 'width', label: 'Larghezza' },
    { key: 'height', label: 'Altezza' },
    { key: 'length', label: 'Lunghezza' },
  ],
}

/** Materiali distinti presenti nel registro, ordinati. */
export function distinctMaterials(rows: HeatTreatmentResult[]): string[] {
  return Array.from(new Set(rows.map(r => r.material).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'it'))
}

const shortDate = (iso: string | undefined, fallback: string): string => {
  if (!iso) return fallback
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? fallback
    : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * Analisi di un materiale, raggruppata per forma (tondo/quadrato). Per ogni
 * forma presente restituisce l'andamento dei Δ nel tempo (ordinati per data)
 * e le statistiche per dimensione: Δ medio (con segno), min, max, n. misure.
 * Riusa `dimensionsFor` per i Δ — una sola fonte di verità con la tabella.
 */
export function analyzeMaterial(rows: HeatTreatmentResult[], material: string): ShapeAnalysis[] {
  const matched = rows.filter(r => r.material === material)
  const out: ShapeAnalysis[] = []
  for (const shape of ['tondo', 'quadrato'] as HeatTreatmentShape[]) {
    const recs = matched.filter(r => r.shape === shape)
    if (recs.length === 0) continue
    const sorted = [...recs].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0
      const tb = b.created_at ? Date.parse(b.created_at) : 0
      return ta !== tb ? ta - tb : a.id - b.id
    })
    const dims = SHAPE_DIMS[shape]
    const trend: TrendPoint[] = sorted.map(r => {
      const byKey = new Map(dimensionsFor(r).map(d => [d.key, d.delta]))
      const point: TrendPoint = { date: shortDate(r.created_at, `#${r.id}`) }
      for (const d of dims) point[d.key] = byKey.get(d.key) ?? null
      return point
    })
    const stats: DimStat[] = dims.map(d => {
      const vals = sorted
        .map(r => dimensionsFor(r).find(x => x.key === d.key)?.delta ?? null)
        .filter((v): v is number => v != null)
      if (vals.length === 0) return { ...d, avg: null, min: null, max: null, count: 0 }
      const sum = vals.reduce((a, b) => a + b, 0)
      return {
        ...d,
        avg: sum / vals.length,
        min: Math.min(...vals),
        max: Math.max(...vals),
        count: vals.length,
      }
    })
    out.push({ shape, dims, stats, trend, recordCount: recs.length })
  }
  return out
}

/** Palette per le linee del grafico, per indice di dimensione. */
export const DIM_COLORS = ['#2563eb', '#e11d48', '#16a34a']
