// src/pages/statistics/StatisticsView.tsx
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { LineChart, FileText, Package, Drill, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KpiTone } from '@/components/dashboard/KpiCard'

export type StatTab = 'quotes' | 'materials' | 'tools'
export type StatPeriod = 'current_year' | 'last_12m' | 'last_year' | 'all'

/** KPI descriptor shared by all three tab views (reuses the dashboard KpiCard look). */
export interface StatKpi {
  key: string
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  tone: KpiTone
}

const TABS: { key: StatTab; label: string; icon: LucideIcon }[] = [
  { key: 'quotes', label: 'Preventivi', icon: FileText },
  { key: 'materials', label: 'Materiali', icon: Package },
  { key: 'tools', label: 'Utensili', icon: Drill },
]

const PERIODS: { value: StatPeriod; label: string }[] = [
  { value: 'current_year', label: 'Anno corrente' },
  { value: 'last_12m', label: 'Ultimi 12 mesi' },
  { value: 'last_year', label: 'Anno scorso' },
  { value: 'all', label: 'Tutto' },
]

interface Props {
  subtitle?: string
  activeTab: StatTab
  onTabChange: (tab: StatTab) => void
  period: StatPeriod
  onPeriodChange: (period: StatPeriod) => void
  children: ReactNode
}

/**
 * Statistics page shell: StandardPage header + period select + segmented tab bar.
 * The active tab's content is passed as `children` (presentational — no data here).
 */
export function StatisticsView({
  subtitle = 'Andamento preventivi, materiali e utensili · dati aggregati',
  activeTab,
  onTabChange,
  period,
  onPeriodChange,
  children,
}: Props) {
  return (
    <div>
      {/* StandardPage header + period */}
      <div className="mb-[22px] flex items-center gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-primary/[0.13] text-primary">
          <LineChart className="h-[23px] w-[23px]" />
        </div>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Statistiche</h1>
          <p className="text-[13.5px] text-muted-foreground">{subtitle}</p>
        </div>
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
      </div>

      {/* Segmented tab bar */}
      <div className="mb-[22px] inline-flex gap-[3px] rounded-[10px] bg-muted p-[3px]">
        {TABS.map((t) => {
          const active = activeTab === t.key
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              className={cn(
                'flex h-[34px] items-center gap-[7px] rounded-[7px] px-[17px] text-[13px] font-semibold transition-colors',
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

      {children}
    </div>
  )
}
