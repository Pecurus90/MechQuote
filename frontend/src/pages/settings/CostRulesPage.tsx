import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'

interface CostRule {
  id: number
  key: string
  value: string
  description: string
}

export default function CostRulesPage() {
  const [rules, setRules] = useState<CostRule[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = () => {
    api.get('/cost-rules').then(res => {
      setRules(res.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew: boolean = false) => {
    setEditingId(isNew ? 0 : null)
    setKey('')
    setValue('')
    setDescription('')
  }

  const startEdit = (r: CostRule) => {
    setEditingId(r.id)
    setKey(r.key)
    setValue(r.value || '')
    setDescription(r.description || '')
  }

  const handleSave = async () => {
    const payload = { key, value, description }
    try {
      if (editingId && editingId > 0) {
        await api.put(`/cost-rules/${editingId}`, payload)
      } else {
        await api.post('/cost-rules', payload)
      }
      resetForm()
      loadData()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questa regola?')) return
    try {
      await api.delete(`/cost-rules/${id}`)
      loadData()
    } catch (e) { console.error(e) }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Regole di Costo</h1>
        <Button onClick={() => resetForm(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuova
        </Button>
      </div>

      {loading ? <p>Caricamento...</p> : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Chiave</th>
                  <th className="text-left p-3">Valore</th>
                  <th className="text-left p-3">Descrizione</th>
                  <th className="text-center p-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{r.key}</td>
                    <td className="p-3">{r.value || '-'}</td>
                    <td className="p-3">{r.description || '-'}</td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEdit(r)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-1 hover:bg-red-50 rounded">
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
                <CardTitle>{editingId && editingId > 0 ? 'Modifica' : 'Nuova'} Regola</CardTitle>
                <button onClick={() => resetForm()} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Chiave</label>
                  <Input value={key} onChange={e => setKey(e.target.value)} placeholder="Es. default_margin" />
                </div>
                <div>
                  <label className="text-sm font-medium">Valore</label>
                  <Input value={value} onChange={e => setValue(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Descrizione</label>
                  <Input value={description} onChange={e => setDescription(e.target.value)} />
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
