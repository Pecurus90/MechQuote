// src/components/quotes/CloseoutPanel.tsx
import { PackageCheck, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DecimalField } from '@/components/ui/decimal-field'
import { Label } from '@/components/ui/label'

interface Props {
  soldPrice: string
  actualCost: string
  /** Margine consuntivo già calcolato dal container (es. "€ 4.725,00 · 33,8%"). */
  marginLabel: string
  marginPositive?: boolean
  locked?: boolean
  /** Commit al blur (parse + salvataggio nel container). */
  onCommit: (field: 'soldPrice' | 'actualCost', raw: string) => void
}

const bigInput =
  'h-[46px] rounded-[10px] border-input bg-background pl-8 pr-3.5 font-mono text-lg font-semibold'

export function CloseoutPanel(props: Props) {
  const { soldPrice, actualCost, marginLabel, marginPositive = true, locked, onCommit } = props
  const TrendIcon = marginPositive ? TrendingUp : TrendingDown

  return (
    <div className="rounded-2xl border border-border bg-card px-[26px] pb-[26px] pt-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-1.5 flex items-center gap-2.5">
        <PackageCheck className="h-[19px] w-[19px] text-state-completo" />
        <h2 className="text-lg font-bold text-foreground">Chiusura Commessa</h2>
      </div>
      <p className="mb-5 text-[13px] text-muted-foreground">
        Registra il consuntivo a commessa completata per il confronto marginalità.
      </p>

      <fieldset disabled={locked} className="grid max-w-[640px] grid-cols-2 gap-4 disabled:opacity-60">
        <div className="rounded-[13px] border border-border bg-card-muted p-[18px]">
          <Label className="mb-2 block text-xs font-medium text-muted-foreground">
            Prezzo venduto (€)
          </Label>
          <div className="relative">
            <span className="absolute left-3.5 top-[13px] font-mono text-base text-muted-foreground">
              €
            </span>
            <DecimalField
              value={soldPrice}
              onCommit={(raw) => onCommit('soldPrice', raw)}
              className={bigInput}
            />
          </div>
        </div>
        <div className="rounded-[13px] border border-border bg-card-muted p-[18px]">
          <Label className="mb-2 block text-xs font-medium text-muted-foreground">
            Costo consuntivo (€)
          </Label>
          <div className="relative">
            <span className="absolute left-3.5 top-[13px] font-mono text-base text-muted-foreground">
              €
            </span>
            <DecimalField
              value={actualCost}
              onCommit={(raw) => onCommit('actualCost', raw)}
              className={bigInput}
            />
          </div>
        </div>
      </fieldset>

      <div className="mt-4 flex items-center gap-2 text-[13px]">
        <TrendIcon
          className={cn('h-[15px] w-[15px]', marginPositive ? 'text-success' : 'text-danger')}
        />
        <span className="text-muted-foreground">Margine consuntivo</span>
        <span
          className={cn('font-mono font-bold', marginPositive ? 'text-success' : 'text-danger')}
        >
          {marginLabel}
        </span>
      </div>
    </div>
  )
}
