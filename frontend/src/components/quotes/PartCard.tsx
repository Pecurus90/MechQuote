import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { X } from 'lucide-react'
import PhaseEditor from '@/components/quotes/PhaseEditor'
import { calcMaterialCost, calcTreatmentCost } from '@/lib/quoteCalc'
import { parseDecimal } from '@/lib/decimalInput'
import api from '@/lib/api'
import type { Part, Material, Machine, Treatment, Supplier, PhaseTemplate } from '@/types'
import { toast } from 'sonner'

type StockType = 'none' | 'round' | 'square'

const IconRound = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
    <ellipse cx="12" cy="7" rx="9" ry="3.5" />
    <path d="M3 7v10c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5V7" />
  </svg>
)

const IconSquare = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
    <path d="M4 6h12v12H4z" />
    <path d="M8 2h12v12" />
    <path d="M16 2l4 4M16 14l4-4M4 18l4 4M20 14v-8" />
  </svg>
)


interface Props {
  part: Part
  machines: Machine[]
  materials: Material[]
  suppliers?: Supplier[]
  templates?: PhaseTemplate[]
  treatments?: Treatment[]
  nParts?: number
  globalMarginPercent: number
  readOnly?: boolean
  onUpdate: (updates: Partial<Part>) => void
  onSave: () => void
  onPhasesChange: (phases: Part['phases']) => void
  onReload?: () => void
}

export default function PartCard({ part, machines, materials, suppliers = [], templates = [], treatments = [], nParts = 1, globalMarginPercent, readOnly = false, onUpdate, onSave, onPhasesChange, onReload }: Props) {
  const selectedMaterial = materials.find(m => m.id === part.material_id)

  const inferStockType = (p: Part): StockType =>
    p.raw_diameter_mm ? 'round' : (p.raw_x_mm || p.raw_y_mm) ? 'square' : 'none'

  const [stockType, setStockType] = useState<StockType>(() => inferStockType(part))

  useEffect(() => { setStockType(inferStockType(part)) }, [part.id])

  const handleMaterialChange = (matId: number | undefined) => {
    const material = materials.find(m => m.id === matId)
    const matCost = calcMaterialCost({ ...part, material_id: matId }, material)
    const deliveryCost = material?.material_supplier?.shipping_cost ?? part.material_delivery_cost ?? 0
    onUpdate({ material_id: matId, material_cost: matCost, material_delivery_cost: deliveryCost })
  }

  const handleStockTypeChange = (type: StockType) => {
    setStockType(type)
    // pulisce i campi dimensione non pertinenti
    const material = materials.find(m => m.id === part.material_id)
    const cleared = type === 'round'
      ? { raw_x_mm: undefined, raw_y_mm: undefined }
      : type === 'square'
        ? { raw_diameter_mm: undefined }
        : { raw_x_mm: undefined, raw_y_mm: undefined, raw_z_mm: undefined, raw_diameter_mm: undefined }
    const updated = { ...part, ...cleared }
    const matCost = calcMaterialCost(updated, material)
    onUpdate({ ...cleared, material_cost: matCost } as Partial<Part>)
  }

  const handleDimChange = (field: keyof Part, value: number) => {
    const updated = { ...part, [field]: value }
    const material = materials.find(m => m.id === part.material_id)
    const matCost = calcMaterialCost(updated, material)
    onUpdate({ [field]: value, material_cost: matCost } as Partial<Part>)
  }

  const workPhaseCost = part.phases.filter(p => !p.treatment_id).reduce((s, p) => s + p.calculated_cost, 0)
  const treatmentPhaseCost = part.phases.filter(p => p.treatment_id != null).reduce((s, p) => s + p.calculated_cost, 0)
  const phaseCost = workPhaseCost + treatmentPhaseCost

  // Breakdown lavorazioni: somma di cui setup vs ciclo (Sprint 12 cost engine split).
  // Replica la stessa formula di PhaseEditor.calcPhase per coerenza DRY.
  const qtyDiv = (part.quantity || 1)
  const workSetupTotal = part.phases.filter(p => !p.treatment_id).reduce((s, p) => {
    const machine = machines.find(m => m.id === p.machine_id)
    const workRate = p.hourly_rate_override ?? machine?.hourly_rate ?? 0
    const setupRate = (machine?.setup_hourly_rate != null) ? machine.setup_hourly_rate : workRate
    const divisor = qtyDiv * (p.is_shared ? nParts : 1)
    return s + (p.setup_hours || 0) * setupRate / divisor
  }, 0)
  const workCycleTotal = workPhaseCost - workSetupTotal  // tutto il resto delle lavorazioni

  const treatmentPhase = part.phases.find(p => p.treatment_id != null)
  const selectedTreatment = treatments.find(t => t.id === treatmentPhase?.treatment_id)

  const deliveryPerPiece = (part.material_delivery_cost ?? 0) / (part.quantity || 1)
  const cuttingPerPiece = selectedMaterial?.material_supplier?.cutting_cost_per_part ?? 0
  const materialTotal = part.material_cost + deliveryPerPiece + cuttingPerPiece
  const treatmentShippingPerPiece = (treatmentPhase?.fixed_cost ?? 0) / (part.quantity || 1)

  const handleTreatmentSelect = async (treatmentId: number | undefined) => {
    if (!part.id) return
    const t = treatments.find(t => t.id === treatmentId)
    try {
      if (!treatmentId || !t) {
        if (treatmentPhase?.id) {
          await api.delete(`/phases/${treatmentPhase.id}`)
          onReload?.()
        }
        return
      }
      const varCost = calcTreatmentCost(t, part.finished_weight_kg, part.quantity || 1)
      const payload = {
        phase_type: 'heat_treatment',
        description: t.name,
        treatment_id: treatmentId,
        supplier_id: t.supplier_id ?? undefined,
        variable_cost_per_part: varCost,
        sequence_number: 99,
        setup_hours: 0,
        cycle_hours_per_part: 0,
        fixed_cost: t.supplier?.shipping_cost ?? 0,
        customer_visible: true,
        is_shared: false,
      }
      if (treatmentPhase?.id) {
        await api.put(`/phases/${treatmentPhase.id}`, payload)
      } else {
        await api.post(`/parts/${part.id}/phases`, payload)
      }
      onReload?.()
    } catch (e) {toast.error('Errore nel salvataggio del trattamento') }
  }

  return (
    <fieldset disabled={readOnly} className="space-y-3 border-0 p-0 m-0 disabled:opacity-90">
      {/* Header compatto: dati parte + materiale in due righe */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          {/* Riga 1: identificativi */}
          <div className="flex items-end gap-3">
            <div className="w-44 shrink-0">
              <label className="text-xs font-medium text-gray-600">Codice Parte</label>
              <Input className="mt-1 h-8 font-mono text-sm" value={part.part_code ?? ''}
                onChange={e => onUpdate({ part_code: e.target.value })}
                onBlur={onSave} />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-gray-600">Descrizione</label>
              <Input className="mt-1 h-8 text-sm" value={part.description ?? ''}
                onChange={e => onUpdate({ description: e.target.value })}
                onBlur={onSave} placeholder="Descrizione del pezzo" />
            </div>
            <div className="w-16 shrink-0">
              <label className="text-xs font-medium text-gray-600">Rev.</label>
              <Input className="mt-1 h-8 text-sm" value={part.revision ?? ''}
                onChange={e => onUpdate({ revision: e.target.value })}
                onBlur={onSave} />
            </div>
            <div className="w-20 shrink-0">
              <label className="text-xs font-medium text-gray-600">Qtà</label>
              <Input onFocus={e => e.currentTarget.select()} type="number" min={1} className="mt-1 h-8 text-sm"
                value={part.quantity}
                onChange={e => onUpdate({ quantity: parseInt(e.target.value) || 1 })}
                onBlur={onSave} />
            </div>
          </div>

          {/* Riga A: Materiale + Toggle grezzo */}
          <div className="flex items-end gap-3">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-gray-600">Materiale</label>
              <select
                className="mt-1 flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={part.material_id || ''}
                onChange={e => handleMaterialChange(Number(e.target.value) || undefined)}
                onBlur={onSave}
              >
                <option value="">Seleziona materiale...</option>
                {materials.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.family})</option>
                ))}
              </select>
            </div>
            <div className="shrink-0">
              <label className="text-xs font-medium text-gray-600 block mb-1">Grezzo</label>
              <div className="flex gap-1">
                {([
                  { type: 'none' as StockType, label: '—' },
                  { type: 'round' as StockType, icon: <IconRound /> },
                  { type: 'square' as StockType, icon: <IconSquare /> },
                ]).map(opt => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => { handleStockTypeChange(opt.type); onSave() }}
                    className={`h-8 px-2.5 rounded-md border text-sm flex items-center gap-1 transition-colors ${
                      stockType === opt.type
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {opt.icon ?? opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Riga B: Dimensioni grezzo (condizionale) */}
          {stockType === 'round' && (
            <div className="flex items-end gap-3">
              <div className="shrink-0">
                <label className="text-xs font-medium text-gray-600">Ø (mm)</label>
                <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={0.1} className="mt-1 h-8 w-24 text-sm"
                  value={part.raw_diameter_mm ?? ''}
                  onChange={e => handleDimChange('raw_diameter_mm', parseDecimal(e.target.value) || 0)}
                  onBlur={onSave} />
              </div>
              <div className="shrink-0">
                <label className="text-xs font-medium text-gray-600">Lungh. (mm)</label>
                <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={0.1} className="mt-1 h-8 w-24 text-sm"
                  value={part.raw_z_mm ?? ''}
                  onChange={e => handleDimChange('raw_z_mm', parseDecimal(e.target.value) || 0)}
                  onBlur={onSave} />
              </div>
              {selectedMaterial && part.raw_diameter_mm && part.raw_z_mm && (
                <p className="text-xs text-gray-400 pb-2 whitespace-nowrap">
                  {(() => {
                    const r = part.raw_diameter_mm! / 2
                    const kg = (Math.PI * r * r * part.raw_z_mm!) / 1_000_000 * selectedMaterial.density_kg_dm3
                    return `~${kg.toFixed(3)} kg grezzo`
                  })()}
                </p>
              )}
            </div>
          )}

          {stockType === 'square' && (
            <div className="flex items-end gap-3">
              <div className="shrink-0">
                <label className="text-xs font-medium text-gray-600">X (mm)</label>
                <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={0.1} className="mt-1 h-8 w-20 text-sm"
                  value={part.raw_x_mm ?? ''}
                  onChange={e => handleDimChange('raw_x_mm', parseDecimal(e.target.value) || 0)}
                  onBlur={onSave} />
              </div>
              <div className="shrink-0">
                <label className="text-xs font-medium text-gray-600">Y (mm)</label>
                <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={0.1} className="mt-1 h-8 w-20 text-sm"
                  value={part.raw_y_mm ?? ''}
                  onChange={e => handleDimChange('raw_y_mm', parseDecimal(e.target.value) || 0)}
                  onBlur={onSave} />
              </div>
              <div className="shrink-0">
                <label className="text-xs font-medium text-gray-600">Z (mm)</label>
                <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={0.1} className="mt-1 h-8 w-20 text-sm"
                  value={part.raw_z_mm ?? ''}
                  onChange={e => handleDimChange('raw_z_mm', parseDecimal(e.target.value) || 0)}
                  onBlur={onSave} />
              </div>
              {selectedMaterial && part.raw_x_mm && part.raw_y_mm && part.raw_z_mm && (
                <p className="text-xs text-gray-400 pb-2 whitespace-nowrap">
                  {((part.raw_x_mm * part.raw_y_mm * part.raw_z_mm) / 1_000_000 * selectedMaterial.density_kg_dm3).toFixed(3)} kg grezzo
                </p>
              )}
            </div>
          )}

          {/* Riga C: Costi — grid fisso, nessun wrap */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Costo mat. (€)</label>
              <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={0.01} className="mt-1 h-8 text-sm"
                value={part.material_cost}
                onChange={e => onUpdate({ material_cost: parseDecimal(e.target.value) || 0 })}
                onBlur={onSave} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Spediz. mat. (€)</label>
              <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={0.5} className="mt-1 h-8 text-sm"
                value={part.material_delivery_cost ?? ''}
                placeholder="—"
                onChange={e => onUpdate({ material_delivery_cost: e.target.value === '' ? undefined : parseDecimal(e.target.value) || 0 })}
                onBlur={onSave} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Peso finito (kg)</label>
              <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={0.001} className="mt-1 h-8 text-sm"
                value={part.finished_weight_kg ?? ''}
                placeholder="—"
                onChange={e => onUpdate({ finished_weight_kg: e.target.value === '' ? undefined : parseDecimal(e.target.value) || 0 })}
                onBlur={onSave} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trattamento termico */}
      {treatments.length > 0 && (
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Trattamento termico</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={treatmentPhase?.treatment_id || ''}
                  onChange={e => handleTreatmentSelect(Number(e.target.value) || undefined)}
                >
                  <option value="">Nessun trattamento</option>
                  {treatments.filter(t => t.active).sort((a, b) => a.name.localeCompare(b.name, 'it')).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              {selectedTreatment && (
                <>
                  <button
                    type="button"
                    onClick={() => handleTreatmentSelect(undefined)}
                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            {selectedTreatment && !part.finished_weight_kg && (
              <p className="text-[11px] text-amber-600 mt-1.5">⚠ Imposta il peso finito per calcolare il costo trattamento.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fasi + riepilogo costi affiancati */}
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          <PhaseEditor
            partId={part.id}
            phases={part.phases}
            quantity={part.quantity}
            nParts={nParts}
            machines={machines}
            suppliers={suppliers}
            templates={templates}
            treatments={treatments}
            finishedWeightKg={part.finished_weight_kg}
            partRawZmm={part.raw_z_mm}
            partHasRawStock={!!(part.raw_diameter_mm || part.raw_x_mm || part.raw_y_mm)}
            onReload={onReload}
            readOnly={readOnly}
            onChange={onPhasesChange}
          />
        </div>

        {/* Riepilogo costi (sticky) */}
        <div className="w-52 shrink-0 sticky top-4">
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4 pb-4">
              <div className="space-y-1 text-sm">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Costo per pezzo</p>
                <div className="flex justify-between">
                  <span className="text-gray-600">Materiale</span>
                  <span>{materialTotal.toFixed(2)} €</span>
                </div>
                {deliveryPerPiece > 0 && (
                  <div className="flex justify-between pl-3 text-[11px] text-gray-400">
                    <span>di cui spedizione</span>
                    <span>{deliveryPerPiece.toFixed(2)} €</span>
                  </div>
                )}
                {cuttingPerPiece > 0 && (
                  <div className="flex justify-between pl-3 text-[11px] text-gray-400">
                    <span>di cui taglio</span>
                    <span>{cuttingPerPiece.toFixed(2)} €</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Lavorazioni</span>
                  <span>{workPhaseCost.toFixed(2)} €</span>
                </div>
                {workSetupTotal > 0 && (
                  <div className="flex justify-between pl-3 text-[11px] text-gray-400">
                    <span>di cui attrezzaggi</span>
                    <span>{workSetupTotal.toFixed(2)} €</span>
                  </div>
                )}
                {workCycleTotal > 0 && (
                  <div className="flex justify-between pl-3 text-[11px] text-gray-400">
                    <span>di cui lavorazione</span>
                    <span>{workCycleTotal.toFixed(2)} €</span>
                  </div>
                )}
                {treatmentPhaseCost > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Trattamenti</span>
                      <span>{treatmentPhaseCost.toFixed(2)} €</span>
                    </div>
                    {treatmentShippingPerPiece > 0 && (
                      <div className="flex justify-between pl-3 text-[11px] text-gray-400">
                        <span>di cui spedizione</span>
                        <span>{treatmentShippingPerPiece.toFixed(2)} €</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between font-medium border-t border-blue-200 pt-1.5 mt-1.5">
                  <span>Costo/pz</span>
                  <span>{part.total_cost.toFixed(2)} €</span>
                </div>

                <div className="border-t border-blue-200 pt-2.5 mt-2.5 space-y-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Margine (%)</label>
                    <Input onFocus={e => e.currentTarget.select()} type="number" min={0} max={500} step={1} className="h-7 w-full text-xs mt-0.5"
                      value={part.margin_percent ?? globalMarginPercent}
                      onChange={e => onUpdate({ margin_percent: parseDecimal(e.target.value) || 0 })}
                      onBlur={onSave} />
                    <p className="text-[10px] text-gray-400 mt-0.5">default: {globalMarginPercent}%</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Prezzo minimo (€)</label>
                    <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={1} className="h-7 w-full text-xs mt-0.5"
                      value={part.minimum_price ?? ''}
                      placeholder="—"
                      onChange={e => onUpdate({
                        minimum_price: e.target.value === '' ? undefined : parseDecimal(e.target.value) || 0,
                      })}
                      onBlur={onSave} />
                    {part.minimum_price && part.total_cost < part.minimum_price && (
                      <p className="text-[10px] text-amber-600 mt-0.5">⚠ minimo attivo</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-blue-200 pt-2.5 mt-2.5 space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Prezzo/pz</span>
                    <span>{part.unit_price.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between font-bold text-blue-700 text-base pt-0.5">
                    <span>× {part.quantity}</span>
                    <span>{part.total_price.toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </fieldset>
  )
}
