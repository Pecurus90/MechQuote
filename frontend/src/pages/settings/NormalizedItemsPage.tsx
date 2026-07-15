import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Search, Package } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import NormalizedItemFormModal from './NormalizedItemFormModal'
import { tWrap, tHead, tRow, RowActions } from '@/components/settings/inlineEdit'
import { ActiveDot } from '@/components/settings/crud'
import type { NormalizedItem, NormalizedSupplier } from '@/types'

const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm'

export default function NormalizedItemsPage() {
  const [items, setItems] = useState<NormalizedItem[]>([])
  const [suppliers, setSuppliers] = useState<NormalizedSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<NormalizedItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSupplier, setFilterSupplier] = useState<number | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)

  useEffect(() => { const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300); return () => clearTimeout(t) }, [searchInput])

  const load = () => {
    setLoading(true)
    Promise.all([api.get('/normalized-items'), api.get('/normalized-suppliers')])
      .then(([itemsRes, supRes]) => { setItems(itemsRes.data); setSuppliers(supRes.data) })
      .catch(() => toast.error('Errore caricamento catalogo')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const confirmDel = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/normalized-items/${id}`); toast.success('Voce eliminata'); load() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione') }
  }

  const categories = useMemo(() => { const set = new Set<string>(); items.forEach(it => { if (it.category) set.add(it.category) }); return Array.from(set).sort() }, [items])
  const visible = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return items.filter(it => {
      if (filterSupplier != null && it.supplier_id !== filterSupplier) return false
      if (filterCategory && it.category !== filterCategory) return false
      if (onlyActive && !it.active) return false
      if (q && !it.code.toLowerCase().includes(q) && !it.description.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, searchQuery, filterSupplier, filterCategory, onlyActive])
  const supplierName = (id?: number | null) => { if (!id) return '—'; return suppliers.find(x => x.id === id)?.name ?? `#${id}` }

  if (loading) return <div className="p-8 text-muted-foreground">Caricamento…</div>

  return (
    <StandardPage
      icon={Package} color="primary" width="xl"
      title="Catalogo normalizzati"
      subtitle={`${items.length} voci in catalogo (viti, cuscinetti, molle, colonne, boccole, spine…).`}
      actions={<PrimaryCtaButton color="primary" size="sm" onClick={() => { setEditItem(null); setShowForm(true) }}><Plus className="h-4 w-4" /> Nuovo normalizzato</PrimaryCtaButton>}
    >
      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Cerca codice o descrizione…" value={searchInput} onChange={e => setSearchInput(e.target.value)} className="h-9 pl-9" /></div>
        <select className={selectCls} value={filterSupplier ?? ''} onChange={e => setFilterSupplier(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Tutti i fornitori</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={selectCls} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="accent-primary" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} /> Solo attivi</label>
        <div className="ml-auto text-xs text-muted-foreground">{visible.length} su {items.length} visualizzate</div>
      </div>

      <div className={tWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <colgroup><col style={{ width: 150 }} /><col /><col style={{ width: 140 }} /><col style={{ width: 180 }} /><col style={{ width: 90 }} /><col style={{ width: 70 }} /><col style={{ width: 90 }} /></colgroup>
            <thead>
              <tr className={tHead}>
                <th className="p-2.5 text-left font-medium">Codice</th>
                <th className="p-2.5 text-left font-medium">Descrizione</th>
                <th className="p-2.5 text-left font-medium">Categoria</th>
                <th className="p-2.5 text-left font-medium">Fornitore</th>
                <th className="p-2.5 text-right font-medium">€/pz</th>
                <th className="p-2.5 text-center font-medium">Attivo</th>
                <th className="p-2.5 text-center font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nessun normalizzato ancora — clicca <span className="font-medium">Nuovo normalizzato</span> per iniziare.</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nessuna voce corrisponde ai filtri.</td></tr>
              ) : visible.map(it => (
                <tr key={it.id} className={tRow}>
                  <td className="p-2.5 font-mono text-xs font-semibold text-foreground">{it.code}</td>
                  <td className="truncate p-2.5 text-foreground">{it.description}</td>
                  <td className="p-2.5 text-muted-foreground">{it.category || '—'}</td>
                  <td className="truncate p-2.5 text-muted-foreground">{supplierName(it.supplier_id)}</td>
                  <td className="p-2.5 text-right font-mono">{(it.unit_price ?? 0).toFixed(2)}</td>
                  <td className="p-2.5 text-center"><ActiveDot active={!!it.active} /></td>
                  <td className="p-2.5"><RowActions onEdit={() => { setEditItem(it); setShowForm(true) }} onDelete={() => setPendingDelete(it.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <NormalizedItemFormModal item={editItem} suppliers={suppliers} categories={categories} onClose={() => setShowForm(false)} onSaved={load} />}
      <ConfirmDialog open={pendingDelete != null} title="Eliminare questa voce?" description="Se la voce è in uso, l'eliminazione sarà bloccata dal backend." confirmLabel="Elimina" onConfirm={confirmDel} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
