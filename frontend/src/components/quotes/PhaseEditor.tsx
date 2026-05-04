import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import api from '@/lib/api'

const PHASE_TYPES = [
  { value: 'raw_material_cutting', label: 'Taglio materiale grezzo' },
  { value: 'cnc_milling', label: 'Fresatura CNC' },
  { value: 'cnc_turning', label: 'Tornitura CNC' },
  { value: 'drilling', label: 'Foratura' },
  { value: 'tapping', label: 'Maschiatura' },
  { value: 'wire_edm', label: 'EDM a filo' },
  { value: 'sinker_edm', label: 'EDM a tuffo' },
  { value: 'grinding', label: 'Rettifica' },
  { value: 'manual_operation', label: 'Operazione manuale' },
  { value: 'heat_treatment', label: 'Trattamento termico' },
  { value: 'surface_treatment', label: 'Trattamento superficiale' },
  { value: 'quality_control', label: 'Controllo qualità' },
  { value: 'external_supplier', label: 'Fornitore esterno' },
  { value: 'packaging', label: 'Imballaggio' },
  { value: 'transport', label: 'Trasporto' },
  { value: 'custom_extra', label: 'Extra personalizzato' },
]

interface Phase {
  id?: number
  sequence_number: number
  phase_type: string
  description: string
  machine_id?: number
  setup_hours: number
  cycle_hours_per_part: number
  fixed_cost: number
  calculated_cost: number
  customer_visible: boolean
}

interface Props {
  partId?: number
  phases: Phase[]
  onChange: (phases: Phase[]) => void
}

export default function PhaseEditor({ partId, phases, onChange }: Props) {
  const [machines, setMachines] = useState<any[]>([])
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  useEffect(() => {
    api.get('/machines').then(res => setMachines(res.data)).catch(() => {})
  }, [])

  const addPhase = async () => {
    const newPhase: Phase = {
      sequence_number: (phases.length + 1) * 10,
      phase_type: 'cnc_milling',
      description: '',
      setup_hours: 0.5,
      cycle_hours_per_part: 0.25,
      fixed_cost: 0,
      calculated_cost: 0,
      customer_visible: true,
    }

    if (partId) {
      try {
        const res = await api.post(`/parts/${partId}/phases`, newPhase)
        onChange([...phases, res.data])
      } catch (e) { console.error(e) }
    } else {
      onChange([...phases, newPhase])
    }
  }

  const removePhase = async (idx: number) => {
    const phase = phases[idx]
    if (phase.id) {
      try { await api.delete(`/phases/${phase.id}`) } catch (e) { console.error(e) }
    }
    onChange(phases.filter((_, i) => i !== idx))
  }

  const updatePhase = (idx: number, field: string, value: any) => {
    const updated = phases.map((p, i) => i === idx ? { ...p, [field]: value } : p)
    onChange(updated)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Ciclo di Lavorazione</CardTitle>
          <Button size="sm" onClick={addPhase}>
            <Plus className="w-4 h-4 mr-1" /> Aggiungi Fase
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {phases.map((phase, idx) => (
            <div key={idx} className="border rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-2 p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              >
                <GripVertical className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-mono w-8">{phase.sequence_number}</span>
                <span className="flex-1 text-sm">
                  {PHASE_TYPES.find(t => t.value === phase.phase_type)?.label || phase.phase_type}
                </span>
                <span className="text-sm font-medium">{phase.calculated_cost?.toFixed(2)} €</span>
                <button onClick={(e) => { e.stopPropagation(); removePhase(idx) }} className="p-1 hover:bg-red-50 rounded">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
                {expandedIdx === idx ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>

              {expandedIdx === idx && (
                <div className="p-4 border-t space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium">Tipo Fase</label>
                      <select
                        className="flex h-9 w-full rounded-md border px-3 text-sm"
                        value={phase.phase_type}
                        onChange={e => updatePhase(idx, 'phase_type', e.target.value)}
                      >
                        {PHASE_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Macchina</label>
                      <select
                        className="flex h-9 w-full rounded-md border px-3 text-sm"
                        value={phase.machine_id || ''}
                        onChange={e => updatePhase(idx, 'machine_id', Number(e.target.value) || undefined)}
                      >
                        <option value="">Nessuna</option>
                        {machines.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Descrizione</label>
                      <Input
                        value={phase.description}
                        onChange={e => updatePhase(idx, 'description', e.target.value)}
                        placeholder="Descrizione fase"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Ore Setup</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={phase.setup_hours}
                        onChange={e => updatePhase(idx, 'setup_hours', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Ore Ciclo per Parte</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={phase.cycle_hours_per_part}
                        onChange={e => updatePhase(idx, 'cycle_hours_per_part', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Costo Fisso (€)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={phase.fixed_cost}
                        onChange={e => updatePhase(idx, 'fixed_cost', Number(e.target.value))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={phase.customer_visible}
                        onChange={e => updatePhase(idx, 'customer_visible', e.target.checked)}
                      />
                      <label className="text-xs">Visibile al cliente</label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {phases.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              Nessuna fase. Clicca "Aggiungi Fase" per iniziare.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
