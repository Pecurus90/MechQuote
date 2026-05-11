import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Box } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import type { MaterialSupplier } from '@/types'

interface FormState {
  id: number | null
  name: string
  address: string
  shipping_cost: string
  cutting_cost_per_part: string
  active: boolean
}

const empty = (): FormState => ({
  id: null, name: '', address: '',
  shipping_cost: '0', cutting_cost_per_part: '0', active: true,
})

export default function MaterialSuppliersPage() {
  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)

  const load = () => {
    api.get('/material-suppliers')
      .then(r => setSuppliers(r.data))
      .catch(() => toast.error('Errore caricamento fornitori'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => (f ? { ...f, [k]: v } : f))

  const startNew = () => setForm(empty())
  const startEdit = (s: MaterialSupplier) => setForm({
    id: s.id,
    name: s.name,
    address: s.address ?? '',
    shipping_cost: String(s.shipping_cost ?? 0),
    cutting_cost_per_part: String(s.cutting_cost_per_part ?? 0),
    active: s.active ?? true,
  })

  const save = async () => {
    if (!form || !form.name.trim()) { toast.error('Nome obbligatorio'); return }
    const payload = {
      name: form.name.trim(),
      address: form.address || null,
      shipping_cost: parseDecimal(form.shipping_cost) || 0,
      cutting_cost_per_part: parseDecimal(form.cutting_cost_per_part) || 0,
      active: form.active,
    }
    try {
      if (form.id) await api.put(`/material-suppliers/${form.id}`, payload)
      else await api.post('/material-suppliers', payload)
      toast.success('Fornitore salvato')
      setForm(null); load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    }
  }

  const del = async (id: number) => {
    if (!confirm('Eliminare questo fornitore?')) return
    try {
      await api.delete(`/material-suppliers/${id}`)
      toast.success('Fornitore eliminato')
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione')
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Box className="w-6 h-6 text-blue-700" /> Fornitori materiali
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Chi vende il materiale grezzo (con spese spedizione e taglio).
          </p>
        </div>
        <Button size="sm" onClick={startNew}>
          <Plus className="w-4 h-4 mr-1" /> Nuovo
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 w-[28%] font-medium text-gray-600">Nome</th>
                <th className="text-left p-3 font-medium text-gray-600">Indirizzo</th>
                <th className="text-right p-3 w-[14%] font-medium text-gray-600">Spedizione (€)</th>
                <th className="text-right p-3 w-[14%] font-medium text-gray-600">Taglio (€/pz)</th>
                <th className="text-center p-3 w-[10%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-400">Nessun fornitore.</td></tr>
              ) : suppliers.map(s => (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-gray-500 truncate">{s.address || '—'}</td>
                  <td className="p-3 text-right font-mono">{(s.shipping_cost ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">{(s.cutting_cost_per_part ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1.5 justify-center">
                      <button onClick={() => startEdit(s)} className="p-1 hover:bg-gray-100 rounded">
                        <Pencil className="w-4 h-4 text-blue-600" />
                      </button>
                      <button onClick={() => del(s.id)} className="p-1 hover:bg-red-50 rounded">
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
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">{form.id ? 'Modifica' : 'Nuovo'} Fornitore materiali</h3>
              <button onClick={() => setForm(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <CardContent className="pt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Nome *</label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium">Indirizzo</label>
                <Input value={form.address} onChange={e => set('address', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Spedizione (€)</label>
                  <Input value={form.shipping_cost} onChange={e => set('shipping_cost', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Taglio (€/pz)</label>
                  <Input value={form.cutting_cost_per_part} onChange={e => set('cutting_cost_per_part', e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={save}><Save className="w-4 h-4 mr-1" /> Salva</Button>
                <Button variant="outline" onClick={() => setForm(null)}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
