// src/components/quotes/QuotesDataTable.tsx
import { FileText, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuoteListItem } from '@/types'
import { StatusBadge, type QuoteStatus } from '@/components/dashboard/StatusBadges'
import { TypeBadge, type QuoteType } from '@/components/quotes/TypeBadge'

interface Props {
  rows: QuoteListItem[]
  onOpen: (id: number) => void
  onMenu?: (id: number) => void
  emptyText?: string
}

const GRID = 'grid grid-cols-[150px_1.4fr_120px_130px_100px_120px_70px] items-center gap-3'

// Tabella piena = importi con 2 decimali (it-IT).
const eur2 = (v: number) =>
  '€ ' +
  Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dateShort = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
    : '—'

function toQuoteType(t?: string | null): QuoteType {
  return t === 'die' ? 'die' : t === 'commessa' ? 'commessa' : 'single'
}

// QuoteListItem non ha un total_price piatto: si somma dalle parti.
function rowTotal(r: QuoteListItem): number {
  return (r.parts ?? []).reduce((s, p) => s + (p.total_price ?? 0), 0)
}

export function QuotesDataTable({ rows, onOpen, onMenu, emptyText = 'Nessun preventivo.' }: Props) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card">
      {/* Header */}
      <div
        className={cn(
          GRID,
          'border-b border-border bg-card-muted px-[18px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground',
        )}
      >
        <div>Numero</div>
        <div>Cliente</div>
        <div>Stato</div>
        <div>Tipo</div>
        <div>Data</div>
        <div className="text-right">Valore</div>
        <div />
      </div>

      {rows.length === 0 ? (
        <div className="px-[18px] py-12 text-center text-[13px] text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        rows.map((r) => (
          <div
            key={r.id}
            onClick={() => onOpen(r.id)}
            className={cn(
              GRID,
              'cursor-pointer border-b border-border px-[18px] py-[13px] text-sm transition-colors last:border-b-0 hover:bg-muted/50',
            )}
          >
            <div className="truncate font-mono text-[13px] font-semibold">{r.quote_number}</div>
            <div className="min-w-0 truncate font-medium">{r.customer_name ?? '—'}</div>
            <div>
              <StatusBadge status={r.status as QuoteStatus} />
            </div>
            <div>
              <TypeBadge type={toQuoteType(r.quote_type)} />
            </div>
            <div className="font-mono text-[13px] text-muted-foreground">
              {dateShort(r.quote_date)}
            </div>
            <div className="text-right font-mono font-semibold">{eur2(rowTotal(r))}</div>
            <div
              className="flex justify-end gap-1.5 text-muted-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <FileText
                className="h-4 w-4 cursor-pointer transition-colors hover:text-foreground"
                onClick={() => onOpen(r.id)}
              />
              <MoreHorizontal
                className="h-4 w-4 cursor-pointer transition-colors hover:text-foreground"
                onClick={() => onMenu?.(r.id)}
              />
            </div>
          </div>
        ))
      )}
    </div>
  )
}
