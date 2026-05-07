import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search } from 'lucide-react'
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
  const [search, setSearch] = useState('')

  const loadData = () => {
    api.get('/cost-rules').then(res => { setRules(res.data); setLoading(false) })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew = false) => {
    setEditingId(isNew ? 0 : null); setKey(''); setValue(''); setDescription('')
  }

  const startEdit = (r: CostRule) => {
    setEditingId(r.id); setKey(r.key); setValue(r.value || ''); setDescription(r.description || '')
  }

  const handleSave = async () => {
    try {
      if (editingId && editingId > 0) await api.put(`/cost-rules/${editingId}`, { key, value, description })
      else await api.post('/cost-rules', { key, value, description })
      resetForm(); loadData()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questa regola?')) return
    try { await api.delete(`/cost-rules/${id}`); loadData() } catch (e) { console.error(e) }
  }

  const visible = [...rules]
    .sort((a, b) => a.key.localeCompare(b.key, 'it'))
    .filter(r => !search || r.key.toLowerCase().includes(search.toLowerCase()) || (r.description || '').toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Regole di Costo</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-48" />
          </div>
          <Button size="sm" onClick={() => resetForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuova
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 w-[25%] font-medium text-gray-600">Chiave</th>
                <th className="text-left p-3 w-[20%] font-medium text-gray-600">Valore</th>
                <th className="text-left p-3 w-[43%] font-medium text-gray-600">Descrizione</th>
                <th className="text-center p-3 w-[12%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-gray-400">Nessuna regola trovata.</td></tr>
              )}
              {visible.map(r => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium font-mono truncate">{r.key}</td>
                  <td className="p-3 truncate">{r.value || '—'}</td>
                  <td className="p-3 text-gray-500 truncate">{r.description || '—'}</td>
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

      {editingId !== null && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{editingId > 0 ? 'Modifica' : 'Nuova'} Regola</h3>
              <button onClick={() => resetForm()} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Chiave</label>
                  <Input value={key} onChange={e => setKey(e.target.value)} placeholder="Es. default_margin" className="font-mono" />
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
