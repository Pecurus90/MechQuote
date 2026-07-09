// src/pages/dashboard/MonthlyChart.tsx
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { useTheme } from '@/lib/theme'
import type { MonthlyData } from '@/types'

interface Props {
  data: MonthlyData[]
}

const eur = (v: number) =>
  '€ ' +
  Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

export default function MonthlyChart({ data }: Props) {
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
        vendutoBar: 'hsl(142 58% 52% / .38)',
        venduto: 'hsl(142 58% 52%)',
        costoBar: 'hsl(28 92% 62% / .32)',
        costo: 'hsl(28 92% 62%)',
      }
    : {
        grid: 'hsl(220 14% 90%)',
        axis: 'hsl(220 10% 46%)',
        tipBg: 'hsl(0 0% 100%)',
        tipBorder: 'hsl(220 14% 89%)',
        text: 'hsl(220 18% 16%)',
        cursor: 'hsl(220 16% 92% / .6)',
        vendutoBar: 'hsl(142 66% 38% / .32)',
        venduto: 'hsl(142 66% 38%)',
        costoBar: 'hsl(28 85% 48% / .28)',
        costo: 'hsl(28 85% 48%)',
      }

  const axisTick = { fill: c.axis, fontSize: 11, fontFamily: '"IBM Plex Mono", monospace' }

  // Anno corrente FISSO, Gen→Dic (12 mesi). L'API emette una riga solo per i
  // mesi con vendite → buchi a 0 (la linea scende a 0, per scelta).
  const byKey = new Map(data.map((d) => [d.month, d]))
  const year = new Date().getFullYear()
  const rows = Array.from({ length: 12 }, (_, m) => {
    const d = byKey.get(`${year}-${String(m + 1).padStart(2, '0')}`)
    return { mese: MESI[m], venduto: d?.sold ?? 0, costo: d?.quoted_cost ?? 0 }
  })

  // Tooltip custom: barre + linee condividono le dataKey (costo/venduto), quindi
  // il payload le duplica → mostro ogni valore una volta sola.
  const renderTooltip = ({ active, payload, label }: {
    active?: boolean
    label?: string
    payload?: { payload?: { costo?: number; venduto?: number } }[]
  }) => {
    if (!active || !payload?.length) return null
    const r = payload[0].payload
    return (
      <div style={{ background: c.tipBg, border: `1px solid ${c.tipBorder}`, borderRadius: 10, padding: '8px 10px', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.14)' }}>
        <div style={{ color: c.text, fontWeight: 600, marginBottom: 4 }}>{label} {year}</div>
        <div style={{ color: c.costo }}>Costo preventivato: {eur(r?.costo ?? 0)}</div>
        <div style={{ color: c.venduto }}>Venduto: {eur(r?.venduto ?? 0)}</div>
      </div>
    )
  }

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-2">
        <div className="text-[15px] font-semibold text-foreground">Costo preventivato vs venduto</div>
        <div className="text-xs text-muted-foreground">Anno {year} · sui preventivi venduti</div>
      </div>

      <div className="h-[264px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 6, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="mese" tick={axisTick} axisLine={{ stroke: c.grid }} tickLine={false} interval={0} />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
            />
            <Tooltip cursor={{ fill: c.cursor }} content={renderTooltip} />
            <Legend wrapperStyle={{ fontSize: 12, color: c.text, paddingTop: 8 }} />
            {/* Due barre affiancate per il confronto del mese */}
            <Bar dataKey="costo" name="Costo preventivato" fill={c.costoBar} radius={[4, 4, 0, 0]} barSize={11} />
            <Bar dataKey="venduto" name="Venduto" fill={c.vendutoBar} radius={[4, 4, 0, 0]} barSize={11} />
            {/* Due linee di tendenza (dente di sega sui mesi senza vendite) */}
            <Line dataKey="costo" stroke={c.costo} strokeWidth={2} dot={false} legendType="none" isAnimationActive={false} />
            <Line dataKey="venduto" stroke={c.venduto} strokeWidth={2} dot={false} legendType="none" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
