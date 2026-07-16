// src/pages/quotes/Dxf2dWizardView.tsx
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  ChevronLeft,
  Scan,
  FileCheck2,
  AlertTriangle,
  Search,
  Zap,
  Box,
  Drill,
  Grid3x3,
  Clock,
  ArrowRight,
} from 'lucide-react'
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

export interface DxfProfileRow {
  id: number
  closed: boolean
  selected: boolean
  /** Lunghezza già formattata dal container (es. "248,5 mm"). */
  lengthLabel: string
  /** Bounding box già formattato (es. "80×60", "Ø42", "—"). */
  bboxLabel: string
}

export interface SelectOption {
  value: string
  label: string
}

export interface Dxf2dValue {
  customerName: string
  customerCode: string
  year: string
  categoryCode: string
  progressive: string
  quantity: string
  marginPercent: string
  date: string
  description: string
  materialId: string
  pieceHeight: string
  cuttingCycleId: string
  foriMode: 'foratrice_edm' | 'piastra_preforata'
  electrodeDiameter: string
  nPreholes: string
  nInfilaggi: string
  offsetX: string
  offsetY: string
  rawX: string
  rawY: string
  rawZ: string
}

interface Props {
  /** Viewer profili interattivo: reso dal container (DxfProfileCanvas). */
  viewer: ReactNode
  fileName: string
  fileMeta: string
  onChangeFile?: () => void

  profiles: DxfProfileRow[]
  allSelected: boolean
  onToggleProfile: (id: number) => void
  onToggleAll: () => void

  /** Riepilogo già calcolato dal container. */
  selectedCount: number
  cutLengthLabel: string
  closedCount: number
  warnings?: string[]

  materials: SelectOption[]
  cuttingCycles: SelectOption[]
  electrodeDiameters: SelectOption[]
  /** Tempo foratura stimato, già calcolato (es. "≈ 4,5 min"). */
  drillTimeEstimate?: string

  previewNumber: string
  value: Dxf2dValue
  onChange: (field: keyof Dxf2dValue, val: string) => void
  customers?: { id: number; name: string }[]
  onSelectCustomer?: (id: number) => void
  onBack?: () => void
  saving: boolean
  onCreate: () => void
}

const fieldLabel = 'mb-[5px] block text-[11.5px] font-medium text-muted-foreground'
const monoInput = 'h-9 rounded-[9px] border-input bg-background font-mono text-[13.5px]'
const textInput = 'h-9 rounded-[9px] border-input bg-background text-[13.5px]'

export function Dxf2dWizardView(props: Props) {
  const {
    viewer,
    fileName,
    fileMeta,
    onChangeFile,
    profiles,
    allSelected,
    onToggleProfile,
    onToggleAll,
    selectedCount,
    cutLengthLabel,
    closedCount,
    warnings = [],
    materials,
    cuttingCycles,
    electrodeDiameters,
    drillTimeEstimate,
    previewNumber,
    value,
    onChange,
    customers = [],
    onSelectCustomer,
    onBack,
    saving,
    onCreate,
  } = props

  const [custOpen, setCustOpen] = useState(false)
  const isForatrice = value.foriMode === 'foratrice_edm'

  return (
    <div className="rounded-2xl border border-border bg-card px-8 pb-9 pt-[30px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* header */}
      <div className="mb-6 flex items-start gap-3.5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-[19px] w-[19px]" />
        </button>
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-confirmed/[0.13] text-confirmed">
          <Scan className="h-[23px] w-[23px]" />
        </div>
        <div>
          <h2 className="mb-[3px] text-[22px] font-bold tracking-tight text-foreground">
            Nuovo Preventivo 2D
          </h2>
          <p className="text-[13.5px] text-muted-foreground">
            Profili, taglio EDM e grezzo calcolati dal file DXF
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
        {/* LEFT — DXF picker */}
        <div className="min-w-0">
          {/* file card */}
          <div className="mb-3.5 flex items-center gap-3 rounded-[11px] border border-border bg-muted/50 px-3.5 py-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-confirmed/[0.13] text-confirmed">
              <FileCheck2 className="h-[19px] w-[19px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[13.5px] font-semibold text-foreground">
                {fileName}
              </div>
              <div className="text-[11.5px] text-muted-foreground">{fileMeta}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onChangeFile}
              className="h-8 flex-none rounded-[8px] px-3 text-xs"
            >
              Cambia file
            </Button>
          </div>

          {/* SVG viewer (dal container) + legenda */}
          <div className="overflow-hidden rounded-xl border border-border bg-card-muted">
            {viewer}
            <div className="flex flex-wrap gap-4 border-t border-border px-3.5 py-[11px] text-[11.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded-[2px] bg-primary" />
                Chiuso · selezionato
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded-[2px] bg-muted-foreground" />
                Chiuso · non selezionato
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-warning" />
                Aperto
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-muted-foreground" />
                Grezzo
              </span>
            </div>
          </div>

          {/* warnings */}
          {warnings.map((w, i) => (
            <div
              key={i}
              className="mt-3 flex items-start gap-2.5 rounded-[10px] border border-warning/30 bg-warning/[0.12] px-3.5 py-2.5 text-[12.5px] font-medium leading-snug text-warning"
            >
              <AlertTriangle className="mt-px h-[15px] w-[15px] flex-none" />
              {w}
            </div>
          ))}

          {/* profiles list */}
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-card-muted px-[15px] py-[11px]">
              <span className="text-[13px] font-semibold text-foreground">
                Profili rilevati <span className="text-muted-foreground">({profiles.length})</span>
              </span>
              <button
                type="button"
                onClick={onToggleAll}
                className="cursor-pointer text-xs font-semibold text-primary"
              >
                {allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
              </button>
            </div>
            {profiles.map((p, i) => (
              <div
                key={p.id}
                onClick={() => onToggleProfile(p.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-[11px] px-[15px] py-[11px] transition-colors hover:bg-muted/50',
                  i < profiles.length - 1 && 'border-b border-border',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 flex-none items-center justify-center rounded-[6px]',
                    p.selected
                      ? 'bg-primary text-primary-foreground'
                      : 'border-[1.5px] border-input',
                  )}
                >
                  {p.selected && (
                    <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none">
                      <path
                        d="M5 12l5 5L20 7"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className={cn(
                    'w-[34px] font-mono text-[12.5px] font-semibold',
                    !p.selected && 'text-muted-foreground',
                  )}
                >
                  #{p.id}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                    p.closed
                      ? p.selected
                        ? 'bg-primary/[0.13] text-primary'
                        : 'bg-muted text-muted-foreground'
                      : 'bg-warning/15 text-warning',
                  )}
                >
                  {p.closed ? 'Chiuso' : 'Aperto'}
                </span>
                <span className="flex-1" />
                <span
                  className={cn(
                    'font-mono text-[12.5px] font-semibold',
                    !p.selected && 'text-muted-foreground',
                  )}
                >
                  {p.lengthLabel}
                </span>
                <span className="w-[74px] text-right font-mono text-[11px] text-muted-foreground">
                  {p.bboxLabel}
                </span>
              </div>
            ))}
          </div>

          {/* selection summary */}
          <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-info/30 bg-info/25">
            <div className="bg-info/[0.08] px-4 py-3.5">
              <div className="mb-[5px] text-[11px] font-semibold text-info">Profili selezionati</div>
              <div className="font-mono text-[22px] font-semibold text-foreground">
                {selectedCount}
              </div>
            </div>
            <div className="bg-info/[0.08] px-4 py-3.5">
              <div className="mb-[5px] text-[11px] font-semibold text-info">Lunghezza taglio</div>
              <div className="font-mono text-[22px] font-semibold text-foreground">
                {cutLengthLabel}
              </div>
            </div>
            <div className="bg-info/[0.08] px-4 py-3.5">
              <div className="mb-[5px] text-[11px] font-semibold text-info">Profili chiusi</div>
              <div className="font-mono text-[22px] font-semibold text-foreground">
                {closedCount}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — form */}
        <div className="flex flex-col gap-3.5">
          {/* Card 1 cliente */}
          <div className="rounded-[13px] border border-border bg-card px-5 py-[18px]">
            <div className="mb-3.5 text-sm font-semibold text-foreground">Cliente e codice</div>
            <div className="relative mb-3">
              <Label className={fieldLabel}>Cliente</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-[11px] top-[11px] h-[15px] w-[15px] text-muted-foreground" />
                <Input
                  value={value.customerName}
                  onChange={(e) => onChange('customerName', e.target.value)}
                  onFocus={() => setCustOpen(true)}
                  onBlur={() => window.setTimeout(() => setCustOpen(false), 120)}
                  placeholder="Cerca per nome o codice…"
                  className={cn(textInput, 'pl-[34px]')}
                />
              </div>
              {custOpen && customers.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[10px] border border-border bg-card p-1 shadow-[0_16px_44px_rgba(0,0,0,0.16)]">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onSelectCustomer?.(c.id); setCustOpen(false) }}
                      className="flex w-full items-center rounded-[7px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-muted/60"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mb-3 flex items-center gap-1.5">
              <Input
                value={value.customerCode}
                onChange={(e) => onChange('customerCode', e.target.value)}
                className="h-9 w-14 rounded-[8px] border-input bg-background text-center font-mono text-[13px]"
              />
              <span className="font-mono text-muted-foreground">-</span>
              <Input
                value={value.year}
                onChange={(e) => onChange('year', e.target.value)}
                className="h-9 w-11 rounded-[8px] border-input bg-background text-center font-mono text-[13px]"
              />
              <Input
                value={value.categoryCode}
                onChange={(e) => onChange('categoryCode', e.target.value)}
                className="h-9 w-11 rounded-[8px] border-input bg-background text-center font-mono text-[13px]"
              />
              <span className="font-mono text-muted-foreground">_</span>
              <Input
                value={value.progressive}
                onChange={(e) => onChange('progressive', e.target.value)}
                className="h-9 w-14 rounded-[8px] border-input bg-background text-center font-mono text-[13px]"
              />
              <span className="flex-1" />
              <span className="font-mono text-[13px] font-semibold text-muted-foreground">
                {previewNumber}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-2.5">
              <div>
                <Label className={fieldLabel}>Quantità</Label>
                <Input
                  value={value.quantity}
                  onChange={(e) => onChange('quantity', e.target.value)}
                  className={monoInput}
                />
              </div>
              <div>
                <Label className={fieldLabel}>Margine %</Label>
                <Input
                  value={value.marginPercent}
                  onChange={(e) => onChange('marginPercent', e.target.value)}
                  className={monoInput}
                />
              </div>
              <div>
                <Label className={fieldLabel}>Data</Label>
                <Input
                  value={value.date}
                  onChange={(e) => onChange('date', e.target.value)}
                  className={monoInput}
                />
              </div>
            </div>
          </div>

          {/* Card 2 pezzo & EDM */}
          <div className="rounded-[13px] border border-border bg-card px-5 py-[18px]">
            <div className="mb-3.5 flex items-center gap-2">
              <Zap className="h-4 w-4 text-warning" />
              <span className="text-sm font-semibold text-foreground">Dati pezzo &amp; taglio EDM</span>
            </div>
            <div className="mb-3">
              <Label className={fieldLabel}>Descrizione</Label>
              <Input
                value={value.description}
                onChange={(e) => onChange('description', e.target.value)}
                className={textInput}
              />
            </div>
            <div className="mb-3 grid grid-cols-[1.4fr_1fr] gap-2.5">
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
                <Label className={fieldLabel}>Altezza pezzo (mm)</Label>
                <Input
                  value={value.pieceHeight}
                  onChange={(e) => onChange('pieceHeight', e.target.value)}
                  className={monoInput}
                />
              </div>
            </div>
            <div className="mb-4">
              <Label className={fieldLabel}>Ciclo di taglio</Label>
              <Select
                value={value.cuttingCycleId}
                onValueChange={(v) => onChange('cuttingCycleId', v)}
              >
                <SelectTrigger className={textInput}>
                  <SelectValue placeholder="Seleziona…" />
                </SelectTrigger>
                <SelectContent>
                  {cuttingCycles.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* modalità fori */}
            <Label className="mb-2 block text-[11.5px] font-medium text-muted-foreground">
              Modalità fori di partenza
            </Label>
            <div className="mb-3.5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onChange('foriMode', 'foratrice_edm')}
                className={cn(
                  'flex items-center gap-2.5 rounded-[11px] border-[1.5px] px-[13px] py-[11px] text-left transition-colors',
                  isForatrice ? 'border-primary bg-primary/5' : 'border-border bg-card',
                )}
              >
                <Drill
                  className={cn('h-[17px] w-[17px]', isForatrice ? 'text-primary' : 'text-muted-foreground')}
                />
                <div>
                  <div className="text-[12.5px] font-semibold text-foreground">Foratrice EDM</div>
                  <div className="text-[10.5px] text-muted-foreground">Pre-fori a elettrodo</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onChange('foriMode', 'piastra_preforata')}
                className={cn(
                  'flex items-center gap-2.5 rounded-[11px] border-[1.5px] px-[13px] py-[11px] text-left transition-colors',
                  !isForatrice ? 'border-primary bg-primary/5' : 'border-border bg-card',
                )}
              >
                <Grid3x3
                  className={cn('h-[17px] w-[17px]', !isForatrice ? 'text-primary' : 'text-muted-foreground')}
                />
                <div>
                  <div className="text-[12.5px] font-semibold text-foreground">Piastra preforata</div>
                  <div className="text-[10.5px] text-muted-foreground">Infilaggi manuali</div>
                </div>
              </button>
            </div>

            {isForatrice ? (
              <>
                <div className="grid grid-cols-[1.3fr_1fr] items-end gap-2.5">
                  <div>
                    <Label className={fieldLabel}>Ø elettrodo</Label>
                    <Select
                      value={value.electrodeDiameter}
                      onValueChange={(v) => onChange('electrodeDiameter', v)}
                    >
                      <SelectTrigger className={monoInput}>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {electrodeDiameters.map((d) => (
                          <SelectItem key={d.value} value={d.value} className="font-mono">
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className={fieldLabel}>N° pre-fori</Label>
                    <Input
                      value={value.nPreholes}
                      onChange={(e) => onChange('nPreholes', e.target.value)}
                      className={monoInput}
                    />
                  </div>
                </div>
                {drillTimeEstimate && (
                  <div className="mt-2.5 flex items-center gap-[7px] text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Tempo foratura stimato{' '}
                    <span className="font-mono font-semibold text-foreground">
                      {drillTimeEstimate}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div>
                <Label className={fieldLabel}>N° infilaggi</Label>
                <Input
                  value={value.nInfilaggi}
                  onChange={(e) => onChange('nInfilaggi', e.target.value)}
                  className={monoInput}
                />
              </div>
            )}
          </div>

          {/* Card 3 grezzo */}
          <div className="rounded-[13px] border border-border bg-card px-5 py-[18px]">
            <div className="mb-3.5 flex items-center gap-2">
              <Box className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Grezzo</span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2.5">
              <div>
                <Label className={fieldLabel}>Offset X (mm)</Label>
                <Input
                  value={value.offsetX}
                  onChange={(e) => onChange('offsetX', e.target.value)}
                  className={monoInput}
                />
              </div>
              <div>
                <Label className={fieldLabel}>Offset Y (mm)</Label>
                <Input
                  value={value.offsetY}
                  onChange={(e) => onChange('offsetY', e.target.value)}
                  className={monoInput}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <Label className="mb-[5px] block text-[11px] font-medium text-muted-foreground">
                  Grezzo X <span className="text-primary">auto</span>
                </Label>
                <Input
                  value={value.rawX}
                  onChange={(e) => onChange('rawX', e.target.value)}
                  className={monoInput}
                />
              </div>
              <div>
                <Label className="mb-[5px] block text-[11px] font-medium text-muted-foreground">
                  Grezzo Y <span className="text-primary">auto</span>
                </Label>
                <Input
                  value={value.rawY}
                  onChange={(e) => onChange('rawY', e.target.value)}
                  className={monoInput}
                />
              </div>
              <div>
                <Label className="mb-[5px] block text-[11px] font-medium text-muted-foreground">
                  Grezzo Z
                </Label>
                <Input
                  value={value.rawZ}
                  readOnly
                  className="h-9 rounded-[9px] border-border bg-muted/50 font-mono text-[13.5px] text-muted-foreground"
                />
              </div>
            </div>
          </div>

          <Button
            size="lg"
            disabled={saving}
            onClick={onCreate}
            className="h-11 w-full justify-center"
          >
            {saving ? 'Creazione in corso…' : 'Crea preventivo'}
            {!saving && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
