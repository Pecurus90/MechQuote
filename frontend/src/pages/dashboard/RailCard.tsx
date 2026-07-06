// src/pages/dashboard/RailCard.tsx
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MaterialStatusBadge, type MaterialStatus } from '@/components/dashboard/StatusBadges'

/* ---------------------------------------------------------------------------
 * RailCard — guscio card del rail destro
 * ------------------------------------------------------------------------- */
interface RailCardProps {
  title: string
  icon: LucideIcon
  iconClass?: string
  count?: number
  actionLabel?: string
  onAction?: () => void
  empty: boolean
  emptyText: string
  children: ReactNode
}

export function RailCard({
  title,
  icon: Icon,
  iconClass = 'text-primary',
  count,
  actionLabel,
  onAction,
  empty,
  emptyText,
  children,
}: RailCardProps) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="flex items-center justify-between px-5 pb-3 pt-[15px]">
        <div className="flex items-center gap-2.5">
          <Icon className={cn('h-[17px] w-[17px]', iconClass)} />
          <span className="text-[15px] font-semibold text-foreground">{title}</span>
          {count != null && (
            <span className="rounded-full bg-danger/15 px-[7px] py-px text-[11px] font-bold text-danger">
              {count}
            </span>
          )}
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-[12.5px] font-semibold text-primary"
          >
            {actionLabel}
          </button>
        )}
      </div>
      {empty ? (
        <div className="border-t border-border px-5 py-8 text-center text-[13px] text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        children
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * ToolLowStockRow — riga utensile sotto scorta
 * ------------------------------------------------------------------------- */
interface ToolLowStockRowProps {
  name: string
  brand?: string | null
  quantity: number
  minimum: number
  onClick?: () => void
}

export function ToolLowStockRow({
  name,
  brand,
  quantity,
  minimum,
  onClick,
}: ToolLowStockRowProps) {
  const critical = quantity < minimum * 0.4
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-2.5 border-t border-border px-5 py-[11px] transition-colors hover:bg-muted/55',
        onClick && 'cursor-pointer',
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{name}</div>
        {brand && <div className="text-[11.5px] text-muted-foreground">{brand}</div>}
      </div>
      <div className="flex-none text-right">
        <div
          className={cn(
            'font-mono text-[13px] font-semibold',
            critical ? 'text-danger' : 'text-warning',
          )}
        >
          {quantity}
        </div>
        <div className="text-[11px] text-muted-foreground">min {minimum}</div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * MaterialTodoRow — riga ordine materiale da fare
 * ------------------------------------------------------------------------- */
interface MaterialTodoRowProps {
  description: string
  quoteNumber: string
  supplier: string
  status: MaterialStatus
  onClick?: () => void
}

export function MaterialTodoRow({
  description,
  quoteNumber,
  supplier,
  status,
  onClick,
}: MaterialTodoRowProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-2.5 border-t border-border px-5 py-[11px] transition-colors hover:bg-muted/55',
        onClick && 'cursor-pointer',
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{description}</div>
        <div className="text-[11.5px] text-muted-foreground">
          {/* Evita il numero ripetuto quando la description è già il numero
              (preventivo senza cliente indicato). */}
          {quoteNumber !== description && <span className="font-mono">{quoteNumber}</span>}
          {quoteNumber !== description && supplier ? <> · </> : null}
          {supplier || null}
        </div>
      </div>
      <div className="flex-none">
        <MaterialStatusBadge status={status} />
      </div>
    </div>
  )
}
