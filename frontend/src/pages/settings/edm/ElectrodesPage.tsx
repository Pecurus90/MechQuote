import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Zap } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import type { Electrode } from '@/types'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { tWrap, tHead, tRow, editRowStyle, RowActions, EditActions } from '@/components/settings/inlineEdit'

interface FormState { diameter_mm: string; length_mm: string; price: string; notes: string }

const empty = (): FormState => ({ diameter_mm: '', length_mm: '', price: '', notes: '' })
const toPayload = (f: FormState) => ({
  diameter_mm: parseDecimal(f.diameter_mm),
  length_mm: parseDecimal(f.length_mm),
  price: parseDecimal(f.price),
  notes: f.notes || null,
})
const inp = 'h-8 text-xs'
// €/mm derivato (prezzo / lunghezza): mostrato come promemoria in tabella.
const perMm = (r: Electrode): string =>
  r.length_mm ? `${(r.price / r.length_mm).toLocaleString('it-IT', { maximumFractionDigits: 4 })} €/mm` : '—'

export default function ElectrodesPage() {
  const [rows, setRows] = useState<Electrode[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<FormState>(empty())
  const [showNew, setShowNew] = useState(false)
  const [newRow, setNewRow] = useState<FormState>(empty())
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const load = () => { setLoading(true); api.get('/electrodes').then(r => { setRows(r.data); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const startEdit = (row: Electrode) => {
    setEditingId(row.id)
    setEditRow({ diameter_mm: String(row.diameter_mm), length_mm: String(row.length_mm), price: String(row.price), notes: row.notes ?? '' })
    setShowNew(false)
  }
  const saveEdit = async (id: number) => {
    try { await api.put(`/electrodes/${id}`, toPayload(editRow)); toast.success('Aggiornato'); setEditingId(null); load() }
    catch { toast.error('Errore nel salvataggio') }
  }
  const createRow = async () => {
    if (!newRow.diameter_mm || !newRow.length_mm || !newRow.price) { toast.error('Diametro, lunghezza e prezzo sono obbligatori'); return }
    try { await api.post('/electrodes', toPayload(newRow)); toast.success('Elettrodo creato'); setShowNew(false); setNewRow(empty()); load() }
    catch { toast.error('Errore nella creazione') }
  }
  const confirmRemove = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/electrodes/${id}`); toast.success('Eliminato'); load() }
    catch { toast.error('Errore') }
  }

  const cells = (form: FormState, set: (f: FormState) => void) => (
    <>
      <td className="p-2"><Input onFocus={e => e.currentTarget.select()} className={inp} type="text" inputMode="decimal" value={form.diameter_mm} onChange={e => set({ ...form, diameter_mm: e.target.value })} /></td>
      <td className="p-2"><Input onFocus={e => e.currentTarget.select()} className={inp} type="text" inputMode="decimal" value={form.length_mm} onChange={e => set({ ...form, length_mm: e.target.value })} /></td>
      <td className="p-2"><Input onFocus={e => e.currentTarget.select()} className={inp} type="text" inputMode="decimal" value={form.price} onChange={e => set({ ...form, price: e.target.value })} /></td>
      <td className="p-2"><Input className={inp} value={form.notes} onChange={e => set({ ...form, notes: e.target.value })} /></td>
    </>
  )

  return (
    <StandardPage
      icon={Zap}
      color="edm"
      width="xl"
      title="Elettrodi"
      subtitle="Costo degli elettrodi per la foratura EDM. Il €/mm consumato è ricavato da prezzo / lunghezza barretta."
      actions={!showNew ? (
        <PrimaryCtaButton color="edm" size="sm" onClick={() => { setShowNew(true); setEditingId(null) }}>
          <Plus className="h-4 w-4" /> Nuovo elettrodo
        </PrimaryCtaButton>
      ) : undefined}
    >
      <div className={tWrap}>
        <div className="overflow-x-auto">
          {loading ? <div className="p-6 text-sm text-muted-foreground">Caricamento…</div> : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className={tHead}>
                  <th className="p-2.5 text-left font-medium">Ø (mm)</th>
                  <th className="p-2.5 text-left font-medium">Lunghezza (mm)</th>
                  <th className="p-2.5 text-left font-medium">Prezzo (€)</th>
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
                    <td className="p-2.5 font-mono">{r.diameter_mm}</td>
                    <td className="p-2.5 font-mono">{r.length_mm}</td>
                    <td className="p-2.5 font-mono">{r.price.toLocaleString('it-IT', { maximumFractionDigits: 2 })} <span className="text-muted-foreground">· {perMm(r)}</span></td>
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
                  <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">Nessun elettrodo configurato.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <ConfirmDialog open={pendingDelete != null} title="Eliminare questo elettrodo?" confirmLabel="Elimina" onConfirm={confirmRemove} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
