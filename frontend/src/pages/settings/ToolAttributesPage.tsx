import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Wrench } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { tHead, tRow, editRowStyle, RowActions, EditActions } from '@/components/settings/inlineEdit'
import type { ToolAttribute } from '@/types'

type SectionKey = 'types' | 'brands'
interface Section { key: SectionKey; title: string; description: string; endpoint: string; newPlaceholder: string }

const SECTIONS: Section[] = [
  { key: 'types', title: 'Tipi utensile', description: 'es. Cilindrica, Sferica, Conica', endpoint: '/tools/types', newPlaceholder: 'es. Cilindrica' },
  { key: 'brands', title: 'Marchi', description: 'es. Sandvik, JJ Tools, OSG', endpoint: '/tools/brands', newPlaceholder: 'es. Sandvik' },
]

function AttributeTable({ section }: { section: Section }) {
  const [items, setItems] = useState<ToolAttribute[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const load = () => { setLoading(true); api.get(section.endpoint).then(r => setItems(r.data)).catch(() => toast.error('Errore caricamento')).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])

  const saveEdit = async (id: number) => {
    const name = editName.trim()
    if (!name) { toast.error('Nome obbligatorio'); return }
    try { await api.put(`${section.endpoint}/${id}`, { name }); toast.success('Salvato'); setEditingId(null); load() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nel salvataggio') }
  }
  const confirmRemove = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`${section.endpoint}/${id}`); toast.success('Eliminato'); load() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore eliminazione') }
  }
  const create = async () => {
    const name = newName.trim()
    if (!name) return
    try { await api.post(section.endpoint, { name, active: true }); toast.success('Creato'); setNewName(''); setShowNew(false); load() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore creazione') }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{section.title}</h2>
          <p className="text-xs text-muted-foreground">{section.description}</p>
        </div>
        <PrimaryCtaButton color="tools" size="sm" onClick={() => setShowNew(true)} disabled={showNew}>
          <Plus className="h-4 w-4" /> Aggiungi
        </PrimaryCtaButton>
      </div>
      <table className="w-full text-sm">
        <colgroup><col /><col style={{ width: 110 }} /></colgroup>
        <thead>
          <tr className={tHead}><th className="p-2.5 text-left font-medium">Nome</th><th className="p-2.5 text-center font-medium">Azioni</th></tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={2} className="p-6 text-center text-muted-foreground">Caricamento…</td></tr>
          ) : (
            <>
              {items.map(it => editingId === it.id ? (
                <tr key={it.id} className="border-b border-border bg-tools/[0.05]" style={editRowStyle('tools')}>
                  <td className="p-2"><Input className="h-8 text-sm" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(it.id); if (e.key === 'Escape') setEditingId(null) }} autoFocus /></td>
                  <td className="p-2"><EditActions onSave={() => saveEdit(it.id)} onCancel={() => setEditingId(null)} /></td>
                </tr>
              ) : (
                <tr key={it.id} className={tRow}>
                  <td className="p-2.5 text-foreground">{it.name}</td>
                  <td className="p-2.5"><RowActions onEdit={() => { setEditingId(it.id); setEditName(it.name) }} onDelete={() => setPendingDelete(it.id)} /></td>
                </tr>
              ))}
              {showNew && (
                <tr className="border-t-2 border-dashed border-border bg-tools/[0.04]">
                  <td className="p-2"><Input className="h-8 text-sm" placeholder={section.newPlaceholder} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { setShowNew(false); setNewName('') } }} autoFocus /></td>
                  <td className="p-2"><EditActions onSave={create} onCancel={() => { setShowNew(false); setNewName('') }} /></td>
                </tr>
              )}
              {items.length === 0 && !showNew && (
                <tr><td colSpan={2} className="p-8 text-center text-muted-foreground">Nessuna voce.</td></tr>
              )}
            </>
          )}
        </tbody>
      </table>
      <ConfirmDialog open={pendingDelete != null} title="Eliminare definitivamente?" confirmLabel="Elimina" onConfirm={confirmRemove} onCancel={() => setPendingDelete(null)} />
    </div>
  )
}

export default function ToolAttributesPage() {
  return (
    <StandardPage
      icon={Wrench}
      color="tools"
      title="Attributi utensili"
      subtitle="Valori usati nei dropdown del catalogo utensili. Aggiungere/rimuovere voci qui non modifica gli utensili esistenti."
      width="lg"
    >
      {SECTIONS.map(s => <AttributeTable key={s.key} section={s} />)}
    </StandardPage>
  )
}
