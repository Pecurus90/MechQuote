// src/components/quotes/StatusStepper.tsx
import type { LucideIcon } from 'lucide-react'
import { Check, Send, MailOpen, CheckCheck, PackageCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type StepKey = 'bozza' | 'inviato' | 'letto' | 'confermato' | 'completo'

interface Props {
  current: StepKey
  dates?: Partial<Record<StepKey, string>>
}

const STEPS: { key: StepKey; label: string; icon: LucideIcon }[] = [
  { key: 'bozza', label: 'Bozza', icon: Check },
  { key: 'inviato', label: 'Inviato', icon: Send },
  { key: 'letto', label: 'Letto', icon: MailOpen },
  { key: 'confermato', label: 'Confermato', icon: CheckCheck },
  { key: 'completo', label: 'Completo', icon: PackageCheck },
]

// Classi statiche per stato (Tailwind JIT deve poterle leggere).
const NODE_REACHED: Record<StepKey, string> = {
  bozza: 'bg-state-bozza text-white',
  inviato: 'bg-state-inviato text-white',
  letto: 'bg-state-letto text-white',
  confermato: 'bg-state-confermato text-white',
  completo: 'bg-state-completo text-white',
}
const RING_CURRENT: Record<StepKey, string> = {
  bozza: 'ring-4 ring-state-bozza/20',
  inviato: 'ring-4 ring-state-inviato/20',
  letto: 'ring-4 ring-state-letto/20',
  confermato: 'ring-4 ring-state-confermato/20',
  completo: 'ring-4 ring-state-completo/20',
}
const LABEL_CURRENT: Record<StepKey, string> = {
  bozza: 'text-state-bozza',
  inviato: 'text-state-inviato',
  letto: 'text-state-letto',
  confermato: 'text-state-confermato',
  completo: 'text-state-completo',
}
const CONNECTOR_COLOR: Record<StepKey, string> = {
  bozza: 'bg-state-bozza',
  inviato: 'bg-state-inviato',
  letto: 'bg-state-letto',
  confermato: 'bg-state-confermato',
  completo: 'bg-state-completo',
}

export function StatusStepper({ current, dates }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === current)

  return (
    <div className="flex items-start">
      {STEPS.map((step, idx) => {
        const Icon = step.icon
        const isReached = idx < currentIdx
        const isCurrent = idx === currentIdx
        const next = STEPS[idx + 1]
        // Il connettore che segue è colorato se il prossimo nodo è già raggiunto/corrente.
        const connectorReached = idx < currentIdx
        return (
          <div key={step.key} className="flex flex-1 items-start">
            <div className="flex flex-1 flex-col items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full',
                  isReached || isCurrent
                    ? NODE_REACHED[step.key]
                    : 'border-[1.5px] border-border bg-muted text-muted-foreground',
                  isCurrent && RING_CURRENT[step.key],
                )}
              >
                <Icon className="h-[15px] w-[15px]" />
              </div>
              <div
                className={cn(
                  'mt-2 text-xs',
                  isCurrent
                    ? cn('font-bold', LABEL_CURRENT[step.key])
                    : isReached
                      ? 'font-semibold text-foreground'
                      : 'font-medium text-muted-foreground',
                )}
              >
                {step.label}
              </div>
              {dates?.[step.key] && (
                <div className="font-mono text-[11px] text-muted-foreground">
                  {dates[step.key]}
                </div>
              )}
            </div>
            {next && (
              <div
                className={cn(
                  'mt-[15px] h-0.5 flex-1',
                  connectorReached ? CONNECTOR_COLOR[next.key] : 'bg-border',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
