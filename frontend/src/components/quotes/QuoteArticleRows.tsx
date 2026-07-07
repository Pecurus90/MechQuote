// src/components/quotes/QuoteArticleRows.tsx
// Righe articolo-materiale (dettaglio riga preventivo espansa). Presentazionale:
// il container mappa il tipo reale ArticleMaterialRow di @/types + lo stato
// per-parte reale (6 valori, via PART_STATE_LABELS/COLORS) su questa shape.
import { cn } from '@/lib/utils'

export interface ArticleMaterialRow {
  partId: number
  partCode: string
  revision?: string | null
  materialCode: string
  materialFamily?: string | null
  /** Dimensioni già formattate (es. "84×64×28", "Ø42 × 60"). */
  dimensions: string
  /** Trattamenti termici della parte (nomi). */
  treatments?: string[] | null
  /** Stato materiale della singola parte, già formattato dal container. */
  statusLabel: string
  statusClass: string
  supplierName?: string | null
}

interface Props {
  rows: ArticleMaterialRow[]
  emptyText?: string
}

const GRID = 'grid grid-cols-[110px_minmax(0,1.1fr)_minmax(0,1.55fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3'

export function QuoteArticleRows({ rows, emptyText = 'Nessun articolo in questo preventivo.' }: Props) {
  return (
    <div className="overflow-hidden rounded-[11px] border border-border bg-card">
      <div
        className={cn(
          GRID,
          'border-b border-border bg-card-muted px-4 py-[10px] text-[11px] font-semibold uppercase tracking-[0.03em] text-muted-foreground',
        )}
      >
        <div>Parte</div>
        <div>Materiale</div>
        <div>Dimensioni</div>
        <div>Trattamenti</div>
        <div>Stato materiale · fornitore</div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-4 text-center text-[13px] text-muted-foreground">{emptyText}</div>
      ) : (
        rows.map((r, i) => (
          <div
            key={r.partId}
            className={cn(
              GRID,
              'items-center px-4 py-[13px] text-[13px]',
              i < rows.length - 1 && 'border-b border-border',
            )}
          >
            {/* Codice articolo in evidenza + revisione sotto */}
            <div className="min-w-0">
              <div className="font-mono text-[13.5px] font-semibold text-foreground">{r.partCode}</div>
              {r.revision && (
                <div className="font-mono text-[11px] text-muted-foreground">rev {r.revision}</div>
              )}
            </div>
            {/* Materiale: codice a piena leggibilità (no troncamento) + famiglia sotto */}
            <div className="min-w-0">
              <div className="break-words font-mono font-medium text-foreground">{r.materialCode}</div>
              {r.materialFamily && (
                <div className="text-[11.5px] text-muted-foreground">{r.materialFamily}</div>
              )}
            </div>
            <div className="whitespace-nowrap font-mono text-foreground">{r.dimensions}</div>
            <div className="text-foreground/80">
              {r.treatments && r.treatments.length ? r.treatments.join(', ') : <span className="text-muted-foreground">—</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium', r.statusClass)}>
                {r.statusLabel}
              </span>
              <span className="text-[11.5px] text-muted-foreground">{r.supplierName ?? '—'}</span>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
