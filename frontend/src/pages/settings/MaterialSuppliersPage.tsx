import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, X, Box, Upload, Download } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
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
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const [onlyActive, setOnlyActive] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useEscapeKey(() => setForm(null), !!form)

  const visible = onlyActive ? suppliers.filter(s => s.active !== false) : suppliers

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

  const handleImport = async (file: File) => {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/material-suppliers/import-csv', fd, {
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
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'import')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/material-suppliers/csv-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fornitori_grezzi_modello.csv'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Errore scaricamento modello')
    }
  }

  const del = (id: number) => setPendingDelete(id)
  const confirmDel = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try {
      await api.delete(`/material-suppliers/${id}`)
      toast.success('Fornitore eliminato')
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione')
    }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Caricamento...</div>

  return (
    <PageContainer width="md">
      <SettingsPageHeader
        icon={Box}
        color="blue"
        title="Fornitori materiali"
        subtitle="Chi vende il materiale grezzo (con spese spedizione e taglio)."
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={e => setOnlyActive(e.target.checked)}
                className="w-4 h-4"
              />
              Solo attivi
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleImport(f)
              }}
            />
            <Button size="sm" variant="outline" onClick={downloadTemplate}
                    title="Scarica un modello CSV vuoto da compilare">
              <Download className="w-4 h-4 mr-1" /> Modello
            </Button>
            <Button size="sm" variant="outline" disabled={importing}
                    onClick={() => fileInputRef.current?.click()}
                    title="Importa un CSV di fornitori grezzi (separatore ;)">
              <Upload className="w-4 h-4 mr-1" /> {importing ? 'Import...' : 'Importa CSV'}
            </Button>
            <PrimaryCtaButton color="blue" onClick={startNew}>
              <Plus className="w-4 h-4" /> Nuovo
            </PrimaryCtaButton>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className="text-left p-3 w-[26%] font-medium text-muted-foreground">Nome</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Indirizzo</th>
                <th className="text-right p-3 w-[13%] font-medium text-muted-foreground">Spedizione (€)</th>
                <th className="text-right p-3 w-[13%] font-medium text-muted-foreground">Taglio (€/pz)</th>
                <th className="text-center p-3 w-[8%] font-medium text-muted-foreground">Attivo</th>
                <th className="text-center p-3 w-[10%] font-medium text-muted-foreground">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nessun fornitore.</td></tr>
              ) : visible.map(s => (
                <tr key={s.id} className="border-b hover:bg-muted">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-muted-foreground truncate">{s.address || '—'}</td>
                  <td className="p-3 text-right font-mono">{(s.shipping_cost ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">{(s.cutting_cost_per_part ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-center">
                    {s.active === false
                      ? <span className="text-muted-foreground/50 text-xs" title="Ritirato">●</span>
                      : <span className="text-green-600 text-xs" title="Attivo">●</span>}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1.5 justify-center">
                      <button onClick={() => startEdit(s)} className="p-1 hover:bg-muted rounded">
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
          <Card className="w-full max-w-lg bg-card shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">{form.id ? 'Modifica' : 'Nuovo'} Fornitore materiali</h3>
              <button onClick={() => setForm(null)} className="p-1 hover:bg-muted rounded">
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
                <PrimaryCtaButton color="blue" onClick={save}>Salva</PrimaryCtaButton>
                <Button variant="outline" onClick={() => setForm(null)}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questo fornitore?"
        confirmLabel="Elimina"
        onConfirm={confirmDel}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  )
}
