// src/pages/dashboard/MonthlyChart.tsx
import { useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/theme'
import type { MonthlyData } from '@/types'

interface Props {
  data: MonthlyData[]
}

type Metric = 'tutti' | 'preventivi' | 'valore'

const SEGMENTS: { key: Metric; label: string }[] = [
  { key: 'tutti', label: 'Tutti' },
  { key: 'preventivi', label: 'Preventivi' },
  { key: 'valore', label: 'Valore €' },
]

const eur = (v: number) =>
  '€ ' +
  Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

// month arriva come "YYYY-MM" dal backend → etichetta mese IT abbreviata.
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

export default function MonthlyChart({ data }: Props) {
  const [metric, setMetric] = useState<Metric>('tutti')
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const c = dark
    ? {
        grid: 'hsl(220 7% 24%)',
        axis: 'hsl(220 9% 62%)',
        tipBg: 'hsl(220 8% 14%)',
        tipBorder: 'hsl(220 7% 24%)',
        text: 'hsl(210 16% 90%)',
        cursor: 'hsl(220 7% 30% / .35)',
        creati: 'hsl(213 93% 66%)',
        confermati: 'hsl(142 58% 52%)',
        valoreFill: 'hsl(217 91% 60% / .5)',
      }
    : {
        grid: 'hsl(220 14% 90%)',
        axis: 'hsl(220 10% 46%)',
        tipBg: 'hsl(0 0% 100%)',
        tipBorder: 'hsl(220 14% 89%)',
        text: 'hsl(220 18% 16%)',
        cursor: 'hsl(220 16% 92% / .6)',
        creati: 'hsl(214 90% 52%)',
        confermati: 'hsl(142 66% 38%)',
        valoreFill: 'hsl(221 83% 53% / .45)',
      }

  const axisTick = { fill: c.axis, fontSize: 12, fontFamily: '"IBM Plex Mono", monospace' }
  const tooltipProps = {
    cursor: { fill: c.cursor },
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

  // Ultimi 6 mesi (API ordinata asc), etichetta mese IT.
  const rows = data.slice(-6).map((d) => {
    const mm = parseInt(d.month.split('-')[1] || '0', 10)
    return {
      mese: MESI[mm - 1] ?? d.month,
      creati: d.created_count,
      confermati: d.confirmed_count,
      valore: d.value,
    }
  })

  const showPrev = metric === 'tutti' || metric === 'preventivi'
  const showVal = metric === 'tutti' || metric === 'valore'

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-foreground">Andamento mensile</div>
          <div className="text-xs text-muted-foreground">Semestre in corso</div>
        </div>
        <div className="flex gap-[3px] rounded-[9px] bg-muted p-[3px]">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setMetric(s.key)}
              className={cn(
                'rounded-[7px] px-[11px] py-[5px] text-xs font-semibold transition-colors',
                metric === s.key
                  ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-muted-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[264px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 6, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="mese" tick={axisTick} axisLine={{ stroke: c.grid }} tickLine={false} />
            {showPrev && (
              <YAxis yAxisId="l" tick={axisTick} axisLine={false} tickLine={false} width={30} />
            )}
            {showVal && (
              <YAxis
                yAxisId="r"
                orientation={showPrev ? 'right' : 'left'}
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v: number) => `${v / 1000}k`}
              />
            )}
            <Tooltip
              {...tooltipProps}
              formatter={(value: number, name: string) =>
                name === 'Valore' ? [eur(value), name] : [value, name]
              }
            />
            <Legend wrapperStyle={{ fontSize: 12, color: c.text, paddingTop: 8 }} />
            {showVal && (
              <Bar
                yAxisId="r"
                dataKey="valore"
                name="Valore"
                fill={c.valoreFill}
                radius={[5, 5, 0, 0]}
                barSize={26}
              />
            )}
            {showPrev && (
              <Line
                yAxisId="l"
                type="monotone"
                dataKey="creati"
                name="Creati"
                stroke={c.creati}
                strokeWidth={2.5}
                dot={{ r: 3, fill: c.creati, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            )}
            {showPrev && (
              <Line
                yAxisId="l"
                type="monotone"
                dataKey="confermati"
                name="Confermati"
                stroke={c.confermati}
                strokeWidth={2.5}
                dot={{ r: 3, fill: c.confermati, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
