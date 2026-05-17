// Sezione Statistiche & Grafici — 4 grafici dimensionali sul preventivato.
// Risponde a chi/quanto/quando: trend per tipo, top clienti, distribuzione
// per categoria, margine medio nel tempo.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart as LineIcon } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import api from '@/lib/api'
import { toast } from 'sonner'
import PageContainer from '@/components/ui/page-container'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { Statistics } from '@/types'

type Period = 'year' | '12m' | 'prev_year' | 'all'

const PERIOD_LABEL: Record<Period, string> = {
  year:      'Anno corrente',
  '12m':     'Ultimi 12 mesi',
  prev_year: 'Anno scorso',
  all:       'Tutto',
}

const fmtEur = (n: number) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

// Palette per donut categoria (max 8 categorie, ne abbiamo 7: A-G)
const CATEGORY_COLORS = ['#2563eb', '#7c3aed', '#dc2626', '#ea580c', '#16a34a', '#0891b2', '#db2777', '#475569']

export default function StatisticsPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('year')
  const [data, setData] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/dashboard/statistics?period=${period}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche'))
      .finally(() => setLoading(false))
  }, [period])

  return (
    <PageContainer width="xl">
      <SettingsPageHeader
        icon={LineIcon}
        color="blue"
        title="Statistiche"
        subtitle="Analisi del preventivato per cliente, categoria, tipo e margine"
        action={
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={period}
            onChange={e => setPeriod(e.target.value as Period)}
          >
            {(Object.keys(PERIOD_LABEL) as Period[]).map(p => (
              <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
            ))}
          </select>
        }
      />

      {loading || !data ? (
        <div className="flex items-center justify-center h-64 text-gray-500">Caricamento…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TrendChart data={data.trend_monthly} />
          <TopCustomersChart
            data={data.top_customers}
            onClickCustomer={(id) => id && navigate(`/quotes/archive?customer_id=${id}`)}
          />
          <CategoryChart data={data.by_category} />
          <MarginChart data={data.margin_monthly} />
        </div>
      )}
    </PageContainer>
  )
}

function TrendChart({ data }: { data: Statistics['trend_monthly'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Trend mensile per tipo</CardTitle>
        <p className="text-xs text-gray-500">€ preventivati, split Standard vs Stampi</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data}>
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
  )
}

function TopCustomersChart({
  data, onClickCustomer,
}: {
  data: Statistics['top_customers']
  onClickCustomer: (id: number | null) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Top 10 clienti</CardTitle>
        <p className="text-xs text-gray-500">Fatturato preventivato cumulato nel periodo · click su barra per filtrare archivio</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" fontSize={11} tickFormatter={(v) => `${fmtEur(v / 1000)}k`} />
              <YAxis type="category" dataKey="customer_name" fontSize={11} width={120} />
              <Tooltip formatter={(v: number) => `€ ${fmtEur(v)}`} />
              <Bar
                dataKey="total"
                fill="#2563eb"
                onClick={(d) => onClickCustomer((d as { customer_id: number | null })?.customer_id ?? null)}
                cursor="pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function CategoryChart({ data }: { data: Statistics['by_category'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Distribuzione per categoria</CardTitle>
        <p className="text-xs text-gray-500">Lettera nel codice preventivo (es. 042-26<strong>A</strong>_001)</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="category_code"
                cx="50%" cy="50%"
                outerRadius={90}
                innerRadius={50}
                paddingAngle={2}
                label={(d: { category_code: string; count: number }) => `${d.category_code} (${d.count})`}
              >
                {data.map((_, i) => (
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
  )
}

function MarginChart({ data }: { data: Statistics['margin_monthly'] }) {
  // Colore della line in base alla media del periodo (semafori).
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
        {data.length === 0 ? (
          <EmptyChart />
        ) : (
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

function EmptyChart() {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">
      Nessun dato per questo periodo
    </div>
  )
}
