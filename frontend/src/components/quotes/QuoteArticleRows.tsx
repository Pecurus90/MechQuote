// src/components/quotes/QuoteArticleRows.tsx
// Righe articolo-materiale (dettaglio riga preventivo espansa). Presentazionale:
// il container mappa il tipo reale ArticleMaterialRow di @/types + lo stato
// per-parte reale (6 valori, via PART_STATE_LABELS/COLORS) su questa shape.
import { cn, eur2 } from '@/lib/utils'

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
  /** Costi al pezzo (sola vista). */
  materialCost?: number | null
  treatmentCost?: number | null
  pieceCost?: number | null
}

interface Props {
  rows: ArticleMaterialRow[]
  emptyText?: string
}

// Layout: info descrittive a sinistra + i 3 costi al pezzo raggruppati e
// allineati a destra ("Costi/pz"). Colonne a larghezza controllata così il
// codice articolo (~14 char mono) non va a capo e la riga resta ordinata.
const GRID =
  'grid grid-cols-[120px_minmax(0,1.35fr)_minmax(0,0.8fr)_minmax(0,1.05fr)_minmax(0,1.1fr)_136px] gap-3'

// Riga del blocco costi: etichetta muta + valore mono a larghezza fissa, così i
// valori si incolonnano perfettamente a destra su tutte le righe.
function CostLine({ label, value, strong }: { label: string; value?: number | null; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-end gap-2">
      <span className={cn('text-[11px]', strong ? 'font-semibold text-muted-foreground' : 'text-muted-foreground')}>
        {label}
      </span>
      <span
        className={cn(
          'w-[66px] text-right font-mono',
          strong ? 'text-[13px] font-semibold text-foreground' : 'text-[12px] text-foreground/80',
        )}
      >
        {value != null ? eur2(value) : '—'}
      </span>
    </div>
  )
}

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
        <div>Stato · fornitore</div>
        <div className="text-right">Costi/pz</div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-4 text-center text-[13px] text-muted-foreground">{emptyText}</div>
      ) : (
        rows.map((r, i) => (
          <div
            key={r.partId}
            className={cn(
              GRID,
              'items-start px-4 py-[13px] text-[13px]',
              i < rows.length - 1 && 'border-b border-border',
            )}
          >
            {/* Parte: codice (una riga) + revisione sotto */}
            <div className="min-w-0">
              <div className="whitespace-nowrap font-mono text-[13.5px] font-semibold text-foreground">{r.partCode}</div>
              {r.revision && (
                <div className="font-mono text-[11px] text-muted-foreground">rev {r.revision}</div>
              )}
            </div>
            {/* Materiale: nome + famiglia sotto */}
            <div className="min-w-0">
              <div className="break-words font-mono font-medium text-foreground">{r.materialCode}</div>
              {r.materialFamily && (
                <div className="text-[11.5px] text-muted-foreground">{r.materialFamily}</div>
              )}
            </div>
            <div className="whitespace-nowrap font-mono text-foreground">{r.dimensions}</div>
            <div className="min-w-0 break-words text-foreground/80">
              {r.treatments && r.treatments.length ? r.treatments.join(', ') : <span className="text-muted-foreground">—</span>}
            </div>
            <div className="flex flex-col gap-1">
              <span className={cn('inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium', r.statusClass)}>
                {r.statusLabel}
              </span>
              <span className="text-[11.5px] text-muted-foreground">{r.supplierName ?? '—'}</span>
            </div>
            {/* Costi al pezzo, incolonnati a destra */}
            <div className="space-y-[3px]">
              <CostLine label="Mat." value={r.materialCost} />
              <CostLine label="Tratt." value={r.treatmentCost && r.treatmentCost > 0 ? r.treatmentCost : null} />
              <CostLine label="Pezzo" value={r.pieceCost} strong />
            </div>
          </div>
        ))
      )}
    </div>
  )
}
