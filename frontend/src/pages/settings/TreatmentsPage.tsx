import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'

interface Treatment {
  id: number
  name: string
  treatment_type: string
  fixed_cost: number
  cost_per_kg: number
  cost_per_part: number
  cost_per_surface_area: number
  minimum_cost: number
  supplier_id: number | null
  supplier_name?: string
  active: boolean
  notes: string
}

interface Supplier {
  id: number
  name: string
}

export default function TreatmentsPage() {
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [treatmentType, setTreatmentType] = useState('')
  const [fixedCost, setFixedCost] = useState('0')
  const [costPerKg, setCostPerKg] = useState('0')
  const [costPerPart, setCostPerPart] = useState('0')
  const [costPerSurface, setCostPerSurface] = useState('0')
  const [minimumCost, setMinimumCost] = useState('0')
  const [supplierId, setSupplierId] = useState('')
  const [active, setActive] = useState(true)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = () => {
    Promise.all([
      api.get('/treatments'),
      api.get('/suppliers'),
    ]).then(([treatRes, supRes]) => {
      const supMap = new Map(supRes.data.map((s: Supplier) => [s.id, s.name]))
      const treatmentsWithSupplier = treatRes.data.map((t: Treatment) => ({
        ...t,
        supplier_name: t.supplier_id ? supMap.get(t.supplier_id) || '-' : '-',
      }))
      setTreatments(treatmentsWithSupplier)
      setSuppliers(supRes.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew: boolean = false) => {
    setEditingId(isNew ? 0 : null)
    setName('')
    setTreatmentType('')
    setFixedCost('0')
    setCostPerKg('0')
    setCostPerPart('0')
    setCostPerSurface('0')
    setMinimumCost('0')
    setSupplierId('')
    setActive(true)
    setNotes('')
  }

  const startEdit = (t: Treatment) => {
    setEditingId(t.id)
    setName(t.name)
    setTreatmentType(t.treatment_type || '')
    setFixedCost(String(t.fixed_cost || 0))
    setCostPerKg(String(t.cost_per_kg || 0))
    setCostPerPart(String(t.cost_per_part || 0))
    setCostPerSurface(String(t.cost_per_surface_area || 0))
    setMinimumCost(String(t.minimum_cost || 0))
    setSupplierId(t.supplier_id ? String(t.supplier_id) : '')
    setActive(t.active)
    setNotes(t.notes || '')
  }

  const handleSave = async () => {
    const payload = {
      name,
      treatment_type: treatmentType,
      fixed_cost: Number(fixedCost),
      cost_per_kg: Number(costPerKg),
      cost_per_part: Number(costPerPart),
      cost_per_surface_area: Number(costPerSurface),
      minimum_cost: Number(minimumCost),
      supplier_id: supplierId ? Number(supplierId) : null,
      active,
      notes,
    }
    try {
      if (editingId && editingId > 0) {
        await api.put(`/treatments/${editingId}`, payload)
      } else {
        await api.post('/treatments', payload)
      }
      resetForm()
      loadData()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo trattamento?')) return
    try {
      await api.delete(`/treatments/${id}`)
      loadData()
    } catch (e) { console.error(e) }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Trattamenti</h1>
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
                  <th className="text-right p-3">Costo Fisso</th>
                  <th className="text-left p-3">Fornitore</th>
                  <th className="text-center p-3">Attivo</th>
                  <th className="text-center p-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {treatments.map(t => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3">{t.treatment_type || '-'}</td>
                    <td className="p-3 text-right">{t.fixed_cost} €</td>
                    <td className="p-3">{t.supplier_name || '-'}</td>
                    <td className="p-3 text-center">{t.active ? 'Sì' : 'No'}</td>
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
                <CardTitle>{editingId && editingId > 0 ? 'Modifica' : 'Nuovo'} Trattamento</CardTitle>
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
                  <label className="text-sm font-medium">Tipo</label>
                  <Input value={treatmentType} onChange={e => setTreatmentType(e.target.value)} placeholder="Es. Zincatura, Anodizzazione" />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo Fisso (€)</label>
                  <Input type="number" step="0.01" value={fixedCost} onChange={e => setFixedCost(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo per kg (€)</label>
                  <Input type="number" step="0.01" value={costPerKg} onChange={e => setCostPerKg(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo per parte (€)</label>
                  <Input type="number" step="0.01" value={costPerPart} onChange={e => setCostPerPart(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo minimo (€)</label>
                  <Input type="number" step="0.01" value={minimumCost} onChange={e => setMinimumCost(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Fornitore</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                  >
                    <option value="">Seleziona fornitore...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Note</label>
                  <Input value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                  <label className="text-sm">Attivo</label>
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
