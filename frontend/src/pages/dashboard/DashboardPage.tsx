import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { Plus, Send, FileText, Inbox, BarChart3 } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import type { DashboardKPI, MonthlyData, WorkflowStats, DashboardQuoteRow } from '@/types'
import type { Notification } from '@/lib/useNotifications'
import { useAuth } from '@/lib/auth'
import { toast } from 'sonner'
import AlertPanel, { type AlertCounts } from './AlertPanel'
import KpiGrid from './KpiGrid'
import MonthlyChart from './MonthlyChart'
import { StatusChips, QuoteListSection, ActivityCard } from './DashboardLists'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canReview = hasPermission('quotes.complete')
  const canTools = hasPermission('tools')
  const canOrderMaterials = hasPermission('orders.materials')
  const [alerts, setAlerts] = useState<AlertCounts>({
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

    // Alert panel: 1 endpoint, 3 counts. L'endpoint richiede solo `dashboard`
    // (già verificato dal mount). Le righe mostrate solo se can{Tools,Order}.
    api.get('/dashboard/alerts')
      .then(r => setAlerts(r.data || { low_stock_tools: 0, stale_submitted: 0, to_order_materials: 0 }))
      .catch(() => undefined)
  }, [canReview])

  if (loading || !kpi || !stats) return (
    <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>
  )

  return (
    <StandardPage
      icon={BarChart3}
      color="blue"
      width="xl"
      title="Dashboard"
      subtitle="Riepilogo lavoro e numeri chiave"
      actions={
        <PrimaryCtaButton color="blue" onClick={() => navigate('/quotes/new')}>
          <Plus className="w-4 h-4" /> Nuovo Preventivo
        </PrimaryCtaButton>
      }
    >
      <StatusChips stats={stats} onClick={(status) => navigate(`/quotes/archive?status=${status}`)} />
      <AlertPanel
        alerts={alerts}
        canTools={canTools}
        canOrderMaterials={canOrderMaterials}
        canReview={canReview}
        onNavigate={navigate}
      />
      <KpiGrid kpi={kpi} />
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
    </StandardPage>
  )
}
