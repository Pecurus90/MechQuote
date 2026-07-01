import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { Plus, Send, FileText, Inbox, BarChart3, Package, ClipboardList, CheckCircle2, Wrench, type LucideIcon } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { MonthlyData, WorkflowStats, DashboardQuoteRow } from '@/types'
import type { Notification } from '@/lib/useNotifications'
import { useAuth } from '@/lib/auth'
import { STATUS_LABELS } from '@/lib/constants'
import { toast } from 'sonner'
import MonthlyChart from './MonthlyChart'
import { QuoteListSection, ActivityCard } from './DashboardLists'

interface AlertCounts { low_stock_tools: number; stale_submitted: number; to_order_materials: number }

// Card KPI con gradiente d'impatto (spec 20, riferimento CRM).
function KpiCard({ label, value, hint, icon: Icon, gradient, onClick }: {
  label: string; value: number; hint?: string; icon: LucideIcon; gradient: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} className={`text-left rounded-xl p-4 text-white shadow-sm bg-gradient-to-br ${gradient} hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white/90">{label}</span>
        <Icon className="w-5 h-5 text-white/80" />
      </div>
      <div className="text-3xl font-bold mt-2 leading-none">{value}</div>
      {hint && <div className="text-xs text-white/80 mt-1">{hint}</div>}
    </button>
  )
}

const STATUS_CHART_COLORS: Record<string, string> = {
  bozza: '#9ca3af', inviato: '#f59e0b', letto: '#0ea5e9', confermato: '#8b5cf6', completo: '#22c55e',
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canReview = hasPermission('quotes.confirm')
  const canQuote = hasPermission('quotes.create')
  const canArchive = hasPermission('quotes.archive')
  const canTools = hasPermission('tools')
  const canOrderMaterials = hasPermission('orders.materials')

  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [stats, setStats] = useState<WorkflowStats | null>(null)
  const [alerts, setAlerts] = useState<AlertCounts>({ low_stock_tools: 0, stale_submitted: 0, to_order_materials: 0 })
  const [myDrafts, setMyDrafts] = useState<DashboardQuoteRow[]>([])
  const [myPending, setMyPending] = useState<DashboardQuoteRow[]>([])
  const [toReview, setToReview] = useState<DashboardQuoteRow[]>([])
  const [awaitingMaterials, setAwaitingMaterials] = useState<DashboardQuoteRow[]>([])
  const [activity, setActivity] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const calls: Promise<unknown>[] = [
      api.get('/dashboard/workflow-stats'),
      api.get('/dashboard/monthly'),
      api.get('/dashboard/my-quotes', { params: { status: 'bozza' } }),
      api.get('/dashboard/my-quotes', { params: { status: 'inviato' } }),
      api.get('/dashboard/activity'),
    ]
    if (canReview) {
      calls.push(api.get('/dashboard/to-review'))
      calls.push(api.get('/dashboard/awaiting-materials'))
    }
    Promise.all(calls).then((r) => {
      const [statsR, monthlyR, draftsR, pendingR, actR, reviewR, awaitingR] = r as { data: unknown }[]
      setStats(statsR.data as WorkflowStats)
      setMonthly(monthlyR.data as MonthlyData[])
      setMyDrafts(draftsR.data as DashboardQuoteRow[])
      setMyPending(pendingR.data as DashboardQuoteRow[])
      setActivity(actR.data as Notification[])
      if (reviewR) setToReview(reviewR.data as DashboardQuoteRow[])
      if (awaitingR) setAwaitingMaterials(awaitingR.data as DashboardQuoteRow[])
    }).catch(() => toast.error('Errore nel caricamento dashboard')).finally(() => setLoading(false))

    api.get('/dashboard/alerts')
      .then(res => setAlerts(res.data || { low_stock_tools: 0, stale_submitted: 0, to_order_materials: 0 }))
      .catch(() => undefined)
  }, [canReview])

  if (loading || !stats) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento...</div>
  )

  const bs = stats.by_status
  const activeCount = (bs.bozza ?? 0) + (bs.inviato ?? 0) + (bs.letto ?? 0) + (bs.confermato ?? 0)
  const statusPie = Object.entries(bs)
    .filter(([k, v]) => v > 0 && STATUS_CHART_COLORS[k])
    .map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v, color: STATUS_CHART_COLORS[k] }))

  return (
    <StandardPage
      icon={BarChart3}
      color="blue"
      width="xl"
      title="Dashboard"
      subtitle="Cosa c'è da fare — a colpo d'occhio"
      actions={
        <PrimaryCtaButton color="blue" onClick={() => navigate('/quotes/new')}>
          <Plus className="w-4 h-4" /> Nuovo Preventivo
        </PrimaryCtaButton>
      }
    >
      {/* FASCIA 1 — KPI headline con gradiente */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {canArchive && (
          <KpiCard label="Preventivi attivi" value={activeCount} hint="in lavorazione"
            icon={ClipboardList} gradient="from-indigo-500 to-violet-600"
            onClick={() => navigate('/quotes/active')} />
        )}
        {canReview && (
          <KpiCard label="Da confermare" value={stats.to_review_count} hint="inviati + letti"
            icon={Inbox} gradient="from-cyan-500 to-blue-600"
            onClick={() => navigate('/quotes/active?status=inviato')} />
        )}
        {(canReview || canOrderMaterials) && (
          <KpiCard label="In attesa materiale" value={alerts.to_order_materials} hint="confermati da ordinare"
            icon={Package} gradient="from-fuchsia-500 to-pink-600"
            onClick={() => navigate('/orders/materials')} />
        )}
        {canTools && (
          <KpiCard label="Utensili sotto minimo" value={alerts.low_stock_tools} hint="da riordinare"
            icon={Wrench} gradient="from-amber-500 to-orange-600"
            onClick={() => navigate('/orders/tools')} />
        )}
      </div>

      {/* FASCIA 2 — lavoro + grafici (sx) · attività + stati (dx) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {monthly.length > 0 && <MonthlyChart data={monthly} />}

          {canQuote && (
            <QuoteListSection
              title="Le mie bozze" count={stats.my_drafts_count} rows={myDrafts}
              emptyText="Nessuna bozza in lavorazione"
              icon={<FileText className="w-4 h-4 text-muted-foreground" />}
              onClick={(id) => navigate(`/quotes/${id}`)}
            />
          )}
          {canQuote && (
            <QuoteListSection
              title="I miei inviati" count={stats.my_pending_count} rows={myPending}
              emptyText="Nessun preventivo inviato in attesa"
              icon={<Send className="w-4 h-4 text-amber-500" />}
              onClick={(id) => navigate(`/quotes/${id}`)}
            />
          )}
          {canReview && (
            <QuoteListSection
              title="Da confermare" count={stats.to_review_count} rows={toReview}
              emptyText="Niente da confermare (inviati e letti compaiono qui)"
              icon={<Inbox className="w-4 h-4 text-blue-500" />}
              onClick={(id) => navigate(`/quotes/${id}`)}
              showSubmitter
            />
          )}
          {canReview && (
            <QuoteListSection
              title="Confermati in attesa materiale" count={awaitingMaterials.length} rows={awaitingMaterials}
              emptyText="Nessun confermato in attesa di ordine materiale"
              icon={<CheckCircle2 className="w-4 h-4 text-violet-500" />}
              onClick={(id) => navigate(`/quotes/${id}`)}
              showSubmitter
            />
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Preventivi per stato</CardTitle>
            </CardHeader>
            <CardContent>
              {statusPie.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">Nessun preventivo</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={80} innerRadius={45} paddingAngle={2}
                      label={(d: { name: string; value: number }) => `${d.name} (${d.value})`}>
                      {statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <ActivityCard
            items={activity}
            onClick={(quoteId) => navigate(`/quotes/${quoteId}`)}
            onSeeAll={() => navigate('/activity')}
          />
        </div>
      </div>
    </StandardPage>
  )
}
