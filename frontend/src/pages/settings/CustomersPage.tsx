import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Pencil, Trash2, X, Search, Upload, Users, UserRoundPlus, MapPin, Check, SearchX } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { Customer } from '@/types'

interface FormState {
  customer_number: string
  name: string
  address: string
  email: string
  phone: string
}

const emptyForm = (): FormState => ({ customer_number: '', name: '', address: '', email: '', phone: '' })
const labelCls = 'mb-1 block text-[12px] font-medium text-foreground'
// Ricerca accento-insensibile (NFD + strip diacritici) e senza punti.
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '')

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useEscapeKey(() => setEditingId(null), editingId !== null)

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
    } catch { toast.error('Errore nel salvataggio') }
  }

  const confirmDelete = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete
    setPendingDelete(null)
    try { await api.delete(`/customers/${id}`); toast.success('Cliente eliminato'); loadData() }
    catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione')
    }
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/customers/import-csv', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const { created, updated, skipped } = res.data as { created: number; updated: number; skipped: number }
      const parts = []
      if (created) parts.push(`${created} nuovi`)
      if (updated) parts.push(`${updated} aggiornati`)
      if (skipped) parts.push(`${skipped} saltati`)
      toast.success(`Import OK: ${parts.join(', ') || 'nessuna modifica'}`)
      loadData()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'import')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const visible = [...customers]
    .sort((a, b) => a.customer_number - b.customer_number)
    .filter(c => {
      if (!search) return true
      const q = normalize(search)
      return String(c.customer_number).includes(q) || normalize(c.name).includes(q) || normalize(c.address || '').includes(q)
    })

  if (loading) return <div className="p-8 text-muted-foreground">Caricamento...</div>

  return (
    <StandardPage
      icon={Users}
      color="customers"
      width="xl"
      title="Clienti"
      subtitle={`${customers.length} client${customers.length === 1 ? 'e' : 'i'} in anagrafica`}
      actions={
        <div className="flex items-center gap-2.5">
          <div className="relative w-[250px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cerca codice, nome, indirizzo…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9 text-sm" />
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f) }} />
          <Button size="sm" variant="outline" disabled={importing} onClick={() => fileInputRef.current?.click()}
            title="Importa un CSV clienti del gestionale (separatore ;)">
            <Upload className="mr-1 h-4 w-4" /> {importing ? 'Import…' : 'Importa CSV'}
          </Button>
          <PrimaryCtaButton color="customers" size="sm" onClick={() => { setEditingId(0); setForm(emptyForm()) }}>
            <Plus className="h-4 w-4" /> Nuovo cliente
          </PrimaryCtaButton>
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <colgroup>
              <col style={{ width: 100 }} /><col style={{ width: '26%' }} /><col />
              <col style={{ width: '22%' }} /><col style={{ width: 130 }} /><col style={{ width: 76 }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-card-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="p-2.5 text-left font-medium">Codice</th>
                <th className="p-2.5 text-left font-medium">Nome</th>
                <th className="p-2.5 text-left font-medium">Indirizzo</th>
                <th className="p-2.5 text-left font-medium">Email</th>
                <th className="p-2.5 text-left font-medium">Telefono</th>
                <th className="p-2.5 text-center font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><SearchX className="h-5 w-5" /></div>
                      <div className="text-sm font-medium text-foreground">Nessun cliente trovato</div>
                      {search && (
                        <button onClick={() => setSearch('')} className="mt-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">Azzera ricerca</button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : visible.map(c => (
                <tr key={c.id} className="border-b border-border transition-colors hover:bg-muted/[0.45]">
                  <td className="p-2.5 font-mono font-semibold text-foreground">{c.customer_number}</td>
                  <td className="truncate p-2.5 font-medium text-foreground">{c.name}</td>
                  <td className="truncate p-2.5">
                    {c.address ? (
                      <a href={`https://maps.google.com/?q=${encodeURIComponent(c.address)}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 border-b border-dashed border-muted-foreground/50 text-foreground hover:border-primary hover:text-primary">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> {c.address}
                      </a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="truncate p-2.5">
                    {c.email ? <a href={`mailto:${c.email}`} className="text-muted-foreground hover:text-primary hover:underline">{c.email}</a> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2.5 font-mono text-muted-foreground">{c.phone || '—'}</td>
                  <td className="p-2.5">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => startEdit(c)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifica"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setPendingDelete(c.id)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-customers/[0.14] text-customers"><UserRoundPlus className="h-[17px] w-[17px]" /></div>
                <h3 className="font-semibold text-foreground">{editingId > 0 ? 'Modifica cliente' : 'Nuovo cliente'}</h3>
              </div>
              <button onClick={closeForm} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-3 px-5 py-4">
              <div>
                <label className={labelCls}>Codice cliente *</label>
                <Input className="font-mono" type="number" value={form.customer_number} onChange={e => set('customer_number', e.target.value)} />
                <p className="mt-1 text-[11px] text-muted-foreground">Dal gestionale.</p>
              </div>
              <div>
                <label className={labelCls}>Telefono</label>
                <Input className="font-mono" value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Nome / Ragione sociale *</label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Indirizzo</label>
                <Input value={form.address} onChange={e => set('address', e.target.value)} />
                <p className="mt-1 text-[11px] text-muted-foreground">In lista diventa un link a Google Maps.</p>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Email</label>
                <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-card-muted px-5 py-3">
              <Button variant="outline" onClick={closeForm}>Annulla</Button>
              <PrimaryCtaButton color="customers" onClick={handleSave} disabled={!form.name || !form.customer_number}>
                <Check className="h-4 w-4" /> Salva cliente
              </PrimaryCtaButton>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questo cliente?"
        description="Se ha preventivi associati l'eliminazione verrà bloccata."
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </StandardPage>
  )
}
