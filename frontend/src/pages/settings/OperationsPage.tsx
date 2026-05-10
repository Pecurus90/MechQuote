import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Operation } from '@/types'

export default function OperationsPage() {
  const [operations, setOperations] = useState<Operation[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => {
    api.get('/operations').then(r => { setOperations(r.data); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  const reset = (isNew = false) => {
    setEditingId(isNew ? 0 : null)
    setName('')
  }

  const startEdit = (o: Operation) => {
    setEditingId(o.id)
    setName(o.name)
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nome obbligatorio'); return }
    const payload = { name: name.trim() }
    try {
      if (editingId && editingId > 0) await api.put(`/operations/${editingId}`, payload)
      else await api.post('/operations', payload)
      toast.success('Lavorazione salvata')
      reset(); load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Errore nel salvataggio')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questa lavorazione?')) return
    try {
      await api.delete(`/operations/${id}`)
      toast.success('Lavorazione eliminata')
      load()
    } catch {
      toast.error('Errore nell\'eliminazione (controlla che non sia usata in un Template flusso)')
    }
  }

  const visible = [...operations]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Lavorazioni</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            Catalogo libero delle lavorazioni che fai (es. "Fresatura CNC",
            "Tornitura sgrossatura", "EDM a filo", "Sbavatura manuale"…).
            Il sistema parte già con le voci standard, le modifichi/aggiungi
            come vuoi. Il behavior speciale (autocalc EDM) si attiva quando
            assegni alla fase una macchina di tipo Wire EDM, indipendentemente
            dal nome scelto qui.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-48" />
          </div>
          <Button size="sm" onClick={() => reset(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuova
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 w-[80%] font-medium text-gray-600">Nome</th>
                <th className="text-center p-3 w-[20%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={2} className="p-6 text-center text-gray-400">Nessuna lavorazione.</td></tr>
              )}
              {visible.map(o => (
                <tr key={o.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium truncate">{o.name}</td>
                  <td className="p-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => startEdit(o)} className="p-1 hover:bg-gray-100 rounded">
                        <Pencil className="w-4 h-4 text-blue-600" />
                      </button>
                      <button onClick={() => handleDelete(o.id)} className="p-1 hover:bg-red-50 rounded">
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
          <Card className="w-full max-w-md bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{editingId > 0 ? 'Modifica' : 'Nuova'} Lavorazione</h3>
              <button onClick={() => reset()} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="es. Tornitura sgrossatura" autoFocus />
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Salva</Button>
                <Button variant="outline" onClick={() => reset()}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
