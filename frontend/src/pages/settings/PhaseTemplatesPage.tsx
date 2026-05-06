import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'

interface PhaseTemplate {
  id: number
  name: string
  phase_type: string
  default_machine_id: number | null
  default_supplier_id: number | null
  setup_hours: number
  cycle_hours_per_part: number
  fixed_cost: number
  variable_cost_per_part: number
  customer_visible: boolean
  is_shared: boolean
  notes: string
}

interface Machine {
  id: number
  name: string
}

interface Supplier {
  id: number
  name: string
}

export default function PhaseTemplatesPage() {
  const [templates, setTemplates] = useState<PhaseTemplate[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [phaseType, setPhaseType] = useState('')
  const [machineId, setMachineId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [setupHours, setSetupHours] = useState('0')
  const [cycleHours, setCycleHours] = useState('0')
  const [fixedCost, setFixedCost] = useState('0')
  const [variableCost, setVariableCost] = useState('0')
  const [customerVisible, setCustomerVisible] = useState(true)
  const [isShared, setIsShared] = useState(false)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = () => {
    Promise.all([
      api.get('/phase-templates'),
      api.get('/machines'),
      api.get('/suppliers'),
    ]).then(([tRes, mRes, sRes]) => {
      setTemplates(tRes.data)
      setMachines(mRes.data)
      setSuppliers(sRes.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew: boolean = false) => {
    setEditingId(isNew ? 0 : null)
    setName('')
    setPhaseType('')
    setMachineId('')
    setSupplierId('')
    setSetupHours('0')
    setCycleHours('0')
    setFixedCost('0')
    setVariableCost('0')
    setCustomerVisible(true)
    setIsShared(false)
    setNotes('')
  }

  const startEdit = (t: PhaseTemplate) => {
    setEditingId(t.id)
    setName(t.name)
    setPhaseType(t.phase_type)
    setMachineId(t.default_machine_id ? String(t.default_machine_id) : '')
    setSupplierId(t.default_supplier_id ? String(t.default_supplier_id) : '')
    setSetupHours(String(t.setup_hours || 0))
    setCycleHours(String(t.cycle_hours_per_part || 0))
    setFixedCost(String(t.fixed_cost || 0))
    setVariableCost(String(t.variable_cost_per_part || 0))
    setCustomerVisible(t.customer_visible)
    setIsShared(t.is_shared ?? false)
    setNotes(t.notes || '')
  }

  const handleSave = async () => {
    const payload = {
      name,
      phase_type: phaseType,
      default_machine_id: machineId ? Number(machineId) : null,
      default_supplier_id: supplierId ? Number(supplierId) : null,
      setup_hours: Number(setupHours),
      cycle_hours_per_part: Number(cycleHours),
      fixed_cost: Number(fixedCost),
      variable_cost_per_part: Number(variableCost),
      customer_visible: customerVisible,
      is_shared: isShared,
      notes,
    }
    try {
      if (editingId && editingId > 0) {
        await api.put(`/phase-templates/${editingId}`, payload)
      } else {
        await api.post('/phase-templates', payload)
      }
      resetForm()
      loadData()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo template?')) return
    try {
      await api.delete(`/phase-templates/${id}`)
      loadData()
    } catch (e) { console.error(e) }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Template Fasi</h1>
        <Button onClick={() => resetForm(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuovo
        </Button>
      </div>

      {loading ? <p>Caricamento...</p> : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Nome</th>
                  <th className="text-left p-3">Tipo Fase</th>
                  <th className="text-right p-3">Setup (h)</th>
                  <th className="text-right p-3">Ciclo (h)</th>
                  <th className="text-center p-3">Visibile</th>
                  <th className="text-center p-3">Condivisa</th>
                  <th className="text-center p-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3">{t.phase_type}</td>
                    <td className="p-3 text-right">{t.setup_hours}</td>
                    <td className="p-3 text-right">{t.cycle_hours_per_part}</td>
                    <td className="p-3 text-center">{t.customer_visible ? 'Sì' : 'No'}</td>
                    <td className="p-3 text-center">
                      {t.is_shared ? <span className="text-indigo-600 text-xs font-medium">↗ Sì</span> : <span className="text-gray-400 text-xs">No</span>}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEdit(t)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => handleDelete(t.id)} className="p-1 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {editingId !== null && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl bg-white shadow-xl">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{editingId && editingId > 0 ? 'Modifica' : 'Nuovo'} Template</CardTitle>
                <button onClick={() => resetForm()} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Nome</label>
                  <Input value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo Fase</label>
                  <Input value={phaseType} onChange={e => setPhaseType(e.target.value)} placeholder="Es. Fresatura, Tornitura" />
                </div>
                <div>
                  <label className="text-sm font-medium">Macchina</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={machineId}
                    onChange={e => setMachineId(e.target.value)}
                  >
                    <option value="">Seleziona...</option>
                    {machines.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Fornitore</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                  >
                    <option value="">Seleziona...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Setup (ore)</label>
                  <Input type="number" step="0.1" value={setupHours} onChange={e => setSetupHours(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Ciclo (ore/pezzo)</label>
                  <Input type="number" step="0.01" value={cycleHours} onChange={e => setCycleHours(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo Fisso (€)</label>
                  <Input type="number" step="0.01" value={fixedCost} onChange={e => setFixedCost(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo Variabile (€/pezzo)</label>
                  <Input type="number" step="0.01" value={variableCost} onChange={e => setVariableCost(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Note</label>
                  <Input value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={customerVisible} onChange={e => setCustomerVisible(e.target.checked)} />
                  <label className="text-sm">Visibile al cliente</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} />
                  <label className="text-sm">Condivisa (setup/fisso ÷ n° parti commessa)</label>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Salva</Button>
                <Button variant="outline" onClick={() => resetForm()}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
