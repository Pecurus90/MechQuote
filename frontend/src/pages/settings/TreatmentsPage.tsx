import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search, Ruler, Upload, Download } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import type { Supplier, Treatment } from '@/types'

interface SupForm { id: number | null; name: string; supplierType: string; address: string; shippingCost: string }
const emptySupplier = (): SupForm => ({ id: null, name: '', supplierType: '', address: '', shippingCost: '0' })

interface TreatForm {
  id: number | null
  name: string
  treatmentType: string
  costPerKg: string
  minimumCost: string
  minimumWeightKg: string
  supplierId: string
  notes: string
}
const emptyTreat = (): TreatForm => ({
  id: null, name: '', treatmentType: '', costPerKg: '0',
  minimumCost: '0', minimumWeightKg: '', supplierId: '', notes: '',
})

export default function TreatmentsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [loading, setLoading] = useState(true)
  const [supForm, setSupForm] = useState<SupForm | null>(null)
  const [treatForm, setTreatForm] = useState<TreatForm | null>(null)
  const [searchSup, setSearchSup] = useState('')
  const [searchTreat, setSearchTreat] = useState('')
  const [pendingDelSupplier, setPendingDelSupplier] = useState<number | null>(null)
  const [pendingDelTreat, setPendingDelTreat] = useState<number | null>(null)
  const [importingTreat, setImportingTreat] = useState(false)
  const treatFileInputRef = useRef<HTMLInputElement>(null)
  useEscapeKey(() => setSupForm(null), !!supForm)
  useEscapeKey(() => setTreatForm(null), !!treatForm)

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
  const saveTreat = async () => {
    if (!treatForm) return
    const payload = {
      name: treatForm.name,
      treatment_type: treatForm.treatmentType,
      cost_per_kg: Number(treatForm.costPerKg),
      minimum_cost: Number(treatForm.minimumCost),
      minimum_weight_kg: treatForm.minimumWeightKg !== '' ? Number(treatForm.minimumWeightKg) : null,
      supplier_id: treatForm.supplierId ? Number(treatForm.supplierId) : null,
      notes: treatForm.notes,
    }
    try {
      if (treatForm.id) await api.put(`/treatments/${treatForm.id}`, payload)
      else await api.post('/treatments', payload)
      toast.success('Trattamento salvato')
      setTreatForm(null); loadData()
    } catch (e) {toast.error('Errore nel salvataggio') }
  }

  const handleImportTreatments = async (file: File) => {
    setImportingTreat(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/treatments/import-csv', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const { created, skipped_existing, skipped_invalid, examples } = res.data as {
        created: number; skipped_existing: number; skipped_invalid: number; examples: string[]
      }
      const parts = []
      if (created) parts.push(`${created} aggiunti`)
      if (skipped_existing) parts.push(`${skipped_existing} già presenti`)
      if (skipped_invalid) parts.push(`${skipped_invalid} scartati`)
      toast.success(`Import OK: ${parts.join(', ') || 'nessuna modifica'}`)
      if (skipped_invalid && examples?.length) {
        toast.warning(`Esempi scartati: ${examples.slice(0, 3).join(' · ')}`)
      }
      loadData()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'import')
    } finally {
      setImportingTreat(false)
      if (treatFileInputRef.current) treatFileInputRef.current.value = ''
    }
  }

  const downloadTreatmentsTemplate = async () => {
    try {
      const res = await api.get('/treatments/csv-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'trattamenti_modello.csv'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Errore scaricamento modello')
    }
  }

  const deleteTreat = (id: number) => setPendingDelTreat(id)
  const confirmDeleteTreat = async () => {
    if (pendingDelTreat == null) return
    const id = pendingDelTreat; setPendingDelTreat(null)
    try { await api.delete(`/treatments/${id}`); toast.success('Trattamento eliminato'); loadData() }
    catch (e) { toast.error('Errore nell\'eliminazione') }
  }

  const startEditTreat = (t: Treatment) => setTreatForm({
    id: t.id, name: t.name, treatmentType: t.treatment_type || '',
    costPerKg: String(t.cost_per_kg || 0),
    minimumCost: String(t.minimum_cost || 0),
    minimumWeightKg: t.minimum_weight_kg != null ? String(t.minimum_weight_kg) : '',
    supplierId: t.supplier_id ? String(t.supplier_id) : '',
    notes: t.notes || '',
  })

  const visibleSup = [...suppliers]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(s => !searchSup || s.name.toLowerCase().includes(searchSup.toLowerCase()) || (s.address || '').toLowerCase().includes(searchSup.toLowerCase()))

  const visibleTreat = [...treatments]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(t => !searchTreat || t.name.toLowerCase().includes(searchTreat.toLowerCase()) || (t.treatment_type || '').toLowerCase().includes(searchTreat.toLowerCase()))

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <PageContainer>
      <SettingsPageHeader
        icon={Ruler}
        color="orange"
        title="Trattamenti"
        subtitle="Trattamenti termici/superficiali con tariffa €/kg o €/dm³ e fornitori associati"
      />

      {/* ── Fornitori trattamenti ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Fornitori trattamenti</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 w-[28%] font-medium text-gray-600">Nome</th>
                  <th className="text-left p-3 w-[43%] font-medium text-gray-600">Indirizzo</th>
                  <th className="text-right p-3 w-[17%] font-medium text-gray-600">Spedizione (€)</th>
                  <th className="text-center p-3 w-[12%] font-medium text-gray-600">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleSup.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-400">Nessun fornitore trovato.</td></tr>
                )}
                {visibleSup.map(s => (
                  supForm?.id === s.id ? (
                    <tr key={s.id} className="border-b bg-blue-50">
                      <td className="p-2"><Input className="h-8 text-sm" value={supForm.name} onChange={e => setSupForm(f => f ? { ...f, name: e.target.value } : f)} /></td>
                      <td className="p-2"><Input className="h-8 text-sm" placeholder="Indirizzo (opzionale)" value={supForm.address} onChange={e => setSupForm(f => f ? { ...f, address: e.target.value } : f)} /></td>
                      <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm w-full" value={supForm.shippingCost} onChange={e => setSupForm(f => f ? { ...f, shippingCost: e.target.value } : f)} /></td>
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
                      <td className="p-3 text-gray-500">{s.address || '—'}</td>
                      <td className="p-3 text-right font-mono">{(s.shipping_cost ?? 0).toFixed(2)} €</td>
                      <td className="p-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => setSupForm({ id: s.id, name: s.name, supplierType: s.supplier_type || '', address: s.address || '', shippingCost: String(s.shipping_cost ?? 0) })} className="p-1 hover:bg-gray-100 rounded">
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
                    <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm w-full" value={supForm.shippingCost} onChange={e => setSupForm(f => f ? { ...f, shippingCost: e.target.value } : f)} /></td>
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

      {/* ── Trattamenti ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Trattamenti</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input placeholder="Cerca..." value={searchTreat} onChange={e => setSearchTreat(e.target.value)} className="pl-9 w-40" />
            </div>
            <input
              ref={treatFileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleImportTreatments(f)
              }}
            />
            <Button size="sm" variant="outline" onClick={downloadTreatmentsTemplate}
                    title="Scarica un modello CSV vuoto da compilare">
              <Download className="w-4 h-4 mr-1" /> Modello
            </Button>
            <Button size="sm" variant="outline" disabled={importingTreat}
                    onClick={() => treatFileInputRef.current?.click()}
                    title="Importa un CSV di trattamenti (separatore ;). Tariffa coerente con l'unità obbligatoria; Fornitore via nome esatto.">
              <Upload className="w-4 h-4 mr-1" /> {importingTreat ? 'Import...' : 'Importa CSV'}
            </Button>
            <PrimaryCtaButton color="orange" size="sm" onClick={() => setTreatForm(emptyTreat())}>
              <Plus className="w-4 h-4" /> Nuovo trattamento
            </PrimaryCtaButton>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="table-fixed w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 w-[22%] font-medium text-gray-600">Nome</th>
                  <th className="text-left p-3 w-[14%] font-medium text-gray-600">Tipo</th>
                  <th className="text-right p-3 w-[11%] font-medium text-gray-600">€/kg</th>
                  <th className="text-right p-3 w-[11%] font-medium text-gray-600">Min (€)</th>
                  <th className="text-right p-3 w-[11%] font-medium text-gray-600">Soglia (kg)</th>
                  <th className="text-left p-3 w-[20%] font-medium text-gray-600">Fornitore</th>
                  <th className="text-center p-3 w-[11%] font-medium text-gray-600">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleTreat.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-gray-400">Nessun trattamento trovato.</td></tr>
                )}
                {visibleTreat.map(t => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium truncate">{t.name}</td>
                    <td className="p-3 truncate">{t.treatment_type || '—'}</td>
                    <td className="p-3 text-right">{t.cost_per_kg.toFixed(2)}</td>
                    <td className="p-3 text-right">{t.minimum_cost.toFixed(2)}</td>
                    <td className="p-3 text-right text-gray-500">{t.minimum_weight_kg != null ? `< ${t.minimum_weight_kg} kg` : '—'}</td>
                    <td className="p-3 text-xs text-gray-500 truncate">
                      {t.supplier?.name || '—'}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEditTreat(t)} className="p-1 hover:bg-gray-100 rounded">
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

      {/* Treatment modal */}
      {treatForm && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{treatForm.id ? 'Modifica' : 'Nuovo'} Trattamento</h3>
              <button onClick={() => setTreatForm(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Nome</label>
                  <Input value={treatForm.name} onChange={e => setTreatForm(f => f ? { ...f, name: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <Input value={treatForm.treatmentType} placeholder="Es. Zincatura, Anodizzazione" onChange={e => setTreatForm(f => f ? { ...f, treatmentType: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo per kg (€)</label>
                  <Input type="number" step="0.01" value={treatForm.costPerKg} onChange={e => setTreatForm(f => f ? { ...f, costPerKg: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo minimo (€)</label>
                  <Input type="number" step="0.01" value={treatForm.minimumCost} onChange={e => setTreatForm(f => f ? { ...f, minimumCost: e.target.value } : f)} />
                  <p className="text-[10px] text-gray-400 mt-0.5">Si applica se il lotto è sotto la soglia peso</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Soglia peso lotto (kg)</label>
                  <Input type="number" step="0.1" min="0" placeholder="—"
                    value={treatForm.minimumWeightKg}
                    onChange={e => setTreatForm(f => f ? { ...f, minimumWeightKg: e.target.value } : f)} />
                  <p className="text-[10px] text-gray-400 mt-0.5">Se peso totale lotto {'<'} soglia → applica costo minimo</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Fornitore</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={treatForm.supplierId}
                    onChange={e => setTreatForm(f => f ? { ...f, supplierId: e.target.value } : f)}
                  >
                    <option value="">Nessun fornitore</option>
                    {[...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'it')).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Note</label>
                  <Input value={treatForm.notes} onChange={e => setTreatForm(f => f ? { ...f, notes: e.target.value } : f)} />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <PrimaryCtaButton color="orange" onClick={saveTreat}>Salva</PrimaryCtaButton>
                <Button variant="outline" onClick={() => setTreatForm(null)}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
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
    </PageContainer>
  )
}
