import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'

interface Material {
  id: number
  name: string
  family: string
  density_kg_dm3: number
  cost_per_kg: number
  edm_coefficient: number
  cnc_machinability_coefficient: number
  default_scrap_percent: number
  active: boolean
}

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState<Partial<Material>>({})
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    api.get('/materials').then(res => {
      setMaterials(res.data)
      setLoading(false)
    })
  }

  useEffect(() => { fetchData() }, [])

  const handleSave = async () => {
    try {
      if (editing?.id) {
        await api.put(`/materials/${editing.id}`, form)
      } else {
        await api.post('/materials', form)
      }
      setEditing(null)
      setForm({})
      fetchData()
    } catch (e) { console.error(e) }
  }

  const handleEdit = (m: Material) => {
    setEditing(m)
    setForm(m)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo materiale?')) return
    try {
      await api.delete(`/materials/${id}`)
      fetchData()
    } catch (e) { console.error(e) }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Materials</h1>
        <Button onClick={() => { setEditing({} as Material); setForm({ active: true }) }}>
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
                  <th className="text-left p-3">Famiglia</th>
                  <th className="text-right p-3">Densità</th>
                  <th className="text-right p-3">Costo €/kg</th>
                  <th className="text-right p-3">EDM Coeff</th>
                  <th className="text-right p-3">CNC Coeff</th>
                  <th className="text-right p-3">Scrap %</th>
                  <th className="text-center p-3">Stato</th>
                  <th className="text-center p-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {materials.map(m => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{m.name}</td>
                    <td className="p-3">{m.family}</td>
                    <td className="p-3 text-right">{m.density_kg_dm3}</td>
                    <td className="p-3 text-right">{m.cost_per_kg}</td>
                    <td className="p-3 text-right">{m.edm_coefficient}</td>
                    <td className="p-3 text-right">{m.cnc_machinability_coefficient}</td>
                    <td className="p-3 text-right">{m.default_scrap_percent}%</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${m.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {m.active ? 'Attivo' : 'Inattivo'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => handleEdit(m)} className="p-1 hover:bg-gray-100 rounded">
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

      {editing !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{editing.id ? 'Modifica' : 'Nuovo'} Materiale</CardTitle>
                <button onClick={() => { setEditing(null); setForm({}) }} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Nome</label>
                  <Input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div>
                  <label className="text-sm font-medium">Famiglia</label>
                  <Input value={form.family || ''} onChange={e => setForm({...form, family: e.target.value})} />
                </div>
                <div>
                  <label className="text-sm font-medium">Densità (kg/dm³)</label>
                  <Input type="number" step="0.01" value={form.density_kg_dm3 || ''} onChange={e => setForm({...form, density_kg_dm3: Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo (€/kg)</label>
                  <Input type="number" step="0.01" value={form.cost_per_kg || ''} onChange={e => setForm({...form, cost_per_kg: Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm font-medium">EDM Coefficient</label>
                  <Input type="number" step="0.1" value={form.edm_coefficient || ''} onChange={e => setForm({...form, edm_coefficient: Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm font-medium">CNC Machinability</label>
                  <Input type="number" step="0.1" value={form.cnc_machinability_coefficient || ''} onChange={e => setForm({...form, cnc_machinability_coefficient: Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Scrap %</label>
                  <Input type="number" step="0.1" value={form.default_scrap_percent || ''} onChange={e => setForm({...form, default_scrap_percent: Number(e.target.value))} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={form.active ?? true} onChange={e => setForm({...form, active: e.target.checked})} />
                  <label className="text-sm">Attivo</label>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Salva</Button>
                <Button variant="outline" onClick={() => { setEditing(null); setForm({}) }}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
