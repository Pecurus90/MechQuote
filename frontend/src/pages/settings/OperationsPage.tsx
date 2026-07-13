import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Search, Layers } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { tWrap, tHead, tRow, RowActions } from '@/components/settings/inlineEdit'
import { SettingsModal, CsvImportButtons, fieldLabel } from '@/components/settings/crud'
import type { Operation } from '@/types'

export default function OperationsPage() {
  const [operations, setOperations] = useState<Operation[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)  // null=chiuso, 0=nuovo
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const load = () => api.get('/operations').then(r => { setOperations(r.data); setLoading(false) })
  useEffect(() => { load() }, [])

  const openNew = () => { setEditingId(0); setName('') }
  const startEdit = (o: Operation) => { setEditingId(o.id); setName(o.name) }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nome obbligatorio'); return }
    try {
      if (editingId && editingId > 0) await api.put(`/operations/${editingId}`, { name: name.trim() }); else await api.post('/operations', { name: name.trim() })
      toast.success('Lavorazione salvata'); setEditingId(null); load()
    } catch (e) { const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail; toast.error(msg || 'Errore nel salvataggio') }
  }
  const confirmDelete = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/operations/${id}`); toast.success('Lavorazione eliminata'); load() }
    catch { toast.error('Errore nell\'eliminazione (controlla che non sia usata in un Template flusso)') }
  }

  const visible = [...operations].sort((a, b) => a.name.localeCompare(b.name, 'it')).filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase()))
  if (loading) return <div className="p-8 text-muted-foreground">Caricamento…</div>

  return (
    <StandardPage
      icon={Layers} color="primary" width="lg"
      title="Lavorazioni"
      subtitle="Catalogo libero. L'autocalc EDM si attiva sulle fasi con macchina Wire EDM, indipendentemente dal nome."
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-48"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Cerca…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9" /></div>
          <CsvImportButtons importUrl="/operations/import-csv" templateUrl="/operations/csv-template" templateName="lavorazioni_modello.csv" importTitle="Importa un CSV di lavorazioni (separatore ;)" onImported={load} />
          <PrimaryCtaButton color="primary" size="sm" onClick={openNew}><Plus className="h-4 w-4" /> Nuova</PrimaryCtaButton>
        </div>
      }
    >
      <div className={tWrap}>
        <table className="w-full text-sm">
          <colgroup><col /><col style={{ width: 100 }} /></colgroup>
          <thead><tr className={tHead}><th className="p-2.5 text-left font-medium">Nome</th><th className="p-2.5 text-center font-medium">Azioni</th></tr></thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={2} className="p-8 text-center text-muted-foreground">Nessuna lavorazione.</td></tr>
            ) : visible.map(o => (
              <tr key={o.id} className={tRow}>
                <td className="truncate p-2.5 font-medium text-foreground">{o.name}</td>
                <td className="p-2.5"><RowActions onEdit={() => startEdit(o)} onDelete={() => setPendingDelete(o.id)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <SettingsModal title={editingId > 0 ? 'Modifica lavorazione' : 'Nuova lavorazione'} icon={Layers} accent="primary" width="max-w-md" onClose={() => setEditingId(null)} onSave={handleSave} saveLabel="Salva">
          <div><label className={fieldLabel}>Nome</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="es. Tornitura sgrossatura" autoFocus onKeyDown={e => e.key === 'Enter' && handleSave()} /></div>
        </SettingsModal>
      )}
      <ConfirmDialog open={pendingDelete != null} title="Eliminare questa lavorazione?" description="Se usata in un Template flusso o in una fase preventivo, l'eliminazione verrà bloccata." confirmLabel="Elimina" onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
