import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
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

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Dati Parte</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600">Codice Parte</label>
              <Input className="mt-1 h-9 font-mono text-sm" value={part.part_code}
                onChange={e => onUpdate({ part_code: e.target.value })}
                onBlur={onSave} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Rev.</label>
              <Input className="mt-1 h-9 text-sm" value={part.revision}
                onChange={e => onUpdate({ revision: e.target.value })}
                onBlur={onSave} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Quantità</label>
              <Input type="number" min={1} className="mt-1 h-9 text-sm"
                value={part.quantity}
                onChange={e => onUpdate({ quantity: parseInt(e.target.value) || 1 })}
                onBlur={onSave} />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="text-xs font-medium text-gray-600">Descrizione</label>
              <Input className="mt-1 h-9 text-sm" value={part.description}
                onChange={e => onUpdate({ description: e.target.value })}
                onBlur={onSave} placeholder="Descrizione del pezzo" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Materiale e Grezzo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600">Materiale</label>
              <select
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={part.material_id || ''}
                onChange={e => handleMaterialChange(Number(e.target.value) || undefined)}
                onBlur={onSave}
              >
                <option value="">Seleziona materiale...</option>
                {materials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.family}) — {m.density_kg_dm3} kg/dm³ — {m.cost_per_kg} €/kg
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">X grezzo (mm)</label>
              <Input type="number" min={0} step={0.1} className="mt-1 h-9 text-sm"
                value={part.raw_x_mm ?? ''}
                onChange={e => handleDimensionChange('raw_x_mm', parseFloat(e.target.value) || 0)}
                onBlur={onSave} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Y grezzo (mm)</label>
              <Input type="number" min={0} step={0.1} className="mt-1 h-9 text-sm"
                value={part.raw_y_mm ?? ''}
                onChange={e => handleDimensionChange('raw_y_mm', parseFloat(e.target.value) || 0)}
                onBlur={onSave} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Z grezzo (mm)</label>
              <Input type="number" min={0} step={0.1} className="mt-1 h-9 text-sm"
                value={part.raw_z_mm ?? ''}
                onChange={e => handleDimensionChange('raw_z_mm', parseFloat(e.target.value) || 0)}
                onBlur={onSave} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Costo materiale (€)</label>
              <Input type="number" min={0} step={0.01} className="mt-1 h-9 text-sm"
                value={part.material_cost}
                onChange={e => onUpdate({ material_cost: parseFloat(e.target.value) || 0 })}
                onBlur={onSave} />
            </div>
            {selectedMaterial && part.raw_x_mm && part.raw_y_mm && part.raw_z_mm && (
              <div className="col-span-2 md:col-span-4">
                <p className="text-xs text-gray-400">
                  Volume: {((part.raw_x_mm * part.raw_y_mm * (part.raw_z_mm || 0)) / 1_000_000).toFixed(4)} dm³ ·
                  Peso grezzo: {(((part.raw_x_mm * part.raw_y_mm * (part.raw_z_mm || 0)) / 1_000_000) * selectedMaterial.density_kg_dm3).toFixed(3)} kg
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <PhaseEditor
        partId={part.id}
        phases={part.phases}
        quantity={part.quantity}
        machines={machines}
        suppliers={suppliers}
        templates={templates}
        onChange={onPhasesChange}
      />

      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <span className="text-gray-600">Costo materiale</span>
            <span className="text-right">{part.material_cost.toFixed(2)} €</span>
            <span className="text-gray-600">Costo lavorazioni</span>
            <span className="text-right">
              {part.phases.reduce((s, p) => s + p.calculated_cost, 0).toFixed(2)} €
            </span>
            <span className="font-medium">Costo totale</span>
            <span className="text-right font-medium">{part.total_cost.toFixed(2)} €</span>

            <div className="col-span-2 border-t border-blue-200 my-1" />

            <div className="flex items-center gap-2">
              <span className="text-gray-600">Margine</span>
              <Input type="number" min={0} max={500} step={1} className="h-7 w-20 text-xs"
                value={part.margin_percent ?? globalMarginPercent}
                onChange={e => onUpdate({ margin_percent: parseFloat(e.target.value) || 0 })}
                onBlur={onSave} />
              <span className="text-xs text-gray-400">%</span>
            </div>
            <span className="text-right text-gray-500 text-xs self-center">
              (default: {globalMarginPercent}%)
            </span>

            <div className="flex items-center gap-2">
              <span className="text-gray-600">Prezzo minimo</span>
              <Input type="number" min={0} step={1} className="h-7 w-24 text-xs"
                value={part.minimum_price ?? ''}
                placeholder="Nessuno"
                onChange={e => onUpdate({
                  minimum_price: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                })}
                onBlur={onSave} />
              <span className="text-xs text-gray-400">€</span>
            </div>
            <span className="text-right text-xs self-center">
              {part.minimum_price && part.total_cost < part.minimum_price
                ? <span className="text-amber-600">⚠ minimo attivo</span>
                : null}
            </span>

            <span className="font-medium">Prezzo unitario</span>
            <span className="text-right font-medium">{part.unit_price.toFixed(2)} €</span>
            <span className="font-bold text-blue-700">Totale × {part.quantity}</span>
            <span className="text-right font-bold text-blue-700 text-lg">
              {part.total_price.toFixed(2)} €
            </span>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
