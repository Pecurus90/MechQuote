// src/components/charts/DonutCard.tsx
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { useChartTheme, tooltipStyle } from '@/components/charts/chartTheme'
import ChartEmpty from '@/components/charts/ChartEmpty'

interface Props {
  title: string
  subtitle?: string
  data: Array<{ name: string; value: number; color?: string }>
  height?: number
}

/**
 * Thin donut with a bottom legend. Falls back to the centralized theme-aware
 * palette when a slice has no explicit `color`.
 */
export default function DonutCard({ title, subtitle, data, height = 310 }: Props) {
  const c = useChartTheme()
  const nonEmpty = data.some((d) => (d.value || 0) > 0)

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-1.5">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="w-full" style={{ height }}>
        {!nonEmpty ? (
          <ChartEmpty height={height} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((d, i) => (
                  <Cell key={d.name} fill={d.color ?? c.palette[i % c.palette.length]} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle(c)} />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                wrapperStyle={{ fontSize: 11.5, color: c.text }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
