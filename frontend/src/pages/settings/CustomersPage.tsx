import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Phone, Mail } from 'lucide-react'
import api from '@/lib/api'

interface Customer {
  id: number
  name: string
  vat_number: string
  address: string
  phone: string
  email: string
  contact_person: string
  active: boolean
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [vat, setVat] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [contact, setContact] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(true)

  const loadData = () => {
    api.get('/customers').then(res => {
      setCustomers(res.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew: boolean = false) => {
    setEditingId(isNew ? 0 : null)
    setName('')
    setVat('')
    setAddress('')
    setPhone('')
    setEmail('')
    setContact('')
    setNotes('')
    setActive(true)
  }

  const startEdit = (c: Customer) => {
    setEditingId(c.id)
    setName(c.name)
    setVat(c.vat_number || '')
    setAddress(c.address || '')
    setPhone(c.phone || '')
    setEmail(c.email || '')
    setContact(c.contact_person || '')
    setNotes('')
    setActive(c.active)
  }

  const handleSave = async () => {
    const payload = {
      name,
      vat_number: vat,
      address,
      phone,
      email,
      contact_person: contact,
      active,
    }
    try {
      if (editingId && editingId > 0) {
        await api.put(`/customers/${editingId}`, payload)
      } else {
        await api.post('/customers', payload)
      }
      resetForm()
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

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Clienti</h1>
        <Button onClick={() => resetForm(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuovo
        </Button>
      </div>

      {loading ? <p>Caricamento...</p> : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Nome</th>
                  <th className="text-left p-3">P.IVA</th>
                  <th className="text-left p-3">Telefono</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-center p-3">Attivo</th>
                  <th className="text-center p-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3">{c.vat_number || '-'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {c.phone || '-'}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {c.email || '-'}
                      </div>
                    </td>
                    <td className="p-3 text-center">{c.active ? 'Sì' : 'No'}</td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEdit(c)} className="p-1 hover:bg-gray-100 rounded">
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
      )}

      {editingId !== null && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl bg-white shadow-xl">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{editingId && editingId > 0 ? 'Modifica' : 'Nuovo'} Cliente</CardTitle>
                <button onClick={() => resetForm()} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium">Nome *</label>
                  <Input value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">P.IVA / VAT</label>
                  <Input value={vat} onChange={e => setVat(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Persona di Riferimento</label>
                  <Input value={contact} onChange={e => setContact(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Indirizzo</label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Telefono</label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Note</label>
                  <Input value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                  <label className="text-sm">Attivo</label>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Salva</Button>
                <Button variant="outline" onClick={() => resetForm()}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
