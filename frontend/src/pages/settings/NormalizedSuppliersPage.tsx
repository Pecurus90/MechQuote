import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Cog } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import { tWrap, tHead, tRow, RowActions } from '@/components/settings/inlineEdit'
import { ActiveDot, SettingsModal, fieldLabel } from '@/components/settings/crud'
import type { NormalizedSupplier } from '@/types'

interface FormState { id: number | null; name: string; address: string; phone: string; email: string; notes: string; active: boolean }
const empty = (): FormState => ({ id: null, name: '', address: '', phone: '', email: '', notes: '', active: true })

export default function NormalizedSuppliersPage() {
  const [suppliers, setSuppliers] = useState<NormalizedSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const [onlyActive, setOnlyActive] = useState(false)

  const visible = onlyActive ? suppliers.filter(s => s.active !== false) : suppliers
  const load = () => api.get('/normalized-suppliers').then(r => setSuppliers(r.data)).catch(() => toast.error('Errore caricamento fornitori')).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => (f ? { ...f, [k]: v } : f))
  const startEdit = (s: NormalizedSupplier) => setForm({ id: s.id, name: s.name, address: s.address ?? '', phone: s.phone ?? '', email: s.email ?? '', notes: s.notes ?? '', active: s.active ?? true })

  const save = async () => {
    if (!form || !form.name.trim()) { toast.error('Nome obbligatorio'); return }
    const payload = { name: form.name.trim(), address: form.address || null, phone: form.phone || null, email: form.email || null, notes: form.notes || null, active: form.active }
    try {
      if (form.id) await api.put(`/normalized-suppliers/${form.id}`, payload); else await api.post('/normalized-suppliers', payload)
      toast.success('Fornitore salvato'); setForm(null); load()
    } catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nel salvataggio') }
  }
  const confirmDel = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/normalized-suppliers/${id}`); toast.success('Fornitore eliminato'); load() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione') }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Caricamento…</div>

  return (
    <StandardPage
      icon={Cog} color="primary" width="lg"
      title="Fornitori normalizzati"
      subtitle="Fornitori di viti, cuscinetti, molle, colonne e altri componenti normalizzati."
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="accent-primary" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} /> Solo attivi</label>
          <PrimaryCtaButton color="primary" size="sm" onClick={() => setForm(empty())}><Plus className="h-4 w-4" /> Nuovo</PrimaryCtaButton>
        </div>
      }
    >
      <div className={tWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <colgroup><col style={{ width: '28%' }} /><col /><col style={{ width: 160 }} /><col style={{ width: 80 }} /><col style={{ width: 90 }} /></colgroup>
            <thead>
              <tr className={tHead}>
                <th className="p-2.5 text-left font-medium">Nome</th>
                <th className="p-2.5 text-left font-medium">Indirizzo</th>
                <th className="p-2.5 text-left font-medium">Telefono</th>
                <th className="p-2.5 text-center font-medium">Attivo</th>
                <th className="p-2.5 text-center font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nessun fornitore.</td></tr>
              ) : visible.map(s => (
                <tr key={s.id} className={tRow}>
                  <td className="p-2.5 font-medium text-foreground">{s.name}</td>
                  <td className="truncate p-2.5 text-muted-foreground">{s.address || '—'}</td>
                  <td className="p-2.5 font-mono text-xs text-muted-foreground">{s.phone || '—'}</td>
                  <td className="p-2.5 text-center"><ActiveDot active={s.active !== false} /></td>
                  <td className="p-2.5"><RowActions onEdit={() => startEdit(s)} onDelete={() => setPendingDelete(s.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <SettingsModal title={form.id ? 'Modifica fornitore normalizzati' : 'Nuovo fornitore normalizzati'} icon={Cog} accent="primary" onClose={() => setForm(null)} onSave={save} saveLabel="Salva fornitore">
          <div><label className={fieldLabel}>Nome *</label><Input value={form.name} onChange={e => set('name', e.target.value)} autoFocus /></div>
          <div><label className={fieldLabel}>Indirizzo</label><Input value={form.address} onChange={e => set('address', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={fieldLabel}>Telefono</label><Input value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
            <div><label className={fieldLabel}>Email</label><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          </div>
          <div><label className={fieldLabel}>Note</label><Input value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={form.active} onChange={e => set('active', e.target.checked)} /> Attivo</label>
        </SettingsModal>
      )}
      <ConfirmDialog open={pendingDelete != null} title="Eliminare questo fornitore?" description="Se utilizzato da documenti officina, l'eliminazione verrà bloccata dal backend." confirmLabel="Elimina" onConfirm={confirmDel} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
