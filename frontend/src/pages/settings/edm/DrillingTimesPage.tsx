import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Drill } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import type { DrillingTime } from '@/types'
import { toast } from 'sonner'
import { MATERIAL_FAMILIES, familyLabel } from '@/lib/materialFamilies'
import { parseDecimal } from '@/lib/decimalInput'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { tWrap, tHead, tRow, editRowStyle, RowActions, EditActions } from '@/components/settings/inlineEdit'

interface FormState { material_family: string; electrode_diameter_mm: string; speed_mm_per_sec: string; notes: string }

const empty = (): FormState => ({ material_family: '', electrode_diameter_mm: '', speed_mm_per_sec: '', notes: '' })
const toPayload = (f: FormState) => ({
  material_family: f.material_family,
  electrode_diameter_mm: parseDecimal(f.electrode_diameter_mm),
  speed_mm_per_sec: parseDecimal(f.speed_mm_per_sec),
  notes: f.notes || null,
})
const inp = 'h-8 text-xs'

export default function DrillingTimesPage() {
  const [rows, setRows] = useState<DrillingTime[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<FormState>(empty())
  const [showNew, setShowNew] = useState(false)
  const [newRow, setNewRow] = useState<FormState>(empty())
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const load = () => { setLoading(true); api.get('/drilling-times').then(r => { setRows(r.data); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const startEdit = (row: DrillingTime) => {
    setEditingId(row.id)
    setEditRow({ material_family: row.material_family, electrode_diameter_mm: String(row.electrode_diameter_mm), speed_mm_per_sec: String(row.speed_mm_per_sec), notes: row.notes ?? '' })
    setShowNew(false)
  }
  const saveEdit = async (id: number) => {
    try { await api.put(`/drilling-times/${id}`, toPayload(editRow)); toast.success('Aggiornato'); setEditingId(null); load() }
    catch { toast.error('Errore nel salvataggio') }
  }
  const createRow = async () => {
    if (!newRow.material_family || !newRow.electrode_diameter_mm || !newRow.speed_mm_per_sec) { toast.error('Famiglia, diametro elettrodo e mm/sec sono obbligatori'); return }
    try { await api.post('/drilling-times', toPayload(newRow)); toast.success('Riga creata'); setShowNew(false); setNewRow(empty()); load() }
    catch { toast.error('Errore nella creazione') }
  }
  const confirmRemove = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/drilling-times/${id}`); toast.success('Eliminata'); load() }
    catch { toast.error('Errore') }
  }

  const cells = (form: FormState, set: (f: FormState) => void) => (
    <>
      <td className="p-2">
        <select className="h-8 rounded-md border border-input bg-background px-1.5 text-xs" value={form.material_family} onChange={e => set({ ...form, material_family: e.target.value })}>
          <option value="">— scegli —</option>
          {MATERIAL_FAMILIES.map(fam => <option key={fam.slug} value={fam.slug}>{fam.label}</option>)}
        </select>
      </td>
      <td className="p-2"><Input onFocus={e => e.currentTarget.select()} className={inp} type="text" inputMode="decimal" value={form.electrode_diameter_mm} onChange={e => set({ ...form, electrode_diameter_mm: e.target.value })} /></td>
      <td className="p-2"><Input onFocus={e => e.currentTarget.select()} className={inp} type="text" inputMode="decimal" value={form.speed_mm_per_sec} onChange={e => set({ ...form, speed_mm_per_sec: e.target.value })} /></td>
      <td className="p-2"><Input className={inp} value={form.notes} onChange={e => set({ ...form, notes: e.target.value })} /></td>
    </>
  )

  return (
    <StandardPage
      icon={Drill}
      color="edm"
      width="xl"
      title="Velocità di foratura"
      subtitle="Velocità avanzamento (mm/sec) per famiglia materiale × diametro elettrodo. Lookup discreto su diametro."
      actions={!showNew ? (
        <PrimaryCtaButton color="edm" size="sm" onClick={() => { setShowNew(true); setEditingId(null) }}>
          <Plus className="h-4 w-4" /> Nuova riga
        </PrimaryCtaButton>
      ) : undefined}
    >
      <div className={tWrap}>
        <div className="overflow-x-auto">
          {loading ? <div className="p-6 text-sm text-muted-foreground">Caricamento…</div> : (
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className={tHead}>
                  <th className="p-2.5 text-left font-medium">Famiglia</th>
                  <th className="p-2.5 text-left font-medium">Ø elettrodo (mm)</th>
                  <th className="p-2.5 text-left font-medium">Velocità (mm/sec)</th>
                  <th className="p-2.5 text-left font-medium">Note</th>
                  <th className="p-2.5 text-center font-medium" style={{ width: 90 }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => editingId === r.id ? (
                  <tr key={r.id} className="border-b border-border bg-edm/[0.05]" style={editRowStyle('edm')}>
                    {cells(editRow, setEditRow)}
                    <td className="p-2"><EditActions onSave={() => saveEdit(r.id)} onCancel={() => setEditingId(null)} /></td>
                  </tr>
                ) : (
                  <tr key={r.id} className={tRow}>
                    <td className="p-2.5">{familyLabel(r.material_family)}</td>
                    <td className="p-2.5 font-mono">{r.electrode_diameter_mm}</td>
                    <td className="p-2.5 font-mono">{r.speed_mm_per_sec}</td>
                    <td className="p-2.5 text-muted-foreground">{r.notes || '—'}</td>
                    <td className="p-2.5"><RowActions onEdit={() => startEdit(r)} onDelete={() => setPendingDelete(r.id)} /></td>
                  </tr>
                ))}

                {showNew && (
                  <tr className="border-t-2 border-dashed border-border bg-edm/[0.04]">
                    {cells(newRow, setNewRow)}
                    <td className="p-2"><EditActions onSave={createRow} onCancel={() => { setShowNew(false); setNewRow(empty()) }} /></td>
                  </tr>
                )}

                {rows.length === 0 && !showNew && (
                  <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">Nessuna velocità di foratura configurata.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <ConfirmDialog open={pendingDelete != null} title="Eliminare questa riga?" confirmLabel="Elimina" onConfirm={confirmRemove} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
