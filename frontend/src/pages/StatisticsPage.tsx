// Sezione Statistiche & Grafici.
// Container con 3 tab (Preventivi / Materiali / Utensili). Filtro periodo
// in alto, condiviso tra i tab. Ogni tab fetcha il proprio endpoint dedicato.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart as LineIcon, Package, Wrench } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import api from '@/lib/api'
import { toast } from 'sonner'
import PageContainer from '@/components/ui/page-container'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { Statistics, MaterialsStats, ToolsStats } from '@/types'

type Period = 'year' | '12m' | 'prev_year' | 'all'
type Tab = 'quotes' | 'materials' | 'tools'

const PERIOD_LABEL: Record<Period, string> = {
  year:      'Anno corrente',
  '12m':     'Ultimi 12 mesi',
  prev_year: 'Anno scorso',
  all:       'Tutto',
}

const TAB_CONFIG: Array<{ id: Tab; label: string }> = [
  { id: 'quotes',    label: 'Preventivi' },
  { id: 'materials', label: 'Materiali' },
  { id: 'tools',     label: 'Utensili' },
]

const fmtEur = (n: number) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const CATEGORY_COLORS = ['#2563eb', '#7c3aed', '#dc2626', '#ea580c', '#16a34a', '#0891b2', '#db2777', '#475569']

export default function StatisticsPage() {
  const [tab, setTab] = useState<Tab>('quotes')
  const [period, setPeriod] = useState<Period>('year')

  return (
    <PageContainer width="xl">
      <SettingsPageHeader
        icon={LineIcon}
        color="blue"
        title="Statistiche"
        subtitle="Analisi preventivi, ordini materiali e utensili"
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

      <div className="flex gap-2 border-b overflow-x-auto">
        {TAB_CONFIG.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'quotes'    && <QuotesStatsTab period={period} />}
      {tab === 'materials' && <MaterialsStatsTab period={period} />}
      {tab === 'tools'     && <ToolsStatsTab period={period} />}
    </PageContainer>
  )
}

// ─── Tab Preventivi ────────────────────────────────────────────────────────

function QuotesStatsTab({ period }: { period: Period }) {
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

// ─── Tab Materiali ─────────────────────────────────────────────────────────

function MaterialsStatsTab({ period }: { period: Period }) {
  const [data, setData] = useState<MaterialsStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/dashboard/statistics/orders-materials?period=${period}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche materiali'))
      .finally(() => setLoading(false))
  }, [period])

  if (loading || !data) return <Loading />

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Trend ordini per mese</CardTitle>
          <p className="text-xs text-gray-500">N. ordini materiale emessi mese su mese</p>
        </CardHeader>
        <CardContent>
          {data.trend_monthly.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.trend_monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" name="Ordini" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top 10 fornitori materiali</CardTitle>
          <p className="text-xs text-gray-500">N. preventivi distinti ordinati per fornitore</p>
        </CardHeader>
        <CardContent>
          {data.top_suppliers.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.top_suppliers} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="supplier_name" fontSize={11} width={140} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" name="Preventivi" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Lead time medio "completato → ordine"</CardTitle>
          <p className="text-xs text-gray-500">
            Giorni medi tra completamento preventivo e generazione ordine materiale ·
            media periodo: <span className="font-semibold text-blue-700">{data.lead_time_avg_days.toFixed(1)} gg</span>
          </p>
        </CardHeader>
        <CardContent>
          {data.lead_time_monthly.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.lead_time_monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${v}gg`} />
                <Tooltip formatter={(v: number) => `${v.toFixed(1)} giorni`} />
                <Line type="monotone" dataKey="avg_days" stroke="#2563eb" strokeWidth={2} name="Giorni medi" dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Tab Utensili ──────────────────────────────────────────────────────────

function ToolsStatsTab({ period }: { period: Period }) {
  const [data, setData] = useState<ToolsStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/dashboard/statistics/tools?period=${period}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche utensili'))
      .finally(() => setLoading(false))
  }, [period])

  if (loading || !data) return <Loading />

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Wrench className="w-4 h-4" /> Trend ordini per mese</CardTitle>
          <p className="text-xs text-gray-500">N. ordini utensili emessi mese su mese</p>
        </CardHeader>
        <CardContent>
          {data.trend_monthly.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.trend_monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#7c3aed" name="Ordini" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top fornitori utensili</CardTitle>
          <p className="text-xs text-gray-500">N. righe ordine per fornitore (snapshot al momento dell'ordine)</p>
        </CardHeader>
        <CardContent>
          {data.top_suppliers.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.top_suppliers} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="supplier_name" fontSize={11} width={140} />
                <Tooltip />
                <Bar dataKey="count" fill="#7c3aed" name="Utensili" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top 10 utensili più ordinati</CardTitle>
          <p className="text-xs text-gray-500">Codice utensile + quantità cumulata nel periodo</p>
        </CardHeader>
        <CardContent>
          {data.top_tools.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.top_tools} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="code" fontSize={11} width={140} />
                <Tooltip />
                <Bar dataKey="total_quantity" fill="#7c3aed" name="Quantità" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Stati condivisi ───────────────────────────────────────────────────────

function Loading() {
  return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento…</div>
}

function EmptyChart() {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">
      Nessun dato per questo periodo
    </div>
  )
}
