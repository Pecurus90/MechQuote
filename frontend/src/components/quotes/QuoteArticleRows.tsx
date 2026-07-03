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

const GRID = 'grid grid-cols-[110px_minmax(0,1.3fr)_130px_minmax(0,1fr)_minmax(0,1.2fr)] gap-3'

export function QuoteArticleRows({ rows, emptyText = 'Nessun articolo in questo preventivo.' }: Props) {
  return (
    <div className="overflow-hidden rounded-[11px] border border-border bg-card">
      <div
        className={cn(
          GRID,
          'border-b border-border bg-card-muted px-[15px] py-[9px] text-[10.5px] font-semibold uppercase tracking-[0.03em] text-muted-foreground',
        )}
      >
        <div>Parte</div>
        <div>Materiale</div>
        <div>Dimensioni</div>
        <div>Trattamenti</div>
        <div>Stato materiale · fornitore</div>
      </div>

      {rows.length === 0 ? (
        <div className="px-[15px] py-4 text-center text-[12px] text-muted-foreground">{emptyText}</div>
      ) : (
        rows.map((r, i) => (
          <div
            key={r.partId}
            className={cn(
              GRID,
              'items-center px-[15px] py-[11px] text-[12.5px]',
              i < rows.length - 1 && 'border-b border-border',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-semibold text-foreground">{r.partCode}</span>
              {r.revision && (
                <span className="font-mono text-[10.5px] text-muted-foreground">rev {r.revision}</span>
              )}
            </div>
            <div className="min-w-0 truncate">
              <span className="font-mono text-foreground">{r.materialCode}</span>
              {r.materialFamily && (
                <>
                  {' '}· <span className="text-muted-foreground">{r.materialFamily}</span>
                </>
              )}
            </div>
            <div className="font-mono text-muted-foreground">{r.dimensions}</div>
            <div className="truncate text-muted-foreground">
              {r.treatments && r.treatments.length ? r.treatments.join(', ') : '—'}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', r.statusClass)}>
                {r.statusLabel}
              </span>
              <span className="text-[11px] text-muted-foreground">{r.supplierName ?? '—'}</span>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
