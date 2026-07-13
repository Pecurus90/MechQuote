import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Box } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import { tWrap, tHead, tRow, RowActions } from '@/components/settings/inlineEdit'
import { ActiveDot, SettingsModal, CsvImportButtons, fieldLabel } from '@/components/settings/crud'
import type { MaterialSupplier } from '@/types'

interface FormState { id: number | null; name: string; address: string; shipping_cost: string; cutting_cost_per_part: string; active: boolean }
const empty = (): FormState => ({ id: null, name: '', address: '', shipping_cost: '0', cutting_cost_per_part: '0', active: true })

export default function MaterialSuppliersPage() {
  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const [onlyActive, setOnlyActive] = useState(false)

  const visible = onlyActive ? suppliers.filter(s => s.active !== false) : suppliers
  const load = () => api.get('/material-suppliers').then(r => setSuppliers(r.data)).catch(() => toast.error('Errore caricamento fornitori')).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => (f ? { ...f, [k]: v } : f))
  const startEdit = (s: MaterialSupplier) => setForm({ id: s.id, name: s.name, address: s.address ?? '', shipping_cost: String(s.shipping_cost ?? 0), cutting_cost_per_part: String(s.cutting_cost_per_part ?? 0), active: s.active ?? true })

  const save = async () => {
    if (!form || !form.name.trim()) { toast.error('Nome obbligatorio'); return }
    const payload = { name: form.name.trim(), address: form.address || null, shipping_cost: parseDecimal(form.shipping_cost) || 0, cutting_cost_per_part: parseDecimal(form.cutting_cost_per_part) || 0, active: form.active }
    try {
      if (form.id) await api.put(`/material-suppliers/${form.id}`, payload); else await api.post('/material-suppliers', payload)
      toast.success('Fornitore salvato'); setForm(null); load()
    } catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nel salvataggio') }
  }
  const confirmDel = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/material-suppliers/${id}`); toast.success('Fornitore eliminato'); load() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione') }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Caricamento…</div>

  return (
    <StandardPage
      icon={Box} color="primary" width="lg"
      title="Fornitori materiali"
      subtitle="Chi vende il materiale grezzo (con spese spedizione e taglio)."
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="accent-primary" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} /> Solo attivi</label>
          <CsvImportButtons importUrl="/material-suppliers/import-csv" templateUrl="/material-suppliers/csv-template" templateName="fornitori_grezzi_modello.csv" importTitle="Importa un CSV di fornitori grezzi (separatore ;)" onImported={load} />
          <PrimaryCtaButton color="primary" size="sm" onClick={() => setForm(empty())}><Plus className="h-4 w-4" /> Nuovo</PrimaryCtaButton>
        </div>
      }
    >
      <div className={tWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <colgroup><col style={{ width: '26%' }} /><col /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 80 }} /><col style={{ width: 90 }} /></colgroup>
            <thead>
              <tr className={tHead}>
                <th className="p-2.5 text-left font-medium">Nome</th>
                <th className="p-2.5 text-left font-medium">Indirizzo</th>
                <th className="p-2.5 text-right font-medium">Spedizione (€)</th>
                <th className="p-2.5 text-right font-medium">Taglio (€/pz)</th>
                <th className="p-2.5 text-center font-medium">Attivo</th>
                <th className="p-2.5 text-center font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nessun fornitore.</td></tr>
              ) : visible.map(s => (
                <tr key={s.id} className={tRow}>
                  <td className="p-2.5 font-medium text-foreground">{s.name}</td>
                  <td className="truncate p-2.5 text-muted-foreground">{s.address || '—'}</td>
                  <td className="p-2.5 text-right font-mono">{(s.shipping_cost ?? 0).toFixed(2)}</td>
                  <td className="p-2.5 text-right font-mono">{(s.cutting_cost_per_part ?? 0).toFixed(2)}</td>
                  <td className="p-2.5 text-center"><ActiveDot active={s.active !== false} /></td>
                  <td className="p-2.5"><RowActions onEdit={() => startEdit(s)} onDelete={() => setPendingDelete(s.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <SettingsModal title={form.id ? 'Modifica fornitore materiali' : 'Nuovo fornitore materiali'} icon={Box} accent="primary" onClose={() => setForm(null)} onSave={save} saveLabel="Salva fornitore">
          <div><label className={fieldLabel}>Nome *</label><Input value={form.name} onChange={e => set('name', e.target.value)} autoFocus /></div>
          <div><label className={fieldLabel}>Indirizzo</label><Input value={form.address} onChange={e => set('address', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={fieldLabel}>Spedizione (€)</label><Input className="font-mono" value={form.shipping_cost} onChange={e => set('shipping_cost', e.target.value)} /></div>
            <div><label className={fieldLabel}>Taglio (€/pz)</label><Input className="font-mono" value={form.cutting_cost_per_part} onChange={e => set('cutting_cost_per_part', e.target.value)} /></div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={form.active} onChange={e => set('active', e.target.checked)} /> Attivo</label>
        </SettingsModal>
      )}
      <ConfirmDialog open={pendingDelete != null} title="Eliminare questo fornitore?" confirmLabel="Elimina" onConfirm={confirmDel} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
