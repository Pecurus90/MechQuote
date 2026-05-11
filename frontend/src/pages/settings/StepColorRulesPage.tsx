import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import type { StepColorRule } from '@/types'

export default function StepColorRulesPage() {
  const [rules, setRules] = useState<StepColorRule[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [colorHex, setColorHex] = useState('#000000')
  const [colorName, setColorName] = useState('')
  const [meaning, setMeaning] = useState('')
  const [phaseType, setPhaseType] = useState('')
  const [complexity, setComplexity] = useState('1.0')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  useEscapeKey(() => setEditingId(null), editingId !== null)

  const loadData = () => {
    api.get('/step-color-rules').then(res => { setRules(res.data); setLoading(false) })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew = false) => {
    setEditingId(isNew ? 0 : null)
    setColorHex('#000000'); setColorName(''); setMeaning(''); setPhaseType('')
    setComplexity('1.0'); setNotes('')
  }

  const startEdit = (r: StepColorRule) => {
    setEditingId(r.id); setColorHex(r.color_hex); setColorName(r.color_name || '')
    setMeaning(r.meaning || ''); setPhaseType(r.suggested_phase_type || '')
    setComplexity(String(r.complexity_coefficient || 1.0)); setNotes(r.notes || '')
  }

  const handleSave = async () => {
    const payload = { color_hex: colorHex, color_name: colorName, meaning, suggested_phase_type: phaseType, complexity_coefficient: Number(complexity), notes }
    try {
      if (editingId && editingId > 0) await api.put(`/step-color-rules/${editingId}`, payload)
      else await api.post('/step-color-rules', payload)
      resetForm(); loadData()
    } catch { toast.error('Errore nel salvataggio') }
  }

  const handleDelete = (id: number) => setPendingDelete(id)
  const confirmDelete = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/step-color-rules/${id}`); loadData() }
    catch { toast.error('Errore nell\'eliminazione') }
  }

  const visible = [...rules]
    .sort((a, b) => (a.color_name || '').localeCompare(b.color_name || '', 'it'))
    .filter(r => !search || (r.color_name || '').toLowerCase().includes(search.toLowerCase()) || (r.meaning || '').toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Regole Colori STEP</h1>
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
                <th className="text-left p-3 w-[6%] font-medium text-gray-600">Colore</th>
                <th className="text-left p-3 w-[20%] font-medium text-gray-600">Nome</th>
                <th className="text-left p-3 w-[28%] font-medium text-gray-600">Significato</th>
                <th className="text-left p-3 w-[28%] font-medium text-gray-600">Fase Suggerita</th>
                <th className="text-center p-3 w-[18%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-gray-400">Nessuna regola trovata.</td></tr>
              )}
              {visible.map(r => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <div className="w-6 h-6 rounded border" style={{ backgroundColor: r.color_hex }} />
                  </td>
                  <td className="p-3 font-medium truncate">{r.color_name || '—'}</td>
                  <td className="p-3 truncate">{r.meaning || '—'}</td>
                  <td className="p-3 truncate">{r.suggested_phase_type || '—'}</td>
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
              <h3 className="font-semibold">{editingId > 0 ? 'Modifica' : 'Nuova'} Regola Colore</h3>
              <button onClick={() => resetForm()} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Colore</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={colorHex} onChange={e => setColorHex(e.target.value)} className="w-10 h-10 border rounded cursor-pointer" />
                    <Input value={colorHex} onChange={e => setColorHex(e.target.value)} className="font-mono" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Nome Colore</label>
                  <Input value={colorName} onChange={e => setColorName(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Significato</label>
                  <Input value={meaning} onChange={e => setMeaning(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Fase Suggerita</label>
                  <Input value={phaseType} onChange={e => setPhaseType(e.target.value)} placeholder="Es. Fresatura" />
                </div>
                <div>
                  <label className="text-sm font-medium">Coefficiente Complessità</label>
                  <Input type="number" step="0.1" value={complexity} onChange={e => setComplexity(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Note</label>
                  <Input value={notes} onChange={e => setNotes(e.target.value)} />
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
      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questa regola?"
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
