// src/components/quotes/StatusStepper.tsx
import type { LucideIcon } from 'lucide-react'
import { Check, Send, MailOpen, Hourglass, CheckCheck, PackageCheck, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Nodi della linea "vinta" + il terminale "perso" (non ordinato), gestito a parte.
type StepKey =
  | 'bozza' | 'in_revisione' | 'inviato' | 'letto' | 'in_attesa_cliente'
  | 'confermato' | 'completo' | 'non_ordinato'

interface Props {
  current: StepKey
  dates?: Partial<Record<StepKey, string>>
  // TD-16: se true (o current='in_revisione'), il primo nodo mostra "In
  // revisione" invece di "Bozza" per tutto il ciclo della revisione.
  isRevision?: boolean
}

// Percorso principale (esito positivo): 6 nodi.
const HAPPY: { key: StepKey; label: string; icon: LucideIcon }[] = [
  { key: 'bozza', label: 'Bozza', icon: Check },
  { key: 'inviato', label: 'Inviato', icon: Send },
  { key: 'letto', label: 'Letto', icon: MailOpen },
  { key: 'in_attesa_cliente', label: 'Attesa cliente', icon: Hourglass },
  { key: 'confermato', label: 'Confermato', icon: CheckCheck },
  { key: 'completo', label: 'Completo', icon: PackageCheck },
]

// Nodo terminale "Non ordinato" (perso): rimpiazza confermato/completo quando
// il cliente non ha ordinato. La linea che lo precede arriva fino ad "attesa".
const LOST_NODE: { key: StepKey; label: string; icon: LucideIcon } = {
  key: 'non_ordinato', label: 'Non ordinato', icon: XCircle,
}

// Classi statiche per stato (Tailwind JIT deve poterle leggere).
const NODE_REACHED: Record<StepKey, string> = {
  bozza: 'bg-state-bozza text-white',
  in_revisione: 'bg-state-revisione text-white',
  inviato: 'bg-state-inviato text-white',
  letto: 'bg-state-letto text-white',
  in_attesa_cliente: 'bg-state-attesa text-white',
  confermato: 'bg-state-confermato text-white',
  completo: 'bg-state-completo text-white',
  non_ordinato: 'bg-state-perso text-white',
}
const RING_CURRENT: Record<StepKey, string> = {
  bozza: 'ring-4 ring-state-bozza/20',
  in_revisione: 'ring-4 ring-state-revisione/20',
  inviato: 'ring-4 ring-state-inviato/20',
  letto: 'ring-4 ring-state-letto/20',
  in_attesa_cliente: 'ring-4 ring-state-attesa/20',
  confermato: 'ring-4 ring-state-confermato/20',
  completo: 'ring-4 ring-state-completo/20',
  non_ordinato: 'ring-4 ring-state-perso/20',
}
const LABEL_CURRENT: Record<StepKey, string> = {
  bozza: 'text-state-bozza',
  in_revisione: 'text-state-revisione',
  inviato: 'text-state-inviato',
  letto: 'text-state-letto',
  in_attesa_cliente: 'text-state-attesa',
  confermato: 'text-state-confermato',
  completo: 'text-state-completo',
  non_ordinato: 'text-state-perso',
}
const CONNECTOR_COLOR: Record<StepKey, string> = {
  bozza: 'bg-state-bozza',
  in_revisione: 'bg-state-revisione',
  inviato: 'bg-state-inviato',
  letto: 'bg-state-letto',
  in_attesa_cliente: 'bg-state-attesa',
  confermato: 'bg-state-confermato',
  completo: 'bg-state-completo',
  non_ordinato: 'bg-state-perso',
}

export function StatusStepper({ current, dates, isRevision }: Props) {
  // TD-16: 'in_revisione' occupa lo slot iniziale (come bozza); se è una
  // revisione l'etichetta del primo nodo diventa "In revisione".
  const rev = isRevision || current === 'in_revisione'
  const happy = rev
    ? [{ key: 'in_revisione' as StepKey, label: 'In revisione', icon: HAPPY[0].icon }, ...HAPPY.slice(1)]
    : HAPPY
  // Percorso "perso": bozza→inviato→letto→attesa (tutti raggiunti) + terminale rosso.
  const lost = current === 'non_ordinato'
  const steps = lost ? [...happy.slice(0, 4), LOST_NODE] : happy
  const currentIdx = lost ? steps.length - 1 : steps.findIndex((s) => s.key === current)

  return (
    <div className="flex items-start">
      {steps.map((step, idx) => {
        const Icon = step.icon
        const isReached = idx < currentIdx
        const isCurrent = idx === currentIdx
        const next = steps[idx + 1]
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
                  'mt-2 whitespace-nowrap text-xs',
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
                  connectorReached
                    ? (lost && idx === steps.length - 2 ? CONNECTOR_COLOR['non_ordinato'] : CONNECTOR_COLOR[next.key])
                    : 'bg-border',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
