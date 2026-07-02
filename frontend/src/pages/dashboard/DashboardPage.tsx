import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { Plus, Send, FileText, Inbox, LayoutDashboard, Package, ClipboardList, CheckCircle2, Wrench } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { KpiCard } from '@/components/ui/kpi-card'
import type { MonthlyData, WorkflowStats, DashboardQuoteRow } from '@/types'
import type { Notification } from '@/lib/useNotifications'
import { useAuth } from '@/lib/auth'
import { STATUS_LABELS } from '@/lib/constants'
import { toast } from 'sonner'
import MonthlyChart from './MonthlyChart'
import { QuoteListSection, ActivityCard } from './DashboardLists'

interface AlertCounts { low_stock_tools: number; stale_submitted: number; to_order_materials: number }

// Ordine + colore barra per i 5 stati preventivo (token design system).
const STATE_ORDER = ['bozza', 'inviato', 'letto', 'confermato', 'completo'] as const
const STATE_BAR: Record<string, string> = {
  bozza: 'bg-state-bozza', inviato: 'bg-state-inviato', letto: 'bg-state-letto',
  confermato: 'bg-state-confermato', completo: 'bg-state-completo',
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
  const totalCount = STATE_ORDER.reduce((s, k) => s + (bs[k] ?? 0), 0)
  const maxCount = Math.max(1, ...STATE_ORDER.map(k => bs[k] ?? 0))

  return (
    <StandardPage
      icon={LayoutDashboard}
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
      {/* KPI bar — card con barra accento + valore mono (design system) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {canArchive && (
          <KpiCard label="Preventivi attivi" value={activeCount} hint="in lavorazione"
            icon={ClipboardList} tone="info" onClick={() => navigate('/quotes/active')} />
        )}
        {canReview && (
          <KpiCard label="Da confermare" value={stats.to_review_count} hint="inviati + letti"
            icon={Inbox} tone="confirmed" onClick={() => navigate('/quotes/active?status=inviato')} />
        )}
        {(canReview || canOrderMaterials) && (
          <KpiCard label="In attesa materiale" value={alerts.to_order_materials} hint="confermati da ordinare"
            icon={Package} tone="danger" onClick={() => navigate('/orders/materials')} />
        )}
        {canTools && (
          <KpiCard label="Utensili sotto minimo" value={alerts.low_stock_tools} hint="da riordinare"
            icon={Wrench} tone="warning" onClick={() => navigate('/orders/tools')} />
        )}
      </div>

      {/* lavoro + grafici (sx) · stati + attività (dx) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5 min-w-0">
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
              icon={<Send className="w-4 h-4 text-state-letto" />}
              onClick={(id) => navigate(`/quotes/${id}`)}
            />
          )}
          {canReview && (
            <QuoteListSection
              title="Da confermare" count={stats.to_review_count} rows={toReview}
              emptyText="Niente da confermare (inviati e letti compaiono qui)"
              icon={<Inbox className="w-4 h-4 text-state-inviato" />}
              onClick={(id) => navigate(`/quotes/${id}`)}
              showSubmitter
            />
          )}
          {canReview && (
            <QuoteListSection
              title="Confermati in attesa materiale" count={awaitingMaterials.length} rows={awaitingMaterials}
              emptyText="Nessun confermato in attesa di ordine materiale"
              icon={<CheckCircle2 className="w-4 h-4 text-state-confermato" />}
              onClick={(id) => navigate(`/quotes/${id}`)}
              showSubmitter
            />
          )}
        </div>

        <div className="space-y-5 min-w-0">
          {/* Preventivi per stato — barre orizzontali cliccabili (token stato) */}
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">Preventivi per stato</CardTitle>
              <span className="text-[11px] text-muted-foreground font-mono">Totale {totalCount}</span>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {totalCount === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Nessun preventivo</div>
              ) : STATE_ORDER.map(s => {
                const n = bs[s] ?? 0
                const pct = Math.round((n / maxCount) * 100)
                return (
                  <button
                    key={s}
                    onClick={() => navigate(`/quotes/active?status=${s}`)}
                    className="w-full flex items-center gap-3 group"
                    title={`Apri ${STATUS_LABELS[s] ?? s}`}
                  >
                    <span className="w-[74px] shrink-0 text-left text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      {STATUS_LABELS[s] ?? s}
                    </span>
                    <span className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                      <span className={`block h-full rounded-full ${STATE_BAR[s]}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-7 text-right text-xs font-mono font-semibold text-foreground">{n}</span>
                  </button>
                )
              })}
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
