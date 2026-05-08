import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'

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

const emptyForm = (): FormState => ({ customer_number: '', name: '', address: '', email: '', phone: '' })

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [search, setSearch] = useState('')

  const loadData = () => {
    api.get('/customers').then(res => { setCustomers(res.data); setLoading(false) })
  }

  useEffect(() => { loadData() }, [])

  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const startEdit = (c: Customer) => {
    setEditingId(c.id)
    setForm({ customer_number: String(c.customer_number), name: c.name, address: c.address || '', email: c.email || '', phone: c.phone || '' })
  }

  const closeForm = () => setEditingId(null)

  const handleSave = async () => {
    if (!form.name || !form.customer_number) return
    const payload = { customer_number: Number(form.customer_number), name: form.name, address: form.address || null, email: form.email || null, phone: form.phone || null }
    try {
      if (editingId && editingId > 0) await api.put(`/customers/${editingId}`, payload)
      else await api.post('/customers', payload)
      toast.success('Cliente salvato')
      closeForm(); loadData()
    } catch (e) {toast.error('Errore nel salvataggio') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo cliente?')) return
    try { await api.delete(`/customers/${id}`); toast.success('Cliente eliminato'); loadData() } catch (e) {toast.error('Errore nell\'eliminazione') }
  }

  const normalize = (s: string) => s.toLowerCase().replace(/\./g, '')

  const visible = [...customers]
    .sort((a, b) => a.customer_number - b.customer_number)
    .filter(c => {
      if (!search) return true
      const q = normalize(search)
      return String(c.customer_number).includes(q) || normalize(c.name).includes(q) || normalize(c.address || '').includes(q)
    })

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clienti</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{customers.length} clienti</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-48" />
          </div>
          <Button size="sm" onClick={() => { setEditingId(0); setForm(emptyForm()) }}>
            <Plus className="w-4 h-4 mr-1" /> Nuovo Cliente
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b">
              <tr>
                <th className="text-left p-3 w-[10%] font-medium text-gray-600 dark:text-gray-300">Codice</th>
                <th className="text-left p-3 w-[22%] font-medium text-gray-600 dark:text-gray-300">Nome</th>
                <th className="text-left p-3 w-[28%] font-medium text-gray-600 dark:text-gray-300">Indirizzo</th>
                <th className="text-left p-3 w-[24%] font-medium text-gray-600 dark:text-gray-300">Email</th>
                <th className="text-left p-3 w-[10%] font-medium text-gray-600 dark:text-gray-300">Telefono</th>
                <th className="text-center p-3 w-[6%] font-medium text-gray-600 dark:text-gray-300">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-gray-400">Nessun cliente trovato.</td></tr>
              ) : visible.map(c => (
                <tr key={c.id} className="border-b hover:bg-gray-50 dark:bg-gray-900">
                  <td className="p-3 font-mono font-medium text-gray-700 dark:text-gray-200">{c.customer_number}</td>
                  <td className="p-3 font-medium truncate">{c.name}</td>
                  <td className="p-3 text-gray-500 dark:text-gray-400 truncate">
                    {c.address
                      ? <a href={`https://maps.google.com/?q=${encodeURIComponent(c.address)}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{c.address}</a>
                      : '—'}
                  </td>
                  <td className="p-3 text-gray-500 dark:text-gray-400 truncate">
                    {c.email ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">{c.email}</a> : '—'}
                  </td>
                  <td className="p-3 text-gray-500 dark:text-gray-400 truncate">{c.phone || '—'}</td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1.5 justify-center">
                      <button onClick={() => startEdit(c)} className="p-1 hover:bg-gray-100 dark:bg-gray-700 rounded">
                        <Pencil className="w-4 h-4 text-blue-600" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1 hover:bg-red-50 rounded">
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

      {editingId !== null && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{editingId > 0 ? 'Modifica Cliente' : 'Nuovo Cliente'}</h3>
              <button onClick={closeForm} className="p-1 hover:bg-gray-100 dark:bg-gray-700 rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Codice Cliente *</label>
                  <Input className="font-mono" type="number" value={form.customer_number} onChange={e => set('customer_number', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Telefono</label>
                  <Input value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Nome / Ragione Sociale *</label>
                  <Input value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Indirizzo</label>
                  <Input value={form.address} onChange={e => set('address', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave} disabled={!form.name || !form.customer_number}>
                  <Save className="w-4 h-4 mr-1" /> Salva
                </Button>
                <Button variant="outline" onClick={closeForm}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
