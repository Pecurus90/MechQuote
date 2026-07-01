import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import api from '@/lib/api'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { Statistics } from '@/types'
import { type Period, fmtEur, CATEGORY_COLORS, Loading, EmptyChart, KpiCards } from './statsShared'

interface CustomerOpt { id: number; name: string }

function MarginChart({ data }: { data: Statistics['margin_monthly'] }) {
  const avg = data.length === 0 ? 0 : data.reduce((s, p) => s + p.margin_percent, 0) / data.length
  const color = avg >= 30 ? '#16a34a' : avg >= 15 ? '#d97706' : '#dc2626'
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Margine medio mensile</CardTitle>
        <p className="text-xs text-muted-foreground">
          Solo preventivi standard · media periodo:
          <span className="font-semibold ml-1" style={{ color }}>{avg.toFixed(1)}%</span>
        </p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
              <Line type="monotone" dataKey="margin_percent" stroke={color} strokeWidth={2} name="Margine" dot />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function HoursChart({ title, subtitle, data }: { title: string; subtitle: string; data: { label: string; hours: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" fontSize={11} tickFormatter={(v) => `${v}h`} />
              <YAxis type="category" dataKey="label" fontSize={11} width={130} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)} h`} />
              <Bar dataKey="hours" name="Ore">
                {data.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export default function QuotesStatsTab({ period }: { period: Period }) {
  const navigate = useNavigate()
  const [data, setData] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [quoteType, setQuoteType] = useState<'all' | 'standard' | 'die'>('all')
  const [customerId, setCustomerId] = useState<string>('')
  const [customers, setCustomers] = useState<CustomerOpt[]>([])

  useEffect(() => {
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => undefined)
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ period })
    if (quoteType !== 'all') params.set('quote_type', quoteType)
    if (customerId) params.set('customer_id', customerId)
    api.get(`/dashboard/statistics?${params}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche preventivi'))
      .finally(() => setLoading(false))
  }, [period, quoteType, customerId])

  if (loading || !data) return <Loading />

  const totalValue = data.trend_monthly.reduce((s, p) => s + p.standard + p.dies, 0)
  const avgMargin = data.margin_monthly.length === 0
    ? 0 : data.margin_monthly.reduce((s, p) => s + p.margin_percent, 0) / data.margin_monthly.length

  return (
    <div className="space-y-4">
      {/* Filtri */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={quoteType} onChange={e => setQuoteType(e.target.value as typeof quoteType)}>
            <option value="all">Tutti</option>
            <option value="standard">Standard</option>
            <option value="die">Stampi</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Cliente</label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm min-w-[180px]" value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Tutti i clienti</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* KPI */}
      <KpiCards items={[
        { label: 'Preventivi', value: String(data.standard_count + data.dies_count), hint: `${data.standard_count} std · ${data.dies_count} stampi` },
        { label: 'Standard', value: String(data.standard_count) },
        { label: '€ preventivato', value: `€ ${fmtEur(totalValue)}` },
        { label: 'Margine medio', value: `${avgMargin.toFixed(1)}%` },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Trend mensile per tipo</CardTitle>
            <p className="text-xs text-muted-foreground">€ preventivati, split Standard vs Stampi</p>
          </CardHeader>
          <CardContent>
            {data.trend_monthly.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.trend_monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${fmtEur(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => `€ ${fmtEur(v)}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="standard" stroke="#2563eb" strokeWidth={2} name="Standard" />
                  <Line type="monotone" dataKey="dies" stroke="#e11d48" strokeWidth={2} name="Stampi" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 clienti</CardTitle>
            <p className="text-xs text-muted-foreground">Fatturato preventivato cumulato · click su barra per filtrare archivio</p>
          </CardHeader>
          <CardContent>
            {data.top_customers.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.top_customers} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} tickFormatter={(v) => `${fmtEur(v / 1000)}k`} />
                  <YAxis type="category" dataKey="customer_name" fontSize={11} width={120} />
                  <Tooltip formatter={(v: number) => `€ ${fmtEur(v)}`} />
                  <Bar dataKey="total" fill="#2563eb" cursor="pointer"
                    onClick={(d) => { const cid = (d as { customer_id: number | null })?.customer_id; if (cid) navigate(`/quotes/archive?customer_id=${cid}`) }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <HoursChart title="Ore per macchina" subtitle="Distribuzione ore lavorazione (setup + ciclo) · solo standard" data={data.hours_by_machine} />
        <HoursChart title="Ore per lavorazione" subtitle="Distribuzione ore per tipo di lavorazione · solo standard" data={data.hours_by_operation} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribuzione per categoria</CardTitle>
            <p className="text-xs text-muted-foreground">Lettera nel codice preventivo (es. 042-26<strong>A</strong>_001)</p>
          </CardHeader>
          <CardContent>
            {data.by_category.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data.by_category}
                    dataKey="count"
                    nameKey="category_code"
                    cx="50%" cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={2}
                    label={(d: { category_code: string; count: number }) => `${d.category_code} (${d.count})`}
                  >
                    {data.by_category.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, _name, props: { payload?: { total?: number } }) => [
                      `${v} preventivi · € ${fmtEur(props?.payload?.total ?? 0)}`,
                      'Categoria',
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <MarginChart data={data.margin_monthly} />
      </div>
    </div>
  )
}
