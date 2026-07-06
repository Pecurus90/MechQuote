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
import { useTheme } from '@/lib/theme'

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
}

/**
 * Area chart card with a soft vertical gradient fill, 1–2 series.
 * Colours are theme-aware and supplied per-series by the caller.
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
}: Props) {
  const uid = useId().replace(/:/g, '')
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const c = dark
    ? {
        grid: 'hsl(220 7% 24%)',
        axis: 'hsl(220 9% 62%)',
        tipBg: 'hsl(220 8% 14%)',
        tipBorder: 'hsl(220 7% 24%)',
        text: 'hsl(210 16% 90%)',
      }
    : {
        grid: 'hsl(220 14% 90%)',
        axis: 'hsl(220 10% 46%)',
        tipBg: 'hsl(0 0% 100%)',
        tipBorder: 'hsl(220 14% 89%)',
        text: 'hsl(220 18% 16%)',
      }

  const axisTick = { fill: c.axis, fontSize: 12, fontFamily: '"IBM Plex Mono", monospace' }
  const tooltipProps = {
    cursor: { stroke: c.grid },
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

  const gid = (key: string) => `grad-${uid}-${key}`

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-1.5">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="w-full" style={{ height }}>
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
            <XAxis dataKey={xKey} tick={axisTick} axisLine={{ stroke: c.grid }} tickLine={false} />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={yFmt}
            />
            <Tooltip {...tooltipProps} formatter={tipFmt} />
            {series.length > 1 ? (
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
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
