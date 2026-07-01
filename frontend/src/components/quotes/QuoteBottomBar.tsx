import { Input } from '@/components/ui/input'
import { parseDecimal } from '@/lib/decimalInput'
import type { Quote } from '@/types'

interface Props {
  quote: Quote
  isLocked: boolean
  /** Subtotale parti (somma di total_price). Mostrato sopra il totale finale
   *  solo se ci sono extras (trasporto/imballaggio/sconto > 0). */
  partsSubtotal: number
  total: number
  hasExtras: boolean
  /** Updater funzionale del quote: permette al footer di toccare solo
   *  transport_cost / packaging_cost / global_discount_percent senza vedere
   *  il setter completo della page. */
  onChange: (updates: Partial<Quote>) => void
  /** Save su blur — gli onChange sono solo locali (preview live). */
  onBlur: () => void
}

/** Footer dell'editor preventivo: trasporto / imballaggio / sconto + totale
 *  finale. Estratto da QuoteEditor; comportamento invariato.
 */
export default function QuoteBottomBar({
  quote, isLocked, partsSubtotal, total, hasExtras, onChange, onBlur,
}: Props) {
  return (
    <div className="bg-card border-t px-6 py-3">
      <fieldset disabled={isLocked} className="border-0 p-0 m-0 disabled:opacity-90">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm text-muted-foreground">{quote.parts.length} parti</span>
        <span className="text-sm text-muted-foreground">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Trasporto</span>
          <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={1} className="h-7 w-20 text-xs"
            value={quote.transport_cost}
            onChange={e => onChange({ transport_cost: parseDecimal(e.target.value) || 0 })}
            onBlur={onBlur} />
          <span className="text-xs text-muted-foreground">€</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Imballag.</span>
          <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={1} className="h-7 w-20 text-xs"
            value={quote.packaging_cost}
            onChange={e => onChange({ packaging_cost: parseDecimal(e.target.value) || 0 })}
            onBlur={onBlur} />
          <span className="text-xs text-muted-foreground">€</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Sconto</span>
          <Input onFocus={e => e.currentTarget.select()} type="number" min={0} max={100} step={0.5} className="h-7 w-16 text-xs"
            value={quote.global_discount_percent}
            onChange={e => onChange({ global_discount_percent: parseDecimal(e.target.value) || 0 })}
            onBlur={onBlur} />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
        <div className="flex-1" />
        <div className="text-right">
          {hasExtras && (
            <span className="text-xs text-muted-foreground block">Subtotale: {partsSubtotal.toFixed(2)} €</span>
          )}
          <span className="text-xs text-muted-foreground uppercase tracking-wide block">Totale Preventivo</span>
          <span className="text-2xl font-bold text-primary">{total.toFixed(2)} €</span>
        </div>
      </div>
      </fieldset>
    </div>
  )
}
