import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'

const MACHINE_TYPES = [
  { value: 'cnc_3_axis', label: 'CNC 3 assi' },
  { value: 'cnc_5_axis', label: 'CNC 5 assi' },
  { value: 'turning', label: 'Tornio' },
  { value: 'wire_edm', label: 'EDM filo' },
  { value: 'sinker_edm', label: 'EDM a tuffo' },
  { value: 'grinding', label: 'Rettifica' },
  { value: 'manual', label: 'Manuale' },
  { value: 'inspection', label: 'Controllo' },
]

interface Machine {
  id: number
  name: string
  machine_type: string
  hourly_rate: number
  setup_minimum_hours: number
  active: boolean
}

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [mtype, setMtype] = useState('')
  const [rate, setRate] = useState('')
  const [setup, setSetup] = useState('')
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(true)

  const loadData = () => {
    api.get('/machines').then(res => {
      setMachines(res.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew: boolean = false) => {
    setEditingId(isNew ? 0 : null)
    setName('')
    setMtype('')
    setRate('')
    setSetup('')
    setActive(true)
  }

  const startEdit = (m: Machine) => {
    setEditingId(m.id)
    setName(m.name)
    setMtype(m.machine_type)
    setRate(String(m.hourly_rate))
    setSetup(String(m.setup_minimum_hours))
    setActive(m.active)
  }

  const handleSave = async () => {
    const payload = {
      name,
      machine_type: mtype,
      hourly_rate: Number(rate),
      setup_minimum_hours: Number(setup),
      active,
    }
    try {
      if (editingId && editingId > 0) {
        await api.put(`/machines/${editingId}`, payload)
      } else {
        await api.post('/machines', payload)
      }
      resetForm()
      loadData()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questa macchina?')) return
    try {
      await api.delete(`/machines/${id}`)
      loadData()
    } catch (e) { console.error(e) }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Macchine</h1>
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
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-right p-3">Tariffa €/h</th>
                  <th className="text-center p-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {machines.map(m => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{m.name}</td>
                    <td className="p-3">{MACHINE_TYPES.find(t => t.value === m.machine_type)?.label || m.machine_type}</td>
                    <td className="p-3 text-right">{m.hourly_rate}</td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEdit(m)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => handleDelete(m.id)} className="p-1 hover:bg-red-50 rounded">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{editingId ? 'Modifica' : 'Nuovo'} Macchina</CardTitle>
                <button onClick={resetForm} className="p-1 hover:bg-gray-100 rounded">
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
                  <label className="text-sm font-medium">Tipo</label>
                  <select
                    className="flex h-10 w-full rounded-md border px-3 text-sm"
                    value={mtype}
                    onChange={e => setMtype(e.target.value)}
                  >
                    <option value="">Seleziona...</option>
                    {MACHINE_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Tariffa €/ora</label>
                  <Input type="number" step="0.1" value={rate} onChange={e => setRate(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Setup minimo (h)</label>
                  <Input type="number" step="0.1" value={setup} onChange={e => setSetup(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                  <label className="text-sm">Attivo</label>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Salva</Button>
                <Button variant="outline" onClick={resetForm}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
