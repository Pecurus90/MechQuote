import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'

interface Customer {
  id: number
  customer_number: number
  name: string
  address: string | null
  email: string | null
  phone: string | null
}

interface FormState {
  customer_number: string
  name: string
  address: string
  email: string
  phone: string
}

const emptyForm = (): FormState => ({
  customer_number: '',
  name: '',
  address: '',
  email: '',
  phone: '',
})

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [search, setSearch] = useState('')

  const loadData = () => {
    api.get('/customers').then(res => {
      setCustomers(res.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const startEdit = (c: Customer) => {
    setEditingId(c.id)
    setForm({
      customer_number: String(c.customer_number),
      name: c.name,
      address: c.address || '',
      email: c.email || '',
      phone: c.phone || '',
    })
  }

  const startNew = () => {
    setEditingId(0)
    setForm(emptyForm())
  }

  const closeForm = () => setEditingId(null)

  const handleSave = async () => {
    if (!form.name || !form.customer_number) return
    const payload = {
      customer_number: Number(form.customer_number),
      name: form.name,
      address: form.address || null,
      email: form.email || null,
      phone: form.phone || null,
    }
    try {
      if (editingId && editingId > 0) {
        await api.put(`/customers/${editingId}`, payload)
      } else {
        await api.post('/customers', payload)
      }
      closeForm()
      loadData()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo cliente?')) return
    try {
      await api.delete(`/customers/${id}`)
      loadData()
    } catch (e) { console.error(e) }
  }

  const filtered = customers.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      String(c.customer_number).includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Clienti</h1>
          <p className="text-sm text-gray-500 mt-0.5">{customers.length} clienti</p>
        </div>
        <Button onClick={startNew}>
          <Plus className="w-4 h-4 mr-1" /> Nuovo Cliente
        </Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Cerca per codice, nome o indirizzo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {loading ? <p className="text-gray-400">Caricamento...</p> : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600 w-20">Codice</th>
                  <th className="text-left p-3 font-medium text-gray-600">Nome</th>
                  <th className="text-left p-3 font-medium text-gray-600">Indirizzo</th>
                  <th className="text-left p-3 font-medium text-gray-600">Email</th>
                  <th className="text-left p-3 font-medium text-gray-600">Telefono</th>
                  <th className="text-center p-3 font-medium text-gray-600 w-20">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-400">Nessun cliente trovato.</td>
                  </tr>
                ) : (
                  filtered.map(c => (
                    <tr key={c.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-mono font-medium text-gray-700">{c.customer_number}</td>
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 text-gray-500 max-w-xs truncate">{c.address || '—'}</td>
                      <td className="p-3 text-gray-500">{c.email || '—'}</td>
                      <td className="p-3 text-gray-500">{c.phone || '—'}</td>
                      <td className="p-3 text-center">
                        <div className="flex gap-1.5 justify-center">
                          <button onClick={() => startEdit(c)} className="p-1 hover:bg-gray-100 rounded">
                            <Pencil className="w-3.5 h-3.5 text-blue-600" />
                          </button>
                          <button onClick={() => handleDelete(c.id)} className="p-1 hover:bg-red-50 rounded">
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {editingId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4">
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-semibold text-gray-900">
                {editingId > 0 ? 'Modifica Cliente' : 'Nuovo Cliente'}
              </h2>
              <button onClick={closeForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Codice Cliente *</label>
                  <Input className="mt-1 font-mono" type="number"
                    value={form.customer_number}
                    onChange={e => set('customer_number', e.target.value)} />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-medium text-gray-600">Telefono</label>
                  <Input className="mt-1" value={form.phone}
                    onChange={e => set('phone', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Nome / Ragione Sociale *</label>
                <Input className="mt-1" value={form.name}
                  onChange={e => set('name', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Indirizzo</label>
                <Input className="mt-1" value={form.address}
                  onChange={e => set('address', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Email</label>
                <Input className="mt-1" type="email" value={form.email}
                  onChange={e => set('email', e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-6 justify-end">
              <Button variant="outline" onClick={closeForm}>Annulla</Button>
              <Button onClick={handleSave} disabled={!form.name || !form.customer_number}>
                <Save className="w-4 h-4 mr-1" /> Salva
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
