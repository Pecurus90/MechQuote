// src/pages/dashboard/PerStatusChart.tsx
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
import { StatusChip } from '@/components/dashboard/StatusBadges'

interface Props {
  byStatus: Record<string, number>
  standardCount: number
  dieCount: number
  onSelect: (status: string) => void
}

const ORDER: { key: string; label: string }[] = [
  { key: 'bozza', label: 'Bozza' },
  { key: 'inviato', label: 'Inviato' },
  { key: 'letto', label: 'Letto' },
  { key: 'in_attesa_cliente', label: 'Attesa cliente' },
  { key: 'confermato', label: 'Confermato' },
  { key: 'completo', label: 'Completo' },
  { key: 'non_ordinato', label: 'Non ordinato' },
]

// C2 — il GRAFICO a barre mostra solo gli stati aperti/azionabili: con gli anni
// gli stati terminali (completo/non_ordinato) accumulano centinaia di preventivi
// e schiacciano visivamente quelli ancora da lavorare. I chip qui sopra restano
// completi (drill-down verso l'archivio anche per completo/non_ordinato).
const CHART_STATES = new Set(['bozza', 'inviato', 'letto', 'in_attesa_cliente', 'confermato'])

export default function PerStatusChart({ byStatus, standardCount, dieCount, onSelect }: Props) {
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
        bozza: 'hsl(220 9% 62%)',
        inviato: 'hsl(213 93% 66%)',
        letto: 'hsl(36 96% 56%)',
        in_attesa_cliente: 'hsl(25 95% 62%)',
        confermato: 'hsl(263 84% 72%)',
        completo: 'hsl(142 58% 52%)',
        non_ordinato: 'hsl(349 82% 66%)',
      }
    : {
        grid: 'hsl(220 14% 90%)',
        axis: 'hsl(220 10% 46%)',
        tipBg: 'hsl(0 0% 100%)',
        tipBorder: 'hsl(220 14% 89%)',
        text: 'hsl(220 18% 16%)',
        cursor: 'hsl(220 16% 92% / .6)',
        bozza: 'hsl(220 9% 46%)',
        inviato: 'hsl(214 90% 52%)',
        letto: 'hsl(33 92% 45%)',
        in_attesa_cliente: 'hsl(25 95% 53%)',
        confermato: 'hsl(262 78% 56%)',
        completo: 'hsl(142 66% 38%)',
        non_ordinato: 'hsl(349 75% 50%)',
      }

  const colorFor = (key: string): string =>
    (c as Record<string, string>)[key] ?? c.axis

  const chartData = ORDER.filter((s) => CHART_STATES.has(s.key)).map((s) => ({
    key: s.key,
    stato: s.label,
    n: byStatus[s.key] ?? 0,
  }))

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

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <div>
          <div className="text-[15px] font-semibold text-foreground">Preventivi per stato</div>
          <div className="text-xs text-muted-foreground">
            Standard <b className="text-foreground font-mono">{standardCount}</b> · Stampi{' '}
            <b className="text-foreground font-mono">{dieCount}</b>
          </div>
        </div>
      </div>

      <div className="mb-3.5 flex flex-wrap gap-2">
        {ORDER.map((s) => (
          <StatusChip
            key={s.key}
            status={s.key}
            count={byStatus[s.key] ?? 0}
            onClick={() => onSelect(s.key)}
          />
        ))}
      </div>

      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 34, left: 8, bottom: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="stato"
              tick={{ fill: c.text, fontSize: 12.5, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              width={94}
            />
            <Tooltip {...tooltipProps} />
            <Bar dataKey="n" name="Preventivi" radius={[0, 6, 6, 0]} barSize={15}>
              {chartData.map((d) => (
                <Cell
                  key={d.key}
                  fill={colorFor(d.key)}
                  className="cursor-pointer"
                  onClick={() => onSelect(d.key)}
                />
              ))}
              <LabelList
                dataKey="n"
                position="right"
                fill={c.axis}
                fontSize={12}
                fontFamily='"IBM Plex Mono", monospace'
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
