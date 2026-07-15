// src/components/quotes/PartCardView.tsx
import type { ReactNode } from 'react'
import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { DecimalField } from '@/components/ui/decimal-field'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SelectOption {
  value: string
  label: string
}

export type RawType = '' | 'tondo' | 'quadro'

export interface PartCardValue {
  description: string
  revision: string
  quantity: string
  materialId: string
  rawType: RawType
  provenance: string
  diameter: string
  length: string
  rawX: string
  rawY: string
  rawZ: string
  materialCost: string
  materialShipping: string
  finishedWeight: string
  treatmentId: string
}

export type PartField = keyof PartCardValue

interface Props {
  partCode: string
  title: string
  /** Es. "di 3 parti · commessa 238-26C_004". */
  contextLabel?: string
  value: PartCardValue
  /** Peso grezzo derivato, già calcolato (es. "1,18 kg"). */
  rawWeightLabel?: string
  /** Il peso finito è richiesto (c'è un trattamento) → campo evidenziato. */
  weightRequired?: boolean
  locked?: boolean
  materials: SelectOption[]
  provenances: SelectOption[]
  treatments: SelectOption[]
  onChange: (field: PartField, val: string) => void
  /** Commit al blur dei campi numerici (parse + salvataggio nel container). */
  onCommit: (field: PartField, raw: string) => void
  onBlur?: (field: PartField) => void
  onClearTreatment?: () => void
  /** Slot: <PhaseListView /> reso dal container. */
  phaseEditor: ReactNode
  /** Slot: <PartCostSummary /> reso dal container. */
  costSummary: ReactNode
  /** Slot: <PartAttachments /> reso dal container (opzionale). */
  attachments?: ReactNode
}

const fieldLabel = 'mb-[5px] block text-[11.5px] font-medium text-muted-foreground'
const baseInput = 'h-[38px] rounded-[9px] border-input bg-background text-sm'
const monoInput = 'h-[38px] rounded-[9px] border-input bg-background font-mono text-sm'

export function PartCardView(props: Props) {
  const {
    partCode,
    title,
    contextLabel,
    value,
    rawWeightLabel,
    weightRequired,
    locked,
    materials,
    provenances,
    treatments,
    onChange,
    onCommit,
    onBlur,
    onClearTreatment,
    phaseEditor,
    costSummary,
    attachments,
  } = props

  return (
    <div>
      {/* header */}
      <div className="mb-[18px] flex items-center gap-2.5">
        <span className="font-mono text-[17px] font-semibold text-foreground">{partCode}</span>
        <span className="text-base font-semibold text-foreground">{title}</span>
        <span className="flex-1" />
        {contextLabel && <span className="text-xs text-muted-foreground">{contextLabel}</span>}
      </div>

      <fieldset disabled={locked} className="disabled:opacity-70">
        {/* basic fields */}
        <div className="mb-3.5 grid grid-cols-[2fr_0.8fr_0.8fr] gap-3">
          <div>
            <Label className={fieldLabel}>Descrizione</Label>
            <Input
              value={value.description}
              onChange={(e) => onChange('description', e.target.value)}
              onBlur={() => onBlur?.('description')}
              className={baseInput}
            />
          </div>
          <div>
            <Label className={fieldLabel}>Rev.</Label>
            <Input
              value={value.revision}
              onChange={(e) => onChange('revision', e.target.value)}
              onBlur={() => onBlur?.('revision')}
              className={monoInput}
            />
          </div>
          <div>
            <Label className={fieldLabel}>Quantità</Label>
            <DecimalField
              value={value.quantity}
              onCommit={(raw) => onCommit('quantity', raw)}
              className={monoInput}
            />
          </div>
        </div>

        {/* material row */}
        <div className="mb-3.5 grid grid-cols-[1.4fr_1fr_1.3fr] gap-3">
          <div>
            <Label className={fieldLabel}>Materiale</Label>
            <Select value={value.materialId} onValueChange={(v) => onChange('materialId', v)}>
              <SelectTrigger className={monoInput}>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="font-mono">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={fieldLabel}>Tipo grezzo</Label>
            <div className="flex h-[38px] gap-[3px] rounded-[9px] bg-muted p-[3px]">
              {(
                [
                  { key: '' as RawType, label: '—' },
                  { key: 'tondo' as RawType, label: 'Tondo' },
                  { key: 'quadro' as RawType, label: 'Quadro' },
                ]
              ).map((o) => {
                const active = value.rawType === o.key
                return (
                  <button
                    key={o.key || 'none'}
                    type="button"
                    onClick={() => onChange('rawType', o.key)}
                    className={cn(
                      'flex flex-1 items-center justify-center rounded-[7px] text-[12.5px] font-semibold transition-colors',
                      active
                        ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                        : 'text-muted-foreground',
                    )}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <Label className={fieldLabel}>Provenienza</Label>
            <Select value={value.provenance} onValueChange={(v) => onChange('provenance', v)}>
              <SelectTrigger className={baseInput}>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {provenances.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* dimension fields (conditional) + ~kg */}
        {value.rawType !== '' && (
          <div className="mb-3.5 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3">
            {value.rawType === 'tondo' ? (
              <>
                <div>
                  <Label className={fieldLabel}>Ø grezzo (mm)</Label>
                  <DecimalField
                    value={value.diameter}
                    onCommit={(raw) => onCommit('diameter', raw)}
                    className={monoInput}
                  />
                </div>
                <div>
                  <Label className={fieldLabel}>Lunghezza (mm)</Label>
                  <DecimalField
                    value={value.length}
                    onCommit={(raw) => onCommit('length', raw)}
                    className={monoInput}
                  />
                </div>
                <div />
              </>
            ) : (
              <>
                <div>
                  <Label className={fieldLabel}>Grezzo X (mm)</Label>
                  <DecimalField
                    value={value.rawX}
                    onCommit={(raw) => onCommit('rawX', raw)}
                    className={monoInput}
                  />
                </div>
                <div>
                  <Label className={fieldLabel}>Grezzo Y (mm)</Label>
                  <DecimalField
                    value={value.rawY}
                    onCommit={(raw) => onCommit('rawY', raw)}
                    className={monoInput}
                  />
                </div>
                <div>
                  <Label className={fieldLabel}>Grezzo Z (mm)</Label>
                  <DecimalField
                    value={value.rawZ}
                    onCommit={(raw) => onCommit('rawZ', raw)}
                    className={monoInput}
                  />
                </div>
              </>
            )}
            {rawWeightLabel && (
              <div className="flex h-[38px] items-center gap-[7px] rounded-[9px] border border-border bg-muted/50 px-3.5">
                <span className="text-[11.5px] text-muted-foreground">~ grezzo</span>
                <span className="font-mono text-sm font-semibold text-foreground">
                  {rawWeightLabel}
                </span>
              </div>
            )}
          </div>
        )}

        {/* costs row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className={fieldLabel}>Costo materiale (€)</Label>
            <DecimalField
              value={value.materialCost}
              onCommit={(raw) => onCommit('materialCost', raw)}
              className={monoInput}
            />
          </div>
          <div>
            <Label className={fieldLabel}>Spedizione mat. (€)</Label>
            <DecimalField
              value={value.materialShipping}
              onCommit={(raw) => onCommit('materialShipping', raw)}
              className={monoInput}
            />
          </div>
          <div>
            <Label
              className={cn(
                'mb-[5px] block text-[11.5px] font-medium',
                weightRequired ? 'text-danger' : 'text-muted-foreground',
              )}
            >
              Peso finito (kg){weightRequired && ' · richiesto'}
            </Label>
            <DecimalField
              value={value.finishedWeight}
              onCommit={(raw) => onCommit('finishedWeight', raw)}
              className={cn(
                'h-[38px] rounded-[9px] bg-background font-mono text-sm',
                weightRequired ? 'border-danger/50' : 'border-input',
              )}
            />
          </div>
        </div>

        {/* Trattamento termico */}
        <div className="mt-5 border-t border-border pt-5">
          <div className="flex items-center gap-3">
            <div className="flex flex-none items-center gap-2">
              <Flame className="h-[17px] w-[17px] text-warning" />
              <span className="text-sm font-semibold text-foreground">Trattamento termico</span>
            </div>
            <div className="relative max-w-[340px] flex-1">
              <Select value={value.treatmentId} onValueChange={(v) => onChange('treatmentId', v)}>
                <SelectTrigger className={baseInput}>
                  <SelectValue placeholder="Nessun trattamento" />
                </SelectTrigger>
                <SelectContent>
                  {treatments.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              onClick={onClearTreatment}
              className="h-[34px] flex-none rounded-[8px] border border-border bg-card px-3 text-[12.5px] font-semibold text-muted-foreground transition-[filter] hover:brightness-105"
            >
              Azzera
            </button>
          </div>
        </div>
      </fieldset>

      {/* Fasi + riepilogo affiancati */}
      <div className="mt-[22px] grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {phaseEditor}
        {costSummary}
      </div>

      {attachments}
    </div>
  )
}
