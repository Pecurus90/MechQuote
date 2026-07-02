import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import {
  Plus, LayoutDashboard, ShoppingCart, Drill, Truck, FileSearch, Clock, Wrench, Package,
} from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import { Card, CardContent } from '@/components/ui/card'
import { KpiCard, type KpiTone } from '@/components/ui/kpi-card'
import { StatusBadge, MaterialStatusBadge } from '@/components/ui/status-badge'
import type { LucideIcon } from 'lucide-react'
import type { MonthlyData, WorkflowStats, DashboardQuoteRow, ToolLowStockPreview } from '@/types'
import type { Notification } from '@/lib/useNotifications'
import { useAuth } from '@/lib/auth'
import { timeAgo } from '@/lib/timeAgo'
import { toast } from 'sonner'
import MonthlyChart from './MonthlyChart'
import PerStatusChart from './PerStatusChart'
import { ActivityCard } from './DashboardLists'

interface MaterialsStats { to_order: number; orders_this_month: number; orders_total: number; last_order_at: string | null }
interface ToolsStats { low_stock: number; total_active: number; orders_this_month: number; orders_total: number; last_order_at: string | null }

const eur = (v: number) => '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

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

  // ─── KPI (5, come prototipo) — filtrate per permesso ────────────────────────
  type Kpi = { key: string; label: string; value: string | number; hint: string; icon: LucideIcon; tone: KpiTone; to: string; show: boolean }
  const allKpis: Kpi[] = [
    { key: 'da-ordinare', label: 'Da ordinare', value: matStats?.to_order ?? 0, hint: 'confermati da ordinare', icon: ShoppingCart, tone: 'danger', to: '/orders/materials', show: canOrderMaterials },
    { key: 'sotto-scorta', label: 'Sotto scorta utensili', value: toolStats?.low_stock ?? 0, hint: `su ${toolStats?.total_active ?? 0} a catalogo`, icon: Drill, tone: 'warning', to: '/orders/tools', show: canTools },
    { key: 'ordini-mese', label: 'Ordini nel mese', value: matStats?.orders_this_month ?? 0, hint: 'ordini materiale emessi', icon: Truck, tone: 'info', to: '/orders/materials', show: canOrderMaterials },
    { key: 'da-revisionare', label: 'Da revisionare', value: stats.to_review_count, hint: 'in attesa conferma', icon: FileSearch, tone: 'confirmed', to: '/quotes/active?status=inviato', show: canReview },
    { key: 'ultimo-ordine', label: 'Ultimo ordine', value: matStats?.last_order_at ? timeAgo(matStats.last_order_at) : '—', hint: 'materiale', icon: Clock, tone: 'success', to: '/orders/materials', show: canOrderMaterials },
  ]
  const kpis = allKpis.filter(k => k.show)

  const myRecent = myQuotes.slice(0, 6)

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
      {/* KPI bar */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map(k => (
            <KpiCard key={k.key} label={k.label} value={k.value} hint={k.hint} icon={k.icon} tone={k.tone} onClick={() => navigate(k.to)} />
          ))}
        </div>
      )}

      {/* main grid: sinistra fluida + rail 336px */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_336px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {monthly.length > 0 && <MonthlyChart data={monthly} />}

          <PerStatusChart
            byStatus={stats.by_status}
            standardCount={stats.standard_count ?? 0}
            dieCount={stats.die_count ?? 0}
            onSelect={(s) => navigate(`/quotes/active?status=${s}`)}
          />

          {canReview && (
            <QuoteTable
              title="Da revisionare"
              rows={toReview}
              emptyText="Niente da revisionare"
              onClick={(id) => navigate(`/quotes/${id}`)}
            />
          )}

          {canQuote && (
            <QuoteTable
              title="I miei preventivi"
              rows={myRecent}
              emptyText="Nessun preventivo in lavorazione"
              onClick={(id) => navigate(`/quotes/${id}`)}
            />
          )}
        </div>

        {/* rail destra */}
        <div className="space-y-5 min-w-0">
          <ActivityCard
            items={activity}
            onClick={(quoteId) => navigate(`/quotes/${quoteId}`)}
            onSeeAll={() => navigate('/activity')}
          />

          {canTools && (
            <RailCard title="Utensili sotto scorta" icon={Wrench} onSeeAll={() => navigate('/orders/tools')}
              empty={!toolPreview || toolPreview.total_tools === 0} emptyText="Tutto sopra scorta">
              {(toolPreview?.groups.flatMap(g => g.items) ?? []).slice(0, 6).map(t => (
                <button key={t.tool_id} onClick={() => navigate('/orders/tools')}
                  className="w-full flex items-center justify-between gap-3 py-2 border-b border-border last:border-0 text-left hover:bg-card-muted -mx-2 px-2 rounded transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate font-mono">{t.code}</div>
                    <div className="text-xs text-muted-foreground truncate">{[t.tool_type, t.brand].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-mono font-semibold text-danger">{t.quantity}</span>
                    <span className="text-xs text-muted-foreground font-mono"> / {t.minimum_quantity}</span>
                  </div>
                </button>
              ))}
            </RailCard>
          )}

          {(canReview || canOrderMaterials) && (
            <RailCard title="Ordini materiale da fare" icon={Package} onSeeAll={() => navigate('/orders/materials')}
              empty={awaitingMaterials.length === 0} emptyText="Nessun materiale da ordinare">
              {awaitingMaterials.slice(0, 6).map(q => (
                <button key={q.id} onClick={() => navigate(`/quotes/${q.id}`)}
                  className="w-full flex items-center justify-between gap-3 py-2 border-b border-border last:border-0 text-left hover:bg-card-muted -mx-2 px-2 rounded transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate font-mono">{q.quote_number}</div>
                    <div className="text-xs text-muted-foreground truncate">{q.customer_name || '—'}</div>
                  </div>
                  <MaterialStatusBadge status="non_ordinato" />
                </button>
              ))}
            </RailCard>
          )}
        </div>
      </div>
    </StandardPage>
  )
}

// ─── Tabella preventivi (N° · cliente · stato · tipo · €) ─────────────────────
function QuoteTable({ title, rows, emptyText, onClick }: {
  title: string; rows: DashboardQuoteRow[]; emptyText: string; onClick: (id: number) => void
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[15px] font-semibold">{title}</div>
          <span className="text-[11px] text-muted-foreground font-mono">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(q => (
              <button key={q.id} onClick={() => onClick(q.id)}
                className="w-full grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[132px_minmax(0,1fr)_auto_72px_96px] items-center gap-3 py-2.5 text-left hover:bg-card-muted -mx-2 px-2 rounded transition-colors">
                <span className="text-sm font-mono font-medium truncate">{q.quote_number}</span>
                <span className="text-sm text-muted-foreground truncate hidden sm:block">{q.customer_name || '—'}</span>
                <StatusBadge status={q.status} />
                <span className="text-xs text-muted-foreground hidden sm:block">{q.quote_type === 'die' ? 'Stampo' : 'Standard'}</span>
                <span className="text-sm font-mono text-right hidden sm:block">{eur(q.total_price)}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Card generica del rail destro ────────────────────────────────────────────
function RailCard({ title, icon: Icon, onSeeAll, empty, emptyText, children }: {
  title: string; icon: LucideIcon; onSeeAll?: () => void; empty: boolean; emptyText: string; children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <span className="text-[15px] font-semibold">{title}</span>
          </div>
          {onSeeAll && (
            <button onClick={onSeeAll} className="text-xs text-primary hover:underline">Vedi tutti</button>
          )}
        </div>
        {empty ? (
          <div className="py-5 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : children}
      </CardContent>
    </Card>
  )
}
