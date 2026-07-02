// Badge/pill di stato — design system (handoff). Riusabile ovunque compaia
// lo stato di un preventivo (5 stati) o lo stato materiale (4). Fondo tenue
// (/15) + testo pieno del colore-stato + pallino bg-current.
import { STATUS_LABELS } from '@/lib/constants'

export const QUOTE_STATE_CLASS: Record<string, string> = {
  bozza:      'bg-state-bozza/15 text-state-bozza',
  inviato:    'bg-state-inviato/15 text-state-inviato',
  letto:      'bg-state-letto/15 text-state-letto',
  confermato: 'bg-state-confermato/15 text-state-confermato',
  completo:   'bg-state-completo/15 text-state-completo',
}

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const cls = QUOTE_STATE_CLASS[status] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// Chip stato con conteggio (dashboard "Preventivi per stato").
export function StatusChip({ status, count, onClick }: { status: string; count: number; onClick?: () => void }) {
  const cls = QUOTE_STATE_CLASS[status] ?? 'bg-muted text-muted-foreground'
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${cls}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {STATUS_LABELS[status] ?? status}
      <span className="font-mono font-semibold">{count}</span>
    </button>
  )
}

// Stato materiale (ordini, spec 18): 4 stati semantici.
const MATERIAL_STATE: Record<string, { cls: string; label: string }> = {
  non_necessario:   { cls: 'bg-muted text-muted-foreground', label: 'Non necessario' },
  non_ordinato:     { cls: 'bg-danger/15 text-danger',       label: 'Non ordinato' },
  parziale:         { cls: 'bg-warning/15 text-warning',     label: 'Parziale' },
  totalmente_evaso: { cls: 'bg-success/15 text-success',     label: 'Evaso' },
}

export function MaterialStatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const m = MATERIAL_STATE[status] ?? { cls: 'bg-muted text-muted-foreground', label: status }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {m.label}
    </span>
  )
}
