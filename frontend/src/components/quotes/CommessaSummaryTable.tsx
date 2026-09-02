// src/components/quotes/CommessaSummaryTable.tsx
import { Layers, AlertTriangle } from 'lucide-react'
import { cn, eur2 } from '@/lib/utils'

export interface CommessaRow {
  id: number
  partCode: string
  description: string
  quantity: number
  costPerPart: number
  unitPrice: number
  totalPrice: number
  hasIssues?: boolean
}

interface Props {
  quoteNumber: string
  rows: CommessaRow[]
  // Tutti derivati, già calcolati dal container.
  // subtotal: prezzi parte GIÀ comprensivi delle spese di gestione (trasporto +
  // imballaggio camuffati nel prezzo/pz) → nessuna riga accessoria separata.
  subtotal: number
  discountPercent: number
  discountAmount: number
  total: number
  onOpenPart: (id: number) => void
}

const GRID = 'grid grid-cols-[110px_minmax(0,1fr)_64px_116px_120px_120px] gap-3'

export function CommessaSummaryTable(props: Props) {
  const {
    quoteNumber,
    rows,
    subtotal,
    discountPercent,
    discountAmount,
    total,
    onOpenPart,
  } = props

  return (
    <div className="rounded-2xl border border-border bg-card px-[26px] pb-7 pt-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-[18px] flex items-center gap-2.5">
        <Layers className="h-[19px] w-[19px] text-info" />
        <h2 className="text-lg font-bold text-foreground">Riepilogo Commessa</h2>
        <span className="text-[12.5px] text-muted-foreground">
          {rows.length} parti · {quoteNumber}
        </span>
      </div>

      <div className="overflow-hidden rounded-[13px] border border-border">
        {/* head */}
        <div
          className={cn(
            GRID,
            'border-b border-border bg-card-muted px-[18px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground',
          )}
        >
          <div>Codice</div>
          <div>Descrizione</div>
          <div className="text-right">Qtà</div>
          <div className="text-right">Costo/pz</div>
          <div className="text-right">Prezzo/pz</div>
          <div className="text-right">Totale</div>
        </div>

        {/* rows */}
        {rows.map((r, i) => (
          <div
            key={r.id}
            onClick={() => onOpenPart(r.id)}
            className={cn(
              GRID,
              'cursor-pointer items-center px-[18px] py-[13px] text-[13.5px] transition-colors hover:bg-muted/45',
              i < rows.length - 1 && 'border-b border-border',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[12.5px] font-semibold text-foreground">
                {r.partCode}
              </span>
              {r.hasIssues && <AlertTriangle className="h-[13px] w-[13px] text-warning" />}
            </div>
            <div className="truncate font-medium text-foreground">{r.description}</div>
            <div className="text-right font-mono text-foreground">{r.quantity}</div>
            <div className="text-right font-mono text-muted-foreground">{eur2(r.costPerPart)}</div>
            <div className="text-right font-mono text-foreground">{eur2(r.unitPrice)}</div>
            <div className="text-right font-mono font-semibold text-foreground">
              {eur2(r.totalPrice)}
            </div>
          </div>
        ))}

        {/* footer totals */}
        <div className="border-t-2 border-border bg-card-muted/60 px-[18px] py-3.5">
          <div className="ml-auto flex max-w-[420px] flex-col gap-[7px]">
            {/* Subtotale mostrato solo come base sconto: senza sconto coincide col
                totale (spese già dentro i prezzi/pz) e sarebbe ridondante. */}
            {discountAmount > 0 && (
              <>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">Subtotale parti</span>
                  <span className="font-mono font-semibold text-foreground">{eur2(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">Sconto {discountPercent}%</span>
                  <span className="font-mono text-danger">− {eur2(discountAmount)}</span>
                </div>
              </>
            )}
            <div className="mt-[3px] flex items-center justify-between border-t border-border pt-[9px]">
              <span className="text-sm font-bold text-foreground">Totale commessa</span>
              <span className="font-mono text-xl font-bold text-foreground">{eur2(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
