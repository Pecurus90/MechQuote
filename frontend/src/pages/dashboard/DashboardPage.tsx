import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Drill, FileSearch, Hourglass, Euro } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MonthlyData, WorkflowStats, DashboardQuoteRow, ToolLowStockPreview } from '@/types'
import type { Notification } from '@/lib/useNotifications'
import { useAuth } from '@/lib/auth'
import { toast } from 'sonner'
import { DashboardView } from '@/pages/dashboard/DashboardView'
import type { KpiTone } from '@/components/dashboard/KpiCard'

// Wrapper "container": fetch + permessi. Tutta la grafica sta in DashboardView
// (design handoff). Qui si passano solo dati reali e handler.

interface MaterialsStats { to_order: number; orders_this_month: number; orders_total: number; last_order_at: string | null }
interface ToolsStats { low_stock: number; total_active: number; orders_this_month: number; orders_total: number; last_order_at: string | null }

export default function DashboardPage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canReview = hasPermission('quotes.confirm')
  const canQuote = hasPermission('quotes.create')
  const canTools = hasPermission('tools')
  const canOrderMaterials = hasPermission('orders.materials')

  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [stats, setStats] = useState<WorkflowStats | null>(null)
  const [matStats, setMatStats] = useState<MaterialsStats | null>(null)
  const [toolStats, setToolStats] = useState<ToolsStats | null>(null)
  const [toolPreview, setToolPreview] = useState<ToolLowStockPreview | null>(null)
  const [myQuotes, setMyQuotes] = useState<DashboardQuoteRow[]>([])
  const [toReview, setToReview] = useState<DashboardQuoteRow[]>([])
  const [awaitingMaterials, setAwaitingMaterials] = useState<DashboardQuoteRow[]>([])
  const [activity, setActivity] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const get = <T,>(url: string, params?: object) =>
      api.get(url, params ? { params } : undefined).then(r => r.data as T).catch(() => null)

    Promise.allSettled([
      get<WorkflowStats>('/dashboard/workflow-stats').then(d => d && setStats(d)),
      get<MonthlyData[]>('/dashboard/monthly').then(d => d && setMonthly(d)),
      get<Notification[]>('/dashboard/activity').then(d => d && setActivity(d)),
      Promise.all([
        get<DashboardQuoteRow[]>('/dashboard/my-quotes', { status: 'bozza' }),
        get<DashboardQuoteRow[]>('/dashboard/my-quotes', { status: 'inviato' }),
      ]).then(([d, p]) => setMyQuotes([...(d || []), ...(p || [])])),
      canReview ? get<DashboardQuoteRow[]>('/dashboard/to-review').then(d => d && setToReview(d)) : null,
      canReview ? get<DashboardQuoteRow[]>('/dashboard/awaiting-materials').then(d => d && setAwaitingMaterials(d)) : null,
      canOrderMaterials ? get<MaterialsStats>('/orders/materials/stats').then(d => d && setMatStats(d)) : null,
      canTools ? get<ToolsStats>('/orders/tools/stats').then(d => d && setToolStats(d)) : null,
      canTools ? get<ToolLowStockPreview>('/orders/tools/preview').then(d => d && setToolPreview(d)) : null,
    ]).catch(() => toast.error('Errore nel caricamento dashboard')).finally(() => setLoading(false))
  }, [canReview, canOrderMaterials, canTools])

  if (loading || !stats) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento...</div>
  )

  // KPI (max 5, filtrate per permesso) → shape KpiSpec di DashboardView.
  // Set focalizzato sulle code di lavoro (riordino 2026-07): revisione interna,
  // esito cliente, buchi dati prezzo, approvvigionamento.
  type Kpi = { key: string; label: string; value: string | number; hint: string; icon: LucideIcon; tone: KpiTone; to: string; show: boolean }
  const allKpis: Kpi[] = [
    { key: 'da-revisionare', label: 'Da revisionare', value: stats.to_review_count, hint: 'inviati o letti, da confermare', icon: FileSearch, tone: 'confirmed', to: '/quotes/active', show: canReview },
    { key: 'attesa-cliente', label: 'Attesa cliente', value: stats.awaiting_client_count, hint: 'offerte dal cliente', icon: Hourglass, tone: 'warning', to: '/quotes/active?status=in_attesa_cliente', show: canReview },
    { key: 'prezzi-mancanti', label: 'Prezzi mancanti', value: stats.completed_missing_price_count, hint: 'ordini completi senza prezzo', icon: Euro, tone: 'info', to: '/quotes/archive?status=completo', show: canReview },
    { key: 'da-ordinare', label: 'Da ordinare', value: matStats?.to_order ?? 0, hint: 'confermati da ordinare', icon: ShoppingCart, tone: 'danger', to: '/orders/materials', show: canOrderMaterials },
    { key: 'sotto-scorta', label: 'Sotto scorta utensili', value: toolStats?.low_stock ?? 0, hint: `su ${toolStats?.total_active ?? 0} a catalogo`, icon: Drill, tone: 'warning', to: '/orders/tools', show: canTools },
  ]
  const kpis = allKpis
    .filter(k => k.show)
    .map(k => ({ key: k.key, label: k.label, value: k.value, hint: k.hint, icon: k.icon, tone: k.tone, onClick: () => navigate(k.to) }))

  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const tools = canTools ? (toolPreview?.groups.flatMap(g => g.items) ?? []).slice(0, 6) : undefined

  return (
    <DashboardView
      subtitle={`Panoramica operativa · ${today}`}
      kpis={kpis}
      monthly={monthly}
      byStatus={stats.by_status}
      standardCount={stats.standard_count ?? 0}
      dieCount={stats.die_count ?? 0}
      onSelectStatus={(s) => navigate(
        ['completo', 'non_ordinato'].includes(s)
          ? `/quotes/archive?status=${s}`
          : `/quotes/active?status=${s}`
      )}
      toReview={canReview ? toReview : undefined}
      onSeeAllReview={() => navigate('/quotes/active')}
      myQuotes={canQuote ? myQuotes.slice(0, 6) : undefined}
      onSeeAllMine={() => navigate('/quotes/active')}
      onOpenQuote={(id) => navigate(`/quotes/${id}`)}
      activity={activity}
      onOpenActivity={(quoteId) => navigate(`/quotes/${quoteId}`)}
      onSeeAllActivity={() => navigate('/activity')}
      tools={tools}
      onOrderTools={() => navigate('/orders/tools')}
      materials={(canReview || canOrderMaterials) ? awaitingMaterials.slice(0, 6) : undefined}
      onOrderMaterials={() => navigate('/orders/materials')}
    />
  )
}
