// src/components/charts/TypeDonut.tsx
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { useTheme } from '@/lib/theme'

interface Props {
  counts: { single: number; commessa: number; die: number }
}

export default function TypeDonut({ counts }: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const c = dark
    ? {
        tipBg: 'hsl(220 8% 14%)',
        tipBorder: 'hsl(220 7% 24%)',
        text: 'hsl(210 16% 90%)',
        singolo: 'hsl(213 93% 66%)',
        commessa: 'hsl(263 84% 72%)',
        stampo: 'hsl(36 96% 56%)',
      }
    : {
        tipBg: 'hsl(0 0% 100%)',
        tipBorder: 'hsl(220 14% 89%)',
        text: 'hsl(220 18% 16%)',
        singolo: 'hsl(214 90% 52%)',
        commessa: 'hsl(262 78% 56%)',
        stampo: 'hsl(33 92% 45%)',
      }

  const data = [
    { name: 'Singolo', value: counts.single, fill: c.singolo },
    { name: 'Commessa', value: counts.commessa, fill: c.commessa },
    { name: 'Stampo', value: counts.die, fill: c.stampo },
  ]

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-5">
      <div className="text-[15px] font-semibold text-foreground">Ripartizione per tipo</div>
      <div className="mb-1.5 text-xs text-muted-foreground">Preventivi attivi</div>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={88}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
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
              wrapperStyle={{ fontSize: 12, color: c.text }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
