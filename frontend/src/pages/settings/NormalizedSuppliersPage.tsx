import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, X, Cog } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import type { NormalizedSupplier } from '@/types'

interface FormState {
  id: number | null
  name: string
  address: string
  phone: string
  email: string
  notes: string
  active: boolean
}

const empty = (): FormState => ({ id: null, name: '', address: '', phone: '', email: '', notes: '', active: true })

export default function NormalizedSuppliersPage() {
  const [suppliers, setSuppliers] = useState<NormalizedSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const [onlyActive, setOnlyActive] = useState(false)
  useEscapeKey(() => setForm(null), !!form)

  const visible = onlyActive ? suppliers.filter(s => s.active !== false) : suppliers

  const load = () => {
    api.get('/normalized-suppliers')
      .then(r => setSuppliers(r.data))
      .catch(() => toast.error('Errore caricamento fornitori'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => (f ? { ...f, [k]: v } : f))

  const startNew = () => setForm(empty())
  const startEdit = (s: NormalizedSupplier) => setForm({
    id: s.id, name: s.name, address: s.address ?? '', phone: s.phone ?? '',
    email: s.email ?? '', notes: s.notes ?? '', active: s.active ?? true,
  })

  const save = async () => {
    if (!form || !form.name.trim()) { toast.error('Nome obbligatorio'); return }
    const payload = {
      name: form.name.trim(),
      address: form.address || null,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
      active: form.active,
    }
    try {
      if (form.id) await api.put(`/normalized-suppliers/${form.id}`, payload)
      else await api.post('/normalized-suppliers', payload)
      toast.success('Fornitore salvato')
      setForm(null); load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    }
  }

  const del = (id: number) => setPendingDelete(id)
  const confirmDel = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try {
      await api.delete(`/normalized-suppliers/${id}`)
      toast.success('Fornitore eliminato')
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione')
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <PageContainer width="md">
      <SettingsPageHeader
        icon={Cog}
        color="sky"
        title="Fornitori normalizzati"
        subtitle="Fornitori di componenti standard: viti, bulloni, cuscinetti, dadi, rondelle, guarnizioni, raccordi (es. Bossard, Würth, Misumi)."
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={e => setOnlyActive(e.target.checked)}
                className="w-4 h-4"
              />
              Solo attivi
            </label>
            <PrimaryCtaButton color="sky" onClick={startNew}>
              <Plus className="w-4 h-4" /> Nuovo
            </PrimaryCtaButton>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 w-[28%] font-medium text-gray-600">Nome</th>
                <th className="text-left p-3 font-medium text-gray-600">Indirizzo</th>
                <th className="text-left p-3 w-[16%] font-medium text-gray-600">Telefono</th>
                <th className="text-center p-3 w-[8%] font-medium text-gray-600">Attivo</th>
                <th className="text-center p-3 w-[10%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-400">Nessun fornitore.</td></tr>
              ) : visible.map(s => (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-gray-500 truncate">{s.address || '—'}</td>
                  <td className="p-3 text-gray-500 font-mono text-xs">{s.phone || '—'}</td>
                  <td className="p-3 text-center">
                    {s.active === false
                      ? <span className="text-gray-300 text-xs" title="Ritirato">●</span>
                      : <span className="text-green-600 text-xs" title="Attivo">●</span>}
                  </td>
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
              <h3 className="font-semibold">{form.id ? 'Modifica' : 'Nuovo'} Fornitore normalizzati</h3>
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
              <div>
                <label className="text-sm font-medium">Telefono</label>
                <Input value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Note</label>
                <Input value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => set('active', e.target.checked)}
                  className="w-4 h-4"
                />
                Attivo
              </label>
              <div className="flex gap-2 mt-4">
                <PrimaryCtaButton color="sky" onClick={save}>Salva</PrimaryCtaButton>
                <Button variant="outline" onClick={() => setForm(null)}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questo fornitore?"
        description="Se utilizzato da documenti officina, l'eliminazione verrà bloccata dal backend."
        confirmLabel="Elimina"
        onConfirm={confirmDel}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  )
}
