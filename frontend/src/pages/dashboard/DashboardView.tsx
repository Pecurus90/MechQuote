// src/pages/dashboard/DashboardView.tsx
import { LayoutDashboard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PackagePlus, FileSearch, UserRoundPen } from 'lucide-react'
import type { MonthlyData, DashboardQuoteRow } from '@/types'
import type { Notification } from '@/lib/useNotifications'
import { KpiCard, type KpiTone } from '@/components/dashboard/KpiCard'
import MonthlyChart from '@/pages/dashboard/MonthlyChart'
import PerStatusChart from '@/pages/dashboard/PerStatusChart'
import { ActivityTimeline } from '@/pages/dashboard/ActivityTimeline'
import { QuoteTable } from '@/pages/dashboard/QuoteTable'
import { RailCard, MaterialTodoRow } from '@/pages/dashboard/RailCard'
import type { MaterialStatus } from '@/components/dashboard/StatusBadges'

interface KpiSpec {
  key: string
  label: string
  value: string | number
  hint?: string
  trend?: { text: string; dir: 'up' | 'down'; tone: 'success' | 'danger' }
  icon: LucideIcon
  tone: KpiTone
  onClick?: () => void
}

interface DashboardViewProps {
  subtitle: string
  kpis: KpiSpec[]

  monthly: MonthlyData[]
  /** Mostra la serie Costo nel grafico mensile (permesso `statistics`). */
  showCost: boolean
  byStatus: Record<string, number>
  standardCount: number
  onSelectStatus: (status: string) => void

  toReview?: DashboardQuoteRow[]
  onSeeAllReview?: () => void
  myQuotes?: DashboardQuoteRow[]
  onSeeAllMine?: () => void
  onOpenQuote: (id: number) => void

  activity: Notification[]
  onOpenActivity: (quoteId: number) => void
  onSeeAllActivity?: () => void

  materials?: DashboardQuoteRow[]
  onOrderMaterials?: () => void
}

export function DashboardView(props: DashboardViewProps) {
  const {
    subtitle,
    kpis,
    monthly,
    showCost,
    byStatus,
    standardCount,
    onSelectStatus,
    toReview,
    onSeeAllReview,
    myQuotes,
    onSeeAllMine,
    onOpenQuote,
    activity,
    onOpenActivity,
    materials,
    onOrderMaterials,
  } = props

  const activityItems = activity.map((n) => {
    const quoteId = typeof n.data?.quote_id === 'number' ? (n.data.quote_id as number) : null
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      created_at: n.created_at,
      quoteId,
    }
  })

  return (
    <div className="px-6 pb-10 pt-[22px]">
      {/* Header pagina (StandardPage) */}
      <div className="mb-[22px] flex items-start gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-primary/[0.13] text-primary">
          <LayoutDashboard className="h-[23px] w-[23px]" />
        </div>
        <div className="flex-1">
          <h1 className="mb-[3px] text-[22px] font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-[13.5px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* KPI bar */}
      {kpis.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k) => (
            <KpiCard
              key={k.key}
              label={k.label}
              value={k.value}
              hint={k.hint}
              trend={k.trend}
              icon={k.icon}
              tone={k.tone}
              onClick={k.onClick}
            />
          ))}
        </div>
      )}

      {/* Corpo: colonna fluida + rail 336px */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_336px]">
        {/* Colonna sinistra */}
        <div className="flex min-w-0 flex-col gap-4">
          <MonthlyChart data={monthly} showCost={showCost} />
          <PerStatusChart
            byStatus={byStatus}
            standardCount={standardCount}
            onSelect={onSelectStatus}
          />
          {toReview && (
            <QuoteTable
              title="Preventivi da confermare"
              icon={FileSearch}
              iconClass="text-confirmed"
              showCount
              rows={toReview}
              emptyText="Nessun preventivo da confermare."
              onOpen={onOpenQuote}
              onSeeAll={onSeeAllReview}
            />
          )}
          {myQuotes && (
            <QuoteTable
              title="I miei preventivi"
              icon={UserRoundPen}
              iconClass="text-primary"
              rows={myQuotes}
              emptyText="Non hai preventivi aperti."
              onOpen={onOpenQuote}
              onSeeAll={onSeeAllMine}
            />
          )}
        </div>

        {/* Rail destro — TD-11: "Materiale da ordinare" in cima e alta
            (scroll interno), poi l'attività. Card utensili rimossa. */}
        <div className="flex flex-col gap-4">
          {materials && (
            <RailCard
              title="Materiale da ordinare"
              icon={PackagePlus}
              iconClass="text-danger"
              count={materials.length}
              actionLabel="Genera"
              onAction={onOrderMaterials}
              empty={materials.length === 0}
              emptyText="Nessun materiale da ordinare."
            >
              <div className="max-h-[560px] overflow-y-auto">
                {materials.map((m) => (
                  // Stato materiale REALE dal backend: può essere "parziale"
                  // (alcuni fornitori già ordinati) e non solo "non ordinato".
                  // Il fornitore non è unico per preventivo (più parti) → omesso.
                  // TD-11: le richieste manuali (kind='request') portano al pool
                  // ordini materiali, non a un preventivo.
                  <MaterialTodoRow
                    key={`${m.kind ?? 'quote'}-${m.id}`}
                    description={m.customer_name ?? m.quote_number}
                    quoteNumber={m.quote_number}
                    supplier=""
                    status={(m.material_status as MaterialStatus) ?? 'non_ordinato'}
                    onClick={() => (m.kind === 'request' ? onOrderMaterials?.() : onOpenQuote(m.id))}
                  />
                ))}
              </div>
            </RailCard>
          )}

          <ActivityTimeline items={activityItems} onOpen={onOpenActivity} />
        </div>
      </div>
    </div>
  )
}
