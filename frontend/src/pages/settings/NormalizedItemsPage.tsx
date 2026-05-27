import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, X, Search, Package } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import type { NormalizedItem, NormalizedSupplier } from '@/types'

/** Pannello edit (struttura pattern: copia di NormalizedSuppliersPage). */
interface FormState {
  id: number | null
  code: string
  description: string
  category: string
  supplier_id: number | null
  unit_price: number
  notes: string
  active: boolean
}

const empty = (): FormState => ({
  id: null, code: '', description: '', category: '',
  supplier_id: null, unit_price: 0, notes: '', active: true,
})

export default function NormalizedItemsPage() {
  const [items, setItems] = useState<NormalizedItem[]>([])
  const [suppliers, setSuppliers] = useState<NormalizedSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  useEscapeKey(() => setForm(null), !!form)

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

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => (f ? { ...f, [k]: v } : f))

  const startNew = () => setForm(empty())
  const startEdit = (it: NormalizedItem) => setForm({
    id: it.id,
    code: it.code,
    description: it.description,
    category: it.category ?? '',
    supplier_id: it.supplier_id ?? null,
    unit_price: it.unit_price ?? 0,
    notes: it.notes ?? '',
    active: it.active ?? true,
  })

  const save = async () => {
    if (!form) return
    // Validazioni client base
    if (!form.code.trim()) { toast.error('Codice obbligatorio'); return }
    if (!form.description.trim()) { toast.error('Descrizione obbligatoria'); return }
    if (form.unit_price < 0) { toast.error('Il prezzo non può essere negativo'); return }
    const payload = {
      code: form.code.trim(),
      description: form.description.trim(),
      category: form.category.trim() || null,
      supplier_id: form.supplier_id,
      unit_price: form.unit_price,
      notes: form.notes.trim() || null,
      active: form.active,
    }
    try {
      if (form.id) await api.put(`/normalized-items/${form.id}`, payload)
      else await api.post('/normalized-items', payload)
      toast.success(form.id ? 'Voce aggiornata' : 'Voce creata')
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

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <PageContainer width="md">
      <SettingsPageHeader
        icon={Package}
        color="sky"
        title="Catalogo normalizzati"
        subtitle={`${items.length} voci in catalogo (viti, cuscinetti, molle, colonne, boccole, spine...).`}
        action={
          <PrimaryCtaButton color="sky" onClick={startNew}>
            <Plus className="w-4 h-4" /> Nuovo Normalizzato
          </PrimaryCtaButton>
        }
      />

      {/* Filtri */}
      <Card className="mb-3">
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={e => setOnlyActive(e.target.checked)}
              className="w-4 h-4"
            />
            Solo attivi
          </label>
          <div className="ml-auto text-xs text-gray-500">
            {visible.length} su {items.length} visualizzate
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 w-[18%] font-medium text-gray-600">Codice</th>
                <th className="text-left p-3 font-medium text-gray-600">Descrizione</th>
                <th className="text-left p-3 w-[13%] font-medium text-gray-600">Categoria</th>
                <th className="text-left p-3 w-[18%] font-medium text-gray-600">Fornitore</th>
                <th className="text-right p-3 w-[10%] font-medium text-gray-600">€/pz</th>
                <th className="text-center p-3 w-[8%] font-medium text-gray-600">Attivo</th>
                <th className="text-center p-3 w-[10%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-gray-400">
                  Nessun normalizzato ancora — clicca <span className="font-medium">+ Nuovo Normalizzato</span> per iniziare.
                </td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-gray-400">
                  Nessuna voce corrisponde ai filtri.
                </td></tr>
              ) : visible.map(it => (
                <tr key={it.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs">{it.code}</td>
                  <td className="p-3 truncate">{it.description}</td>
                  <td className="p-3 text-gray-500">{it.category || '—'}</td>
                  <td className="p-3 text-gray-500 truncate">{supplierName(it.supplier_id)}</td>
                  <td className="p-3 text-right font-mono text-xs">
                    {(it.unit_price ?? 0).toFixed(2)}
                  </td>
                  <td className="p-3 text-center">
                    {it.active ? (
                      <span className="text-green-600 text-xs">●</span>
                    ) : (
                      <span className="text-gray-300 text-xs">●</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1.5 justify-center">
                      <button onClick={() => startEdit(it)} className="p-1 hover:bg-gray-100 rounded" title="Modifica">
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

      {form && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">{form.id ? 'Modifica' : 'Nuovo'} normalizzato</h3>
              <button onClick={() => setForm(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Codice *</label>
                  <Input
                    value={form.code}
                    onChange={e => set('code', e.target.value)}
                    placeholder="es. COL-D32-L250-RAB"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Categoria</label>
                  <Input
                    value={form.category}
                    onChange={e => set('category', e.target.value)}
                    placeholder="es. colonne, viti, molle"
                    list="categories-suggest"
                  />
                  <datalist id="categories-suggest">
                    {categories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Descrizione *</label>
                <Input
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="es. Colonna Ø32 L250 Rabourdin"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Fornitore</label>
                  <select
                    className="w-full border rounded px-2 py-1.5 text-sm h-9"
                    value={form.supplier_id ?? ''}
                    onChange={e => set('supplier_id', e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— nessuno —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Prezzo €/pz</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.unit_price}
                    onChange={e => set('unit_price', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Note</label>
                <Input
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="riferimenti, link scheda tecnica..."
                />
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
        title="Eliminare questa voce?"
        description="Se utilizzata in template stampo o preventivi stampo (Step 4-5 del cantiere), l'eliminazione sarà bloccata dal backend."
        confirmLabel="Elimina"
        onConfirm={confirmDel}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  )
}
