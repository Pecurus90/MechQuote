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
import { type Period, fmtEur, CATEGORY_COLORS, Loading, EmptyChart } from './statsShared'

function MarginChart({ data }: { data: Statistics['margin_monthly'] }) {
  const avg = data.length === 0 ? 0 : data.reduce((s, p) => s + p.margin_percent, 0) / data.length
  const color = avg >= 30 ? '#16a34a' : avg >= 15 ? '#d97706' : '#dc2626'
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Margine medio mensile</CardTitle>
        <p className="text-xs text-gray-500">
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

export default function QuotesStatsTab({ period }: { period: Period }) {
  const navigate = useNavigate()
  const [data, setData] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/dashboard/statistics?period=${period}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche preventivi'))
      .finally(() => setLoading(false))
  }, [period])

  if (loading || !data) return <Loading />

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trend mensile per tipo</CardTitle>
          <p className="text-xs text-gray-500">€ preventivati, split Standard vs Stampi</p>
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
          <p className="text-xs text-gray-500">Fatturato preventivato cumulato · click su barra per filtrare archivio</p>
        </CardHeader>
        <CardContent>
          {data.top_customers.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.top_customers} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" fontSize={11} tickFormatter={(v) => `${fmtEur(v / 1000)}k`} />
                <YAxis type="category" dataKey="customer_name" fontSize={11} width={120} />
                <Tooltip formatter={(v: number) => `€ ${fmtEur(v)}`} />
                <Bar
                  dataKey="total"
                  fill="#2563eb"
                  onClick={(d) => {
                    const cid = (d as { customer_id: number | null })?.customer_id
                    if (cid) navigate(`/quotes/archive?customer_id=${cid}`)
                  }}
                  cursor="pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Distribuzione per categoria</CardTitle>
          <p className="text-xs text-gray-500">Lettera nel codice preventivo (es. 042-26<strong>A</strong>_001)</p>
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
  )
}
