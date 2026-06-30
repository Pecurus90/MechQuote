import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search, FileText, Box } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { familyLabel } from '@/lib/materialFamilies'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import MaterialFormModal from './MaterialFormModal'
import MaterialsImportButtons from './MaterialsImportButtons'
import type { Material, MaterialSupplier } from '@/types'

interface SupplierForm { id: number | null; name: string; address: string; shipping_cost: string; cutting_cost_per_part: string }
const emptySupplier = (): SupplierForm => ({ id: null, name: '', address: '', shipping_cost: '0', cutting_cost_per_part: '0' })

export default function MaterialsPage() {
  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [supForm, setSupForm] = useState<SupplierForm | null>(null)
  const [showMatForm, setShowMatForm] = useState(false)
  const [editMaterial, setEditMaterial] = useState<Material | null>(null)
  const [searchSup, setSearchSup] = useState('')
  const [searchMat, setSearchMat] = useState('')
  // Filtri "Solo attivi" — uniformazione cataloghi 2026-05-28.
  // La sezione "Fornitori materiali" qui dentro NON viene toccata (b3):
  // l'utente gestisce i fornitori ritirati su MaterialSuppliersPage.
  const [onlyActiveMat, setOnlyActiveMat] = useState(false)
  const [pendingDelSupplier, setPendingDelSupplier] = useState<number | null>(null)
  const [pendingDelMaterial, setPendingDelMaterial] = useState<number | null>(null)
  useEscapeKey(() => setSupForm(null), !!supForm)

  const loadData = () => {
    Promise.all([api.get('/material-suppliers'), api.get('/materials')]).then(([sRes, mRes]) => {
      setSuppliers(sRes.data)
      setMaterials(mRes.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const saveSupplier = async () => {
    if (!supForm) return
    const payload = { name: supForm.name, address: supForm.address || null, shipping_cost: Number(supForm.shipping_cost), cutting_cost_per_part: Number(supForm.cutting_cost_per_part) }
    try {
      if (supForm.id) await api.put(`/material-suppliers/${supForm.id}`, payload)
      else await api.post('/material-suppliers', payload)
      toast.success('Fornitore salvato')
      setSupForm(null); loadData()
    } catch (e) {toast.error('Errore nel salvataggio') }
  }

  const deleteSupplier = (id: number) => setPendingDelSupplier(id)
  const confirmDeleteSupplier = async () => {
    if (pendingDelSupplier == null) return
    const id = pendingDelSupplier; setPendingDelSupplier(null)
    try { await api.delete(`/material-suppliers/${id}`); toast.success('Fornitore eliminato'); loadData() }
    catch (e) { toast.error('Errore nell\'eliminazione') }
  }

  const deleteMaterial = (id: number) => setPendingDelMaterial(id)
  const confirmDeleteMaterial = async () => {
    if (pendingDelMaterial == null) return
    const id = pendingDelMaterial; setPendingDelMaterial(null)
    try { await api.delete(`/materials/${id}`); toast.success('Materiale eliminato'); loadData() }
    catch (e) { toast.error('Errore nell\'eliminazione') }
  }

  const startNewMat = () => { setEditMaterial(null); setShowMatForm(true) }
  const startEditMat = (m: Material) => { setEditMaterial(m); setShowMatForm(true) }

  const visibleSup = [...suppliers]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(s => !searchSup || s.name.toLowerCase().includes(searchSup.toLowerCase()) || (s.address || '').toLowerCase().includes(searchSup.toLowerCase()))

  const visibleMat = [...materials]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(m => {
      if (onlyActiveMat && !m.active) return false
      if (!searchMat) return true
      const q = searchMat.toLowerCase()
      return m.name.toLowerCase().includes(q)
          || (m.family ?? '').toLowerCase().includes(q)
          || familyLabel(m.family).toLowerCase().includes(q)
    })

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <StandardPage
      icon={Box}
      color="blue"
      title="Materiali"
      subtitle="Anagrafica materiali con densità, costo €/kg e scheda tecnica"
    >

      {/* ── Fornitori materiali ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Fornitori materiali</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input placeholder="Cerca..." value={searchSup} onChange={e => setSearchSup(e.target.value)} className="pl-9 w-40" />
            </div>
            <PrimaryCtaButton color="blue" size="sm" onClick={() => setSupForm(emptySupplier())}>
              <Plus className="w-4 h-4" /> Nuovo fornitore
            </PrimaryCtaButton>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="table-fixed w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 w-[25%] font-medium text-gray-600">Nome</th>
                  <th className="text-left p-3 w-[33%] font-medium text-gray-600">Indirizzo</th>
                  <th className="text-right p-3 w-[14%] font-medium text-gray-600">Spedizione (€)</th>
                  <th className="text-right p-3 w-[14%] font-medium text-gray-600">Taglio (€/pz)</th>
                  <th className="text-center p-3 w-[14%] font-medium text-gray-600">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleSup.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-gray-400">Nessun fornitore trovato.</td></tr>
                )}
                {visibleSup.map(s => (
                  supForm?.id === s.id ? (
                    <tr key={s.id} className="border-b bg-blue-50">
                      <td className="p-2"><Input className="h-8 text-sm" value={supForm.name} onChange={e => setSupForm(f => f ? { ...f, name: e.target.value } : f)} /></td>
                      <td className="p-2"><Input className="h-8 text-sm" value={supForm.address} onChange={e => setSupForm(f => f ? { ...f, address: e.target.value } : f)} /></td>
                      <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm w-full" value={supForm.shipping_cost} onChange={e => setSupForm(f => f ? { ...f, shipping_cost: e.target.value } : f)} /></td>
                      <td className="p-2"><Input type="number" step="0.5" min="0" className="h-8 text-sm w-full" value={supForm.cutting_cost_per_part} onChange={e => setSupForm(f => f ? { ...f, cutting_cost_per_part: e.target.value } : f)} /></td>
                      <td className="p-2 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={saveSupplier} className="p-1 hover:bg-green-100 rounded"><Save className="w-4 h-4 text-green-600" /></button>
                          <button onClick={() => setSupForm(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 text-gray-500 truncate">{s.address || '—'}</td>
                      <td className="p-3 text-right font-mono">{s.shipping_cost.toFixed(2)} €</td>
                      <td className="p-3 text-right font-mono">{(s.cutting_cost_per_part ?? 0).toFixed(2)} €</td>
                      <td className="p-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => setSupForm({ id: s.id, name: s.name, address: s.address || '', shipping_cost: String(s.shipping_cost), cutting_cost_per_part: String(s.cutting_cost_per_part ?? 0) })} className="p-1 hover:bg-gray-100 rounded">
                            <Pencil className="w-4 h-4 text-blue-600" />
                          </button>
                          <button onClick={() => deleteSupplier(s.id)} className="p-1 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
                {supForm?.id === null && (
                  <tr className="border-b bg-blue-50">
                    <td className="p-2"><Input className="h-8 text-sm" placeholder="Nome fornitore" value={supForm.name} onChange={e => setSupForm(f => f ? { ...f, name: e.target.value } : f)} /></td>
                    <td className="p-2"><Input className="h-8 text-sm" placeholder="Indirizzo (opzionale)" value={supForm.address} onChange={e => setSupForm(f => f ? { ...f, address: e.target.value } : f)} /></td>
                    <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm w-full" value={supForm.shipping_cost} onChange={e => setSupForm(f => f ? { ...f, shipping_cost: e.target.value } : f)} /></td>
                    <td className="p-2"><Input type="number" step="0.5" min="0" className="h-8 text-sm w-full" value={supForm.cutting_cost_per_part} onChange={e => setSupForm(f => f ? { ...f, cutting_cost_per_part: e.target.value } : f)} /></td>
                    <td className="p-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={saveSupplier} className="p-1 hover:bg-green-100 rounded"><Save className="w-4 h-4 text-green-600" /></button>
                        <button onClick={() => setSupForm(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* ── Materiali ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Materiali</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyActiveMat}
                onChange={e => setOnlyActiveMat(e.target.checked)}
                className="w-4 h-4"
              />
              Solo attivi
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input placeholder="Cerca..." value={searchMat} onChange={e => setSearchMat(e.target.value)} className="pl-9 w-40" />
            </div>
            <MaterialsImportButtons onImported={loadData} />
            <PrimaryCtaButton color="blue" size="sm" onClick={startNewMat}>
              <Plus className="w-4 h-4" /> Nuovo materiale
            </PrimaryCtaButton>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="table-fixed w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 w-[18%] font-medium text-gray-600">Nome</th>
                  <th className="text-left p-3 w-[13%] font-medium text-gray-600">Famiglia</th>
                  <th className="text-right p-3 w-[12%] font-medium text-gray-600">Densità (kg/dm³)</th>
                  <th className="text-right p-3 w-[11%] font-medium text-gray-600">Costo €/kg</th>
                  <th className="text-left p-3 w-[15%] font-medium text-gray-600">Fornitore</th>
                  <th className="text-center p-3 w-[11%] font-medium text-gray-600">Scheda PDF</th>
                  <th className="text-center p-3 w-[8%] font-medium text-gray-600">Attivo</th>
                  <th className="text-center p-3 w-[12%] font-medium text-gray-600">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleMat.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-gray-400">Nessun materiale trovato.</td></tr>
                )}
                {visibleMat.map(m => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium truncate">{m.name}</td>
                    <td className="p-3 truncate">{familyLabel(m.family)}</td>
                    <td className="p-3 text-right">{m.density_kg_dm3}</td>
                    <td className="p-3 text-right">{m.cost_per_kg}</td>
                    <td className="p-3 text-gray-500 text-xs truncate">{m.material_supplier?.name || '—'}</td>
                    <td className="p-3 text-center text-xs">
                      {m.has_datasheet
                        ? <span className="inline-flex items-center gap-1 text-green-700"><FileText className="w-3.5 h-3.5" /> Allegata</span>
                        : <span className="text-gray-400 italic">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      {m.active === false
                        ? <span className="text-gray-300 text-xs" title="Ritirato">●</span>
                        : <span className="text-green-600 text-xs" title="Attivo">●</span>}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEditMat(m)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => deleteMaterial(m.id)} className="p-1 hover:bg-red-50 rounded">
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
      </section>

      {showMatForm && (
        <MaterialFormModal
          material={editMaterial}
          suppliers={suppliers}
          onClose={() => setShowMatForm(false)}
          onSaved={loadData}
        />
      )}
      <ConfirmDialog
        open={pendingDelSupplier != null}
        title="Eliminare questo fornitore?"
        confirmLabel="Elimina"
        onConfirm={confirmDeleteSupplier}
        onCancel={() => setPendingDelSupplier(null)}
      />
      <ConfirmDialog
        open={pendingDelMaterial != null}
        title="Eliminare questo materiale?"
        confirmLabel="Elimina"
        onConfirm={confirmDeleteMaterial}
        onCancel={() => setPendingDelMaterial(null)}
      />
    </StandardPage>
  )
}
