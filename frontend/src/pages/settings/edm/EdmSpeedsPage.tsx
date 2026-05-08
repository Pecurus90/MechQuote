import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import api from '@/lib/api'
import type { EdmCutSpeed, Material } from '@/types'
import { toast } from 'sonner'

interface FormState {
  material_id: string
  thickness_min_mm: string
  thickness_max_mm: string
  speed_mm2_min: string
  pierce_time_s: string
  notes: string
}

const empty = (): FormState => ({
  material_id: '',
  thickness_min_mm: '0',
  thickness_max_mm: '',
  speed_mm2_min: '',
  pierce_time_s: '',
  notes: '',
})

const toPayload = (f: FormState) => ({
  material_id: Number(f.material_id),
  thickness_min_mm: Number(f.thickness_min_mm) || 0,
  thickness_max_mm: Number(f.thickness_max_mm) || 0,
  speed_mm2_min: Number(f.speed_mm2_min) || 0,
  pierce_time_s: f.pierce_time_s ? Number(f.pierce_time_s) : null,
  notes: f.notes || null,
})

export default function EdmSpeedsPage() {
  const [rows, setRows] = useState<EdmCutSpeed[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<FormState>(empty())
  const [showNew, setShowNew] = useState(false)
  const [newRow, setNewRow] = useState<FormState>(empty())
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([api.get('/edm-cut-speeds'), api.get('/materials')])
      .then(([r1, r2]) => { setRows(r1.data); setMaterials(r2.data); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  const matName = (id: number) => materials.find(m => m.id === id)?.name ?? `#${id}`

  const startEdit = (row: EdmCutSpeed) => {
    setEditingId(row.id)
    setEditRow({
      material_id: String(row.material_id),
      thickness_min_mm: String(row.thickness_min_mm),
      thickness_max_mm: String(row.thickness_max_mm),
      speed_mm2_min: String(row.speed_mm2_min),
      pierce_time_s: row.pierce_time_s != null ? String(row.pierce_time_s) : '',
      notes: row.notes ?? '',
    })
    setShowNew(false)
  }

  const saveEdit = async (id: number) => {
    try {
      await api.put(`/edm-cut-speeds/${id}`, toPayload(editRow))
      toast.success('Velocità aggiornata')
      setEditingId(null); load()
    } catch {toast.error('Errore nel salvataggio') }
  }

  const createRow = async () => {
    if (!newRow.material_id || !newRow.thickness_max_mm || !newRow.speed_mm2_min) {
      toast.error('Materiale, altezza max e velocità sono obbligatori')
      return
    }
    try {
      await api.post('/edm-cut-speeds', toPayload(newRow))
      toast.success('Velocità creata')
      setShowNew(false); setNewRow(empty()); load()
    } catch {toast.error('Errore nella creazione') }
  }

  const removeRow = async (id: number) => {
    if (!confirm('Eliminare questa riga?')) return
    try {
      await api.delete(`/edm-cut-speeds/${id}`)
      toast.success('Eliminata'); load()
    } catch {toast.error('Errore') }
  }

  const inp = 'h-7 text-xs px-2'

  const renderRow = (form: FormState, set: (f: FormState) => void) => (
    <>
      <td className="px-3 py-2">
        <select className="h-7 text-xs border rounded px-1.5 bg-background" value={form.material_id}
          onChange={e => set({ ...form, material_id: e.target.value })}>
          <option value="">— scegli —</option>
          {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <Input className={inp} type="number" step="0.5" value={form.thickness_min_mm}
          onChange={e => set({ ...form, thickness_min_mm: e.target.value })} />
      </td>
      <td className="px-3 py-2">
        <Input className={inp} type="number" step="0.5" value={form.thickness_max_mm}
          onChange={e => set({ ...form, thickness_max_mm: e.target.value })} />
      </td>
      <td className="px-3 py-2">
        <Input className={inp} type="number" step="1" value={form.speed_mm2_min}
          onChange={e => set({ ...form, speed_mm2_min: e.target.value })} />
      </td>
      <td className="px-3 py-2">
        <Input className={inp} type="number" step="0.5" placeholder="default" value={form.pierce_time_s}
          onChange={e => set({ ...form, pierce_time_s: e.target.value })} />
      </td>
      <td className="px-3 py-2">
        <Input className={inp} value={form.notes}
          onChange={e => set({ ...form, notes: e.target.value })} />
      </td>
    </>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Velocità di taglio Wire EDM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Velocità base (sgrossatura) in mm²/min per ogni materiale e range di altezza.
            Le velocità delle altre passate sono derivate dai fattori in <em>Parametri globali</em>.
          </p>
        </div>
        {!showNew && (
          <Button size="sm" onClick={() => { setShowNew(true); setEditingId(null) }}>
            <Plus className="w-4 h-4 mr-1" /> Nuova riga
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <div className="p-6 text-sm text-muted-foreground">Caricamento...</div> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Materiale</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Altezza min (mm)</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Altezza max (mm)</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Velocità (mm²/min)</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Pierce (s, override)</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Note</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                    {editingId === r.id ? (
                      <>
                        {renderRow(editRow, setEditRow)}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => saveEdit(r.id)} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-950 rounded">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-muted rounded">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5">{matName(r.material_id)}</td>
                        <td className="px-4 py-2.5">{r.thickness_min_mm}</td>
                        <td className="px-4 py-2.5">{r.thickness_max_mm}</td>
                        <td className="px-4 py-2.5 font-mono">{r.speed_mm2_min}</td>
                        <td className="px-4 py-2.5">{r.pierce_time_s ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.notes || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(r)} className="p-1 text-muted-foreground hover:text-blue-600 rounded">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => removeRow(r.id)} className="p-1 text-muted-foreground hover:text-red-500 rounded">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}

                {showNew && (
                  <tr className="bg-blue-50/40 dark:bg-blue-950/20 border-b">
                    {renderRow(newRow, setNewRow)}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={createRow} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-950 rounded">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setShowNew(false); setNewRow(empty()) }}
                          className="p-1 text-muted-foreground hover:bg-muted rounded">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {rows.length === 0 && !showNew && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">
                      Nessuna velocità configurata. Aggiungi una riga per iniziare.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
