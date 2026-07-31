// src/components/charts/RankBarsCard.tsx
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts'
import { useChartTheme } from '@/components/charts/chartTheme'
import ChartEmpty from '@/components/charts/ChartEmpty'

interface Props {
  title: string
  subtitle?: string
  /** Pre-sorted rows (highest first). */
  data: Array<Record<string, string | number>>
  labelKey: string
  valueKey: string
  height?: number
  labelWidth?: number
  barSize?: number
  /** Formats the value shown at the end of each bar and in the tooltip. */
  valueFmt?: (v: number) => string
  /** Optional unit appended to the raw value when no `valueFmt` is given (e.g. `h`). */
  unit?: string
}

/**
 * Thin rounded horizontal bars, one theme-aware colour per row.
 * Used for rankings (top clients €, hours per machine, …).
 */
export default function RankBarsCard({
  title,
  subtitle,
  data,
  labelKey,
  valueKey,
  height = 262,
  labelWidth = 128,
  barSize = 13,
  valueFmt,
  unit,
}: Props) {
  const c = useChartTheme()
  const fmt = (v: number): string => (valueFmt ? valueFmt(v) : `${v}${unit ? ` ${unit}` : ''}`)

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-3">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="w-full" style={{ height }}>
        {data.length === 0 ? (
          <ChartEmpty height={height} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 2, right: 72, left: 6, bottom: 2 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey={labelKey}
                tick={{ fill: c.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={labelWidth}
              />
              <Tooltip
                cursor={{ fill: c.cursor }}
                contentStyle={{
                  background: c.tipBg,
                  border: `1px solid ${c.tipBorder}`,
                  borderRadius: 10,
                  fontSize: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
                }}
                itemStyle={{ color: c.text }}
                labelStyle={{ color: c.text, fontWeight: 600, marginBottom: 4 }}
                formatter={(value: number, name: string) => [fmt(value), name]}
              />
              <Bar dataKey={valueKey} radius={[0, 5, 5, 0]} barSize={barSize}>
                {data.map((_, i) => (
                  <Cell key={i} fill={c.palette[i % c.palette.length]} />
                ))}
                <LabelList
                  dataKey={valueKey}
                  position="right"
                  fill={c.axis}
                  fontSize={11}
                  fontFamily='"IBM Plex Mono", monospace'
                  formatter={(v: number) => fmt(v)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
