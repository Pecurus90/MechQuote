// src/components/charts/GroupedBarsCard.tsx
// Barre verticali affiancate, N serie (handoff Statistiche v2 — tab Marginalità).
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { useChartTheme, axisTick, tooltipStyle } from '@/components/charts/chartTheme'
import ChartEmpty from '@/components/charts/ChartEmpty'

export interface GroupedSeries {
  key: string
  name: string
  color: string
}

interface Props {
  title: string
  subtitle?: string
  data: Array<Record<string, string | number>>
  xKey: string
  series: GroupedSeries[]
  height?: number
  yFmt?: (v: number) => string
  tipFmt?: (value: number, name: string) => [string, string]
  /** larghezza asse Y (default 44); passare valori piccoli per istogrammi count */
  yWidth?: number
  /** barre impilate (stesso stackId) invece che affiancate */
  stacked?: boolean
}

export default function GroupedBarsCard({
  title,
  subtitle,
  data,
  xKey,
  series,
  height = 256,
  yFmt,
  tipFmt,
  yWidth = 44,
  stacked = false,
}: Props) {
  const c = useChartTheme()
  const showLegend = series.length > 1

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
            <BarChart
              data={data}
              margin={{ top: 8, right: 12, left: -4, bottom: 0 }}
              barCategoryGap="26%"
              barGap={2}
            >
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey={xKey} tick={axisTick(c)} axisLine={{ stroke: c.grid }} tickLine={false} />
              <YAxis
                tick={axisTick(c)}
                axisLine={false}
                tickLine={false}
                width={yWidth}
                tickFormatter={yFmt}
                allowDecimals={false}
              />
              <Tooltip cursor={{ fill: c.cursor }} {...tooltipStyle(c)} formatter={tipFmt} />
              {showLegend ? (
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, color: c.text, paddingBottom: 8 }} />
              ) : null}
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  fill={s.color}
                  stackId={stacked ? 'a' : undefined}
                  radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
                  barSize={stacked ? 22 : 11}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
