import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import api from '@/lib/api'
import { Plus, Pencil, Trash2, Check, X, Search } from 'lucide-react'
import { toast } from 'sonner'

interface Category {
  id: number
  code: string
  name: string
  active: boolean
  sort_order: number
}

interface EditRow { code: string; name: string; sort_order: number }

export default function QuoteCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<EditRow>({ code: '', name: '', sort_order: 0 })
  const [newRow, setNewRow] = useState<EditRow>({ code: '', name: '', sort_order: 0 })
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  const load = () => {
    setLoading(true)
    api.get('/quote-categories').then(res => { setCategories(res.data); setLoading(false) })
  }

  const startEdit = (cat: Category) => {
    setEditingId(cat.id)
    setEditRow({ code: cat.code, name: cat.name, sort_order: cat.sort_order })
  }

  const saveEdit = async (id: number) => {
    try {
      await api.put(`/quote-categories/${id}`, editRow)
      toast.success('Categoria salvata')
      setEditingId(null); load()
    } catch (e) {toast.error('Errore nel salvataggio') }
  }

  const deleteCategory = async (id: number) => {
    if (!confirm('Eliminare questa categoria?')) return
    try {
      await api.delete(`/quote-categories/${id}`)
      toast.success('Categoria eliminata'); load()
    } catch (e) {toast.error('Errore nell\'eliminazione') }
  }

  const createCategory = async () => {
    if (!newRow.code || !newRow.name) return
    try {
      await api.post('/quote-categories', newRow)
      toast.success('Categoria creata')
      setNewRow({ code: '', name: '', sort_order: 0 }); setShowNew(false); load()
    } catch (e) {toast.error('Errore nella creazione') }
  }

  const visible = categories.filter(c =>
    !search || c.code.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categorie Preventivo</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            La lettera appare nel codice preventivo (es. 240-26<strong>A</strong>_001)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-40" />
          </div>
          <Button size="sm" onClick={() => setShowNew(true)} disabled={showNew}>
            <Plus className="w-4 h-4 mr-1" /> Nuova
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 w-[18%] font-medium text-gray-600">Codice</th>
                <th className="text-left p-3 font-medium text-gray-600">Descrizione</th>
                <th className="text-center p-3 w-[18%] font-medium text-gray-600">Ordine</th>
                <th className="text-center p-3 w-[18%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-4 text-center text-gray-400">Caricamento...</td></tr>
              ) : (
                <>
                  {visible.map(cat => (
                    <tr key={cat.id} className="border-b hover:bg-gray-50">
                      {editingId === cat.id ? (
                        <>
                          <td className="p-2">
                            <Input className="h-8 text-sm font-mono" value={editRow.code} maxLength={5}
                              onChange={e => setEditRow(r => ({ ...r, code: e.target.value.toUpperCase() }))} />
                          </td>
                          <td className="p-2">
                            <Input className="h-8 text-sm" value={editRow.name}
                              onChange={e => setEditRow(r => ({ ...r, name: e.target.value }))} />
                          </td>
                          <td className="p-2 text-center">
                            <Input type="number" className="h-8 text-sm w-16 mx-auto" value={editRow.sort_order}
                              onChange={e => setEditRow(r => ({ ...r, sort_order: parseInt(e.target.value) || 0 }))} />
                          </td>
                          <td className="p-2 text-center">
                            <button onClick={() => saveEdit(cat.id)} className="p-1 text-green-600 hover:bg-green-50 rounded mr-1">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 font-mono font-bold text-blue-700">{cat.code}</td>
                          <td className="p-3">{cat.name}</td>
                          <td className="p-3 text-center text-gray-400">{cat.sort_order}</td>
                          <td className="p-3 text-center">
                            <div className="flex gap-2 justify-center">
                              <button onClick={() => startEdit(cat)} className="p-1 hover:bg-gray-100 rounded">
                                <Pencil className="w-4 h-4 text-blue-600" />
                              </button>
                              <button onClick={() => deleteCategory(cat.id)} className="p-1 hover:bg-red-50 rounded">
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}

                  {showNew && (
                    <tr className="border-b bg-blue-50">
                      <td className="p-2">
                        <Input className="h-8 text-sm font-mono" placeholder="H" maxLength={5}
                          value={newRow.code} onChange={e => setNewRow(r => ({ ...r, code: e.target.value.toUpperCase() }))} autoFocus />
                      </td>
                      <td className="p-2">
                        <Input className="h-8 text-sm" placeholder="Nome categoria" value={newRow.name}
                          onChange={e => setNewRow(r => ({ ...r, name: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && createCategory()} />
                      </td>
                      <td className="p-2 text-center">
                        <Input type="number" className="h-8 text-sm w-16 mx-auto" value={newRow.sort_order}
                          onChange={e => setNewRow(r => ({ ...r, sort_order: parseInt(e.target.value) || 0 }))} />
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={createCategory} className="p-1 text-green-600 hover:bg-green-100 rounded mr-1">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setShowNew(false); setNewRow({ code: '', name: '', sort_order: 0 }) }}
                          className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )}

                  {visible.length === 0 && !showNew && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-400">Nessuna categoria trovata.</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
