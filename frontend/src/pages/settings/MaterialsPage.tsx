import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Search, FileText, Box } from 'lucide-react'
import api from '@/lib/api'
import { parseDecimal } from '@/lib/decimalInput'
import { toast } from 'sonner'
import { familyLabel } from '@/lib/materialFamilies'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import MaterialFormModal from './MaterialFormModal'
import MaterialsImportButtons from './MaterialsImportButtons'
import { tWrap, tHead, tRow, editRowStyle, RowActions, EditActions } from '@/components/settings/inlineEdit'
import { ActiveDot } from '@/components/settings/crud'
import type { Material, MaterialSupplier } from '@/types'

const FAM_CLS: Record<string, string> = {
  acciaio: 'bg-fam-acciaio/[0.14] text-fam-acciaio', acciaio_inox: 'bg-fam-inox/[0.14] text-fam-inox',
  acciaio_legato: 'bg-fam-legato/[0.14] text-fam-legato', alluminio: 'bg-fam-alluminio/[0.14] text-fam-alluminio',
  ottone: 'bg-fam-ottone/[0.14] text-fam-ottone', rame: 'bg-fam-rame/[0.14] text-fam-rame',
  bronzo: 'bg-fam-bronzo/[0.14] text-fam-bronzo', plastica: 'bg-fam-plastica/[0.14] text-fam-plastica',
  altro: 'bg-fam-altro/[0.14] text-fam-altro',
}
const famClass = (f: string | null | undefined) => (f && FAM_CLS[f]) || FAM_CLS.altro

interface SupplierForm { id: number | null; name: string; address: string; shipping_cost: string; cutting_cost_per_part: string }
const emptySupplier = (): SupplierForm => ({ id: null, name: '', address: '', shipping_cost: '0', cutting_cost_per_part: '0' })

const supCells = (f: SupplierForm, set: (v: SupplierForm) => void) => (
  <>
    <td className="p-2"><Input className="h-8 text-sm" placeholder="Nome fornitore" value={f.name} onChange={e => set({ ...f, name: e.target.value })} /></td>
    <td className="p-2"><Input className="h-8 text-sm" placeholder="Indirizzo (opzionale)" value={f.address} onChange={e => set({ ...f, address: e.target.value })} /></td>
    <td className="p-2"><Input type="text" inputMode="decimal" className="h-8 font-mono text-sm" value={f.shipping_cost} onChange={e => set({ ...f, shipping_cost: e.target.value })} /></td>
    <td className="p-2"><Input type="text" inputMode="decimal" className="h-8 font-mono text-sm" value={f.cutting_cost_per_part} onChange={e => set({ ...f, cutting_cost_per_part: e.target.value })} /></td>
  </>
)

export default function MaterialsPage() {
  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [supForm, setSupForm] = useState<SupplierForm | null>(null)
  const [showMatForm, setShowMatForm] = useState(false)
  const [editMaterial, setEditMaterial] = useState<Material | null>(null)
  const [searchSup, setSearchSup] = useState('')
  const [searchMat, setSearchMat] = useState('')
  const [onlyActiveMat, setOnlyActiveMat] = useState(false)
  const [pendingDelSupplier, setPendingDelSupplier] = useState<number | null>(null)
  const [pendingDelMaterial, setPendingDelMaterial] = useState<number | null>(null)

  const loadData = () => Promise.all([api.get('/material-suppliers'), api.get('/materials')]).then(([sRes, mRes]) => { setSuppliers(sRes.data); setMaterials(mRes.data); setLoading(false) })
  useEffect(() => { loadData() }, [])

  const saveSupplier = async () => {
    if (!supForm) return
    if (!supForm.name.trim()) { toast.error('Nome obbligatorio'); return }
    const payload = { name: supForm.name, address: supForm.address || null, shipping_cost: parseDecimal(supForm.shipping_cost), cutting_cost_per_part: parseDecimal(supForm.cutting_cost_per_part) }
    try {
      if (supForm.id) await api.put(`/material-suppliers/${supForm.id}`, payload); else await api.post('/material-suppliers', payload)
      toast.success('Fornitore salvato'); setSupForm(null); loadData()
    } catch { toast.error('Errore nel salvataggio') }
  }
  const confirmDeleteSupplier = async () => {
    if (pendingDelSupplier == null) return
    const id = pendingDelSupplier; setPendingDelSupplier(null)
    try { await api.delete(`/material-suppliers/${id}`); toast.success('Fornitore eliminato'); loadData() } catch { toast.error('Errore nell\'eliminazione') }
  }
  const confirmDeleteMaterial = async () => {
    if (pendingDelMaterial == null) return
    const id = pendingDelMaterial; setPendingDelMaterial(null)
    try { await api.delete(`/materials/${id}`); toast.success('Materiale eliminato'); loadData() } catch { toast.error('Errore nell\'eliminazione') }
  }

  const visibleSup = [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'it')).filter(s => !searchSup || s.name.toLowerCase().includes(searchSup.toLowerCase()) || (s.address || '').toLowerCase().includes(searchSup.toLowerCase()))
  const visibleMat = [...materials].sort((a, b) => a.name.localeCompare(b.name, 'it')).filter(m => {
    if (onlyActiveMat && !m.active) return false
    if (!searchMat) return true
    const q = searchMat.toLowerCase()
    return m.name.toLowerCase().includes(q) || (m.family ?? '').toLowerCase().includes(q) || familyLabel(m.family).toLowerCase().includes(q)
  })
  if (loading) return <div className="p-8 text-muted-foreground">Caricamento…</div>

  const searchBox = (v: string, set: (s: string) => void) => (
    <div className="relative w-40"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Cerca…" value={v} onChange={e => set(e.target.value)} className="h-9 pl-9" /></div>
  )

  return (
    <StandardPage icon={Box} color="primary" width="xl" title="Materiali" subtitle="Anagrafica materiali con densità, costo €/kg e scheda tecnica">
      {/* Fornitori materiali (inline-edit) */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Fornitori materiali</h2>
          <div className="flex items-center gap-2.5">{searchBox(searchSup, setSearchSup)}<PrimaryCtaButton color="primary" size="sm" onClick={() => setSupForm(emptySupplier())}><Plus className="h-4 w-4" /> Nuovo fornitore</PrimaryCtaButton></div>
        </div>
        <div className={tWrap}>
          <table className="w-full text-sm">
            <colgroup><col style={{ width: '24%' }} /><col /><col style={{ width: 140 }} /><col style={{ width: 140 }} /><col style={{ width: 90 }} /></colgroup>
            <thead><tr className={tHead}><th className="p-2.5 text-left font-medium">Nome</th><th className="p-2.5 text-left font-medium">Indirizzo</th><th className="p-2.5 text-left font-medium">Spedizione (€)</th><th className="p-2.5 text-left font-medium">Taglio (€/pz)</th><th className="p-2.5 text-center font-medium">Azioni</th></tr></thead>
            <tbody>
              {visibleSup.length === 0 && !supForm && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nessun fornitore trovato.</td></tr>}
              {visibleSup.map(s => supForm?.id === s.id ? (
                <tr key={s.id} className="border-b border-border bg-primary/[0.05]" style={editRowStyle('primary')}>{supCells(supForm, setSupForm)}<td className="p-2"><EditActions onSave={saveSupplier} onCancel={() => setSupForm(null)} /></td></tr>
              ) : (
                <tr key={s.id} className={tRow}>
                  <td className="p-2.5 font-medium text-foreground">{s.name}</td>
                  <td className="truncate p-2.5 text-muted-foreground">{s.address || '—'}</td>
                  <td className="p-2.5 font-mono">{s.shipping_cost.toFixed(2)} €</td>
                  <td className="p-2.5 font-mono">{(s.cutting_cost_per_part ?? 0).toFixed(2)} €</td>
                  <td className="p-2.5"><RowActions onEdit={() => setSupForm({ id: s.id, name: s.name, address: s.address || '', shipping_cost: String(s.shipping_cost), cutting_cost_per_part: String(s.cutting_cost_per_part ?? 0) })} onDelete={() => setPendingDelSupplier(s.id)} /></td>
                </tr>
              ))}
              {supForm?.id === null && <tr className="border-t-2 border-dashed border-border bg-primary/[0.04]">{supCells(supForm, setSupForm)}<td className="p-2"><EditActions onSave={saveSupplier} onCancel={() => setSupForm(null)} /></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Materiali (tabella + modale) */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Materiali</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="accent-primary" checked={onlyActiveMat} onChange={e => setOnlyActiveMat(e.target.checked)} /> Solo attivi</label>
            {searchBox(searchMat, setSearchMat)}
            <MaterialsImportButtons onImported={loadData} />
            <PrimaryCtaButton color="primary" size="sm" onClick={() => { setEditMaterial(null); setShowMatForm(true) }}><Plus className="h-4 w-4" /> Nuovo materiale</PrimaryCtaButton>
          </div>
        </div>
        <div className={tWrap}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <colgroup><col style={{ width: '18%' }} /><col style={{ width: 130 }} /><col style={{ width: 120 }} /><col style={{ width: 100 }} /><col /><col style={{ width: 110 }} /><col style={{ width: 70 }} /><col style={{ width: 90 }} /></colgroup>
              <thead>
                <tr className={tHead}>
                  <th className="p-2.5 text-left font-medium">Nome</th>
                  <th className="p-2.5 text-left font-medium">Famiglia</th>
                  <th className="p-2.5 text-right font-medium">Densità (kg/dm³)</th>
                  <th className="p-2.5 text-right font-medium">Costo €/kg</th>
                  <th className="p-2.5 text-left font-medium">Fornitore</th>
                  <th className="p-2.5 text-center font-medium">Scheda PDF</th>
                  <th className="p-2.5 text-center font-medium">Attivo</th>
                  <th className="p-2.5 text-center font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleMat.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nessun materiale trovato.</td></tr>
                ) : visibleMat.map(m => (
                  <tr key={m.id} className={tRow}>
                    <td className="truncate p-2.5 font-mono font-semibold text-foreground">{m.name}</td>
                    <td className="p-2.5">{m.family && <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${famClass(m.family)}`}>{familyLabel(m.family)}</span>}</td>
                    <td className="p-2.5 text-right font-mono">{m.density_kg_dm3}</td>
                    <td className="p-2.5 text-right font-mono">{m.cost_per_kg}</td>
                    <td className="truncate p-2.5 text-xs text-muted-foreground">{m.material_supplier?.name || '—'}</td>
                    <td className="p-2.5 text-center text-xs">{m.has_datasheet ? <span className="inline-flex items-center gap-1 text-success"><FileText className="h-3.5 w-3.5" /> Allegata</span> : <span className="italic text-muted-foreground">—</span>}</td>
                    <td className="p-2.5 text-center"><ActiveDot active={m.active !== false} /></td>
                    <td className="p-2.5"><RowActions onEdit={() => { setEditMaterial(m); setShowMatForm(true) }} onDelete={() => setPendingDelMaterial(m.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {showMatForm && <MaterialFormModal material={editMaterial} suppliers={suppliers} onClose={() => setShowMatForm(false)} onSaved={loadData} />}
      <ConfirmDialog open={pendingDelSupplier != null} title="Eliminare questo fornitore?" confirmLabel="Elimina" onConfirm={confirmDeleteSupplier} onCancel={() => setPendingDelSupplier(null)} />
      <ConfirmDialog open={pendingDelMaterial != null} title="Eliminare questo materiale?" confirmLabel="Elimina" onConfirm={confirmDeleteMaterial} onCancel={() => setPendingDelMaterial(null)} />
    </StandardPage>
  )
}
