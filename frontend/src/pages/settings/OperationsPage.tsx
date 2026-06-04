import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search, Layers, Upload, Download } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import type { Operation } from '@/types'

export default function OperationsPage() {
  const [operations, setOperations] = useState<Operation[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useEscapeKey(() => setEditingId(null), editingId !== null)

  const load = () => {
    api.get('/operations').then(r => { setOperations(r.data); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  const reset = (isNew = false) => {
    setEditingId(isNew ? 0 : null)
    setName('')
  }

  const startEdit = (o: Operation) => {
    setEditingId(o.id)
    setName(o.name)
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nome obbligatorio'); return }
    const payload = { name: name.trim() }
    try {
      if (editingId && editingId > 0) await api.put(`/operations/${editingId}`, payload)
      else await api.post('/operations', payload)
      toast.success('Lavorazione salvata')
      reset(); load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Errore nel salvataggio')
    }
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/operations/import-csv', fd, {
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
      const res = await api.get('/operations/csv-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lavorazioni_modello.csv'
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
    try {
      await api.delete(`/operations/${id}`)
      toast.success('Lavorazione eliminata')
      load()
    } catch {
      toast.error('Errore nell\'eliminazione (controlla che non sia usata in un Template flusso)')
    }
  }

  const visible = [...operations]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <PageContainer width="md">
      <SettingsPageHeader
        icon={Layers}
        color="indigo"
        title="Lavorazioni"
        subtitle="Catalogo libero. L'autocalc EDM si attiva sulle fasi con macchina Wire EDM, indipendentemente dal nome."
        action={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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
                    title="Importa un CSV di lavorazioni (separatore ;)">
              <Upload className="w-4 h-4 mr-1" /> {importing ? 'Import...' : 'Importa CSV'}
            </Button>
            <PrimaryCtaButton color="indigo" size="sm" onClick={() => reset(true)}>
              <Plus className="w-4 h-4" /> Nuova
            </PrimaryCtaButton>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 w-[80%] font-medium text-gray-600">Nome</th>
                <th className="text-center p-3 w-[20%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={2} className="p-6 text-center text-gray-400">Nessuna lavorazione.</td></tr>
              )}
              {visible.map(o => (
                <tr key={o.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium truncate">{o.name}</td>
                  <td className="p-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => startEdit(o)} className="p-1 hover:bg-gray-100 rounded">
                        <Pencil className="w-4 h-4 text-blue-600" />
                      </button>
                      <button onClick={() => handleDelete(o.id)} className="p-1 hover:bg-red-50 rounded">
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
          <Card className="w-full max-w-md bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{editingId > 0 ? 'Modifica' : 'Nuova'} Lavorazione</h3>
              <button onClick={() => reset()} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="es. Tornitura sgrossatura" autoFocus />
              </div>
              <div className="flex gap-2 mt-4">
                <PrimaryCtaButton color="indigo" onClick={handleSave}>Salva</PrimaryCtaButton>
                <Button variant="outline" onClick={() => reset()}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questa lavorazione?"
        description="Se usata in un Template flusso o in una fase preventivo, l'eliminazione verrà bloccata."
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  )
}
