import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Check, X, Drill } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import api from '@/lib/api'
import type { DrillingTime } from '@/types'
import { toast } from 'sonner'
import { MATERIAL_FAMILIES, familyLabel } from '@/lib/materialFamilies'
import { parseDecimal } from '@/lib/decimalInput'
import ConfirmDialog from '@/components/ui/confirm-dialog'

interface FormState {
  material_family: string
  electrode_diameter_mm: string
  speed_mm_per_sec: string
  notes: string
}

const empty = (): FormState => ({
  material_family: '',
  electrode_diameter_mm: '',
  speed_mm_per_sec: '',
  notes: '',
})

const toPayload = (f: FormState) => ({
  material_family: f.material_family,
  electrode_diameter_mm: parseDecimal(f.electrode_diameter_mm),
  speed_mm_per_sec: parseDecimal(f.speed_mm_per_sec),
  notes: f.notes || null,
})

export default function DrillingTimesPage() {
  const [rows, setRows] = useState<DrillingTime[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<FormState>(empty())
  const [showNew, setShowNew] = useState(false)
  const [newRow, setNewRow] = useState<FormState>(empty())
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    api.get('/drilling-times').then(r => { setRows(r.data); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  const startEdit = (row: DrillingTime) => {
    setEditingId(row.id)
    setEditRow({
      material_family: row.material_family,
      electrode_diameter_mm: String(row.electrode_diameter_mm),
      speed_mm_per_sec: String(row.speed_mm_per_sec),
      notes: row.notes ?? '',
    })
    setShowNew(false)
  }

  const saveEdit = async (id: number) => {
    try {
      await api.put(`/drilling-times/${id}`, toPayload(editRow))
      toast.success('Aggiornato')
      setEditingId(null); load()
    } catch {toast.error('Errore nel salvataggio') }
  }

  const createRow = async () => {
    if (!newRow.material_family || !newRow.electrode_diameter_mm || !newRow.speed_mm_per_sec) {
      toast.error('Famiglia, diametro elettrodo e mm/sec sono obbligatori')
      return
    }
    try {
      await api.post('/drilling-times', toPayload(newRow))
      toast.success('Riga creata')
      setShowNew(false); setNewRow(empty()); load()
    } catch {toast.error('Errore nella creazione') }
  }

  const removeRow = (id: number) => setPendingDelete(id)
  const confirmRemove = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try {
      await api.delete(`/drilling-times/${id}`)
      toast.success('Eliminata'); load()
    } catch { toast.error('Errore') }
  }

  const inp = 'h-7 text-xs px-2'

  const renderRow = (form: FormState, set: (f: FormState) => void) => (
    <>
      <td className="px-3 py-2">
        <select className="h-7 text-xs border rounded px-1.5 bg-background" value={form.material_family}
          onChange={e => set({ ...form, material_family: e.target.value })}>
          <option value="">— scegli —</option>
          {MATERIAL_FAMILIES.map(fam => <option key={fam.slug} value={fam.slug}>{fam.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <Input onFocus={e => e.currentTarget.select()} className={inp} type="number" step="0.1" value={form.electrode_diameter_mm}
          onChange={e => set({ ...form, electrode_diameter_mm: e.target.value })} />
      </td>
      <td className="px-3 py-2">
        <Input onFocus={e => e.currentTarget.select()} className={inp} type="number" step="0.5" value={form.speed_mm_per_sec}
          onChange={e => set({ ...form, speed_mm_per_sec: e.target.value })} />
      </td>
      <td className="px-3 py-2">
        <Input className={inp} value={form.notes}
          onChange={e => set({ ...form, notes: e.target.value })} />
      </td>
    </>
  )

  return (
    <PageContainer>
      <SettingsPageHeader
        icon={Drill}
        color="amber"
        title="Velocità di foratura"
        subtitle="Velocità avanzamento (mm/sec) per famiglia materiale × diametro elettrodo. Lookup discreto su diametro."
        action={
          !showNew ? (
            <PrimaryCtaButton color="amber" size="sm" onClick={() => { setShowNew(true); setEditingId(null) }}>
              <Plus className="w-4 h-4" /> Nuova riga
            </PrimaryCtaButton>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <div className="p-6 text-sm text-muted-foreground">Caricamento...</div> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Famiglia</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Ø elettrodo (mm)</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Velocità (mm/sec)</th>
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
                            <button onClick={() => saveEdit(r.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
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
                        <td className="px-4 py-2.5">{familyLabel(r.material_family)}</td>
                        <td className="px-4 py-2.5 font-mono">{r.electrode_diameter_mm}</td>
                        <td className="px-4 py-2.5 font-mono">{r.speed_mm_per_sec}</td>
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
                  <tr className="bg-blue-50/40 border-b">
                    {renderRow(newRow, setNewRow)}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={createRow} className="p-1 text-green-600 hover:bg-green-50 rounded">
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
                    <td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">
                      Nessuna velocità di foratura configurata.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questa riga?"
        confirmLabel="Elimina"
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  )
}
