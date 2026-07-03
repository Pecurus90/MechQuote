// src/pages/quotes/ManualQuoteWizardView.tsx
import { useState } from 'react'
import { ChevronLeft, FileText, Layers, Search, Hash, Check, Info, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface CustomerOption {
  id: number
  name: string
}
export interface CategoryOption {
  code: string
  label: string
}

export interface ManualQuoteValue {
  customerName: string
  customerCode: string
  year: string
  categoryCode: string
  progressive: string
  customerReference: string
}

interface Props {
  customers: CustomerOption[]
  categories: CategoryOption[]
  value: ManualQuoteValue
  /** Numero preventivo già composto dal container (es. "240-26A_001"). */
  previewNumber: string
  onChange: (field: keyof ManualQuoteValue, val: string) => void
  onSelectCustomer?: (id: number) => void
  onBack?: () => void
  onCancel?: () => void
  canProceed: boolean
  saving: boolean
  onCreate: (type: 'single' | 'commessa') => void
}

const codeInput =
  'h-[38px] rounded-[9px] border-input bg-background text-center font-mono text-sm'

export function ManualQuoteWizardView(props: Props) {
  const {
    customers,
    categories,
    value,
    previewNumber,
    onChange,
    onSelectCustomer,
    onBack,
    onCancel,
    canProceed,
    saving,
    onCreate,
  } = props

  const [type, setType] = useState<'single' | 'commessa'>('single')
  const [custOpen, setCustOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-border bg-card px-9 pb-10 pt-[34px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* header */}
      <div className="mb-[26px] flex items-start gap-3.5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-[19px] w-[19px]" />
        </button>
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-primary/[0.13] text-primary">
          <FileText className="h-[23px] w-[23px]" />
        </div>
        <div>
          <h2 className="mb-[3px] text-[22px] font-bold tracking-tight text-foreground">
            Nuovo Preventivo Manuale
          </h2>
          <p className="text-[13.5px] text-muted-foreground">
            Componi il codice, scegli il tipo e crea
          </p>
        </div>
      </div>

      <div className="max-w-[820px]">
        {/* Card 1: cliente & codice */}
        <div className="mb-4 rounded-[14px] border border-border bg-card p-6">
          <div className="mb-1 text-[15px] font-semibold text-foreground">
            Cliente &amp; codice preventivo
          </div>
          <div className="mb-5 text-[12.5px] text-muted-foreground">
            Il numero si compone automaticamente dai campi sottostanti
          </div>

          {/* cliente autocomplete */}
          <div className="relative mb-[18px]">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Cliente</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-[11px] h-4 w-4 text-muted-foreground" />
              <Input
                value={value.customerName}
                onChange={(e) => onChange('customerName', e.target.value)}
                onFocus={() => setCustOpen(true)}
                onBlur={() => window.setTimeout(() => setCustOpen(false), 120)}
                className="h-[38px] rounded-[9px] border-input bg-background pl-9 text-sm"
                placeholder="Cerca per nome o numero cliente…"
              />
            </div>
            {custOpen && customers.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[10px] border border-border bg-card p-1 shadow-[0_16px_44px_rgba(0,0,0,0.16)]">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelectCustomer?.(c.id)
                      setCustOpen(false)
                    }}
                    className="flex w-full items-center rounded-[7px] px-2.5 py-2 text-left text-[13.5px] transition-colors hover:bg-muted/60"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* codice composer */}
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Codice preventivo
          </Label>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-[88px]">
              <div className="mb-1 text-[10.5px] text-muted-foreground">Cod. cliente</div>
              <Input
                value={value.customerCode}
                onChange={(e) => onChange('customerCode', e.target.value)}
                className={codeInput}
              />
            </div>
            <span className="pb-2 font-mono text-lg text-muted-foreground">-</span>
            <div className="w-[72px]">
              <div className="mb-1 text-[10.5px] text-muted-foreground">Anno</div>
              <Input
                value={value.year}
                onChange={(e) => onChange('year', e.target.value)}
                className={codeInput}
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <div className="mb-1 text-[10.5px] text-muted-foreground">Categoria</div>
              <Select
                value={value.categoryCode}
                onValueChange={(v) => onChange('categoryCode', v)}
              >
                <SelectTrigger className="h-[38px] rounded-[9px] border-input bg-background font-mono text-sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.code} value={c.code} className="font-mono">
                      {c.code} · {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="pb-2 font-mono text-lg text-muted-foreground">_</span>
            <div className="w-24">
              <div className="mb-1 text-[10.5px] text-muted-foreground">Progressivo</div>
              <Input
                value={value.progressive}
                onChange={(e) => onChange('progressive', e.target.value)}
                className={codeInput}
              />
            </div>
          </div>

          {/* live preview */}
          <div className="mt-4 flex items-center gap-3 rounded-[11px] border border-border bg-muted/55 px-[18px] py-3.5">
            <Hash className="h-[18px] w-[18px] text-muted-foreground" />
            <div>
              <div className="mb-0.5 text-[11px] text-muted-foreground">
                Anteprima numero preventivo
              </div>
              <div className="font-mono text-xl font-semibold tracking-[0.01em] text-foreground">
                {previewNumber || '—'}
              </div>
            </div>
          </div>

          {/* riferimento cliente */}
          <div className="mt-[18px]">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Riferimento cliente <span className="font-normal">(opzionale)</span>
            </Label>
            <Input
              value={value.customerReference}
              onChange={(e) => onChange('customerReference', e.target.value)}
              placeholder="Es. RDA-2026-0142 / ordine cliente"
              className="h-[38px] rounded-[9px] border-input bg-background text-sm"
            />
          </div>
        </div>

        {/* Card 2: tipo preventivo */}
        <div className="mb-[22px] rounded-[14px] border border-border bg-card p-6">
          <div className="mb-1 text-[15px] font-semibold text-foreground">Tipo preventivo</div>
          <div className="mb-[18px] text-[12.5px] text-muted-foreground">
            Determina la struttura: una sola parte oppure una commessa multi-parti
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {(
              [
                {
                  key: 'single' as const,
                  title: 'Preventivo singolo',
                  desc: 'Una parte, un ciclo. Ideale per articoli a sé.',
                  icon: FileText,
                  tile: 'bg-primary/[0.13] text-primary',
                },
                {
                  key: 'commessa' as const,
                  title: 'Commessa multi-parti',
                  desc: 'Più parti sotto un unico preventivo, con totali aggregati.',
                  icon: Layers,
                  tile: 'bg-info/[0.13] text-info',
                },
              ]
            ).map((opt) => {
              const OptIcon = opt.icon
              const selected = type === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={!canProceed}
                  onClick={() => setType(opt.key)}
                  className={cn(
                    'relative flex gap-3.5 rounded-[13px] border-[1.5px] p-[18px] text-left transition-colors',
                    !canProceed && 'cursor-not-allowed opacity-60',
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:border-foreground/20',
                  )}
                >
                  {selected && (
                    <span className="absolute right-3.5 top-3.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-[13px] w-[13px]" />
                    </span>
                  )}
                  <div
                    className={cn(
                      'flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px]',
                      opt.tile,
                    )}
                  >
                    <OptIcon className="h-[21px] w-[21px]" />
                  </div>
                  <div>
                    <div className="mb-[3px] text-[14.5px] font-bold text-foreground">
                      {opt.title}
                    </div>
                    <div className="text-xs leading-snug text-muted-foreground">{opt.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>

          {!canProceed && (
            <div className="mt-3.5 flex items-center gap-2.5 rounded-[10px] border border-warning/30 bg-warning/[0.12] px-3.5 py-2.5 text-[12.5px] font-medium text-warning">
              <Info className="h-[15px] w-[15px] flex-none" />
              Compila cliente, categoria e progressivo per abilitare la scelta del tipo.
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" size="lg" onClick={onCancel}>
            Annulla
          </Button>
          <Button
            size="lg"
            disabled={!canProceed || saving}
            onClick={() => onCreate(type)}
          >
            {saving ? 'Creazione in corso…' : 'Crea preventivo'}
            {!saving && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
