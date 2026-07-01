import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search, Ruler } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import TreatmentFormModal from './TreatmentFormModal'
import TreatmentsImportButtons from './TreatmentsImportButtons'
import type { Supplier, Treatment } from '@/types'

interface SupForm { id: number | null; name: string; supplierType: string; address: string; shippingCost: string }
const emptySupplier = (): SupForm => ({ id: null, name: '', supplierType: '', address: '', shippingCost: '0' })

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
  useEscapeKey(() => setSupForm(null), !!supForm)

  const loadData = () => {
    Promise.all([api.get('/suppliers'), api.get('/treatments')]).then(([sRes, tRes]) => {
      setSuppliers(sRes.data)
      setTreatments(tRes.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  // --- Supplier CRUD ---
  const saveSupplier = async () => {
    if (!supForm) return
    const payload = { name: supForm.name, supplier_type: supForm.supplierType || null, address: supForm.address || null, shipping_cost: Number(supForm.shippingCost) }
    try {
      if (supForm.id) await api.put(`/suppliers/${supForm.id}`, payload)
      else await api.post('/suppliers', payload)
      toast.success('Fornitore salvato')
      setSupForm(null); loadData()
    } catch (e) {toast.error('Errore nel salvataggio') }
  }

  const deleteSupplier = (id: number) => setPendingDelSupplier(id)
  const confirmDeleteSupplier = async () => {
    if (pendingDelSupplier == null) return
    const id = pendingDelSupplier; setPendingDelSupplier(null)
    try { await api.delete(`/suppliers/${id}`); toast.success('Fornitore eliminato'); loadData() }
    catch (e) { toast.error('Errore nell\'eliminazione') }
  }

  // --- Treatment CRUD ---
  const startNewTreat = () => { setEditTreat(null); setShowTreatForm(true) }
  const startEditTreat = (t: Treatment) => { setEditTreat(t); setShowTreatForm(true) }

  const deleteTreat = (id: number) => setPendingDelTreat(id)
  const confirmDeleteTreat = async () => {
    if (pendingDelTreat == null) return
    const id = pendingDelTreat; setPendingDelTreat(null)
    try { await api.delete(`/treatments/${id}`); toast.success('Trattamento eliminato'); loadData() }
    catch (e) { toast.error('Errore nell\'eliminazione') }
  }

  const visibleSup = [...suppliers]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(s => !searchSup || s.name.toLowerCase().includes(searchSup.toLowerCase()) || (s.address || '').toLowerCase().includes(searchSup.toLowerCase()))

  const visibleTreat = [...treatments]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(t => !searchTreat || t.name.toLowerCase().includes(searchTreat.toLowerCase()) || (t.treatment_type || '').toLowerCase().includes(searchTreat.toLowerCase()))

  if (loading) return <div className="p-8 text-muted-foreground">Caricamento...</div>

  return (
    <StandardPage
      icon={Ruler}
      color="orange"
      width="full"
      title="Trattamenti"
      subtitle="Trattamenti termici/superficiali con tariffa €/kg o €/dm³ e fornitori associati"
    >

      {/* ── Fornitori trattamenti ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Fornitori trattamenti</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Cerca..." value={searchSup} onChange={e => setSearchSup(e.target.value)} className="pl-9 w-40" />
            </div>
            <PrimaryCtaButton color="orange" size="sm" onClick={() => setSupForm(emptySupplier())}>
              <Plus className="w-4 h-4" /> Nuovo fornitore
            </PrimaryCtaButton>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="table-fixed w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left p-3 w-[28%] font-medium text-muted-foreground">Nome</th>
                  <th className="text-left p-3 w-[43%] font-medium text-muted-foreground">Indirizzo</th>
                  <th className="text-right p-3 w-[17%] font-medium text-muted-foreground">Spedizione (€)</th>
                  <th className="text-center p-3 w-[12%] font-medium text-muted-foreground">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleSup.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Nessun fornitore trovato.</td></tr>
                )}
                {visibleSup.map(s => (
                  supForm?.id === s.id ? (
                    <tr key={s.id} className="border-b bg-primary/10">
                      <td className="p-2"><Input className="h-8 text-sm" value={supForm.name} onChange={e => setSupForm(f => f ? { ...f, name: e.target.value } : f)} /></td>
                      <td className="p-2"><Input className="h-8 text-sm" placeholder="Indirizzo (opzionale)" value={supForm.address} onChange={e => setSupForm(f => f ? { ...f, address: e.target.value } : f)} /></td>
                      <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm w-full" value={supForm.shippingCost} onChange={e => setSupForm(f => f ? { ...f, shippingCost: e.target.value } : f)} /></td>
                      <td className="p-2 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={saveSupplier} className="p-1 hover:bg-green-100 rounded"><Save className="w-4 h-4 text-green-600" /></button>
                          <button onClick={() => setSupForm(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4 text-muted-foreground" /></button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id} className="border-b hover:bg-muted">
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 text-muted-foreground">{s.address || '—'}</td>
                      <td className="p-3 text-right font-mono">{(s.shipping_cost ?? 0).toFixed(2)} €</td>
                      <td className="p-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => setSupForm({ id: s.id, name: s.name, supplierType: s.supplier_type || '', address: s.address || '', shippingCost: String(s.shipping_cost ?? 0) })} className="p-1 hover:bg-muted rounded">
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
                  <tr className="border-b bg-primary/10">
                    <td className="p-2"><Input className="h-8 text-sm" placeholder="Nome fornitore" value={supForm.name} onChange={e => setSupForm(f => f ? { ...f, name: e.target.value } : f)} /></td>
                    <td className="p-2"><Input className="h-8 text-sm" placeholder="Indirizzo (opzionale)" value={supForm.address} onChange={e => setSupForm(f => f ? { ...f, address: e.target.value } : f)} /></td>
                    <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm w-full" value={supForm.shippingCost} onChange={e => setSupForm(f => f ? { ...f, shippingCost: e.target.value } : f)} /></td>
                    <td className="p-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={saveSupplier} className="p-1 hover:bg-green-100 rounded"><Save className="w-4 h-4 text-green-600" /></button>
                        <button onClick={() => setSupForm(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4 text-muted-foreground" /></button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* ── Trattamenti ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Trattamenti</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Cerca..." value={searchTreat} onChange={e => setSearchTreat(e.target.value)} className="pl-9 w-40" />
            </div>
            <TreatmentsImportButtons onImported={loadData} />
            <PrimaryCtaButton color="orange" size="sm" onClick={startNewTreat}>
              <Plus className="w-4 h-4" /> Nuovo trattamento
            </PrimaryCtaButton>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="table-fixed w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left p-3 w-[22%] font-medium text-muted-foreground">Nome</th>
                  <th className="text-left p-3 w-[14%] font-medium text-muted-foreground">Tipo</th>
                  <th className="text-right p-3 w-[11%] font-medium text-muted-foreground">€/kg</th>
                  <th className="text-right p-3 w-[11%] font-medium text-muted-foreground">Min (€)</th>
                  <th className="text-right p-3 w-[11%] font-medium text-muted-foreground">Soglia (kg)</th>
                  <th className="text-left p-3 w-[20%] font-medium text-muted-foreground">Fornitore</th>
                  <th className="text-center p-3 w-[11%] font-medium text-muted-foreground">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleTreat.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nessun trattamento trovato.</td></tr>
                )}
                {visibleTreat.map(t => (
                  <tr key={t.id} className="border-b hover:bg-muted">
                    <td className="p-3 font-medium truncate">{t.name}</td>
                    <td className="p-3 truncate">{t.treatment_type || '—'}</td>
                    <td className="p-3 text-right">{t.cost_per_kg.toFixed(2)}</td>
                    <td className="p-3 text-right">{t.minimum_cost.toFixed(2)}</td>
                    <td className="p-3 text-right text-muted-foreground">{t.minimum_weight_kg != null ? `< ${t.minimum_weight_kg} kg` : '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground truncate">
                      {t.supplier?.name || '—'}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEditTreat(t)} className="p-1 hover:bg-muted rounded">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => deleteTreat(t.id)} className="p-1 hover:bg-red-50 rounded">
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

      {showTreatForm && (
        <TreatmentFormModal
          treatment={editTreat}
          suppliers={suppliers}
          onClose={() => setShowTreatForm(false)}
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
        open={pendingDelTreat != null}
        title="Eliminare questo trattamento?"
        confirmLabel="Elimina"
        onConfirm={confirmDeleteTreat}
        onCancel={() => setPendingDelTreat(null)}
      />
    </StandardPage>
  )
}
