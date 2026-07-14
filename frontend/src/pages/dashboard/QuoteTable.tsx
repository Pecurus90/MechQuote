// src/pages/dashboard/QuoteTable.tsx
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DashboardQuoteRow } from '@/types'
import { StatusBadge, type QuoteStatus } from '@/components/dashboard/StatusBadges'

interface Props {
  title: string
  icon: LucideIcon
  iconClass?: string
  showCount?: boolean
  rows: DashboardQuoteRow[]
  emptyText: string
  onOpen: (id: number) => void
  onSeeAll?: () => void
}

const GRID = 'grid grid-cols-[132px_minmax(0,1fr)_116px_108px_96px] items-center gap-2.5'

const eur0 = (v: number) =>
  '€ ' +
  Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function typeLabel(t?: string | null): string {
  return t === 'commessa' ? 'Commessa' : 'Singolo'
}

export function QuoteTable({
  title,
  icon: Icon,
  iconClass = 'text-primary',
  showCount = false,
  rows,
  emptyText,
  onOpen,
  onSeeAll,
}: Props) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="flex items-center justify-between px-5 pb-3 pt-[15px]">
        <div className="flex items-center gap-2.5">
          <Icon className={cn('h-[17px] w-[17px]', iconClass)} />
          <span className="text-[15px] font-semibold text-foreground">{title}</span>
          {showCount && (
            <span className="rounded-full bg-confirmed/15 px-[7px] py-px text-[11px] font-bold text-confirmed">
              {rows.length}
            </span>
          )}
        </div>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-[12.5px] font-semibold text-primary"
          >
            Vedi tutti
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-border px-5 py-8 text-center text-[13px] text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        rows.map((r) => (
          <div
            key={r.id}
            onClick={() => onOpen(r.id)}
            className={cn(
              GRID,
              'cursor-pointer border-t border-border px-5 py-[11px] text-[13.5px] transition-colors hover:bg-muted/55',
            )}
          >
            <span className="truncate font-mono text-[12.5px] font-semibold">{r.quote_number}</span>
            <span className="min-w-0 truncate font-medium">{r.customer_name ?? '—'}</span>
            <span>
              <StatusBadge status={r.status as QuoteStatus} />
            </span>
            <span className="text-xs text-muted-foreground">{typeLabel(r.quote_type)}</span>
            <span className="text-right font-mono font-semibold">{eur0(r.total_price)}</span>
          </div>
        ))
      )}
    </div>
  )
}
