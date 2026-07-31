// src/pages/statistics/StatisticsView.tsx
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { LineChart, Gauge, FileText, TrendingUp, ShoppingCart, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KpiTone, KpiDelta } from '@/components/dashboard/KpiCard'

export type StatTab = 'overview' | 'commerciale' | 'redditivita' | 'acquisti'
export type StatPeriod = 'current_year' | 'last_12m' | 'last_year' | 'all'
export type StatCompare = 'none' | 'prev' | 'yoy'

/** KPI descriptor shared by all tab views (reuses the dashboard KpiCard look). */
export interface StatKpi {
  key: string
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  tone: KpiTone
  /** colora il valore col tono (es. Guadagno reale in verde) */
  valueToned?: boolean
  /** pill di confronto MoM/YoY (popolata quando compare !== 'none') */
  delta?: KpiDelta
}

const TABS: { key: StatTab; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Panoramica', icon: Gauge },
  { key: 'commerciale', label: 'Commerciale', icon: FileText },
  { key: 'redditivita', label: 'Redditività', icon: TrendingUp },
  { key: 'acquisti', label: 'Acquisti', icon: ShoppingCart },
]

// Il confronto MoM/YoY ha senso solo dove c'è un andamento temporale
// confrontabile: Commerciale e Redditività. Su Panoramica/Acquisti si nasconde.
const COMPARE_TABS: StatTab[] = ['commerciale', 'redditivita']

const PERIODS: { value: StatPeriod; label: string }[] = [
  { value: 'current_year', label: 'Anno corrente' },
  { value: 'last_12m', label: 'Ultimi 12 mesi' },
  { value: 'last_year', label: 'Anno scorso' },
  { value: 'all', label: 'Tutto' },
]

const COMPARE: { value: StatCompare; label: string }[] = [
  { value: 'none', label: 'Nessuno' },
  { value: 'prev', label: 'Periodo prec.' },
  { value: 'yoy', label: 'Anno scorso' },
]

interface Props {
  subtitle?: string
  activeTab: StatTab
  onTabChange: (tab: StatTab) => void
  period: StatPeriod
  onPeriodChange: (period: StatPeriod) => void
  compare: StatCompare
  onCompareChange: (c: StatCompare) => void
  children: ReactNode
}

/**
 * Statistics page shell: StandardPage header (teal accent) + period select +
 * compare toggle + segmented tab bar. The active tab's content is passed as
 * `children` (presentational — no data here).
 */
export function StatisticsView({
  subtitle = 'Andamento commerciale, redditività e acquisti · dati aggregati',
  activeTab,
  onTabChange,
  period,
  onPeriodChange,
  compare,
  onCompareChange,
  children,
}: Props) {
  return (
    <div>
      {/* StandardPage header + period + compare */}
      <div className="mb-5 flex flex-wrap items-center gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-stats/[0.13] text-stats">
          <LineChart className="h-[23px] w-[23px]" />
        </div>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Statistiche</h1>
          <p className="text-[13.5px] text-muted-foreground">{subtitle}</p>
        </div>

        {/* Slot azioni */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-[184px] flex-none">
            <select
              value={period}
              onChange={(e) => onPeriodChange(e.target.value as StatPeriod)}
              className="h-[38px] w-full cursor-pointer appearance-none rounded-[9px] border border-input bg-background pl-[13px] pr-[34px] text-[13.5px] font-medium text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/[0.18]"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-[11px] h-[15px] w-[15px] text-muted-foreground" />
          </div>

          <div className={cn('flex items-center gap-2', !COMPARE_TABS.includes(activeTab) && 'hidden')}>
            <span className="text-[12.5px] text-muted-foreground">Confronta:</span>
            <div className="flex h-[38px] gap-[3px] rounded-[9px] bg-muted p-[3px]">
              {COMPARE.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => onCompareChange(c.value)}
                  className={cn(
                    'flex items-center rounded-[7px] px-3 text-[12.5px] font-semibold transition-colors',
                    compare === c.value
                      ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                      : 'text-muted-foreground',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Segmented tab bar */}
      <div className="mb-[22px] overflow-x-auto">
        <div className="inline-flex gap-[3px] rounded-[10px] bg-muted p-[3px]">
          {TABS.map((t) => {
            const active = activeTab === t.key
            const Icon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                className={cn(
                  'flex h-[34px] items-center gap-[7px] whitespace-nowrap rounded-[7px] px-[17px] text-[13px] font-semibold transition-colors',
                  active
                    ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                    : 'text-muted-foreground',
                )}
              >
                <Icon className="h-[15px] w-[15px]" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {children}
    </div>
  )
}
