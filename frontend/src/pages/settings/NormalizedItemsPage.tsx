import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Search, Package } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import NormalizedItemFormModal from './NormalizedItemFormModal'
import type { NormalizedItem, NormalizedSupplier } from '@/types'

export default function NormalizedItemsPage() {
  const [items, setItems] = useState<NormalizedItem[]>([])
  const [suppliers, setSuppliers] = useState<NormalizedSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<NormalizedItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  // Filtri
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSupplier, setFilterSupplier] = useState<number | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [onlyActive, setOnlyActive] = useState(false)

  // Debounce search input → searchQuery (300ms, pattern di MaterialsPage)
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/normalized-items'),
      api.get('/normalized-suppliers'),
    ])
      .then(([itemsRes, supRes]) => {
        setItems(itemsRes.data)
        setSuppliers(supRes.data)
      })
      .catch(() => toast.error('Errore caricamento catalogo'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const startNew = () => { setEditItem(null); setShowForm(true) }
  const startEdit = (it: NormalizedItem) => { setEditItem(it); setShowForm(true) }

  const del = (id: number) => setPendingDelete(id)
  const confirmDel = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try {
      await api.delete(`/normalized-items/${id}`)
      toast.success('Voce eliminata')
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione')
    }
  }

  // Lista categorie distinte dalle voci esistenti (per popolare il dropdown).
  const categories = useMemo(() => {
    const set = new Set<string>()
    items.forEach(it => { if (it.category) set.add(it.category) })
    return Array.from(set).sort()
  }, [items])

  // Filtraggio client-side: il backend supporta i query param, ma con il
  // catalogo che cresce solo poco usiamo un'unica fetch + filtro locale per
  // reattività massima (no flicker durante typing). Il limit 500 dell'API
  // è ampio rispetto allo scenario d'uso atteso (catalogo officina meccanica).
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

  const supplierName = (id?: number | null) => {
    if (!id) return '—'
    const s = suppliers.find(x => x.id === id)
    return s?.name ?? `#${id}`
  }

  if (loading) return <div className="p-8 text-muted-foreground">Caricamento...</div>

  return (
    <StandardPage
      icon={Package}
      color="sky"
      width="lg"
      title="Catalogo normalizzati"
      subtitle={`${items.length} voci in catalogo (viti, cuscinetti, molle, colonne, boccole, spine...).`}
      actions={
        <PrimaryCtaButton color="sky" onClick={startNew}>
          <Plus className="w-4 h-4" /> Nuovo Normalizzato
        </PrimaryCtaButton>
      }
    >

      {/* Filtri */}
      <Card className="mb-3">
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Cerca codice o descrizione..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <select
            className="text-sm border rounded px-2 py-1.5"
            value={filterSupplier ?? ''}
            onChange={e => setFilterSupplier(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Tutti i fornitori</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            className="text-sm border rounded px-2 py-1.5"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="">Tutte le categorie</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={e => setOnlyActive(e.target.checked)}
              className="w-4 h-4"
            />
            Solo attivi
          </label>
          <div className="ml-auto text-xs text-muted-foreground">
            {visible.length} su {items.length} visualizzate
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className="text-left p-3 w-[18%] font-medium text-muted-foreground">Codice</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Descrizione</th>
                <th className="text-left p-3 w-[13%] font-medium text-muted-foreground">Categoria</th>
                <th className="text-left p-3 w-[18%] font-medium text-muted-foreground">Fornitore</th>
                <th className="text-right p-3 w-[10%] font-medium text-muted-foreground">€/pz</th>
                <th className="text-center p-3 w-[8%] font-medium text-muted-foreground">Attivo</th>
                <th className="text-center p-3 w-[10%] font-medium text-muted-foreground">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Nessun normalizzato ancora — clicca <span className="font-medium">+ Nuovo Normalizzato</span> per iniziare.
                </td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Nessuna voce corrisponde ai filtri.
                </td></tr>
              ) : visible.map(it => (
                <tr key={it.id} className="border-b hover:bg-muted">
                  <td className="p-3 font-mono text-xs">{it.code}</td>
                  <td className="p-3 truncate">{it.description}</td>
                  <td className="p-3 text-muted-foreground">{it.category || '—'}</td>
                  <td className="p-3 text-muted-foreground truncate">{supplierName(it.supplier_id)}</td>
                  <td className="p-3 text-right font-mono text-xs">
                    {(it.unit_price ?? 0).toFixed(2)}
                  </td>
                  <td className="p-3 text-center">
                    {it.active ? (
                      <span className="text-green-600 text-xs">●</span>
                    ) : (
                      <span className="text-muted-foreground/50 text-xs">●</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1.5 justify-center">
                      <button onClick={() => startEdit(it)} className="p-1 hover:bg-muted rounded" title="Modifica">
                        <Pencil className="w-4 h-4 text-blue-600" />
                      </button>
                      <button onClick={() => del(it.id)} className="p-1 hover:bg-red-50 rounded" title="Elimina">
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

      {showForm && (
        <NormalizedItemFormModal
          item={editItem}
          suppliers={suppliers}
          categories={categories}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questa voce?"
        description="Se utilizzata in template stampo o preventivi stampo (Step 4-5 del cantiere), l'eliminazione sarà bloccata dal backend."
        confirmLabel="Elimina"
        onConfirm={confirmDel}
        onCancel={() => setPendingDelete(null)}
      />
    </StandardPage>
  )
}
