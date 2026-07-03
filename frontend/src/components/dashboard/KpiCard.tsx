// src/components/dashboard/KpiCard.tsx
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type KpiTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'confirmed'

interface Props {
  label: string
  value: string | number
  hint?: string
  trend?: { text: string; dir: 'up' | 'down'; tone: 'success' | 'danger' }
  icon: LucideIcon
  tone: KpiTone
  onClick?: () => void
}

const accentBar: Record<KpiTone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  confirmed: 'bg-confirmed',
}

const iconColor: Record<KpiTone, string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  confirmed: 'text-confirmed',
}

export function KpiCard({ label, value, hint, trend, icon: Icon, tone, onClick }: Props) {
  const TrendIcon = trend?.dir === 'down' ? TrendingDown : TrendingUp
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-[13px] border border-border bg-card px-4 py-4',
        onClick && 'cursor-pointer transition-colors hover:bg-muted/40',
      )}
    >
      <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', accentBar[tone])} />
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn('h-4 w-4', iconColor[tone])} />
      </div>
      <div className="font-mono text-[28px] font-bold leading-none tracking-tight text-foreground">
        {value}
      </div>
      {trend ? (
        <div
          className={cn(
            'mt-1.5 flex items-center gap-1 text-[11px] font-semibold',
            trend.tone === 'danger' ? 'text-danger' : 'text-success',
          )}
        >
          <TrendIcon className="h-3 w-3" />
          {trend.text}
        </div>
      ) : hint ? (
        <div className="mt-1.5 text-[11px] font-medium text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  )
}
