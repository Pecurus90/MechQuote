import { useState, useEffect } from 'react'
import PhaseEditor from '@/components/quotes/PhaseEditor'
import { calcMaterialCost, calcTreatmentCost } from '@/lib/quoteCalc'
import { parseDecimal } from '@/lib/decimalInput'
import api from '@/lib/api'
import { buildCatalogOptions } from '@/lib/catalogSelect'
import type { Part, Material, Machine, Treatment, Supplier, CompanySettings } from '@/types'
import { toast } from 'sonner'
import { PartCardView, type PartCardValue, type PartField, type RawType, type SelectOption } from '@/components/quotes/PartCardView'
import { PartCostSummary } from '@/components/quotes/PartCostSummary'

// Container della PartCard: mantiene TUTTA la logica materiale/grezzo/
// trattamento e il breakdown costi (gemello DRY di calculation.py). La grafica
// è in PartCardView + PartCostSummary (design handoff). Il PhaseEditor esistente
// resta nello slot (verrà sostituito in D2).

type StockType = 'none' | 'round' | 'square'
const RAW_TO_STOCK: Record<RawType, StockType> = { '': 'none', tondo: 'round', quadro: 'square' }
const STOCK_TO_RAW: Record<StockType, RawType> = { none: '', round: 'tondo', square: 'quadro' }

interface Props {
  part: Part
  machines: Machine[]
  materials: Material[]
  suppliers?: Supplier[]
  treatments?: Treatment[]
  nParts?: number
  globalMarginPercent: number
  siblings?: Part[]
  companySettings?: CompanySettings | null
  readOnly?: boolean
  onUpdate: (updates: Partial<Part>) => void
  onSave: (override?: Partial<Part>) => void
  onPhasesChange: (phases: Part['phases']) => void
  onReload?: () => void
}

export default function PartCard({
  part, machines, materials, suppliers = [], treatments = [], nParts = 1,
  globalMarginPercent, siblings = [], companySettings, readOnly = false,
  onUpdate, onSave, onPhasesChange, onReload,
}: Props) {
  const selectedMaterial = materials.find(m => m.id === part.material_id)

  const inferStockType = (p: Part): StockType =>
    p.raw_diameter_mm ? 'round' : (p.raw_x_mm || p.raw_y_mm) ? 'square' : 'none'
  const [stockType, setStockType] = useState<StockType>(() => inferStockType(part))
  useEffect(() => { setStockType(inferStockType(part)) }, [part.id])

  // ─── material / stock / dims ───────────────────────────────────────────────
  const applyMaterial = (matId: number | undefined) => {
    const material = materials.find(m => m.id === matId)
    const matCost = calcMaterialCost({ ...part, material_id: matId }, material)
    onUpdate({ material_id: matId, material_cost: matCost })
    onSave({ material_id: matId, material_cost: matCost })
  }
  const applyStockType = (type: StockType) => {
    setStockType(type)
    const material = materials.find(m => m.id === part.material_id)
    const cleared = type === 'round'
      ? { raw_x_mm: undefined, raw_y_mm: undefined }
      : type === 'square'
        ? { raw_diameter_mm: undefined }
        : { raw_x_mm: undefined, raw_y_mm: undefined, raw_z_mm: undefined, raw_diameter_mm: undefined }
    const matCost = calcMaterialCost({ ...part, ...cleared }, material)
    onUpdate({ ...cleared, material_cost: matCost } as Partial<Part>)
    onSave({ ...cleared, material_cost: matCost } as Partial<Part>)
  }
  const applyProvenance = (v: string) => {
    const updates = { customer_supplied_material: v === 'cl', material_from_stock: v === 'stock' }
    onUpdate(updates); onSave(updates)
  }

  const treatmentPhase = part.phases.find(p => p.treatment_id != null)
  const selectedTreatment = treatments.find(t => t.id === treatmentPhase?.treatment_id)
  const needsFinishedWeight = !!treatmentPhase && !part.finished_weight_kg

  const handleTreatmentSelect = async (treatmentId: number | undefined) => {
    if (!part.id) return
    const t = treatments.find(t => t.id === treatmentId)
    try {
      if (!treatmentId || !t) {
        if (treatmentPhase?.id) { await api.delete(`/phases/${treatmentPhase.id}`); await onReload?.(); toast.success('Trattamento rimosso') }
        return
      }
      const varCost = calcTreatmentCost(t, part.finished_weight_kg, part.quantity || 1, [], {
        raw_x_mm: part.raw_x_mm, raw_y_mm: part.raw_y_mm, raw_z_mm: part.raw_z_mm, raw_diameter_mm: part.raw_diameter_mm,
      })
      const payload = {
        phase_type: '', description: t.name, treatment_id: treatmentId, supplier_id: t.supplier_id ?? undefined,
        variable_cost_per_part: varCost, sequence_number: 99, setup_hours: 0, cycle_hours_per_part: 0,
        fixed_cost: t.supplier?.shipping_cost ?? 0,
      }
      if (treatmentPhase?.id) await api.put(`/phases/${treatmentPhase.id}`, payload)
      else await api.post(`/parts/${part.id}/phases`, payload)
      await onReload?.(); toast.success('Trattamento salvato')
    } catch { toast.error('Errore nel salvataggio del trattamento') }
  }

  // ─── breakdown costi (gemello DRY calculation.py) ──────────────────────────
  const workPhaseCost = part.phases.filter(p => !p.treatment_id).reduce((s, p) => s + p.calculated_cost, 0)
  const treatmentPhaseCost = part.phases.filter(p => p.treatment_id != null).reduce((s, p) => s + p.calculated_cost, 0)
  const qtyDiv = part.quantity || 1
  const workSetupTotal = part.phases.filter(p => !p.treatment_id).reduce((s, p) => {
    const machine = machines.find(m => m.id === p.machine_id)
    const workRate = p.hourly_rate_override ?? machine?.hourly_rate ?? 0
    const setupRate = (machine?.setup_hourly_rate != null) ? machine.setup_hourly_rate : workRate
    return s + (p.setup_hours || 0) * setupRate / qtyDiv
  }, 0)
  const workCycleTotal = workPhaseCost - workSetupTotal

  let deliveryPerPiece: number, cuttingPerPiece: number, materialTotal: number
  if (part.customer_supplied_material) {
    deliveryPerPiece = 0; cuttingPerPiece = 0; materialTotal = 0
  } else if (part.material_from_stock && companySettings) {
    const fromStockCount = 1 + siblings.filter(s => s.material_from_stock && !s.customer_supplied_material).length
    deliveryPerPiece = (companySettings.stock_shipping_cost || 0) / Math.max(fromStockCount, 1) / (part.quantity || 1)
    cuttingPerPiece = companySettings.stock_cutting_cost_per_part || 0
    materialTotal = part.material_cost + deliveryPerPiece + cuttingPerPiece
  } else {
    deliveryPerPiece = (part.material_delivery_cost ?? 0) / (part.quantity || 1)
    cuttingPerPiece = selectedMaterial?.material_supplier?.cutting_cost_per_part ?? 0
    materialTotal = part.material_cost + deliveryPerPiece + cuttingPerPiece
  }
  const treatmentShippingPerPiece = (treatmentPhase?.fixed_cost ?? 0) / (part.quantity || 1)

  // ─── raw weight label ──────────────────────────────────────────────────────
  let rawWeightLabel: string | undefined
  if (selectedMaterial) {
    if (stockType === 'round' && part.raw_diameter_mm && part.raw_z_mm) {
      const r = part.raw_diameter_mm / 2
      const kg = (Math.PI * r * r * part.raw_z_mm) / 1_000_000 * selectedMaterial.density_kg_dm3
      rawWeightLabel = `${kg.toFixed(3).replace('.', ',')} kg`
    } else if (stockType === 'square' && part.raw_x_mm && part.raw_y_mm && part.raw_z_mm) {
      const kg = (part.raw_x_mm * part.raw_y_mm * part.raw_z_mm) / 1_000_000 * selectedMaterial.density_kg_dm3
      rawWeightLabel = `${kg.toFixed(3).replace('.', ',')} kg`
    }
  }

  // ─── options ───────────────────────────────────────────────────────────────
  const materialOpts: SelectOption[] = [
    { value: '', label: 'Seleziona materiale…' },
    ...buildCatalogOptions(materials, part.material_id, part.material, m => `${m.name} (${m.family})`).map(o => ({ value: String(o.value), label: o.label })),
  ]
  const provenanceOpts: SelectOption[] = [
    { value: 'normal', label: 'Fornitore abituale' },
    { value: 'cl', label: 'Conto lavoro (cliente)' },
    { value: 'stock', label: 'A magazzino' },
  ]
  const treatmentOpts: SelectOption[] = [
    { value: '', label: 'Nessun trattamento' },
    ...buildCatalogOptions([...treatments].sort((a, b) => a.name.localeCompare(b.name, 'it')), treatmentPhase?.treatment_id, treatmentPhase?.treatment, t => t.name).map(o => ({ value: String(o.value), label: o.label })),
  ]

  // ─── value + handlers ──────────────────────────────────────────────────────
  const value: PartCardValue = {
    description: part.description ?? '',
    revision: part.revision ?? '',
    quantity: String(part.quantity ?? ''),
    materialId: part.material_id ? String(part.material_id) : '',
    rawType: STOCK_TO_RAW[stockType],
    provenance: part.customer_supplied_material ? 'cl' : part.material_from_stock ? 'stock' : 'normal',
    diameter: part.raw_diameter_mm != null ? String(part.raw_diameter_mm) : '',
    length: part.raw_z_mm != null ? String(part.raw_z_mm) : '',
    rawX: part.raw_x_mm != null ? String(part.raw_x_mm) : '',
    rawY: part.raw_y_mm != null ? String(part.raw_y_mm) : '',
    rawZ: part.raw_z_mm != null ? String(part.raw_z_mm) : '',
    materialCost: String(part.material_cost ?? ''),
    materialShipping: part.material_delivery_cost != null ? String(part.material_delivery_cost) : '',
    finishedWeight: part.finished_weight_kg != null ? String(part.finished_weight_kg) : '',
    treatmentId: treatmentPhase?.treatment_id ? String(treatmentPhase.treatment_id) : '',
  }

  // Campi testo/select: aggiornamento live (onChange) + salvataggio on-blur.
  const onFieldChange = (field: PartField, val: string) => {
    switch (field) {
      case 'description': onUpdate({ description: val }); break
      case 'revision': onUpdate({ revision: val }); break
      case 'materialId': applyMaterial(val ? Number(val) : undefined); break
      case 'rawType': applyStockType(RAW_TO_STOCK[val as RawType]); break
      case 'provenance': applyProvenance(val); break
      case 'treatmentId': handleTreatmentSelect(val ? Number(val) : undefined); break
    }
  }
  // Salvataggio on-blur solo per i campi testo; i select salvano in onChange.
  const onFieldBlur = (field: PartField) => {
    if (['materialId', 'rawType', 'provenance', 'treatmentId'].includes(field)) return
    onSave()
  }

  // Campi numerici: commit atomico al blur (evita il round-trip che strippava i
  // decimali). onUpdate = anteprima immediata, onSave(override) = persistenza
  // con il valore fresco (savePart lo fonde sul part, niente stato "vecchio").
  const commitDim = (field: keyof Part, value: number) => {
    const material = materials.find(m => m.id === part.material_id)
    const updates = { [field]: value, material_cost: calcMaterialCost({ ...part, [field]: value }, material) } as Partial<Part>
    onUpdate(updates); onSave(updates)
  }
  const commitPart = (updates: Partial<Part>) => { onUpdate(updates); onSave(updates) }
  const onFieldCommit = (field: PartField, raw: string) => {
    switch (field) {
      case 'quantity': commitPart({ quantity: parseInt(raw, 10) || 1 }); break
      case 'diameter': commitDim('raw_diameter_mm', parseDecimal(raw) || 0); break
      case 'length': commitDim('raw_z_mm', parseDecimal(raw) || 0); break
      case 'rawX': commitDim('raw_x_mm', parseDecimal(raw) || 0); break
      case 'rawY': commitDim('raw_y_mm', parseDecimal(raw) || 0); break
      case 'rawZ': commitDim('raw_z_mm', parseDecimal(raw) || 0); break
      case 'materialCost': commitPart({ material_cost: parseDecimal(raw) || 0 }); break
      case 'materialShipping': commitPart({ material_delivery_cost: raw === '' ? undefined : parseDecimal(raw) || 0 }); break
      case 'finishedWeight': commitPart({ finished_weight_kg: raw === '' ? undefined : parseDecimal(raw) || 0 }); break
    }
  }

  const contextLabel = nParts > 1 ? `di ${nParts} parti` : undefined

  return (
    <PartCardView
      partCode={part.part_code}
      title={part.description || 'Parte'}
      contextLabel={contextLabel}
      value={value}
      rawWeightLabel={rawWeightLabel}
      weightRequired={needsFinishedWeight}
      locked={readOnly}
      materials={materialOpts}
      provenances={provenanceOpts}
      treatments={treatmentOpts}
      onChange={onFieldChange}
      onCommit={onFieldCommit}
      onBlur={onFieldBlur}
      onClearTreatment={() => handleTreatmentSelect(undefined)}
      phaseEditor={
        <PhaseEditor
          partId={part.id}
          partMaterialId={part.material_id}
          phases={part.phases}
          quantity={part.quantity}
          nParts={nParts}
          machines={machines}
          suppliers={suppliers}
          treatments={treatments}
          finishedWeightKg={part.finished_weight_kg}
          siblings={siblings}
          partRawZmm={part.raw_z_mm}
          partRawXmm={part.raw_x_mm ?? undefined}
          partRawYmm={part.raw_y_mm ?? undefined}
          partRawDiameterMm={part.raw_diameter_mm ?? undefined}
          partDxfFileId={part.files?.find(f => f.file_type === 'dxf')?.id}
          partHasRawStock={!!(part.raw_diameter_mm || part.raw_x_mm || part.raw_y_mm)}
          onReload={onReload}
          readOnly={readOnly}
          onChange={onPhasesChange}
        />
      }
      costSummary={
        <PartCostSummary
          materialTotal={materialTotal}
          materialShipping={deliveryPerPiece}
          materialCutting={cuttingPerPiece > 0 ? cuttingPerPiece : undefined}
          laborTotal={workPhaseCost}
          laborSetup={workSetupTotal}
          laborWork={workCycleTotal}
          treatmentTotal={treatmentPhaseCost}
          treatmentShipping={treatmentShippingPerPiece}
          costPerPart={part.total_cost ?? 0}
          unitPrice={part.unit_price ?? 0}
          quantity={part.quantity}
          totalPrice={part.total_price ?? 0}
          minimumActive={!!part.minimum_price && (part.total_cost ?? 0) < part.minimum_price}
          marginPercent={String(part.margin_percent ?? globalMarginPercent)}
          minimumPrice={part.minimum_price != null ? String(part.minimum_price) : ''}
          locked={readOnly}
          onCommit={(f, v) => {
            if (f === 'marginPercent') commitPart({ margin_percent: parseDecimal(v) || 0 })
            else commitPart({ minimum_price: v === '' ? undefined : parseDecimal(v) || 0 })
          }}
        />
      }
    />
  )
}
