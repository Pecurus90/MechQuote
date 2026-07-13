import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import api from '@/lib/api'
import { Plus, Search, Tag } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { tWrap, tHead, tRow, editRowStyle, RowActions, EditActions } from '@/components/settings/inlineEdit'
import type { Category } from '@/types'

interface EditRow { code: string; name: string; sort_order: number }

export default function QuoteCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<EditRow>({ code: '', name: '', sort_order: 0 })
  const [newRow, setNewRow] = useState<EditRow>({ code: '', name: '', sort_order: 0 })
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  useEffect(() => { load() }, [])
  const load = () => { setLoading(true); api.get('/quote-categories').then(res => { setCategories(res.data); setLoading(false) }) }

  const startEdit = (cat: Category) => { setEditingId(cat.id); setEditRow({ code: cat.code, name: cat.name, sort_order: cat.sort_order ?? 0 }) }

  const saveEdit = async (id: number) => {
    try { await api.put(`/quote-categories/${id}`, editRow); toast.success('Categoria salvata'); setEditingId(null); load() }
    catch { toast.error('Errore nel salvataggio') }
  }
  const confirmDelete = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/quote-categories/${id}`); toast.success('Categoria eliminata'); load() }
    catch { toast.error('Errore nell\'eliminazione') }
  }
  const createCategory = async () => {
    if (!newRow.code || !newRow.name) return
    try { await api.post('/quote-categories', newRow); toast.success('Categoria creata'); setNewRow({ code: '', name: '', sort_order: 0 }); setShowNew(false); load() }
    catch { toast.error('Errore nella creazione') }
  }

  const visible = categories.filter(c => !search || c.code.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <StandardPage
      icon={Tag}
      color="primary"
      title="Categorie preventivo"
      subtitle="La lettera appare nel codice preventivo (es. 240-26A_001)"
      width="lg"
      actions={
        <div className="flex items-center gap-2.5">
          <div className="relative w-40">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cerca…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9" />
          </div>
          <PrimaryCtaButton color="primary" size="sm" onClick={() => setShowNew(true)} disabled={showNew}>
            <Plus className="h-4 w-4" /> Nuova
          </PrimaryCtaButton>
        </div>
      }
    >
      <div className={tWrap}>
        <table className="w-full text-sm">
          <colgroup><col style={{ width: 120 }} /><col /><col style={{ width: 110 }} /><col style={{ width: 110 }} /></colgroup>
          <thead>
            <tr className={tHead}>
              <th className="p-2.5 text-left font-medium">Codice</th>
              <th className="p-2.5 text-left font-medium">Descrizione</th>
              <th className="p-2.5 text-center font-medium">Ordine</th>
              <th className="p-2.5 text-center font-medium">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Caricamento…</td></tr>
            ) : (
              <>
                {visible.map(cat => editingId === cat.id ? (
                  <tr key={cat.id} className="border-b border-border bg-primary/[0.05]" style={editRowStyle('primary')}>
                    <td className="p-2"><Input className="h-8 font-mono text-sm" value={editRow.code} maxLength={5} onChange={e => setEditRow(r => ({ ...r, code: e.target.value.toUpperCase() }))} onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id); if (e.key === 'Escape') setEditingId(null) }} /></td>
                    <td className="p-2"><Input className="h-8 text-sm" value={editRow.name} onChange={e => setEditRow(r => ({ ...r, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id); if (e.key === 'Escape') setEditingId(null) }} /></td>
                    <td className="p-2"><Input type="number" className="mx-auto h-8 w-16 text-center text-sm" value={editRow.sort_order} onChange={e => setEditRow(r => ({ ...r, sort_order: parseInt(e.target.value) || 0 }))} /></td>
                    <td className="p-2"><EditActions onSave={() => saveEdit(cat.id)} onCancel={() => setEditingId(null)} /></td>
                  </tr>
                ) : (
                  <tr key={cat.id} className={tRow}>
                    <td className="p-2.5 font-mono font-semibold text-primary">{cat.code}</td>
                    <td className="p-2.5 text-foreground">{cat.name}</td>
                    <td className="p-2.5 text-center text-muted-foreground">{cat.sort_order}</td>
                    <td className="p-2.5"><RowActions onEdit={() => startEdit(cat)} onDelete={() => setPendingDelete(cat.id)} /></td>
                  </tr>
                ))}

                {showNew && (
                  <tr className="border-t-2 border-dashed border-border bg-primary/[0.04]">
                    <td className="p-2"><Input className="h-8 font-mono text-sm" placeholder="H" maxLength={5} value={newRow.code} onChange={e => setNewRow(r => ({ ...r, code: e.target.value.toUpperCase() }))} autoFocus /></td>
                    <td className="p-2"><Input className="h-8 text-sm" placeholder="Nome categoria" value={newRow.name} onChange={e => setNewRow(r => ({ ...r, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && createCategory()} /></td>
                    <td className="p-2"><Input type="number" className="mx-auto h-8 w-16 text-center text-sm" value={newRow.sort_order} onChange={e => setNewRow(r => ({ ...r, sort_order: parseInt(e.target.value) || 0 }))} /></td>
                    <td className="p-2"><EditActions onSave={createCategory} onCancel={() => { setShowNew(false); setNewRow({ code: '', name: '', sort_order: 0 }) }} /></td>
                  </tr>
                )}

                {visible.length === 0 && !showNew && (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nessuna categoria trovata.</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog open={pendingDelete != null} title="Eliminare questa categoria?" confirmLabel="Elimina" onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
