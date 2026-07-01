// Tipi e toolkit grafici condivisi dai tab della pagina Statistiche.
// Stile "dashboard elegante" (spec 20, Step 6): area chart con gradiente,
// barre sottili arrotondate, donut fine, palette coerente, dark-aware.
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { useTheme } from '@/lib/theme'

export type Period = 'year' | '12m' | 'prev_year' | 'all'

export const PERIOD_LABEL: Record<Period, string> = {
  year:      'Anno corrente',
  '12m':     'Ultimi 12 mesi',
  prev_year: 'Anno scorso',
  all:       'Tutto',
}

export const fmtEur = (n: number) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

// Palette armoniosa (usata per barre multicolore e donut).
export const CHART_COLORS = ['#6366f1', '#22d3ee', '#f472b6', '#34d399', '#f59e0b', '#a78bfa', '#fb7185', '#60a5fa']
// Retro-compat: alcuni file importano ancora CATEGORY_COLORS.
export const CATEGORY_COLORS = CHART_COLORS

export function useChartColors() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  return {
    grid: dark ? '#2b3648' : '#eef1f5',
    axis: dark ? '#93a1b5' : '#94a3b8',
  }
}

export function Loading() {
  return <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento…</div>
}

export function EmptyChart() {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
      Nessun dato per questo periodo
    </div>
  )
}

// Riga di KPI-card riusabile dai tab statistiche.
export function KpiCards({ items }: { items: Array<{ label: string; value: string; hint?: string }> }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <div className="text-2xl font-bold text-foreground leading-none">{it.value}</div>
          <div className="text-sm font-medium text-muted-foreground mt-1">{it.label}</div>
          {it.hint && <div className="text-xs text-muted-foreground mt-0.5">{it.hint}</div>}
        </div>
      ))}
    </div>
  )
}

// ─── Componenti grafico eleganti ────────────────────────────────────────────

// Le righe dati sono interfacce concrete (StatsTrendPoint, ecc.): le tipizziamo
// come unknown[] così recharts (data?: any[]) le accetta senza index signature.
type Row = unknown
export interface Serie { key: string; name: string; color: string }

/** Area chart con gradiente morbido, linea sottile. `idPrefix` unico per pagina. */
export function TrendArea({ data, xKey, series, idPrefix, height = 240, yFmt, tipFmt }: {
  data: Row[]; xKey: string; series: Serie[]; idPrefix: string; height?: number
  yFmt?: (v: number) => string; tipFmt?: (v: number) => string
}) {
  const c = useChartColors()
  if (data.length === 0) return <EmptyChart />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`${idPrefix}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} fontSize={11} tick={{ fill: c.axis }} axisLine={false} tickLine={false} />
        <YAxis fontSize={11} tick={{ fill: c.axis }} axisLine={false} tickLine={false} width={44} tickFormatter={yFmt} />
        <Tooltip formatter={tipFmt} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map(s => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name}
            stroke={s.color} strokeWidth={2} fill={`url(#${idPrefix}-${s.key})`} dot={false} activeDot={{ r: 3 }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Barre orizzontali sottili e arrotondate, multicolore dalla palette. */
export function RankBars({ data, labelKey, valueKey, height = 240, color, labelWidth = 140, valueFmt, unit }: {
  data: Row[]; labelKey: string; valueKey: string; height?: number; color?: string
  labelWidth?: number; valueFmt?: (v: number) => string; unit?: string
}) {
  const c = useChartColors()
  if (data.length === 0) return <EmptyChart />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 6, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={c.grid} strokeDasharray="3 3" />
        <XAxis type="number" fontSize={11} tick={{ fill: c.axis }} axisLine={false} tickLine={false} tickFormatter={valueFmt} allowDecimals={false} />
        <YAxis type="category" dataKey={labelKey} fontSize={11} tick={{ fill: c.axis }} axisLine={false} tickLine={false} width={labelWidth} />
        <Tooltip formatter={(v: number) => [valueFmt ? valueFmt(v) : String(v), unit || '']} />
        <Bar dataKey={valueKey} radius={[0, 6, 6, 0]} barSize={16}>
          {data.map((_, i) => <Cell key={i} fill={color || CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Donut fine (anello sottile) con legenda. */
export function FineDonut({ data, height = 240 }: {
  data: Array<{ name: string; value: number; color?: string }>; height?: number
}) {
  if (data.length === 0) return <EmptyChart />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
          innerRadius={62} outerRadius={88} paddingAngle={3} cornerRadius={4} stroke="none">
          {data.map((e, i) => <Cell key={i} fill={e.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
