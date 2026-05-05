import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'

interface StepColorRule {
  id: number
  color_hex: string
  color_name: string
  meaning: string
  suggested_phase_type: string
  complexity_coefficient: number
  notes: string
  active: boolean
}

export default function StepColorRulesPage() {
  const [rules, setRules] = useState<StepColorRule[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [colorHex, setColorHex] = useState('#000000')
  const [colorName, setColorName] = useState('')
  const [meaning, setMeaning] = useState('')
  const [phaseType, setPhaseType] = useState('')
  const [complexity, setComplexity] = useState('1.0')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(true)

  const loadData = () => {
    api.get('/step-color-rules').then(res => {
      setRules(res.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew: boolean = false) => {
    setEditingId(isNew ? 0 : null)
    setColorHex('#000000')
    setColorName('')
    setMeaning('')
    setPhaseType('')
    setComplexity('1.0')
    setNotes('')
    setActive(true)
  }

  const startEdit = (r: StepColorRule) => {
    setEditingId(r.id)
    setColorHex(r.color_hex)
    setColorName(r.color_name || '')
    setMeaning(r.meaning || '')
    setPhaseType(r.suggested_phase_type || '')
    setComplexity(String(r.complexity_coefficient || 1.0))
    setNotes(r.notes || '')
    setActive(r.active)
  }

  const handleSave = async () => {
    const payload = {
      color_hex: colorHex,
      color_name: colorName,
      meaning,
      suggested_phase_type: phaseType,
      complexity_coefficient: Number(complexity),
      notes,
      active,
    }
    try {
      if (editingId && editingId > 0) {
        await api.put(`/step-color-rules/${editingId}`, payload)
      } else {
        await api.post('/step-color-rules', payload)
      }
      resetForm()
      loadData()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questa regola?')) return
    try {
      await api.delete(`/step-color-rules/${id}`)
      loadData()
    } catch (e) { console.error(e) }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Regole Colori STEP</h1>
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
                  <th className="text-left p-3">Colore</th>
                  <th className="text-left p-3">Nome</th>
                  <th className="text-left p-3">Significato</th>
                  <th className="text-left p-3">Fase Suggerita</th>
                  <th className="text-center p-3">Attivo</th>
                  <th className="text-center p-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      <div className="w-6 h-6 rounded border" style={{ backgroundColor: r.color_hex }} />
                    </td>
                    <td className="p-3 font-medium">{r.color_name || '-'}</td>
                    <td className="p-3">{r.meaning || '-'}</td>
                    <td className="p-3">{r.suggested_phase_type || '-'}</td>
                    <td className="p-3 text-center">{r.active ? 'Sì' : 'No'}</td>
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
                <CardTitle>{editingId && editingId > 0 ? 'Modifica' : 'Nuova'} Regola Colore</CardTitle>
                <button onClick={() => resetForm()} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
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
