// src/components/charts/SignedBarsCard.tsx
// Barre verticali con segno: verde ≥0 / rosso <0, con linea di zero
// (handoff Statistiche v2 — Guadagno reale mensile).
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts'
import { useChartTheme, axisTick, tooltipStyle } from '@/components/charts/chartTheme'
import ChartEmpty from '@/components/charts/ChartEmpty'

interface Props {
  title: string
  subtitle?: string
  data: Array<Record<string, string | number>>
  xKey: string
  valueKey: string
  height?: number
  yFmt?: (v: number) => string
  /** larghezza asse Y (default 44); alzare per cifre intere lunghe */
  yWidth?: number
  tipFmt?: (value: number, name: string) => [string, string]
  valueName?: string
}

export default function SignedBarsCard({
  title,
  subtitle,
  data,
  xKey,
  valueKey,
  height = 256,
  yFmt,
  yWidth = 44,
  tipFmt,
  valueName = 'Guadagno',
}: Props) {
  const c = useChartTheme()

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
            <BarChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey={xKey} tick={axisTick(c)} axisLine={{ stroke: c.grid }} tickLine={false} />
              <YAxis tick={axisTick(c)} axisLine={false} tickLine={false} width={yWidth} tickFormatter={yFmt} />
              <Tooltip cursor={{ fill: c.cursor }} {...tooltipStyle(c)} formatter={tipFmt} />
              <ReferenceLine y={0} stroke={c.axis} />
              <Bar dataKey={valueKey} name={valueName} radius={[3, 3, 0, 0]} barSize={22}>
                {data.map((d, i) => (
                  <Cell key={i} fill={Number(d[valueKey]) >= 0 ? c.succ : c.dang} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
