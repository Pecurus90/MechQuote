import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { Plus, TrendingUp, TrendingDown, Check, Send, FileText, Inbox, ChevronRight } from 'lucide-react'
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
  }, [canReview])

  if (loading || !kpi || !stats) return (
    <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <DashboardHeader stats={stats} onNew={() => navigate('/quotes/new')} />
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
            emptyText="Nessun preventivo inviato in attesa"
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
    </div>
  )
}

// ─── Sezioni interne (co-locate, usate solo qui) ──────────────────────────────

function DashboardHeader({ stats, onNew }: { stats: WorkflowStats; onNew: () => void }) {
  const counts = stats.by_status
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-900 mr-2">Dashboard</h2>
        <StatusPill label="Bozza" value={counts.bozza ?? 0} color="bg-gray-100 text-gray-700" />
        <StatusPill label="Inviato" value={counts.inviato ?? 0} color="bg-amber-100 text-amber-700" />
        <StatusPill label="Completato" value={counts.completato ?? 0} color="bg-green-100 text-green-700" />
      </div>
      <Button onClick={onNew}>
        <Plus className="w-4 h-4 mr-1.5" /> Nuovo Preventivo
      </Button>
    </div>
  )
}

function StatusPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {value} {label}
    </span>
  )
}

function KPIGrid({ kpi }: { kpi: DashboardKPI }) {
  const diff = kpi.percentage_diff
  const diffPositive = diff >= 0
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => [`${fmtEur(v)} €`, cfg.label]}
                contentStyle={{ fontSize: 12 }}
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
