import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import type { MonthlyData } from '@/types'
import { fmtEur } from './dashboardUtil'

type Metric = 'value' | 'margin' | 'material' | 'labor'

const METRIC_CONFIG: Record<Metric, { label: string; color: string }> = {
  value:    { label: 'Valore preventivato', color: '#2563eb' },
  margin:   { label: 'Margine',             color: '#16a34a' },
  material: { label: 'Costo materiali',     color: '#d97706' },
  labor:    { label: 'Costo lavorazioni',   color: '#4f46e5' },
}

export default function MonthlyChart({ data }: { data: MonthlyData[] }) {
  const [metric, setMetric] = useState<Metric>('value')
  // Ultimi 6 mesi: la API ritorna ordinata asc; prendiamo gli ultimi 6
  const last6 = data.slice(-6)
  const formatted = last6.map(d => ({
    label: d.month.slice(2),  // "26-05" da "2026-05"
    value: d[metric],
  }))
  const cfg = METRIC_CONFIG[metric]

  // Colori grafico (recharts non legge CSS variables)
  const chartColors = {
    grid: '#f0f0f0',
    tick: '#6b7280',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e5e7eb',
    tooltipText: '#111827',
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base">Andamento ultimi 6 mesi</CardTitle>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={metric}
          onChange={e => setMetric(e.target.value as Metric)}
        >
          {(Object.keys(METRIC_CONFIG) as Metric[]).map(m => (
            <option key={m} value={m}>{METRIC_CONFIG[m].label}</option>
          ))}
        </select>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formatted} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartColors.tick }} stroke={chartColors.grid} />
              <YAxis tick={{ fontSize: 11, fill: chartColors.tick }} stroke={chartColors.grid} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => [`${fmtEur(v)} €`, cfg.label]}
                contentStyle={{
                  fontSize: 12,
                  background: chartColors.tooltipBg,
                  border: `1px solid ${chartColors.tooltipBorder}`,
                  borderRadius: 6,
                  color: chartColors.tooltipText,
                }}
                itemStyle={{ color: chartColors.tooltipText }}
                labelStyle={{ color: chartColors.tooltipText, fontWeight: 500 }}
                cursor={{ stroke: chartColors.grid, strokeWidth: 1 }}
              />
              <Line type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
