// src/components/dashboard/StatusBadges.tsx
import { cn } from '@/lib/utils'

/* ---------------------------------------------------------------------------
 * StatusBadge — pill stato preventivo (5 stati)
 * ------------------------------------------------------------------------- */
export type QuoteStatus =
  | 'bozza' | 'in_revisione' | 'inviato' | 'letto' | 'in_attesa_cliente'
  | 'confermato' | 'completo' | 'non_ordinato'

const STATUS_LABEL: Record<QuoteStatus, string> = {
  bozza: 'Bozza',
  in_revisione: 'In revisione',
  inviato: 'Inviato',
  letto: 'Letto',
  in_attesa_cliente: 'Attesa cliente',
  confermato: 'Confermato',
  completo: 'Completo',
  non_ordinato: 'Non ordinato',
}

const STATUS_CLASS: Record<QuoteStatus, string> = {
  bozza: 'bg-state-bozza/15 text-state-bozza',
  in_revisione: 'bg-state-revisione/15 text-state-revisione',
  inviato: 'bg-state-inviato/15 text-state-inviato',
  letto: 'bg-state-letto/15 text-state-letto',
  in_attesa_cliente: 'bg-state-attesa/15 text-state-attesa',
  confermato: 'bg-state-confermato/15 text-state-confermato',
  completo: 'bg-state-completo/15 text-state-completo',
  non_ordinato: 'bg-state-perso/15 text-state-perso',
}

export function StatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-semibold',
        STATUS_CLASS[status],
      )}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * MaterialStatusBadge — stato materiale ordine (4 stati)
 * ------------------------------------------------------------------------- */
export type MaterialStatus =
  | 'non_necessario'
  | 'non_ordinato'
  | 'parziale'
  | 'totalmente_evaso'

const MATERIAL_LABEL: Record<MaterialStatus, string> = {
  non_necessario: 'Non necessario',
  non_ordinato: 'Non ordinato',
  parziale: 'Parziale',
  totalmente_evaso: 'Evaso',
}

const MATERIAL_CLASS: Record<MaterialStatus, string> = {
  non_necessario: 'bg-muted text-muted-foreground',
  non_ordinato: 'bg-danger/15 text-danger',
  parziale: 'bg-warning/15 text-warning',
  totalmente_evaso: 'bg-success/15 text-success',
}

export function MaterialStatusBadge({ status }: { status: MaterialStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-semibold',
        MATERIAL_CLASS[status],
      )}
    >
      {status !== 'non_necessario' && <span className="h-[5px] w-[5px] rounded-full bg-current" />}
      {MATERIAL_LABEL[status]}
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * StatusChip — chip cliccabile stato + conteggio ("Preventivi per stato")
 * ------------------------------------------------------------------------- */
const CHIP_CLASS: Record<string, string> = {
  bozza: 'bg-state-bozza/15 text-state-bozza',
  in_revisione: 'bg-state-revisione/15 text-state-revisione',
  inviato: 'bg-state-inviato/15 text-state-inviato',
  letto: 'bg-state-letto/15 text-state-letto',
  in_attesa_cliente: 'bg-state-attesa/15 text-state-attesa',
  confermato: 'bg-state-confermato/15 text-state-confermato',
  completo: 'bg-state-completo/15 text-state-completo',
  non_ordinato: 'bg-state-perso/15 text-state-perso',
}

const CHIP_LABEL: Record<string, string> = {
  bozza: 'Bozza',
  in_revisione: 'In revisione',
  inviato: 'Inviato',
  letto: 'Letto',
  in_attesa_cliente: 'Attesa cliente',
  confermato: 'Confermato',
  completo: 'Completo',
  non_ordinato: 'Non ordinato',
}

export function StatusChip({
  status,
  count,
  onClick,
}: {
  status: string
  count: number
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-2.5 py-[5px] text-[12.5px] font-semibold transition-[filter] hover:brightness-105',
        CHIP_CLASS[status] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {CHIP_LABEL[status] ?? status}
      <span className="font-mono">{count}</span>
    </button>
  )
}
