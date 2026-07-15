import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Gauge } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { parseDecimal } from '@/lib/decimalInput'
import type { EdmCutSpeed } from '@/types'
import { toast } from 'sonner'
import { MATERIAL_FAMILIES, familyLabel } from '@/lib/materialFamilies'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { tWrap, tHead, tRow, editRowStyle, RowActions, EditActions } from '@/components/settings/inlineEdit'

interface FormState {
  material_family: string; thickness_min_mm: string; thickness_max_mm: string
  speed_mm_per_min: string; pierce_time_s: string; notes: string
}

const empty = (): FormState => ({ material_family: '', thickness_min_mm: '0', thickness_max_mm: '', speed_mm_per_min: '', pierce_time_s: '', notes: '' })

const toPayload = (f: FormState) => ({
  material_family: f.material_family,
  thickness_min_mm: parseDecimal(f.thickness_min_mm),
  thickness_max_mm: parseDecimal(f.thickness_max_mm),
  speed_mm_per_min: parseDecimal(f.speed_mm_per_min),
  pierce_time_s: f.pierce_time_s ? parseDecimal(f.pierce_time_s) : null,
  notes: f.notes || null,
})

const inp = 'h-8 text-xs'

export default function EdmSpeedsPage() {
  const [rows, setRows] = useState<EdmCutSpeed[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<FormState>(empty())
  const [showNew, setShowNew] = useState(false)
  const [newRow, setNewRow] = useState<FormState>(empty())
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const load = () => { setLoading(true); api.get('/edm-cut-speeds').then(r => { setRows(r.data); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const startEdit = (row: EdmCutSpeed) => {
    setEditingId(row.id)
    setEditRow({
      material_family: row.material_family,
      thickness_min_mm: String(row.thickness_min_mm),
      thickness_max_mm: String(row.thickness_max_mm),
      speed_mm_per_min: String(row.speed_mm_per_min),
      pierce_time_s: row.pierce_time_s != null ? String(row.pierce_time_s) : '',
      notes: row.notes ?? '',
    })
    setShowNew(false)
  }

  const saveEdit = async (id: number) => {
    try { await api.put(`/edm-cut-speeds/${id}`, toPayload(editRow)); toast.success('Velocità aggiornata'); setEditingId(null); load() }
    catch { toast.error('Errore nel salvataggio') }
  }
  const createRow = async () => {
    if (!newRow.material_family || !newRow.thickness_max_mm || !newRow.speed_mm_per_min) { toast.error('Famiglia, altezza max e velocità sono obbligatori'); return }
    try { await api.post('/edm-cut-speeds', toPayload(newRow)); toast.success('Velocità creata'); setShowNew(false); setNewRow(empty()); load() }
    catch { toast.error('Errore nella creazione') }
  }
  const confirmRemove = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/edm-cut-speeds/${id}`); toast.success('Eliminata'); load() }
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
      <td className="p-2"><Input className={inp} type="text" inputMode="decimal" value={form.thickness_min_mm} onChange={e => set({ ...form, thickness_min_mm: e.target.value })} /></td>
      <td className="p-2"><Input className={inp} type="text" inputMode="decimal" value={form.thickness_max_mm} onChange={e => set({ ...form, thickness_max_mm: e.target.value })} /></td>
      <td className="p-2"><Input className={inp} type="text" inputMode="decimal" value={form.speed_mm_per_min} onChange={e => set({ ...form, speed_mm_per_min: e.target.value })} /></td>
      <td className="p-2"><Input className={inp} type="text" inputMode="decimal" placeholder="default" value={form.pierce_time_s} onChange={e => set({ ...form, pierce_time_s: e.target.value })} /></td>
      <td className="p-2"><Input className={inp} value={form.notes} onChange={e => set({ ...form, notes: e.target.value })} /></td>
    </>
  )

  return (
    <StandardPage
      icon={Gauge}
      color="edm"
      width="xl"
      title="Velocità di taglio Wire EDM"
      subtitle="Avanzamento filo (mm/min) per famiglia materiale × altezza. Le passate derivano dai fattori in Parametri globali."
      actions={!showNew ? (
        <PrimaryCtaButton color="edm" size="sm" onClick={() => { setShowNew(true); setEditingId(null) }}>
          <Plus className="h-4 w-4" /> Nuova riga
        </PrimaryCtaButton>
      ) : undefined}
    >
      <div className={tWrap}>
        <div className="overflow-x-auto">
          {loading ? <div className="p-6 text-sm text-muted-foreground">Caricamento…</div> : (
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className={tHead}>
                  <th className="p-2.5 text-left font-medium">Famiglia</th>
                  <th className="p-2.5 text-left font-medium">Altezza min (mm)</th>
                  <th className="p-2.5 text-left font-medium">Altezza max (mm)</th>
                  <th className="p-2.5 text-left font-medium">Velocità (mm/min)</th>
                  <th className="p-2.5 text-left font-medium">Pierce (s, override)</th>
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
                    <td className="p-2.5">{r.thickness_min_mm}</td>
                    <td className="p-2.5">{r.thickness_max_mm}</td>
                    <td className="p-2.5 font-mono">{r.speed_mm_per_min}</td>
                    <td className="p-2.5">{r.pierce_time_s ?? <span className="text-muted-foreground">—</span>}</td>
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
                  <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">Nessuna velocità configurata. Aggiungi una riga per iniziare.</td></tr>
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
