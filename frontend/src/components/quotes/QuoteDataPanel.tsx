// src/components/quotes/QuoteDataPanel.tsx
import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { DecimalField } from '@/components/ui/decimal-field'
import { Label } from '@/components/ui/label'

export interface QuoteDataValue {
  customerReference: string
  validityDays: string
  deliveryText: string
  notesCustomer: string
  notesInternal: string
}

interface Props {
  value: QuoteDataValue
  locked: boolean
  onChange: (field: keyof QuoteDataValue, val: string) => void
  /** Commit al blur dei campi numerici (validità). */
  onCommit: (field: 'validityDays', raw: string) => void
  /** Autosave on-blur dei campi testo (il container salva). */
  onBlur?: (field: keyof QuoteDataValue) => void
  /** Margine corrente del preventivo — prefill del campo "applica a tutte". */
  marginDefault: string
  /** Numero di parti (per il testo di conferma). */
  partCount: number
  /** Applica il margine a TUTTE le parti; il container conferma + salva. */
  onApplyMarginToAll: (raw: string) => void
}

const labelCls = 'mb-1.5 block text-xs font-medium text-muted-foreground'
const inputCls = 'h-[38px] rounded-[9px] border-input bg-background text-sm'
const textareaCls =
  'w-full resize-none rounded-[9px] border border-input bg-background px-3 py-[9px] text-[13.5px] text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/[0.18] disabled:cursor-not-allowed disabled:opacity-60'

export function QuoteDataPanel({ value, locked, onChange, onCommit, onBlur, marginDefault, partCount, onApplyMarginToAll }: Props) {
  // Campo-azione: il valore digitato si applica solo col pulsante (+ conferma nel
  // container), non on-blur. Si ri-allinea al default quando il preventivo cambia.
  const [marginInput, setMarginInput] = useState(marginDefault)
  useEffect(() => setMarginInput(marginDefault), [marginDefault])

  return (
    <div className="max-w-[720px]">
      <div className="mb-[18px] flex items-center gap-2.5">
        <Settings2 className="h-[19px] w-[19px] text-primary" />
        <h2 className="text-lg font-bold text-foreground">Dati Preventivo</h2>
      </div>

      <fieldset
        disabled={locked}
        className="rounded-[14px] border border-border bg-card px-6 py-[22px] disabled:opacity-70"
      >
        <div className="mb-4">
          <Label className={labelCls}>Riferimento cliente</Label>
          <Input
            value={value.customerReference}
            onChange={(e) => onChange('customerReference', e.target.value)}
            onBlur={() => onBlur?.('customerReference')}
            className={`${inputCls} font-mono`}
          />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3.5">
          <div>
            <Label className={labelCls}>Margine — tutte le parti %</Label>
            <div className="flex gap-2">
              <Input
                value={marginInput}
                onChange={(e) => setMarginInput(e.target.value)}
                inputMode="decimal"
                className={`${inputCls} font-mono`}
              />
              <button
                type="button"
                onClick={() => onApplyMarginToAll(marginInput)}
                className="h-[38px] flex-none rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105"
              >
                Applica
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Imposta questo margine su tutte le {partCount} parti (poi override sulla singola).
            </p>
          </div>
          <div>
            <Label className={labelCls}>Validità (giorni)</Label>
            <DecimalField
              value={value.validityDays}
              onCommit={(raw) => onCommit('validityDays', raw)}
              className={`${inputCls} font-mono`}
            />
          </div>
        </div>

        <div className="mb-4">
          <Label className={labelCls}>Condizioni di consegna</Label>
          <Input
            value={value.deliveryText}
            onChange={(e) => onChange('deliveryText', e.target.value)}
            onBlur={() => onBlur?.('deliveryText')}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <Label className={labelCls}>Note cliente</Label>
            <textarea
              value={value.notesCustomer}
              onChange={(e) => onChange('notesCustomer', e.target.value)}
              onBlur={() => onBlur?.('notesCustomer')}
              className={`${textareaCls} h-[78px]`}
            />
          </div>
          <div>
            <Label className={labelCls}>Note interne</Label>
            <textarea
              value={value.notesInternal}
              onChange={(e) => onChange('notesInternal', e.target.value)}
              onBlur={() => onBlur?.('notesInternal')}
              className={`${textareaCls} h-[78px]`}
            />
          </div>
        </div>
      </fieldset>
    </div>
  )
}
