// src/pages/dashboard/MonthlyChart.tsx
import { useMemo, useState } from 'react'
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
import { useChartTheme } from '@/components/charts/chartTheme'
import { useTheme } from '@/lib/theme'
import type { MonthlyData } from '@/types'

interface Props {
  data: MonthlyData[]
  /** Mostra la serie "Costo" (e quindi il margine). Falso per chi non ha il
   *  permesso `statistics`: vede solo il Venduto, non i costi aziendali. */
  showCost?: boolean
}

const eur = (v: number) =>
  '€ ' +
  Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

export default function MonthlyChart({ data, showCost = true }: Props) {
  // AUD-20: grid/assi/tooltip/cursor dalla palette centralizzata (unica fonte);
  // solo i colori serie (venduto verde / costo arancio) restano locali.
  const c = useChartTheme()
  const dark = useTheme().theme === 'dark'
  const s = dark
    ? { vendutoBar: 'hsl(142 58% 52% / .38)', venduto: 'hsl(142 58% 52%)', costoBar: 'hsl(28 92% 62% / .32)', costo: 'hsl(28 92% 62%)' }
    : { vendutoBar: 'hsl(142 66% 38% / .32)', venduto: 'hsl(142 66% 38%)', costoBar: 'hsl(28 85% 48% / .28)', costo: 'hsl(28 85% 48%)' }

  const axisTick = { fill: c.axis, fontSize: 11, fontFamily: '"IBM Plex Mono", monospace' }

  // C1 — anni disponibili dai dati (l'API emette righe per tutti gli anni),
  // più l'anno corrente sempre presente. Ordinati decrescenti per lo select.
  const currentYear = new Date().getFullYear()
  const years = useMemo(() => {
    const set = new Set<number>(data.map((d) => d.year))
    set.add(currentYear)
    return Array.from(set).sort((a, b) => b - a)
  }, [data, currentYear])

  // Anno selezionato: default all'anno corrente. A gennaio, con dati solo
  // sull'anno scorso, l'utente può selezionarlo dal menu (prima il grafico
  // restava muto). Se l'anno in stato non è più nella lista, ripiega sul primo.
  const [selYear, setSelYear] = useState(currentYear)
  const year = years.includes(selYear) ? selYear : years[0]

  const byKey = new Map(data.map((d) => [d.month, d]))
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
        {showCost && <div style={{ color: s.costo }}>Costo preventivato: {eur(r?.costo ?? 0)}</div>}
        <div style={{ color: s.venduto }}>Venduto: {eur(r?.venduto ?? 0)}</div>
      </div>
    )
  }

  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-foreground">{showCost ? 'Costo preventivato vs venduto' : 'Venduto'}</div>
          <div className="text-xs text-muted-foreground">Anno {year} · preventivi + vendite dirette</div>
        </div>
        <select
          value={year}
          onChange={(e) => setSelYear(Number(e.target.value))}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Anno"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
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
            {/* Barre affiancate per il confronto del mese (Costo solo se permesso) */}
            {showCost && <Bar dataKey="costo" name="Costo preventivato" fill={s.costoBar} radius={[4, 4, 0, 0]} barSize={11} />}
            <Bar dataKey="venduto" name="Venduto" fill={s.vendutoBar} radius={[4, 4, 0, 0]} barSize={11} />
            {/* Linee di tendenza (dente di sega sui mesi senza vendite) */}
            {showCost && <Line dataKey="costo" stroke={s.costo} strokeWidth={2} dot={false} legendType="none" isAnimationActive={false} />}
            <Line dataKey="venduto" stroke={s.venduto} strokeWidth={2} dot={false} legendType="none" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
