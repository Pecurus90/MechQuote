// src/components/charts/DonutCard.tsx
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { useTheme } from '@/lib/theme'

interface Props {
  title: string
  subtitle?: string
  data: Array<{ name: string; value: number; color?: string }>
  height?: number
}

/**
 * Thin donut with a bottom legend. Falls back to a theme-aware
 * multi-colour palette when a slice has no explicit `color`.
 */
export default function DonutCard({ title, subtitle, data, height = 310 }: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const c = dark
    ? { tipBg: 'hsl(220 8% 14%)', tipBorder: 'hsl(220 7% 24%)', text: 'hsl(210 16% 90%)' }
    : { tipBg: 'hsl(0 0% 100%)', tipBorder: 'hsl(220 14% 89%)', text: 'hsl(220 18% 16%)' }

  const palette = dark
    ? [
        'hsl(213 93% 66%)',
        'hsl(187 85% 53%)',
        'hsl(330 80% 68%)',
        'hsl(142 58% 52%)',
        'hsl(36 96% 56%)',
        'hsl(263 84% 72%)',
        'hsl(244 84% 74%)',
      ]
    : [
        'hsl(214 90% 52%)',
        'hsl(188 90% 34%)',
        'hsl(330 72% 50%)',
        'hsl(142 66% 38%)',
        'hsl(33 92% 45%)',
        'hsl(262 78% 56%)',
        'hsl(243 75% 58%)',
      ]

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-1.5">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="w-full" style={{ height }}>
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
                <Cell key={d.name} fill={d.color ?? palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: c.tipBg,
                border: `1px solid ${c.tipBorder}`,
                borderRadius: 10,
                fontSize: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
              }}
              itemStyle={{ color: c.text }}
              labelStyle={{ color: c.text, fontWeight: 600, marginBottom: 4 }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              wrapperStyle={{ fontSize: 11.5, color: c.text }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
