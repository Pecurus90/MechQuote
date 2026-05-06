import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'

interface Supplier {
  id: number
  name: string
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
  minimum_cost: number
  minimum_weight_kg: number | null
  supplier_id: number | null
  supplier?: Supplier | null
  active: boolean
  notes: string
}

interface TreatForm {
  id: number | null
  name: string
  treatmentType: string
  fixedCost: string
  costPerKg: string
  costPerPart: string
  minimumCost: string
  minimumWeightKg: string
  supplierId: string
  active: boolean
  notes: string
}

const emptyForm = (): TreatForm => ({
  id: null, name: '', treatmentType: '', fixedCost: '0', costPerKg: '0',
  costPerPart: '0', minimumCost: '0', minimumWeightKg: '',
  supplierId: '', active: true, notes: '',
})

export default function TreatmentsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<TreatForm | null>(null)

  const loadData = () => {
    Promise.all([api.get('/suppliers'), api.get('/treatments')]).then(([sRes, tRes]) => {
      setSuppliers(sRes.data.filter((s: Supplier) => s.active))
      setTreatments(tRes.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const set = (k: keyof TreatForm, v: unknown) => setForm(f => f ? { ...f, [k]: v } : f)

  const startEdit = (t: Treatment) => setForm({
    id: t.id, name: t.name, treatmentType: t.treatment_type || '',
    fixedCost: String(t.fixed_cost || 0), costPerKg: String(t.cost_per_kg || 0),
    costPerPart: String(t.cost_per_part || 0), minimumCost: String(t.minimum_cost || 0),
    minimumWeightKg: t.minimum_weight_kg != null ? String(t.minimum_weight_kg) : '',
    supplierId: t.supplier_id ? String(t.supplier_id) : '',
    active: t.active, notes: t.notes || '',
  })

  const handleSave = async () => {
    if (!form) return
    const payload = {
      name: form.name,
      treatment_type: form.treatmentType,
      fixed_cost: Number(form.fixedCost),
      cost_per_kg: Number(form.costPerKg),
      cost_per_part: Number(form.costPerPart),
      minimum_cost: Number(form.minimumCost),
      minimum_weight_kg: form.minimumWeightKg !== '' ? Number(form.minimumWeightKg) : null,
      supplier_id: form.supplierId ? Number(form.supplierId) : null,
      active: form.active,
      notes: form.notes,
    }
    try {
      if (form.id) await api.put(`/treatments/${form.id}`, payload)
      else await api.post('/treatments', payload)
      setForm(null)
      loadData()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo trattamento?')) return
    try { await api.delete(`/treatments/${id}`); loadData() } catch (e) { console.error(e) }
  }

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trattamenti</h1>
        <Button size="sm" onClick={() => setForm(emptyForm())}>
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
                <th className="text-right p-3">Soglia (kg)</th>
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
                  <td className="p-3 text-right text-gray-500">{t.minimum_weight_kg != null ? `< ${t.minimum_weight_kg} kg` : '—'}</td>
                  <td className="p-3 text-xs text-gray-500">
                    {t.supplier
                      ? <span>{t.supplier.name}{t.supplier.shipping_cost > 0 && <span className="text-gray-400"> +{t.supplier.shipping_cost.toFixed(2)} €</span>}</span>
                      : '—'}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => startEdit(t)} className="p-1 hover:bg-gray-100 rounded">
                        <Pencil className="w-4 h-4 text-blue-600" />
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="p-1 hover:bg-red-50 rounded">
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

      {form && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{form.id ? 'Modifica' : 'Nuovo'} Trattamento</h3>
              <button onClick={() => setForm(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Nome</label>
                  <Input value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <Input value={form.treatmentType} placeholder="Es. Zincatura, Anodizzazione" onChange={e => set('treatmentType', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo fisso (€)</label>
                  <Input type="number" step="0.01" value={form.fixedCost} onChange={e => set('fixedCost', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo per kg (€)</label>
                  <Input type="number" step="0.01" value={form.costPerKg} onChange={e => set('costPerKg', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo minimo (€)</label>
                  <Input type="number" step="0.01" value={form.minimumCost} onChange={e => set('minimumCost', e.target.value)} />
                  <p className="text-[10px] text-gray-400 mt-0.5">Si applica se il lotto è sotto la soglia peso</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Soglia peso lotto (kg)</label>
                  <Input type="number" step="0.1" min="0" placeholder="—"
                    value={form.minimumWeightKg}
                    onChange={e => set('minimumWeightKg', e.target.value)} />
                  <p className="text-[10px] text-gray-400 mt-0.5">Se peso totale lotto {'<'} soglia → applica costo minimo</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Fornitore</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.supplierId}
                    onChange={e => set('supplierId', e.target.value)}
                  >
                    <option value="">Nessun fornitore</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.shipping_cost > 0 ? ` — spedizione ${s.shipping_cost.toFixed(2)} €` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">La spedizione del fornitore si somma al costo fisso quando si seleziona il trattamento nel ciclo di lavorazione</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Note</label>
                  <Input value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
                <div className="flex items-center gap-2 self-end">
                  <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
                  <label className="text-sm">Attivo</label>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Salva</Button>
                <Button variant="outline" onClick={() => setForm(null)}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
