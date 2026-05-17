import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { Plus, TrendingUp, TrendingDown, Check, Send, FileText, Inbox, ChevronRight, AlertTriangle, Wrench, Hammer, BarChart3, Percent, Clock, Package, CalendarClock } from 'lucide-react'
import PageContainer from '@/components/ui/page-container'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import type { DashboardKPI, MonthlyData, WorkflowStats, DashboardQuoteRow } from '@/types'
import type { Notification } from '@/lib/useNotifications'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import { timeAgo } from '@/lib/timeAgo'
import { useAuth } from '@/lib/auth'
import { ACTIVITY_KIND } from '@/lib/activity'
import { toast } from 'sonner'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'

const fmtEur = (n: number) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function DashboardPage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canReview = hasPermission('quotes.complete')
  const canTools = hasPermission('tools')
  const canOrderMaterials = hasPermission('orders.materials')
  const [alerts, setAlerts] = useState<{ low_stock_tools: number; stale_submitted: number; to_order_materials: number }>({
    low_stock_tools: 0, stale_submitted: 0, to_order_materials: 0,
  })

  const [kpi, setKpi] = useState<DashboardKPI | null>(null)
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [stats, setStats] = useState<WorkflowStats | null>(null)
  const [myDrafts, setMyDrafts] = useState<DashboardQuoteRow[]>([])
  const [myPending, setMyPending] = useState<DashboardQuoteRow[]>([])
  const [toReview, setToReview] = useState<DashboardQuoteRow[]>([])
  const [activity, setActivity] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const calls: Promise<unknown>[] = [
      api.get('/dashboard/kpi'),
      api.get('/dashboard/monthly'),
      api.get('/dashboard/workflow-stats'),
      api.get('/dashboard/my-quotes', { params: { status: 'bozza' } }),
      api.get('/dashboard/my-quotes', { params: { status: 'inviato' } }),
      api.get('/dashboard/activity'),
    ]
    if (canReview) calls.push(api.get('/dashboard/to-review'))

    Promise.all(calls).then((results) => {
      const [kpiR, monthlyR, statsR, draftsR, pendingR, actR, reviewR] = results as { data: unknown }[]
      setKpi(kpiR.data as DashboardKPI)
      setMonthly(monthlyR.data as MonthlyData[])
      setStats(statsR.data as WorkflowStats)
      setMyDrafts(draftsR.data as DashboardQuoteRow[])
      setMyPending(pendingR.data as DashboardQuoteRow[])
      setActivity(actR.data as Notification[])
      if (reviewR) setToReview(reviewR.data as DashboardQuoteRow[])
    }).catch(() => {
      toast.error('Errore nel caricamento dashboard')
    }).finally(() => setLoading(false))

    // Alert panel: 1 endpoint, 3 counts. Niente preghiera permessi qui —
    // l'endpoint richiede solo `dashboard` (già verificato dal canView del
    // page mount). Le righe del pannello mostrate solo se can{Tools,Order}.
    api.get('/dashboard/alerts')
      .then(r => setAlerts(r.data || { low_stock_tools: 0, stale_submitted: 0, to_order_materials: 0 }))
      .catch(() => undefined)
  }, [canReview])

  if (loading || !kpi || !stats) return (
    <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>
  )

  return (
    <PageContainer width="xl">
      <SettingsPageHeader
        icon={BarChart3}
        color="blue"
        title="Dashboard"
        subtitle="Riepilogo lavoro e numeri chiave"
        action={
          <PrimaryCtaButton color="blue" onClick={() => navigate('/quotes/new')}>
            <Plus className="w-4 h-4" /> Nuovo Preventivo
          </PrimaryCtaButton>
        }
      />
      <StatusChips stats={stats} onClick={(status) => navigate(`/quotes/archive?status=${status}`)} />
      <AlertPanel
        alerts={alerts}
        canTools={canTools}
        canOrderMaterials={canOrderMaterials}
        canReview={canReview}
        onNavigate={navigate}
      />
      <KPIGrid kpi={kpi} />
      {monthly.length > 0 && <MonthlyChart data={monthly} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <QuoteListSection
            title="Le mie bozze"
            count={stats.my_drafts_count}
            rows={myDrafts}
            emptyText="Nessuna bozza in lavorazione"
            icon={<FileText className="w-4 h-4 text-gray-400" />}
            onClick={(id) => navigate(`/quotes/${id}`)}
          />
          <QuoteListSection
            title="I miei inviati"
            count={stats.my_pending_count}
            rows={myPending}
            emptyText="Nessun preventivo in stato 'inviato'. Apri una bozza e usa 'Invia per revisione' per spostarla qui."
            icon={<Send className="w-4 h-4 text-amber-500" />}
            onClick={(id) => navigate(`/quotes/${id}`)}
          />
          {canReview && (
            <QuoteListSection
              title="Da leggere"
              count={stats.to_review_count}
              rows={toReview}
              emptyText="Niente da leggere"
              icon={<Inbox className="w-4 h-4 text-blue-500" />}
              onClick={(id) => navigate(`/quotes/${id}`)}
              showSubmitter
            />
          )}
        </div>

        <ActivityCard
          items={activity}
          onClick={(quoteId) => navigate(`/quotes/${quoteId}`)}
          onSeeAll={() => navigate('/activity')}
        />
      </div>
    </PageContainer>
  )
}

// ─── Sezioni interne (co-locate, usate solo qui) ──────────────────────────────

// Pannello Alert: mostra 0..N righe per problemi attivi. Se tutte 0,
// niente visualizzazione (zero rumore). Ogni riga linka alla pagina
// di azione per risolvere il problema.
interface AlertCounts {
  low_stock_tools: number
  stale_submitted: number
  to_order_materials: number
}
function AlertPanel({
  alerts, canTools, canOrderMaterials, canReview, onNavigate,
}: {
  alerts: AlertCounts
  canTools: boolean
  canOrderMaterials: boolean
  canReview: boolean
  onNavigate: (path: string) => void
}) {
  const rows = [
    canTools && alerts.low_stock_tools > 0 && {
      key: 'tools',
      icon: Wrench,
      bg: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      iconColor: 'text-orange-600',
      titleColor: 'text-orange-800',
      bodyColor: 'text-orange-700',
      title: `${alerts.low_stock_tools} utensil${alerts.low_stock_tools === 1 ? 'e' : 'i'} sotto la quantità minima`,
      body: 'Apri Ordini utensili per generare il PDF aggregato per fornitore',
      onClick: () => onNavigate('/orders/tools'),
    },
    canReview && alerts.stale_submitted > 0 && {
      key: 'stale',
      icon: Clock,
      bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      iconColor: 'text-amber-600',
      titleColor: 'text-amber-800',
      bodyColor: 'text-amber-700',
      title: `${alerts.stale_submitted} preventiv${alerts.stale_submitted === 1 ? 'o' : 'i'} in revisione da > 7 giorni`,
      body: 'Bottleneck di revisione: aprili per smaltire',
      onClick: () => onNavigate('/quotes/archive?status=inviato'),
    },
    canOrderMaterials && alerts.to_order_materials > 0 && {
      key: 'to-order',
      icon: Package,
      bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      iconColor: 'text-blue-600',
      titleColor: 'text-blue-800',
      bodyColor: 'text-blue-700',
      title: `${alerts.to_order_materials} preventiv${alerts.to_order_materials === 1 ? 'o completato senza' : 'i completati senza'} ordine materiale`,
      body: 'Apri Ordini materiali per generare la lista per fornitore',
      onClick: () => onNavigate('/orders/materials'),
    },
  ].filter(Boolean) as Array<{
    key: string; icon: typeof Wrench; bg: string; iconColor: string;
    titleColor: string; bodyColor: string; title: string; body: string;
    onClick: () => void
  }>

  if (rows.length === 0) return null

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <button
          key={r.key}
          type="button"
          onClick={r.onClick}
          className={`w-full border rounded-lg px-4 py-3 flex items-center gap-3 text-left transition-colors ${r.bg}`}
        >
          <r.icon className={`w-5 h-5 shrink-0 ${r.iconColor}`} />
          <div className="flex-1">
            <div className={`text-sm font-semibold ${r.titleColor}`}>{r.title}</div>
            <div className={`text-xs ${r.bodyColor}`}>{r.body}</div>
          </div>
          <ChevronRight className={`w-4 h-4 shrink-0 ${r.iconColor} opacity-70`} />
        </button>
      ))}
    </div>
  )
}

// 3 chip cliccabili con conteggio per stato. Click → archivio preventivi
// filtrato per quel status (via query param ?status=X).
function StatusChips({ stats, onClick }: { stats: WorkflowStats; onClick: (status: 'bozza' | 'inviato' | 'completato') => void }) {
  const counts = stats.by_status
  const CHIPS = [
    { status: 'bozza' as const,      label: 'Bozze',       count: counts.bozza ?? 0,      colors: 'bg-gray-50 border-gray-200 hover:border-gray-400 text-gray-700' },
    { status: 'inviato' as const,    label: 'In revisione', count: counts.inviato ?? 0,    colors: 'bg-amber-50 border-amber-200 hover:border-amber-400 text-amber-800' },
    { status: 'completato' as const, label: 'Completati',  count: counts.completato ?? 0, colors: 'bg-green-50 border-green-200 hover:border-green-400 text-green-800' },
  ]
  return (
    <div className="grid grid-cols-3 gap-3">
      {CHIPS.map(c => (
        <button
          key={c.status}
          type="button"
          onClick={() => onClick(c.status)}
          className={`p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${c.colors}`}
        >
          <div className="text-3xl font-bold leading-none">{c.count}</div>
          <div className="text-sm font-medium mt-1">{c.label}</div>
        </button>
      ))}
    </div>
  )
}

function KPIGrid({ kpi }: { kpi: DashboardKPI }) {
  const diff = kpi.percentage_diff
  const diffPositive = diff >= 0
  // Card "Valore stampi" mostrata solo quando ci sono preventivi stampo
  // in archivio: per officine senza modulo stampi attivo, la dashboard
  // resta a 4+1 card come prima.
  const showDies = (kpi.dies_quoted_value ?? 0) > 0
  // Margine medio: solo se ho almeno un preventivo (cost > 0)
  const margin = kpi.avg_margin_percent ?? 0
  const showMargin = kpi.total_quotes > 0
  // Grid columns: 4 base + 1 stampi (opzionale) + 1 margine (opzionale).
  // Su sm/md sempre 2 col; su lg dinamico in base ai card presenti.
  const lgCols = (showDies && showMargin) ? 'lg:grid-cols-6'
    : (showDies || showMargin) ? 'lg:grid-cols-5'
    : 'lg:grid-cols-4'
  const marginColor = margin >= 30 ? 'text-green-600' : margin >= 15 ? 'text-amber-600' : 'text-red-500'
  return (
    <div className={`grid grid-cols-2 ${lgCols} gap-4`}>
      <Card>
        <CardHeader className="pb-1">
          <CardDescription>Valore totale preventivato</CardDescription>
          <CardTitle className="text-3xl">{fmtEur(kpi.total_quoted_value)} €</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          {kpi.total_quotes} preventivi
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardDescription>Valore mese corrente</CardDescription>
          <CardTitle className="text-3xl">{fmtEur(kpi.quoted_value_this_month)} €</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          {kpi.total_quotes_this_month} preventivi
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardDescription>Trend vs mese precedente</CardDescription>
          <CardTitle className={`text-3xl flex items-center gap-2 ${diffPositive ? 'text-green-600' : 'text-red-500'}`}>
            {diffPositive
              ? <TrendingUp className="w-7 h-7" />
              : <TrendingDown className="w-7 h-7" />}
            {diffPositive ? '+' : ''}{diff.toFixed(1)}%
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          {fmtEur(kpi.quoted_value_prev_month)} € il mese scorso
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardDescription>Media per preventivo</CardDescription>
          <CardTitle className="text-3xl">{fmtEur(kpi.avg_quote_value)} €</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          su {kpi.total_quotes} preventivi
        </CardContent>
      </Card>

      {showDies && (
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5"><Hammer className="w-3.5 h-3.5" /> Valore stampi</CardDescription>
            <CardTitle className="text-3xl text-rose-700">{fmtEur(kpi.dies_quoted_value || 0)} €</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">
            Preventivi modulo Stampi
          </CardContent>
        </Card>
      )}

      {showMargin && (
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" /> Margine medio</CardDescription>
            <CardTitle className={`text-3xl ${marginColor}`}>{margin.toFixed(1)}%</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">
            Su preventivi standard (no stampi)
          </CardContent>
        </Card>
      )}
    </div>
  )
}

type Metric = 'value' | 'margin' | 'material' | 'labor'

const METRIC_CONFIG: Record<Metric, { label: string; color: string }> = {
  value:    { label: 'Valore preventivato', color: '#2563eb' },
  margin:   { label: 'Margine',             color: '#16a34a' },
  material: { label: 'Costo materiali',     color: '#d97706' },
  labor:    { label: 'Costo lavorazioni',   color: '#4f46e5' },
}

function MonthlyChart({ data }: { data: MonthlyData[] }) {
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

function QuoteListSection({
  title, count, rows, emptyText, icon, onClick, showSubmitter = false,
}: {
  title: string
  count: number
  rows: DashboardQuoteRow[]
  emptyText: string
  icon: React.ReactNode
  onClick: (id: number) => void
  showSubmitter?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
          <span className="text-sm font-normal text-gray-400">({count})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">{emptyText}</div>
        ) : (
          <ul>
            {rows.map(q => (
              <li
                key={q.id}
                onClick={() => onClick(q.id)}
                className="border-b last:border-0 px-4 py-2.5 cursor-pointer hover:bg-gray-50 flex items-center gap-3"
              >
                <span className="font-mono font-medium text-blue-700 text-sm shrink-0">{q.quote_number}</span>
                <span className="text-sm text-gray-600 truncate flex-1">{q.customer_name || '—'}</span>
                {showSubmitter && q.submitted_by && (
                  <span className="text-xs text-gray-400 shrink-0">
                    {q.submitted_by.full_name || q.submitted_by.username}
                    {q.submitted_at && <> · {timeAgo(q.submitted_at)}</>}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_COLORS[q.status] || STATUS_COLORS.bozza}`}>
                  {STATUS_LABELS[q.status] || q.status}
                </span>
                <span className="font-medium text-sm shrink-0 w-24 text-right">{q.total_price.toFixed(2)} €</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityCard({ items, onClick, onSeeAll }: {
  items: Notification[]
  onClick: (quoteId: number) => void
  onSeeAll?: () => void
}) {
  return (
    <Card className="lg:sticky lg:top-4 self-start">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base">Attività recente</CardTitle>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
            Tutte <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">Nessuna attività</div>
        ) : (
          <ul>
            {items.map(a => {
              const unread = !a.read_at
              const confirmed = !!a.confirmed_at
              const quoteId = typeof a.data?.quote_id === 'number' ? a.data.quote_id : null
              const kind = ACTIVITY_KIND[a.type]
              const isCompleted = a.type === 'quote_completed'
              return (
                <li
                  key={a.id}
                  onClick={() => quoteId && onClick(quoteId)}
                  className={`border-b last:border-0 px-4 py-3 ${quoteId ? 'cursor-pointer hover:bg-gray-50' : ''} ${isCompleted ? 'bg-green-50/40' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="pt-1.5 shrink-0">
                      {confirmed ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : unread ? (
                        <span className="block w-2 h-2 rounded-full bg-blue-500" />
                      ) : (
                        <span className="block w-2 h-2 rounded-full border border-gray-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2 justify-between">
                        <p className={`text-sm ${unread ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{a.title}</p>
                        {kind && (
                          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${kind.pillClass}`}>
                            {kind.icon}
                            {kind.label}
                          </span>
                        )}
                      </div>
                      {a.body && <p className="text-xs text-gray-500">{a.body}</p>}
                      <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(a.created_at)}</p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
