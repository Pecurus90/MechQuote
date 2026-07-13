// src/components/charts/TrendAreaCard.tsx
import { useId } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { useChartTheme, axisTick, tooltipStyle } from '@/components/charts/chartTheme'
import ChartEmpty from '@/components/charts/ChartEmpty'

export interface TrendSeries {
  key: string
  name: string
  color: string
}

interface Props {
  title: string
  subtitle?: string
  data: Array<Record<string, string | number>>
  xKey: string
  series: TrendSeries[]
  height?: number
  /** Formats the Y axis ticks (e.g. `€ 12k`, `34%`). */
  yFmt?: (v: number) => string
  /** Formats a tooltip value/name pair. */
  tipFmt?: (value: number, name: string) => [string, string]
  /**
   * Confronto MoM/YoY: se valorizzato, disegna una serie tratteggiata muted
   * `cmp` sotto le altre. `cmpName` è l'etichetta in legenda/tooltip.
   */
  cmpKey?: string
  cmpName?: string
}

/**
 * Area chart card with a soft vertical gradient fill, 1–2 series + optional
 * dashed comparison series. Colours are theme-aware (palette centralizzata).
 */
export default function TrendAreaCard({
  title,
  subtitle,
  data,
  xKey,
  series,
  height = 256,
  yFmt,
  tipFmt,
  cmpKey,
  cmpName = 'Confronto',
}: Props) {
  const uid = useId().replace(/:/g, '')
  const c = useChartTheme()
  const gid = (key: string) => `grad-${uid}-${key}`
  const showCmp = !!cmpKey && data.some((d) => d[cmpKey] != null)

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-1.5">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="w-full" style={{ height }}>
        {data.length === 0 ? (
          <ChartEmpty height={height} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={gid(s.key)} x1={0} y1={0} x2={0} y2={1}>
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey={xKey} tick={axisTick(c)} axisLine={{ stroke: c.grid }} tickLine={false} />
              <YAxis
                tick={axisTick(c)}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={yFmt}
              />
              <Tooltip cursor={{ stroke: c.grid }} {...tooltipStyle(c)} formatter={tipFmt} />
              {series.length > 1 || showCmp ? (
                <Legend wrapperStyle={{ fontSize: 12, color: c.text, paddingTop: 6 }} />
              ) : null}
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#${gid(s.key)})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
              {showCmp ? (
                <Area
                  type="monotone"
                  dataKey={cmpKey}
                  name={cmpName}
                  stroke={c.cmp}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  fill="none"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
