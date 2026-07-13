import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Search, Ruler } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import TreatmentFormModal from './TreatmentFormModal'
import TreatmentsImportButtons from './TreatmentsImportButtons'
import { tWrap, tHead, tRow, editRowStyle, RowActions, EditActions } from '@/components/settings/inlineEdit'
import type { Supplier, Treatment } from '@/types'

interface SupForm { id: number | null; name: string; supplierType: string; address: string; shippingCost: string }
const emptySupplier = (): SupForm => ({ id: null, name: '', supplierType: '', address: '', shippingCost: '0' })

const supEditCells = (form: SupForm, set: (f: SupForm) => void) => (
  <>
    <td className="p-2"><Input className="h-8 text-sm" placeholder="Nome fornitore" value={form.name} onChange={e => set({ ...form, name: e.target.value })} /></td>
    <td className="p-2"><Input className="h-8 text-sm" placeholder="Indirizzo (opzionale)" value={form.address} onChange={e => set({ ...form, address: e.target.value })} /></td>
    <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm font-mono" value={form.shippingCost} onChange={e => set({ ...form, shippingCost: e.target.value })} /></td>
  </>
)

export default function TreatmentsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [loading, setLoading] = useState(true)
  const [supForm, setSupForm] = useState<SupForm | null>(null)
  const [showTreatForm, setShowTreatForm] = useState(false)
  const [editTreat, setEditTreat] = useState<Treatment | null>(null)
  const [searchSup, setSearchSup] = useState('')
  const [searchTreat, setSearchTreat] = useState('')
  const [pendingDelSupplier, setPendingDelSupplier] = useState<number | null>(null)
  const [pendingDelTreat, setPendingDelTreat] = useState<number | null>(null)

  const loadData = () => Promise.all([api.get('/suppliers'), api.get('/treatments')]).then(([sRes, tRes]) => { setSuppliers(sRes.data); setTreatments(tRes.data); setLoading(false) })
  useEffect(() => { loadData() }, [])

  const saveSupplier = async () => {
    if (!supForm) return
    if (!supForm.name.trim()) { toast.error('Nome obbligatorio'); return }
    const payload = { name: supForm.name, supplier_type: supForm.supplierType || null, address: supForm.address || null, shipping_cost: Number(supForm.shippingCost) }
    try {
      if (supForm.id) await api.put(`/suppliers/${supForm.id}`, payload); else await api.post('/suppliers', payload)
      toast.success('Fornitore salvato'); setSupForm(null); loadData()
    } catch { toast.error('Errore nel salvataggio') }
  }
  const confirmDeleteSupplier = async () => {
    if (pendingDelSupplier == null) return
    const id = pendingDelSupplier; setPendingDelSupplier(null)
    try { await api.delete(`/suppliers/${id}`); toast.success('Fornitore eliminato'); loadData() } catch { toast.error('Errore nell\'eliminazione') }
  }
  const confirmDeleteTreat = async () => {
    if (pendingDelTreat == null) return
    const id = pendingDelTreat; setPendingDelTreat(null)
    try { await api.delete(`/treatments/${id}`); toast.success('Trattamento eliminato'); loadData() } catch { toast.error('Errore nell\'eliminazione') }
  }

  const visibleSup = [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'it')).filter(s => !searchSup || s.name.toLowerCase().includes(searchSup.toLowerCase()) || (s.address || '').toLowerCase().includes(searchSup.toLowerCase()))
  const visibleTreat = [...treatments].sort((a, b) => a.name.localeCompare(b.name, 'it')).filter(t => !searchTreat || t.name.toLowerCase().includes(searchTreat.toLowerCase()) || (t.treatment_type || '').toLowerCase().includes(searchTreat.toLowerCase()))
  if (loading) return <div className="p-8 text-muted-foreground">Caricamento…</div>

  const searchBox = (v: string, set: (s: string) => void) => (
    <div className="relative w-40"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Cerca…" value={v} onChange={e => set(e.target.value)} className="h-9 pl-9" /></div>
  )

  return (
    <StandardPage icon={Ruler} color="primary" width="xl" title="Trattamenti" subtitle="Trattamenti termici/superficiali con tariffa €/kg o €/dm³ e fornitori associati">
      {/* Fornitori trattamenti (inline-edit) */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Fornitori trattamenti</h2>
          <div className="flex items-center gap-2.5">{searchBox(searchSup, setSearchSup)}<PrimaryCtaButton color="primary" size="sm" onClick={() => setSupForm(emptySupplier())}><Plus className="h-4 w-4" /> Nuovo fornitore</PrimaryCtaButton></div>
        </div>
        <div className={tWrap}>
          <table className="w-full text-sm">
            <colgroup><col style={{ width: '28%' }} /><col /><col style={{ width: 150 }} /><col style={{ width: 90 }} /></colgroup>
            <thead><tr className={tHead}><th className="p-2.5 text-left font-medium">Nome</th><th className="p-2.5 text-left font-medium">Indirizzo</th><th className="p-2.5 text-left font-medium">Spedizione (€)</th><th className="p-2.5 text-center font-medium">Azioni</th></tr></thead>
            <tbody>
              {visibleSup.length === 0 && !supForm && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nessun fornitore trovato.</td></tr>}
              {visibleSup.map(s => supForm?.id === s.id ? (
                <tr key={s.id} className="border-b border-border bg-primary/[0.05]" style={editRowStyle('primary')}>
                  {supEditCells(supForm, setSupForm)}
                  <td className="p-2"><EditActions onSave={saveSupplier} onCancel={() => setSupForm(null)} /></td>
                </tr>
              ) : (
                <tr key={s.id} className={tRow}>
                  <td className="p-2.5 font-medium text-foreground">{s.name}</td>
                  <td className="p-2.5 text-muted-foreground">{s.address || '—'}</td>
                  <td className="p-2.5 font-mono">{(s.shipping_cost ?? 0).toFixed(2)} €</td>
                  <td className="p-2.5"><RowActions onEdit={() => setSupForm({ id: s.id, name: s.name, supplierType: s.supplier_type || '', address: s.address || '', shippingCost: String(s.shipping_cost ?? 0) })} onDelete={() => setPendingDelSupplier(s.id)} /></td>
                </tr>
              ))}
              {supForm?.id === null && (
                <tr className="border-t-2 border-dashed border-border bg-primary/[0.04]">
                  {supEditCells(supForm, setSupForm)}
                  <td className="p-2"><EditActions onSave={saveSupplier} onCancel={() => setSupForm(null)} /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trattamenti (tabella + modale) */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Trattamenti</h2>
          <div className="flex flex-wrap items-center gap-2.5">{searchBox(searchTreat, setSearchTreat)}<TreatmentsImportButtons onImported={loadData} /><PrimaryCtaButton color="primary" size="sm" onClick={() => { setEditTreat(null); setShowTreatForm(true) }}><Plus className="h-4 w-4" /> Nuovo trattamento</PrimaryCtaButton></div>
        </div>
        <div className={tWrap}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <colgroup><col style={{ width: '22%' }} /><col style={{ width: 130 }} /><col style={{ width: 90 }} /><col style={{ width: 90 }} /><col style={{ width: 110 }} /><col /><col style={{ width: 90 }} /></colgroup>
              <thead>
                <tr className={tHead}>
                  <th className="p-2.5 text-left font-medium">Nome</th>
                  <th className="p-2.5 text-left font-medium">Tipo</th>
                  <th className="p-2.5 text-right font-medium">€/kg</th>
                  <th className="p-2.5 text-right font-medium">Min (€)</th>
                  <th className="p-2.5 text-right font-medium">Soglia (kg)</th>
                  <th className="p-2.5 text-left font-medium">Fornitore</th>
                  <th className="p-2.5 text-center font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleTreat.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nessun trattamento trovato.</td></tr>
                ) : visibleTreat.map(t => (
                  <tr key={t.id} className={tRow}>
                    <td className="truncate p-2.5 font-medium text-foreground">{t.name}</td>
                    <td className="truncate p-2.5">{t.treatment_type || '—'}</td>
                    <td className="p-2.5 text-right font-mono">{t.cost_per_kg.toFixed(2)}</td>
                    <td className="p-2.5 text-right font-mono">{t.minimum_cost.toFixed(2)}</td>
                    <td className="p-2.5 text-right font-mono text-muted-foreground">{t.minimum_weight_kg != null ? `< ${t.minimum_weight_kg} kg` : '—'}</td>
                    <td className="truncate p-2.5 text-muted-foreground">{t.supplier?.name || '—'}</td>
                    <td className="p-2.5"><RowActions onEdit={() => { setEditTreat(t); setShowTreatForm(true) }} onDelete={() => setPendingDelTreat(t.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {showTreatForm && <TreatmentFormModal treatment={editTreat} suppliers={suppliers} onClose={() => setShowTreatForm(false)} onSaved={loadData} />}
      <ConfirmDialog open={pendingDelSupplier != null} title="Eliminare questo fornitore?" confirmLabel="Elimina" onConfirm={confirmDeleteSupplier} onCancel={() => setPendingDelSupplier(null)} />
      <ConfirmDialog open={pendingDelTreat != null} title="Eliminare questo trattamento?" confirmLabel="Elimina" onConfirm={confirmDeleteTreat} onCancel={() => setPendingDelTreat(null)} />
    </StandardPage>
  )
}
