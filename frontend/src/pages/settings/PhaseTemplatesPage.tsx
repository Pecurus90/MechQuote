import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search } from 'lucide-react'
import api from '@/lib/api'
import type { PhaseTemplate, Machine, Supplier } from '@/types'
import { toast } from 'sonner'

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
  const [search, setSearch] = useState('')

  const loadData = () => {
    Promise.all([api.get('/phase-templates'), api.get('/machines'), api.get('/suppliers')]).then(([tRes, mRes, sRes]) => {
      setTemplates(tRes.data)
      setMachines(mRes.data)
      setSuppliers(sRes.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew = false) => {
    setEditingId(isNew ? 0 : null)
    setName(''); setPhaseType(''); setMachineId(''); setSupplierId('')
    setSetupHours('0'); setCycleHours('0'); setFixedCost('0'); setVariableCost('0')
    setCustomerVisible(true); setIsShared(false); setNotes('')
  }

  const startEdit = (t: PhaseTemplate) => {
    setEditingId(t.id); setName(t.name); setPhaseType(t.phase_type)
    setMachineId(t.default_machine_id ? String(t.default_machine_id) : '')
    setSupplierId(t.default_supplier_id ? String(t.default_supplier_id) : '')
    setSetupHours(String(t.setup_hours || 0)); setCycleHours(String(t.cycle_hours_per_part || 0))
    setFixedCost(String(t.fixed_cost || 0)); setVariableCost(String(t.variable_cost_per_part || 0))
    setCustomerVisible(t.customer_visible); setIsShared(t.is_shared ?? false); setNotes(t.notes || '')
  }

  const handleSave = async () => {
    const payload = {
      name, phase_type: phaseType,
      default_machine_id: machineId ? Number(machineId) : null,
      default_supplier_id: supplierId ? Number(supplierId) : null,
      setup_hours: Number(setupHours), cycle_hours_per_part: Number(cycleHours),
      fixed_cost: Number(fixedCost), variable_cost_per_part: Number(variableCost),
      customer_visible: customerVisible, is_shared: isShared, notes,
    }
    try {
      if (editingId && editingId > 0) await api.put(`/phase-templates/${editingId}`, payload)
      else await api.post('/phase-templates', payload)
      toast.success('Template salvato')
      resetForm(); loadData()
    } catch (e) {toast.error('Errore nel salvataggio') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo template?')) return
    try { await api.delete(`/phase-templates/${id}`); toast.success('Template eliminato'); loadData() } catch (e) {toast.error('Errore nell\'eliminazione') }
  }

  const visible = [...templates]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.phase_type || '').toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Template Fasi</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-48" />
          </div>
          <Button size="sm" onClick={() => resetForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuovo
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b">
              <tr>
                <th className="text-left p-3 w-[26%] font-medium text-gray-600 dark:text-gray-300">Nome</th>
                <th className="text-left p-3 w-[20%] font-medium text-gray-600 dark:text-gray-300">Tipo Fase</th>
                <th className="text-right p-3 w-[11%] font-medium text-gray-600 dark:text-gray-300">Setup (h)</th>
                <th className="text-right p-3 w-[11%] font-medium text-gray-600 dark:text-gray-300">Ciclo (h)</th>
                <th className="text-center p-3 w-[10%] font-medium text-gray-600 dark:text-gray-300">Visibile</th>
                <th className="text-center p-3 w-[12%] font-medium text-gray-600 dark:text-gray-300">Condivisa</th>
                <th className="text-center p-3 w-[10%] font-medium text-gray-600 dark:text-gray-300">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-gray-400">Nessun template trovato.</td></tr>
              )}
              {visible.map(t => (
                <tr key={t.id} className="border-b hover:bg-gray-50 dark:bg-gray-900">
                  <td className="p-3 font-medium truncate">{t.name}</td>
                  <td className="p-3 truncate">{t.phase_type}</td>
                  <td className="p-3 text-right">{t.setup_hours}</td>
                  <td className="p-3 text-right">{t.cycle_hours_per_part}</td>
                  <td className="p-3 text-center">{t.customer_visible ? 'Sì' : 'No'}</td>
                  <td className="p-3 text-center">
                    {t.is_shared ? <span className="text-indigo-600 text-xs font-medium">↗ Sì</span> : <span className="text-gray-400 text-xs">No</span>}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => startEdit(t)} className="p-1 hover:bg-gray-100 dark:bg-gray-700 rounded">
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

      {editingId !== null && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{editingId > 0 ? 'Modifica' : 'Nuovo'} Template</h3>
              <button onClick={() => resetForm()} className="p-1 hover:bg-gray-100 dark:bg-gray-700 rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4">
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
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={machineId} onChange={e => setMachineId(e.target.value)}>
                    <option value="">Seleziona...</option>
                    {[...machines].sort((a, b) => a.name.localeCompare(b.name, 'it')).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Fornitore</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                    <option value="">Seleziona...</option>
                    {[...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'it')).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
