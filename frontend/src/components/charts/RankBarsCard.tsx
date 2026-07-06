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
import { useTheme } from '@/lib/theme'

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
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const c = dark
    ? {
        axis: 'hsl(220 9% 62%)',
        tipBg: 'hsl(220 8% 14%)',
        tipBorder: 'hsl(220 7% 24%)',
        text: 'hsl(210 16% 90%)',
        cursor: 'hsl(220 7% 30% / .35)',
      }
    : {
        axis: 'hsl(220 10% 46%)',
        tipBg: 'hsl(0 0% 100%)',
        tipBorder: 'hsl(220 14% 89%)',
        text: 'hsl(220 18% 16%)',
        cursor: 'hsl(220 16% 92% / .6)',
      }

  const palette = dark
    ? [
        'hsl(213 93% 66%)',
        'hsl(187 85% 53%)',
        'hsl(330 80% 68%)',
        'hsl(142 58% 52%)',
        'hsl(36 96% 56%)',
        'hsl(263 84% 72%)',
        'hsl(244 84% 74%)',
        'hsl(160 62% 52%)',
        'hsl(20 90% 64%)',
        'hsl(280 72% 72%)',
      ]
    : [
        'hsl(214 90% 52%)',
        'hsl(188 90% 34%)',
        'hsl(330 72% 50%)',
        'hsl(142 66% 38%)',
        'hsl(33 92% 45%)',
        'hsl(262 78% 56%)',
        'hsl(243 75% 58%)',
        'hsl(160 70% 36%)',
        'hsl(20 85% 48%)',
        'hsl(280 65% 52%)',
      ]

  const fmt = (v: number): string => (valueFmt ? valueFmt(v) : `${v}${unit ? ` ${unit}` : ''}`)

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-3">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 2, right: 52, left: 6, bottom: 2 }}>
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
                <Cell key={i} fill={palette[i % palette.length]} />
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
      </div>
    </div>
  )
}
