import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search, Cog, Upload, Download } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import type { Machine } from '@/types'

const MACHINE_TYPES = [
  { value: 'cnc_3_axis',      label: 'CNC 3 assi' },
  { value: 'cnc_5_axis',      label: 'CNC 5 assi' },
  { value: 'milling',         label: 'Fresatrice' },
  { value: 'turning',         label: 'Tornio' },
  { value: 'wire_edm',        label: 'EDM filo' },
  { value: 'sinker_edm',      label: 'EDM a tuffo' },
  { value: 'laser',           label: 'Laser' },
  { value: 'grinding',        label: 'Rettifica' },
  { value: 'manual',          label: 'Manuale' },
  { value: 'cad_design',      label: 'Progettazione CAD' },
  { value: 'cam_programming', label: 'Programmazione CAM' },
  { value: 'assembly',        label: 'Montaggio' },
  { value: 'inspection',      label: 'Controllo CMM' },
]

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [mtype, setMtype] = useState('')
  const [rate, setRate] = useState('')
  const [setupRate, setSetupRate] = useState('')
  const [setup, setSetup] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useEscapeKey(() => setEditingId(null), editingId !== null)

  const loadData = () => {
    api.get('/machines').then(res => { setMachines(res.data); setLoading(false) })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew = false) => {
    setEditingId(isNew ? 0 : null)
    setName(''); setMtype(''); setRate(''); setSetupRate(''); setSetup('')
  }

  const startEdit = (m: Machine) => {
    setEditingId(m.id); setName(m.name); setMtype(m.machine_type ?? '')
    setRate(String(m.hourly_rate))
    setSetupRate(m.setup_hourly_rate != null ? String(m.setup_hourly_rate) : '')
    setSetup(String(m.setup_minimum_hours ?? 0))
  }

  const handleSave = async () => {
    const payload = {
      name,
      machine_type: mtype,
      hourly_rate: Number(rate),
      setup_hourly_rate: setupRate === '' ? null : Number(setupRate),
      setup_minimum_hours: Number(setup),
    }
    try {
      if (editingId && editingId > 0) await api.put(`/machines/${editingId}`, payload)
      else await api.post('/machines', payload)
      toast.success('Centro di costo salvato')
      resetForm(); loadData()
    } catch (e) {toast.error('Errore nel salvataggio') }
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/machines/import-csv', fd, {
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
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/machines/csv-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'centri_di_costo_modello.csv'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Errore scaricamento modello')
    }
  }

  const handleDelete = (id: number) => setPendingDelete(id)
  const confirmDelete = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/machines/${id}`); toast.success('Centro di costo eliminato'); loadData() }
    catch (e) { toast.error('Errore nell\'eliminazione') }
  }

  const visible = [...machines]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()) || (MACHINE_TYPES.find(t => t.value === m.machine_type)?.label || m.machine_type || '').toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="p-8 text-muted-foreground">Caricamento...</div>

  return (
    <StandardPage
      icon={Cog}
      color="indigo"
      title="Centri di costo"
      subtitle="Macchine e postazioni con tariffa €/h e setup"
      width="xl"
      actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-48" />
            </div>
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
                    title="Importa un CSV di centri di costo (separatore ;)">
              <Upload className="w-4 h-4 mr-1" /> {importing ? 'Import...' : 'Importa CSV'}
            </Button>
            <PrimaryCtaButton color="indigo" size="sm" onClick={() => resetForm(true)}>
              <Plus className="w-4 h-4" /> Nuovo
            </PrimaryCtaButton>
          </div>
      }
    >

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className="text-left p-3 w-[34%] font-medium text-muted-foreground">Nome</th>
                <th className="text-left p-3 w-[28%] font-medium text-muted-foreground">Tipo</th>
                <th className="text-right p-3 w-[14%] font-medium text-muted-foreground">Lavoro €/h</th>
                <th className="text-right p-3 w-[14%] font-medium text-muted-foreground">Setup €/h</th>
                <th className="text-center p-3 w-[10%] font-medium text-muted-foreground">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nessun centro di costo trovato.</td></tr>
              )}
              {visible.map(m => (
                <tr key={m.id} className="border-b hover:bg-muted">
                  <td className="p-3 font-medium truncate">{m.name}</td>
                  <td className="p-3 truncate">{MACHINE_TYPES.find(t => t.value === m.machine_type)?.label || m.machine_type}</td>
                  <td className="p-3 text-right font-mono">{m.hourly_rate}</td>
                  <td className="p-3 text-right font-mono text-muted-foreground">
                    {m.setup_hourly_rate != null ? m.setup_hourly_rate : <span className="text-muted-foreground">= {m.hourly_rate}</span>}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => startEdit(m)} className="p-1 hover:bg-muted rounded">
                        <Pencil className="w-4 h-4 text-blue-600" />
                      </button>
                      <button onClick={() => handleDelete(m.id)} className="p-1 hover:bg-red-50 rounded">
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
          <Card className="w-full max-w-2xl bg-card shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{editingId > 0 ? 'Modifica' : 'Nuovo'} Centro di costo</h3>
              <button onClick={() => resetForm()} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Nome</label>
                  <Input value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={mtype} onChange={e => setMtype(e.target.value)}>
                    <option value="">Seleziona...</option>
                    {MACHINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Tariffa lavoro €/ora</label>
                  <Input onFocus={e => e.currentTarget.select()} type="number" step="0.1" value={rate} onChange={e => setRate(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground mt-0.5">Costo orario quando la macchina lavora</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Tariffa setup €/ora</label>
                  <Input onFocus={e => e.currentTarget.select()} type="number" step="0.1" placeholder={`default ${rate || '...'}`} value={setupRate} onChange={e => setSetupRate(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground mt-0.5">Costo orario attrezzaggio (operatore senza macchina). Vuoto = stessa di lavoro.</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Setup minimo (h)</label>
                  <Input onFocus={e => e.currentTarget.select()} type="number" step="0.1" value={setup} onChange={e => setSetup(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground mt-0.5">Usato in fase di import DXF/STEP (in arrivo)</p>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <PrimaryCtaButton color="indigo" onClick={handleSave}>Salva</PrimaryCtaButton>
                <Button variant="outline" onClick={() => resetForm()}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questo centro di costo?"
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </StandardPage>
  )
}
