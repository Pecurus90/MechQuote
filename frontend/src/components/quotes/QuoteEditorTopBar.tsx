// src/components/quotes/QuoteEditorTopBar.tsx
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusStepper } from '@/components/quotes/StatusStepper'
import { TypeBadge, type QuoteType } from '@/components/quotes/TypeBadge'
import type { QuoteStatus } from '@/components/dashboard/StatusBadges'

export type ActionVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'confirm' | 'muted'

export interface EditorAction {
  key: string
  label: string
  icon: LucideIcon
  variant: ActionVariant
  onClick: () => void
  show?: boolean
  disabled?: boolean
}

interface Props {
  quoteNumber: string
  customerName: string
  type: QuoteType
  status: QuoteStatus
  stepDates?: Partial<Record<QuoteStatus, string>>
  actions: EditorAction[]
  locked: boolean
  lockedText?: string
  // TD-16: primo nodo dello stepper "In revisione" invece di "Bozza".
  isRevision?: boolean
  onBack?: () => void
  /** AUD-34: quando true (es. salvataggio/transizione in corso) disabilita
   *  tutte le azioni di workflow, così non si ri-entra in doStatus/doSubmit. */
  busy?: boolean
}

const ACTION_CLASS: Record<ActionVariant, string> = {
  primary: 'border-transparent bg-primary text-primary-foreground',
  secondary: 'border-border bg-card text-foreground',
  ghost: 'border-border bg-card text-muted-foreground',
  destructive: 'border-transparent bg-danger text-white',
  confirm: 'border-transparent bg-state-confermato text-white',
  muted: 'border-border bg-muted text-muted-foreground',
}

export function QuoteEditorTopBar(props: Props) {
  const {
    quoteNumber,
    customerName,
    type,
    status,
    stepDates,
    actions,
    locked,
    lockedText = 'Preventivo non più modificabile.',
    isRevision = false,
    onBack,
    busy = false,
  } = props

  const visibleActions = actions.filter((a) => a.show !== false)

  return (
    <div className="flex-none border-b border-border bg-card">
      {locked && (
        <div className="flex items-center gap-2.5 border-b border-warning/30 bg-warning/[0.12] px-[22px] py-2.5 text-[13px] font-semibold text-warning">
          <Lock className="h-[15px] w-[15px]" />
          {lockedText}
        </div>
      )}

      {/* row 1: identity + actions */}
      <div className="flex items-center gap-3.5 px-[22px] py-[13px]">
        <button
          type="button"
          onClick={onBack}
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-[18px] w-[18px]" />
        </button>
        <span className="flex-none whitespace-nowrap font-mono text-base font-semibold tracking-[0.01em] text-foreground">
          {quoteNumber}
        </span>
        <span className="h-[22px] w-px flex-none bg-border" />
        <span className="flex-none whitespace-nowrap text-sm font-medium text-foreground">
          {customerName}
        </span>
        <TypeBadge type={type} />
        <span className="flex-1" />
        {visibleActions.map((a) => {
          const Icon = a.icon
          const isDisabled = busy || a.disabled
          return (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              disabled={isDisabled}
              className={cn(
                'inline-flex h-9 flex-none items-center gap-[7px] rounded-[9px] border px-[13px] text-[13px] font-semibold transition-[filter] hover:brightness-105',
                ACTION_CLASS[a.variant],
                isDisabled && 'cursor-not-allowed opacity-50 hover:brightness-100',
              )}
            >
              <Icon className="h-[15px] w-[15px]" />
              {a.label}
            </button>
          )
        })}
      </div>

      {/* row 2: stepper */}
      <div className="px-[90px] pb-[18px] pt-1.5">
        <div className="mx-auto max-w-[860px]">
          <StatusStepper current={status} dates={stepDates} isRevision={isRevision} />
        </div>
      </div>
    </div>
  )
}
