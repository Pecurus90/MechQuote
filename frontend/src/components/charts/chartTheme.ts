// Palette grafici centralizzata, dark-aware (handoff Statistiche v2, Richiesta 1).
// UNICA fonte dei colori usati da recharts: nessun chart deve avere una palette
// hard-coded interna. recharts non accetta classi Tailwind → stringhe hsl().
import { useTheme } from '@/lib/theme'

export interface ChartTheme {
  grid: string
  axis: string
  tipBg: string
  tipBorder: string
  text: string
  cursor: string
  /** serie di confronto (MoM/YoY) — linea tratteggiata muted */
  cmp: string
  /** barra "neutra" (es. preventivato, aperti) */
  mutedBar: string
  /** sequenza serie a ordine fisso, dai token semantici */
  palette: string[]
  /** alias comodi dalla sequenza */
  blu: string
  ciano: string
  verde: string
  viola: string
  succ: string
  warn: string
  dang: string
}

const LIGHT: ChartTheme = (() => {
  const palette = [
    'hsl(214 90% 52%)', 'hsl(188 90% 34%)', 'hsl(330 72% 50%)', 'hsl(142 66% 38%)',
    'hsl(33 92% 45%)', 'hsl(262 78% 56%)', 'hsl(243 75% 58%)', 'hsl(160 70% 36%)',
    'hsl(20 85% 48%)', 'hsl(280 65% 52%)',
  ]
  return {
    grid: 'hsl(220 14% 90%)', axis: 'hsl(220 10% 46%)',
    tipBg: 'hsl(0 0% 100%)', tipBorder: 'hsl(220 14% 89%)',
    text: 'hsl(220 18% 16%)', cursor: 'hsl(220 16% 92% / .6)',
    cmp: 'hsl(220 10% 58%)', mutedBar: 'hsl(220 12% 76%)',
    palette,
    blu: palette[0], ciano: palette[1], verde: palette[3], viola: palette[5],
    succ: palette[3], warn: 'hsl(33 92% 45%)', dang: 'hsl(0 74% 50%)',
  }
})()

const DARK: ChartTheme = (() => {
  const palette = [
    'hsl(213 93% 66%)', 'hsl(187 85% 53%)', 'hsl(330 80% 68%)', 'hsl(142 58% 52%)',
    'hsl(36 96% 56%)', 'hsl(263 84% 72%)', 'hsl(244 84% 74%)', 'hsl(160 62% 52%)',
    'hsl(20 90% 64%)', 'hsl(280 72% 72%)',
  ]
  return {
    grid: 'hsl(220 7% 24%)', axis: 'hsl(220 9% 62%)',
    tipBg: 'hsl(220 8% 14%)', tipBorder: 'hsl(220 7% 24%)',
    text: 'hsl(210 16% 90%)', cursor: 'hsl(220 7% 30% / .35)',
    cmp: 'hsl(220 9% 56%)', mutedBar: 'hsl(220 8% 36%)',
    palette,
    blu: palette[0], ciano: palette[1], verde: palette[3], viola: palette[5],
    succ: palette[3], warn: 'hsl(36 96% 56%)', dang: 'hsl(0 78% 63%)',
  }
})()

/** Colori grafico per il tema corrente. */
export function useChartTheme(): ChartTheme {
  return useTheme().theme === 'dark' ? DARK : LIGHT
}

/** Tick assi comune (mono 12px). */
export function axisTick(c: ChartTheme) {
  return { fill: c.axis, fontSize: 12, fontFamily: '"IBM Plex Mono", monospace' }
}

/** contentStyle/itemStyle/labelStyle del Tooltip, coerenti su tutti i chart. */
export function tooltipStyle(c: ChartTheme) {
  return {
    contentStyle: {
      background: c.tipBg,
      border: `1px solid ${c.tipBorder}`,
      borderRadius: 10,
      fontSize: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
    },
    itemStyle: { color: c.text },
    labelStyle: { color: c.text, fontWeight: 600, marginBottom: 4 },
  }
}
