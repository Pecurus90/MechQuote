import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'

interface TreatmentSupplier {
  id: number
  name: string
  address: string | null
  shipping_cost: number
  active: boolean
}

interface Treatment {
  id: number
  name: string
  treatment_type: string
  fixed_cost: number
  cost_per_kg: number
  cost_per_part: number
  cost_per_surface_area: number
  minimum_cost: number
  treatment_supplier_id: number | null
  treatment_supplier?: TreatmentSupplier | null
  active: boolean
  notes: string
}

interface SupplierForm { id: number | null; name: string; address: string; shipping_cost: string; active: boolean }
const emptySupplier = (): SupplierForm => ({ id: null, name: '', address: '', shipping_cost: '0', active: true })

interface TreatForm {
  id: number | null; name: string; treatmentType: string; fixedCost: string
  costPerKg: string; costPerPart: string; costPerSurface: string; minimumCost: string
  treatmentSupplierId: string; active: boolean; notes: string
}
const emptyTreat = (): TreatForm => ({
  id: null, name: '', treatmentType: '', fixedCost: '0', costPerKg: '0',
  costPerPart: '0', costPerSurface: '0', minimumCost: '0',
  treatmentSupplierId: '', active: true, notes: '',
})

export default function TreatmentsPage() {
  const [suppliers, setSuppliers] = useState<TreatmentSupplier[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [loading, setLoading] = useState(true)
  const [supForm, setSupForm] = useState<SupplierForm | null>(null)
  const [treatForm, setTreatForm] = useState<TreatForm | null>(null)

  const loadData = () => {
    Promise.all([api.get('/treatment-suppliers'), api.get('/treatments')]).then(([sRes, tRes]) => {
      setSuppliers(sRes.data)
      setTreatments(tRes.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  // --- Supplier CRUD ---
  const saveSupplier = async () => {
    if (!supForm) return
    const payload = { name: supForm.name, address: supForm.address || null, shipping_cost: Number(supForm.shipping_cost), active: supForm.active }
    try {
      if (supForm.id) await api.put(`/treatment-suppliers/${supForm.id}`, payload)
      else await api.post('/treatment-suppliers', payload)
      setSupForm(null)
      loadData()
    } catch (e) { console.error(e) }
  }

  const deleteSupplier = async (id: number) => {
    if (!confirm('Eliminare questo fornitore?')) return
    try { await api.delete(`/treatment-suppliers/${id}`); loadData() } catch (e) { console.error(e) }
  }

  // --- Treatment CRUD ---
  const saveTreatment = async () => {
    if (!treatForm) return
    const payload = {
      name: treatForm.name,
      treatment_type: treatForm.treatmentType,
      fixed_cost: Number(treatForm.fixedCost),
      cost_per_kg: Number(treatForm.costPerKg),
      cost_per_part: Number(treatForm.costPerPart),
      cost_per_surface_area: Number(treatForm.costPerSurface),
      minimum_cost: Number(treatForm.minimumCost),
      treatment_supplier_id: treatForm.treatmentSupplierId ? Number(treatForm.treatmentSupplierId) : null,
      active: treatForm.active,
      notes: treatForm.notes,
    }
    try {
      if (treatForm.id) await api.put(`/treatments/${treatForm.id}`, payload)
      else await api.post('/treatments', payload)
      setTreatForm(null)
      loadData()
    } catch (e) { console.error(e) }
  }

  const deleteTreatment = async (id: number) => {
    if (!confirm('Eliminare questo trattamento?')) return
    try { await api.delete(`/treatments/${id}`); loadData() } catch (e) { console.error(e) }
  }

  const startEditTreat = (t: Treatment) => setTreatForm({
    id: t.id, name: t.name, treatmentType: t.treatment_type || '',
    fixedCost: String(t.fixed_cost || 0), costPerKg: String(t.cost_per_kg || 0),
    costPerPart: String(t.cost_per_part || 0), costPerSurface: String(t.cost_per_surface_area || 0),
    minimumCost: String(t.minimum_cost || 0),
    treatmentSupplierId: t.treatment_supplier_id ? String(t.treatment_supplier_id) : '',
    active: t.active, notes: t.notes || '',
  })

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Trattamenti</h1>

      {/* ── Fornitori trattamenti ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Fornitori trattamenti</h2>
          <Button size="sm" onClick={() => setSupForm(emptySupplier())}>
            <Plus className="w-4 h-4 mr-1" /> Nuovo fornitore
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Nome</th>
                  <th className="text-left p-3">Indirizzo</th>
                  <th className="text-right p-3">Spedizione (€)</th>
                  <th className="text-center p-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-gray-400 text-xs">Nessun fornitore</td></tr>
                )}
                {suppliers.map(s => (
                  supForm?.id === s.id ? (
                    <tr key={s.id} className="border-b bg-blue-50">
                      <td className="p-2"><Input className="h-8 text-sm" value={supForm.name} onChange={e => setSupForm(f => f ? { ...f, name: e.target.value } : f)} /></td>
                      <td className="p-2"><Input className="h-8 text-sm" value={supForm.address} onChange={e => setSupForm(f => f ? { ...f, address: e.target.value } : f)} /></td>
                      <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm w-24 ml-auto" value={supForm.shipping_cost} onChange={e => setSupForm(f => f ? { ...f, shipping_cost: e.target.value } : f)} /></td>
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
                      <td className="p-3 text-right font-mono">{s.shipping_cost.toFixed(2)} €</td>
                      <td className="p-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => setSupForm({ id: s.id, name: s.name, address: s.address || '', shipping_cost: String(s.shipping_cost), active: s.active })} className="p-1 hover:bg-gray-100 rounded">
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
                    <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm w-24 ml-auto" value={supForm.shipping_cost} onChange={e => setSupForm(f => f ? { ...f, shipping_cost: e.target.value } : f)} /></td>
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
          <Button size="sm" onClick={() => setTreatForm(emptyTreat())}>
            <Plus className="w-4 h-4 mr-1" /> Nuovo trattamento
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Nome</th>
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-right p-3">Fisso (€)</th>
                  <th className="text-right p-3">€/kg</th>
                  <th className="text-right p-3">Min (€)</th>
                  <th className="text-left p-3">Fornitore</th>
                  <th className="text-center p-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {treatments.map(t => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3">{t.treatment_type || '—'}</td>
                    <td className="p-3 text-right">{t.fixed_cost.toFixed(2)}</td>
                    <td className="p-3 text-right">{t.cost_per_kg.toFixed(2)}</td>
                    <td className="p-3 text-right">{t.minimum_cost.toFixed(2)}</td>
                    <td className="p-3 text-xs text-gray-500">
                      {t.treatment_supplier
                        ? <span>{t.treatment_supplier.name} <span className="text-gray-400">+{t.treatment_supplier.shipping_cost.toFixed(2)} €</span></span>
                        : '—'}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEditTreat(t)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => deleteTreatment(t.id)} className="p-1 hover:bg-red-50 rounded">
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
                  <label className="text-sm font-medium">Costo fisso trattamento (€)</label>
                  <Input type="number" step="0.01" value={treatForm.fixedCost} onChange={e => setTreatForm(f => f ? { ...f, fixedCost: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo per kg (€)</label>
                  <Input type="number" step="0.01" value={treatForm.costPerKg} onChange={e => setTreatForm(f => f ? { ...f, costPerKg: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo per parte (€)</label>
                  <Input type="number" step="0.01" value={treatForm.costPerPart} onChange={e => setTreatForm(f => f ? { ...f, costPerPart: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo minimo (€)</label>
                  <Input type="number" step="0.01" value={treatForm.minimumCost} onChange={e => setTreatForm(f => f ? { ...f, minimumCost: e.target.value } : f)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Fornitore trattamento</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={treatForm.treatmentSupplierId}
                    onChange={e => setTreatForm(f => f ? { ...f, treatmentSupplierId: e.target.value } : f)}
                  >
                    <option value="">Nessun fornitore</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} — spedizione {s.shipping_cost.toFixed(2)} €</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">La spedizione del fornitore si somma al costo fisso quando si seleziona il trattamento in un ciclo</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Note</label>
                  <Input value={treatForm.notes} onChange={e => setTreatForm(f => f ? { ...f, notes: e.target.value } : f)} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={treatForm.active} onChange={e => setTreatForm(f => f ? { ...f, active: e.target.checked } : f)} />
                  <label className="text-sm">Attivo</label>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={saveTreatment}><Save className="w-4 h-4 mr-1" /> Salva</Button>
                <Button variant="outline" onClick={() => setTreatForm(null)}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
