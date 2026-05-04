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
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [family, setFamily] = useState('')
  const [density, setDensity] = useState('')
  const [cost, setCost] = useState('')
  const [edm, setEdm] = useState('1.0')
  const [cnc, setCnc] = useState('1.0')
  const [scrap, setScrap] = useState('10')
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(true)

  const loadData = () => {
    api.get('/materials').then(res => {
      setMaterials(res.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setFamily('')
    setDensity('')
    setCost('')
    setEdm('1.0')
    setCnc('1.0')
    setScrap('10')
    setActive(true)
  }

  const startEdit = (m: Material) => {
    setEditingId(m.id)
    setName(m.name)
    setFamily(m.family)
    setDensity(String(m.density_kg_dm3))
    setCost(String(m.cost_per_kg))
    setEdm(String(m.edm_coefficient))
    setCnc(String(m.cnc_machinability_coefficient))
    setScrap(String(m.default_scrap_percent))
    setActive(m.active)
  }

  const handleSave = async () => {
    const payload = {
      name,
      family,
      density_kg_dm3: Number(density),
      cost_per_kg: Number(cost),
      edm_coefficient: Number(edm),
      cnc_machinability_coefficient: Number(cnc),
      default_scrap_percent: Number(scrap),
      active,
    }
    try {
      if (editingId) {
        await api.put(`/materials/${editingId}`, payload)
      } else {
        await api.post('/materials', payload)
      }
      resetForm()
      loadData()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo materiale?')) return
    try {
      await api.delete(`/materials/${id}`)
      loadData()
    } catch (e) { console.error(e) }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Materials</h1>
        <Button onClick={() => resetForm()}>
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
                <CardTitle>{editingId ? 'Modifica' : 'Nuovo'} Materiale</CardTitle>
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
                  <label className="text-sm font-medium">Famiglia</label>
                  <Input value={family} onChange={e => setFamily(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Densità</label>
                  <Input type="number" step="0.01" value={density} onChange={e => setDensity(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo €/kg</label>
                  <Input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">EDM Coeff</label>
                  <Input type="number" step="0.1" value={edm} onChange={e => setEdm(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">CNC Coeff</label>
                  <Input type="number" step="0.1" value={cnc} onChange={e => setCnc(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Scrap %</label>
                  <Input type="number" step="0.1" value={scrap} onChange={e => setScrap(e.target.value)} />
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
