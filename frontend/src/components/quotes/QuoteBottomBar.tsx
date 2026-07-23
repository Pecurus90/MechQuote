// src/components/quotes/QuoteBottomBar.tsx
import { DecimalField } from '@/components/ui/decimal-field'

interface Props {
  nParts: number
  /** Valori editabili (stringhe controllate; commit on-blur nel container). */
  transport: string
  packaging: string
  discountPercent: string
  /** Derivati, già calcolati dal container. */
  subtotal?: number
  /** Imponibile pre-sconto (parti + trasporto + imballaggio) e importo sconto:
   *  usati per la lettura "Imponibile → Sconto → Totale" quando lo sconto > 0. */
  taxable?: number
  discountAmount?: number
  total: number
  locked: boolean
  onCommit: (field: 'transport' | 'packaging' | 'discountPercent', raw: string) => void
}

const eur0 = (v: number): string =>
  '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })

const eurField =
  'h-[34px] w-[88px] rounded-[8px] border-input bg-background pl-6 pr-2.5 font-mono text-[13px]'

export function QuoteBottomBar(props: Props) {
  const { nParts, transport, packaging, discountPercent, subtotal, taxable, discountAmount, total, locked, onCommit } = props
  const hasDiscount = (discountAmount ?? 0) > 0

  return (
    // `fixed` + offset a sinistra della sidebar (SidebarView: w-[244px]) così la
    // barra resta sempre incollata in basso mentre scorre solo il contenuto.
    // Il padding-bottom del contenuto (in QuoteEditor) evita che le ultime card
    // finiscano dietro la barra.
    <div className="fixed bottom-0 left-[244px] right-0 z-30 flex items-center gap-[22px] border-t border-border bg-card px-[22px] py-3">
      <span className="text-[13px] font-medium text-muted-foreground">{nParts} parti</span>

      <fieldset
        disabled={locked}
        className="flex items-center gap-[22px] disabled:opacity-60"
      >
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Trasporto</label>
          <div className="relative">
            <span className="absolute left-2.5 top-2 font-mono text-[13px] text-muted-foreground">
              €
            </span>
            <DecimalField
              value={transport}
              onCommit={(raw) => onCommit('transport', raw)}
              className={eurField}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Imballaggio</label>
          <div className="relative">
            <span className="absolute left-2.5 top-2 font-mono text-[13px] text-muted-foreground">
              €
            </span>
            <DecimalField
              value={packaging}
              onCommit={(raw) => onCommit('packaging', raw)}
              className={eurField}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Sconto</label>
          <div className="relative">
            <DecimalField
              value={discountPercent}
              onCommit={(raw) => onCommit('discountPercent', raw)}
              className="h-[34px] w-[72px] rounded-[8px] border-input bg-background pl-2.5 pr-6 font-mono text-[13px]"
            />
            <span className="absolute right-2.5 top-2 font-mono text-[13px] text-muted-foreground">
              %
            </span>
          </div>
        </div>
      </fieldset>

      <span className="flex-1" />

      {hasDiscount ? (
        <div className="mr-1 text-right text-[13px] leading-tight">
          <div>
            <span className="text-muted-foreground">Imponibile </span>
            <span className="font-mono text-foreground">{eur0(taxable ?? 0)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Sconto {discountPercent}% </span>
            <span className="font-mono font-semibold text-danger">− {eur0(discountAmount ?? 0)}</span>
          </div>
        </div>
      ) : subtotal != null ? (
        <div className="mr-1 text-right">
          <span className="text-xs text-muted-foreground">Subtotale </span>
          <span className="font-mono text-sm font-semibold text-foreground">{eur0(subtotal)}</span>
        </div>
      ) : null}
      <div className="text-right">
        <div className="mb-px text-[11px] font-medium text-muted-foreground">Totale Preventivo</div>
        <div className="font-mono text-[26px] font-bold leading-none tracking-[-0.01em] text-foreground">
          {eur0(total)}
        </div>
      </div>
    </div>
  )
}
