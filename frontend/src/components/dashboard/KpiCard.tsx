// src/components/dashboard/KpiCard.tsx
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type KpiTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'confirmed'

/**
 * Pill di confronto MoM/YoY (handoff Statistiche v2). `dir` = direzione del
 * valore (freccia); `good` = se il cambiamento è un miglioramento (colore
 * verde) o un peggioramento (rosso). Colore ≠ segno: es. "Scostamento prezzo"
 * che scende è male (rosso) pur essendo un −X%.
 */
export interface KpiDelta {
  value: string
  dir: 'up' | 'down'
  good: boolean
  vs?: string
}

interface Props {
  label: string
  value: string | number
  hint?: string
  trend?: { text: string; dir: 'up' | 'down'; tone: 'success' | 'danger' }
  delta?: KpiDelta
  icon: LucideIcon
  tone: KpiTone
  /** colora il valore col tono (es. Guadagno reale in verde) */
  valueToned?: boolean
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

function DeltaPill({ delta }: { delta: KpiDelta }) {
  const Arrow = delta.dir === 'down' ? ArrowDownRight : ArrowUpRight
  return (
    <span className="inline-flex items-center gap-[3px]">
      <span
        className={cn(
          'inline-flex items-center gap-[2px] rounded-full px-[7px] py-[2px] font-mono text-[11px] font-semibold',
          delta.good ? 'bg-success/[0.12] text-success' : 'bg-danger/[0.12] text-danger',
        )}
      >
        <Arrow className="h-[11px] w-[11px]" />
        {delta.value}
      </span>
      {delta.vs ? <span className="text-[11px] font-medium text-muted-foreground">{delta.vs}</span> : null}
    </span>
  )
}

export function KpiCard({ label, value, hint, trend, delta, icon: Icon, tone, valueToned, onClick }: Props) {
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
      <div
        className={cn(
          'font-mono text-[28px] font-bold leading-none tracking-tight',
          valueToned ? iconColor[tone] : 'text-foreground',
        )}
      >
        {value}
      </div>
      {delta ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {hint ? <span className="text-[11px] font-medium text-muted-foreground">{hint}</span> : null}
          <DeltaPill delta={delta} />
        </div>
      ) : trend ? (
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
