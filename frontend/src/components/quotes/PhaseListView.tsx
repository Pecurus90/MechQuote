// PhaseListView (design handoff) adattato: il pannello EDM e l'aiuto-trattamento
// sono resi dal container via slot (renderEdm / renderTreatmentInfo) così si
// riusa la logica esistente e testata (EdmPhaseFields + preview batch). Save
// on-blur per i campi testo/numero; i select salvano nel container (onChange).
import { useState, type ReactNode } from 'react'
import {
  GitBranch, Plus, GripVertical, Trash2, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { DecimalField } from '@/components/ui/decimal-field'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

export interface SelectOption {
  value: string
  label: string
}

export interface PhaseVM {
  id: number
  sequence_number: number
  title: string
  subtitle?: string
  /** €/pz già calcolato dal container. */
  calculatedCost: number
  belowMinimum?: boolean
  isTreatment?: boolean
  isWireEdm?: boolean
  operationId: string
  machineId: string
  treatmentId: string
  supplierId: string
  description: string
  setupMinutes: string
  cycleMinutes: string
  cycleAuto?: boolean
  fixedCost: string
  variableCostPerPart: string
  hourlyRateOverride: string
}

export type PhaseField =
  | 'operationId' | 'machineId' | 'treatmentId' | 'supplierId' | 'description'
  | 'setupMinutes' | 'cycleMinutes' | 'fixedCost' | 'variableCostPerPart' | 'hourlyRateOverride'

interface Options {
  operations: SelectOption[]
  machines: SelectOption[]
  treatments: SelectOption[]
  suppliers: SelectOption[]
}

interface Props extends Options {
  phases: PhaseVM[]
  locked?: boolean
  workflowTemplates?: SelectOption[]
  onAdd?: () => void
  onApplyTemplate?: (templateId: string) => void
  onChange: (phaseId: number, field: PhaseField, val: string) => void
  /** Commit al blur dei campi numerici (parse + salvataggio nel container). */
  onCommitField: (phaseId: number, field: PhaseField, raw: string) => void
  onBlurField?: (phaseId: number, field: PhaseField) => void
  onDelete?: (phaseId: number) => void
  onReorder?: (fromId: number, toId: number) => void
  /** Slot EDM (EdmPhaseFields esistente) reso dal container. */
  renderEdm?: (phaseId: number) => ReactNode
  /** Slot aiuto-trattamento (preview batch) reso dal container. */
  renderTreatmentInfo?: (phaseId: number) => ReactNode
}

const eur2 = (v: number): string =>
  Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fieldLabel = 'mb-[5px] block text-[11px] font-medium text-muted-foreground'
const smallInput = 'h-9 rounded-[9px] border-input bg-background text-[13px]'
const smallMono = 'h-9 rounded-[9px] border-input bg-background font-mono text-[13px]'

function PhaseRow(props: {
  phase: PhaseVM
  open: boolean
  locked?: boolean
  operations: SelectOption[]
  machines: SelectOption[]
  treatments: SelectOption[]
  suppliers: SelectOption[]
  onToggle: () => void
  onChange: (phaseId: number, field: PhaseField, val: string) => void
  onCommitField: (phaseId: number, field: PhaseField, raw: string) => void
  onBlurField?: (phaseId: number, field: PhaseField) => void
  onDelete?: (phaseId: number) => void
  onDragStart: () => void
  onDrop: () => void
  renderEdm?: (phaseId: number) => ReactNode
  renderTreatmentInfo?: (phaseId: number) => ReactNode
}) {
  const {
    phase, open, locked, operations, machines, treatments, suppliers,
    onToggle, onChange, onCommitField, onBlurField, onDelete, onDragStart, onDrop, renderEdm, renderTreatmentInfo,
  } = props
  const [advanced, setAdvanced] = useState(false)
  const blur = (f: PhaseField) => () => onBlurField?.(phase.id, f)
  const commit = (f: PhaseField) => (raw: string) => onCommitField(phase.id, f, raw)

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cn('overflow-hidden rounded-xl border bg-card', open ? 'border-primary/40' : 'border-border')}
    >
      {/* header */}
      <div
        onClick={onToggle}
        className={cn('flex cursor-pointer items-center gap-[11px] px-3.5 py-3 transition-colors hover:bg-muted/50', open && 'bg-primary/[0.04]')}
      >
        <span draggable={!locked} onDragStart={(e) => { e.stopPropagation(); onDragStart() }} onClick={(e) => e.stopPropagation()}>
          <GripVertical className="h-4 w-4 flex-none cursor-grab text-muted-foreground" />
        </span>
        <span className={cn('flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] font-mono text-xs font-semibold', open ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground')}>
          {phase.sequence_number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
            {phase.title}
            {phase.belowMinimum && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-[7px] py-px text-[10px] font-semibold text-warning">
                <AlertTriangle className="h-2.5 w-2.5" />
                sotto minimo
              </span>
            )}
          </div>
          {phase.subtitle && <div className="text-[11.5px] text-muted-foreground">{phase.subtitle}</div>}
        </div>
        <span className="font-mono text-sm font-semibold text-foreground">€ {eur2(phase.calculatedCost)}</span>
        <span className="text-[11px] text-muted-foreground">/pz</span>
        {!locked && (
          <Trash2 className="h-[15px] w-[15px] flex-none text-muted-foreground transition-colors hover:text-danger"
            onClick={(e) => { e.stopPropagation(); onDelete?.(phase.id) }} />
        )}
        {open ? <ChevronUp className="h-4 w-4 flex-none text-muted-foreground" /> : <ChevronDown className="h-4 w-4 flex-none text-muted-foreground" />}
      </div>

      {/* body */}
      {open && (
        <fieldset disabled={locked} className="border-t border-border px-4 pb-4 pt-1 disabled:opacity-70">
          {/* row 1 */}
          <div className="mt-3.5 grid grid-cols-3 gap-2.5">
            <div>
              <Label className={fieldLabel}>Lavorazione</Label>
              <Select value={phase.operationId} onValueChange={(v) => onChange(phase.id, 'operationId', v)}>
                <SelectTrigger className={smallInput}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{operations.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {phase.isTreatment ? (
              <div>
                <Label className={fieldLabel}>Trattamento</Label>
                <Select value={phase.treatmentId} onValueChange={(v) => onChange(phase.id, 'treatmentId', v)}>
                  <SelectTrigger className={smallInput}><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{treatments.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className={fieldLabel}>Macchina</Label>
                <Select value={phase.machineId} onValueChange={(v) => onChange(phase.id, 'machineId', v)}>
                  <SelectTrigger className={smallInput}><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{machines.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className={fieldLabel}>Descrizione</Label>
              <Input value={phase.description} onChange={(e) => onChange(phase.id, 'description', e.target.value)} onBlur={blur('description')} className={smallInput} />
            </div>
          </div>

          {/* Fornitore esterno (opz.): trattamenti + qualsiasi fase SENZA
              macchina interna (conto lavoro esterno / extra personalizzato). */}
          {(phase.isTreatment || !phase.machineId || phase.supplierId) && (
            <div className="mt-2.5 max-w-[calc(33%_-_6px)]">
              <Label className={fieldLabel}>Fornitore esterno (opz.)</Label>
              <Select value={phase.supplierId} onValueChange={(v) => onChange(phase.id, 'supplierId', v === '__none__' ? '' : v)}>
                <SelectTrigger className={smallInput}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— nessuno —</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* aiuto-trattamento (preview batch) dal container */}
          {phase.isTreatment && renderTreatmentInfo?.(phase.id)}

          {/* EDM sub-panel dal container (EdmPhaseFields) */}
          {phase.isWireEdm && renderEdm?.(phase.id)}

          {/* row 2 */}
          <div className="mt-3.5 grid grid-cols-4 gap-2.5">
            {!phase.isTreatment && (
              <>
                <div>
                  <Label className={fieldLabel}>Min. setup</Label>
                  <DecimalField value={phase.setupMinutes} onCommit={commit('setupMinutes')} className={smallMono} />
                </div>
                <div>
                  <Label className={fieldLabel}>Min. ciclo/pz {phase.cycleAuto && <span className="text-primary">(auto)</span>}</Label>
                  <DecimalField value={phase.cycleMinutes} readOnly={phase.cycleAuto}
                    onCommit={commit('cycleMinutes')}
                    className={cn(smallMono, phase.cycleAuto && 'border-border bg-muted/50 text-muted-foreground')} />
                </div>
              </>
            )}
            <div>
              <Label className={fieldLabel}>{phase.isTreatment ? 'Spedizione / fisso (€)' : 'Costo fisso (€)'}</Label>
              <DecimalField value={phase.fixedCost} onCommit={commit('fixedCost')} className={smallMono} />
            </div>
            <div>
              <Label className={fieldLabel}>{phase.isTreatment ? 'Costo/pz (€)' : 'Costo var./pz (€)'}</Label>
              <DecimalField value={phase.variableCostPerPart} onCommit={commit('variableCostPerPart')} className={smallMono} />
            </div>
          </div>

          {/* avanzato + footer */}
          <div className="mt-3.5 flex items-center justify-between">
            <button type="button" onClick={() => setAdvanced((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', advanced && 'rotate-180')} />
              Avanzato · tariffa override
            </button>
            <span className="text-[13px] text-muted-foreground">
              = <span className="font-mono text-[15px] font-semibold text-foreground">{eur2(phase.calculatedCost)}</span> €/pz
            </span>
          </div>
          {advanced && (
            <div className="mt-2.5 max-w-[220px]">
              <Label className={fieldLabel}>Tariffa override (€/h)</Label>
              <DecimalField value={phase.hourlyRateOverride} onCommit={commit('hourlyRateOverride')} className={smallMono} placeholder="Auto" />
            </div>
          )}
        </fieldset>
      )}
    </div>
  )
}

export function PhaseListView(props: Props) {
  const {
    phases, locked, workflowTemplates = [], operations, machines, treatments, suppliers,
    onAdd, onApplyTemplate, onChange, onCommitField, onBlurField, onDelete, onReorder, renderEdm, renderTreatmentInfo,
  } = props
  const [openId, setOpenId] = useState<number | null>(phases.length ? phases[0].id : null)
  const [dragId, setDragId] = useState<number | null>(null)

  return (
    <div className="min-w-0">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="text-[15px] font-semibold text-foreground">Ciclo di Lavorazione</span>
        <span className="flex-1" />
        {!locked && (
          <>
            {workflowTemplates.length > 0 && (
              <Select onValueChange={(v) => onApplyTemplate?.(v)}>
                <SelectTrigger className="h-[34px] w-auto gap-1.5 rounded-[8px] border-border bg-card px-3 text-[12.5px] font-semibold">
                  <GitBranch className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Da flusso…" />
                </SelectTrigger>
                <SelectContent>{workflowTemplates.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={onAdd} className="h-[34px] rounded-[8px]">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Aggiungi Fase
            </Button>
          </>
        )}
      </div>

      {phases.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nessuna fase. Clicca "Aggiungi Fase" per iniziare.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {phases.map((p) => (
            <PhaseRow
              key={p.id}
              phase={p}
              open={openId === p.id}
              locked={locked}
              operations={operations}
              machines={machines}
              treatments={treatments}
              suppliers={suppliers}
              onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
              onChange={onChange}
              onCommitField={onCommitField}
              onBlurField={onBlurField}
              onDelete={onDelete}
              onDragStart={() => setDragId(p.id)}
              onDrop={() => { if (dragId != null && dragId !== p.id) onReorder?.(dragId, p.id); setDragId(null) }}
              renderEdm={renderEdm}
              renderTreatmentInfo={renderTreatmentInfo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
