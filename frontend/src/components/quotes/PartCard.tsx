import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import PhaseEditor from '@/components/quotes/PhaseEditor'
import { calcMaterialCost } from '@/lib/quoteCalc'
import type { Part, Material, Machine } from '@/types'

interface Supplier { id: number; name: string }
interface PhaseTemplate { id: number; name: string; phase_type: string; default_machine_id: number | null; default_supplier_id: number | null; setup_hours: number; cycle_hours_per_part: number; fixed_cost: number; variable_cost_per_part: number; customer_visible: boolean }

interface Props {
  part: Part
  machines: Machine[]
  materials: Material[]
  suppliers?: Supplier[]
  templates?: PhaseTemplate[]
  globalMarginPercent: number
  onUpdate: (updates: Partial<Part>) => void
  onSave: () => void
  onPhasesChange: (phases: Part['phases']) => void
}

export default function PartCard({ part, machines, materials, suppliers = [], templates = [], globalMarginPercent, onUpdate, onSave, onPhasesChange }: Props) {
  const selectedMaterial = materials.find(m => m.id === part.material_id)

  const handleMaterialChange = (matId: number | undefined) => {
    const material = materials.find(m => m.id === matId)
    const matCost = calcMaterialCost({ ...part, material_id: matId }, material)
    onUpdate({ material_id: matId, material_cost: matCost })
  }

  const handleDimensionChange = (field: 'raw_x_mm' | 'raw_y_mm' | 'raw_z_mm', value: number) => {
    const updated = { ...part, [field]: value }
    const material = materials.find(m => m.id === part.material_id)
    const matCost = calcMaterialCost(updated, material)
    onUpdate({ [field]: value, material_cost: matCost } as Partial<Part>)
  }

  const phaseCost = part.phases.reduce((s, p) => s + p.calculated_cost, 0)

  return (
    <div className="space-y-3">
      {/* Header compatto: dati parte + materiale in due righe */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          {/* Riga 1: identificativi */}
          <div className="flex items-end gap-3">
            <div className="w-44 shrink-0">
              <label className="text-xs font-medium text-gray-600">Codice Parte</label>
              <Input className="mt-1 h-8 font-mono text-sm" value={part.part_code}
                onChange={e => onUpdate({ part_code: e.target.value })}
                onBlur={onSave} />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-gray-600">Descrizione</label>
              <Input className="mt-1 h-8 text-sm" value={part.description}
                onChange={e => onUpdate({ description: e.target.value })}
                onBlur={onSave} placeholder="Descrizione del pezzo" />
            </div>
            <div className="w-16 shrink-0">
              <label className="text-xs font-medium text-gray-600">Rev.</label>
              <Input className="mt-1 h-8 text-sm" value={part.revision}
                onChange={e => onUpdate({ revision: e.target.value })}
                onBlur={onSave} />
            </div>
            <div className="w-20 shrink-0">
              <label className="text-xs font-medium text-gray-600">Qtà</label>
              <Input type="number" min={1} className="mt-1 h-8 text-sm"
                value={part.quantity}
                onChange={e => onUpdate({ quantity: parseInt(e.target.value) || 1 })}
                onBlur={onSave} />
            </div>
          </div>

          {/* Riga 2: materiale e grezzo */}
          <div className="flex items-end gap-3">
            <div className="w-60 shrink-0">
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
            <div className="w-24 shrink-0">
              <label className="text-xs font-medium text-gray-600">X grezzo (mm)</label>
              <Input type="number" min={0} step={0.1} className="mt-1 h-8 text-sm"
                value={part.raw_x_mm ?? ''}
                onChange={e => handleDimensionChange('raw_x_mm', parseFloat(e.target.value) || 0)}
                onBlur={onSave} />
            </div>
            <div className="w-24 shrink-0">
              <label className="text-xs font-medium text-gray-600">Y grezzo (mm)</label>
              <Input type="number" min={0} step={0.1} className="mt-1 h-8 text-sm"
                value={part.raw_y_mm ?? ''}
                onChange={e => handleDimensionChange('raw_y_mm', parseFloat(e.target.value) || 0)}
                onBlur={onSave} />
            </div>
            <div className="w-24 shrink-0">
              <label className="text-xs font-medium text-gray-600">Z grezzo (mm)</label>
              <Input type="number" min={0} step={0.1} className="mt-1 h-8 text-sm"
                value={part.raw_z_mm ?? ''}
                onChange={e => handleDimensionChange('raw_z_mm', parseFloat(e.target.value) || 0)}
                onBlur={onSave} />
            </div>
            <div className="w-28 shrink-0">
              <label className="text-xs font-medium text-gray-600">Costo mat. (€)</label>
              <Input type="number" min={0} step={0.01} className="mt-1 h-8 text-sm"
                value={part.material_cost}
                onChange={e => onUpdate({ material_cost: parseFloat(e.target.value) || 0 })}
                onBlur={onSave} />
            </div>
            {selectedMaterial && part.raw_x_mm && part.raw_y_mm && part.raw_z_mm && (
              <p className="text-xs text-gray-400 pb-1.5 whitespace-nowrap">
                {(((part.raw_x_mm * part.raw_y_mm * (part.raw_z_mm || 0)) / 1_000_000) * selectedMaterial.density_kg_dm3).toFixed(3)} kg
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fasi + riepilogo costi affiancati */}
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          <PhaseEditor
            partId={part.id}
            phases={part.phases}
            quantity={part.quantity}
            machines={machines}
            suppliers={suppliers}
            templates={templates}
            onChange={onPhasesChange}
          />
        </div>

        {/* Riepilogo costi (sticky) */}
        <div className="w-52 shrink-0 sticky top-4">
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4 pb-4">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Materiale</span>
                  <span>{part.material_cost.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Lavorazioni</span>
                  <span>{phaseCost.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between font-medium border-t border-blue-200 pt-1.5 mt-1.5">
                  <span>Costo totale</span>
                  <span>{part.total_cost.toFixed(2)} €</span>
                </div>

                <div className="border-t border-blue-200 pt-2.5 mt-2.5 space-y-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Margine (%)</label>
                    <Input type="number" min={0} max={500} step={1} className="h-7 w-full text-xs mt-0.5"
                      value={part.margin_percent ?? globalMarginPercent}
                      onChange={e => onUpdate({ margin_percent: parseFloat(e.target.value) || 0 })}
                      onBlur={onSave} />
                    <p className="text-[10px] text-gray-400 mt-0.5">default: {globalMarginPercent}%</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Prezzo minimo (€)</label>
                    <Input type="number" min={0} step={1} className="h-7 w-full text-xs mt-0.5"
                      value={part.minimum_price ?? ''}
                      placeholder="—"
                      onChange={e => onUpdate({
                        minimum_price: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                      })}
                      onBlur={onSave} />
                    {part.minimum_price && part.total_cost < part.minimum_price && (
                      <p className="text-[10px] text-amber-600 mt-0.5">⚠ minimo attivo</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-blue-200 pt-2.5 mt-2.5 space-y-1">
                  <div className="flex justify-between font-medium">
                    <span>Unitario</span>
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
    </div>
  )
}
