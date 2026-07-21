import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, FileSearch, Hourglass, Euro, History } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MonthlyData, WorkflowStats, DashboardQuoteRow } from '@/types'
import type { Notification } from '@/lib/useNotifications'
import { useAuth } from '@/lib/auth'
import { toast } from 'sonner'
import { DashboardView } from '@/pages/dashboard/DashboardView'
import type { KpiTone } from '@/components/dashboard/KpiCard'

// Wrapper "container": fetch + permessi. Tutta la grafica sta in DashboardView
// (design handoff). Qui si passano solo dati reali e handler.

interface MaterialsStats { to_order: number; orders_this_month: number; orders_total: number; last_order_at: string | null }

export default function DashboardPage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  // Visibilità pipeline preventivi: chi accede all'archivio (ufficio tecnico
  // E amministrazione). La CONFERMA resta un'azione gated da quotes.confirm
  // nell'editor — qui la dashboard mostra gli stessi KPI ai due ruoli.
  const hasDashboard = hasPermission('dashboard')
  const canStatistics = hasPermission('statistics')   // vede i costi aggregati
  const canSeeQuotes = hasPermission('quotes.archive')
  const canQuote = hasPermission('quotes.create')
  // Rail/KPI "Utensili da ordinare" = dominio ORDINI utensili (orders.tools),
  // non l'anagrafica (tools): gli endpoint /orders/tools/* sono gated così.
  const canOrderTools = hasPermission('orders.tools')
  const canOrderMaterials = hasPermission('orders.materials')

  // Chi non ha la dashboard (es. ruolo officina) non deve restare bloccato
  // sullo spinner della home: redirige alla prima pagina utile per il ruolo.
  useEffect(() => {
    if (hasDashboard) return
    const dest = hasPermission('officina') ? '/officina'
      : canOrderTools ? '/orders/tools'
      : hasPermission('tools') ? '/tools'
      : canSeeQuotes ? '/quotes/active'
      : '/login'
    navigate(dest, { replace: true })
  }, [hasDashboard, canOrderTools, canSeeQuotes, hasPermission, navigate])

  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [stats, setStats] = useState<WorkflowStats | null>(null)
  const [matStats, setMatStats] = useState<MaterialsStats | null>(null)
  const [myQuotes, setMyQuotes] = useState<DashboardQuoteRow[]>([])
  const [toReview, setToReview] = useState<DashboardQuoteRow[]>([])
  const [awaitingMaterials, setAwaitingMaterials] = useState<DashboardQuoteRow[]>([])
  const [activity, setActivity] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasDashboard) return
    setLoading(true)
    const get = <T,>(url: string, params?: object) =>
      api.get(url, params ? { params } : undefined).then(r => r.data as T).catch(() => null)

    Promise.allSettled([
      get<WorkflowStats>('/dashboard/workflow-stats').then(d => d && setStats(d)),
      get<MonthlyData[]>('/dashboard/monthly').then(d => d && setMonthly(d)),
      get<Notification[]>('/dashboard/activity').then(d => d && setActivity(d)),
      get<DashboardQuoteRow[]>('/dashboard/my-quotes', { open_only: true }).then(d => d && setMyQuotes(d)),
      canSeeQuotes ? get<DashboardQuoteRow[]>('/dashboard/to-review').then(d => d && setToReview(d)) : null,
      (canSeeQuotes || canOrderMaterials) ? get<DashboardQuoteRow[]>('/dashboard/awaiting-materials').then(d => d && setAwaitingMaterials(d)) : null,
      canOrderMaterials ? get<MaterialsStats>('/orders/materials/stats').then(d => d && setMatStats(d)) : null,
    ]).catch(() => toast.error('Errore nel caricamento dashboard')).finally(() => setLoading(false))
  }, [hasDashboard, canSeeQuotes, canOrderMaterials, canOrderTools])

  if (!hasDashboard) return null  // redirect in corso
  if (loading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento...</div>
  )
  if (!stats) return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
      <p>Impossibile caricare la dashboard.</p>
      <button type="button" onClick={() => window.location.reload()}
        className="rounded-[8px] border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60">
        Riprova
      </button>
    </div>
  )

  // KPI (max 5, filtrate per permesso) → shape KpiSpec di DashboardView.
  // Set focalizzato sulle code di lavoro (riordino 2026-07): revisione interna,
  // esito cliente, buchi dati prezzo, approvvigionamento.
  type Kpi = { key: string; label: string; value: string | number; hint: string; icon: LucideIcon; tone: KpiTone; to: string; show: boolean }
  const allKpis: Kpi[] = [
    { key: 'da-revisionare', label: 'Preventivi da confermare', value: stats.to_review_count, hint: 'inviati o letti', icon: FileSearch, tone: 'confirmed', to: '/quotes/active?status=da_confermare', show: canSeeQuotes },
    { key: 'in-revisione', label: 'In revisione', value: stats.in_revision_count, hint: 'rimandati da rivedere', icon: History, tone: 'warning', to: '/quotes/active?status=in_revisione', show: canSeeQuotes },
    { key: 'attesa-cliente', label: 'In attesa del cliente', value: stats.awaiting_client_count, hint: 'offerta inviata', icon: Hourglass, tone: 'warning', to: '/quotes/active?status=in_attesa_cliente', show: canSeeQuotes },
    { key: 'prezzi-mancanti', label: 'Preventivi senza prezzo', value: stats.completed_missing_price_count, hint: 'ordini completi senza prezzo', icon: Euro, tone: 'info', to: '/quotes/archive?status=senza_prezzo', show: canSeeQuotes },
    { key: 'da-ordinare', label: 'Materiale da ordinare', value: matStats?.to_order ?? 0, hint: 'da preventivi confermati', icon: ShoppingCart, tone: 'danger', to: '/orders/materials', show: canOrderMaterials },
  ]
  const kpis = allKpis
    .filter(k => k.show)
    .map(k => ({ key: k.key, label: k.label, value: k.value, hint: k.hint, icon: k.icon, tone: k.tone, onClick: () => navigate(k.to) }))

  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <DashboardView
      subtitle={`Panoramica operativa · ${today}`}
      kpis={kpis}
      monthly={monthly}
      showCost={canStatistics}
      byStatus={stats.by_status}
      standardCount={stats.standard_count ?? 0}
      onSelectStatus={(s) => navigate(
        ['completo', 'non_ordinato'].includes(s)
          ? `/quotes/archive?status=${s}`
          : `/quotes/active?status=${s}`
      )}
      toReview={canSeeQuotes ? toReview : undefined}
      onSeeAllReview={() => navigate('/quotes/active?status=da_confermare')}
      myQuotes={canQuote ? myQuotes.slice(0, 6) : undefined}
      onSeeAllMine={() => navigate('/quotes/active')}
      onOpenQuote={(id) => navigate(`/quotes/${id}`)}
      activity={activity}
      onOpenActivity={(quoteId) => navigate(`/quotes/${quoteId}`)}
      onSeeAllActivity={() => navigate('/activity')}
      materials={(canSeeQuotes || canOrderMaterials) ? awaitingMaterials.slice(0, 20) : undefined}
      onOrderMaterials={() => navigate('/orders/materials')}
    />
  )
}
