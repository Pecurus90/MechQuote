import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Plus, Pencil, Trash2, Search, Drill, AlertTriangle, SearchX } from 'lucide-react'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Tool, ToolAttribute, ToolSupplier } from '@/types'
import ToolFormModal from './ToolFormModal'
import ToolScanBar from './ToolScanBar'
import ToolImportButtons from './ToolImportButtons'

const selectCls = 'h-[38px] rounded-md border border-input bg-background px-2 text-sm'

export default function ToolsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tools, setTools] = useState<Tool[]>([])
  const [suppliers, setSuppliers] = useState<ToolSupplier[]>([])
  const [types, setTypes] = useState<ToolAttribute[]>([])
  const [brands, setBrands] = useState<ToolAttribute[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  // Modal CRUD: editTool null = nuovo
  const [formOpen, setFormOpen] = useState(false)
  const [editTool, setEditTool] = useState<Tool | null>(null)

  // Filtri lista
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(searchParams.get('low_stock') === '1')
  const [onlyActive, setOnlyActive] = useState(true)

  // Sync URL ↔ lowStockOnly. searchParams/setSearchParams fuori dalle deps:
  // scriverebbero la URL ad ogni cambio di URL stessa → loop.
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    if (lowStockOnly) params.set('low_stock', '1')
    else params.delete('low_stock')
    setSearchParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowStockOnly])

  const loadTools = () => {
    const params = new URLSearchParams()
    if (filterType) params.set('tool_type', filterType)
    if (filterBrand) params.set('brand', filterBrand)
    if (filterSupplier) params.set('tool_supplier_id', filterSupplier)
    if (lowStockOnly) params.set('low_stock_only', 'true')
    if (onlyActive) params.set('active', 'true')
    if (search.trim()) params.set('q', search.trim())
    setLoading(true)
    api.get(`/tools?${params}`)
      .then(r => setTools(r.data))
      .catch(() => toast.error('Errore caricamento utensili'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadTools() }, [filterType, filterBrand, filterSupplier, lowStockOnly, onlyActive])
  // Debounce ricerca: loadTools fuori dalle deps (l'effect deve firare SOLO su `search`).
  useEffect(() => {
    const t = setTimeout(loadTools, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  useEffect(() => {
    api.get('/tools/suppliers').then(r => setSuppliers(r.data)).catch(() => undefined)
    api.get('/tools/types').then(r => setTypes(r.data)).catch(() => undefined)
    api.get('/tools/brands').then(r => setBrands(r.data)).catch(() => undefined)
  }, [])

  const startNew = () => { setEditTool(null); setFormOpen(true) }
  const startEdit = (t: Tool) => { setEditTool(t); setFormOpen(true) }

  const confirmDelete = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete
    setPendingDelete(null)
    try {
      await api.delete(`/tools/${id}`)
      toast.success('Utensile eliminato')
      loadTools()
    } catch { toast.error('Errore nell\'eliminazione') }
  }

  const resetFilters = () => {
    setSearch(''); setFilterType(''); setFilterBrand(''); setFilterSupplier('')
    setLowStockOnly(false); setOnlyActive(true)
  }

  const supplierName = (id?: number | null) => suppliers.find(s => s.id === id)?.name ?? '—'
  const hasFilters = !!(search || filterType || filterBrand || filterSupplier || lowStockOnly || !onlyActive)

  return (
    <StandardPage
      icon={Drill}
      color="tools"
      width="xl"
      title="Utensili"
      subtitle={`${tools.length} utensil${tools.length === 1 ? 'e' : 'i'} mostrat${tools.length === 1 ? 'o' : 'i'} · frese, punte e inserti`}
      actions={
        <div className="flex items-center gap-2.5">
          <ToolImportButtons onImported={loadTools} />
          <PrimaryCtaButton color="tools" size="sm" onClick={startNew}>
            <Plus className="h-4 w-4" /> Nuovo utensile
          </PrimaryCtaButton>
        </div>
      }
    >
      <ToolScanBar onScanned={loadTools} />

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] max-w-[340px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cerca codice, marchio, modello…" value={search}
            onChange={e => setSearch(e.target.value)} className="h-[38px] pl-9 text-sm" />
        </div>
        <select className={selectCls} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tutti i tipi</option>
          {types.filter(t => t.active).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        <select className={selectCls} value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
          <option value="">Tutti i marchi</option>
          {brands.filter(b => b.active).map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>
        <select className={selectCls} value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
          <option value="">Tutti i fornitori</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
          lowStockOnly ? 'border-danger/[0.45] bg-danger/[0.08] text-danger' : 'border-border text-muted-foreground hover:bg-muted'
        }`}>
          <input type="checkbox" className="hidden" checked={lowStockOnly} onChange={e => setLowStockOnly(e.target.checked)} />
          <AlertTriangle className="h-3.5 w-3.5" /> Solo sotto minimo
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="accent-tools" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} />
          Solo attivi
        </label>
      </div>

      {/* Tabella */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <colgroup>
              <col style={{ width: 130 }} /><col style={{ width: 110 }} /><col />
              <col style={{ width: 80 }} /><col style={{ width: 100 }} /><col style={{ width: '20%' }} />
              <col style={{ width: 92 }} /><col style={{ width: 84 }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-card-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="p-2.5 text-left font-medium">Codice</th>
                <th className="p-2.5 text-left font-medium">Tipo</th>
                <th className="p-2.5 text-left font-medium">Marchio · Modello</th>
                <th className="p-2.5 text-right font-medium">Ø mm</th>
                <th className="p-2.5 text-right font-medium">Qtà / Min</th>
                <th className="p-2.5 text-left font-medium">Fornitore</th>
                <th className="p-2.5 text-center font-medium">Attivo</th>
                <th className="p-2.5 text-center font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="p-2.5"><div className="h-4 rounded bg-muted" style={{ width: `${50 + (j * 7) % 40}%` }} /></td>
                    ))}
                  </tr>
                ))
              ) : tools.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <SearchX className="h-5 w-5" />
                      </div>
                      <div className="text-sm font-medium text-foreground">Nessun utensile trovato</div>
                      <div className="text-xs text-muted-foreground">Prova ad allargare i filtri o azzerali.</div>
                      {hasFilters && (
                        <button onClick={resetFilters} className="mt-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                          Azzera filtri
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : tools.map(t => {
                const isLow = t.quantity < t.minimum_quantity && t.minimum_quantity > 0
                const retired = t.active === false
                return (
                  <tr
                    key={t.id}
                    className={`border-b border-border transition-colors hover:bg-muted/[0.45] ${isLow ? 'bg-danger/[0.06]' : ''} ${retired ? 'opacity-[.62]' : ''}`}
                    style={isLow ? { boxShadow: 'inset 3px 0 0 0 hsl(var(--danger))' } : undefined}
                  >
                    <td className="truncate p-2.5 font-mono text-xs font-semibold text-foreground">{t.code}</td>
                    <td className="truncate p-2.5">{t.tool_type || '—'}</td>
                    <td className="truncate p-2.5">
                      <span className="font-semibold">{t.brand || ''}</span>
                      {t.model && <span className="text-muted-foreground"> · {t.model}</span>}
                    </td>
                    <td className="p-2.5 text-right font-mono">{t.diameter_mm ?? '—'}</td>
                    <td className="p-2.5 text-right font-mono">
                      <span className={isLow ? 'inline-flex items-center gap-1 font-semibold text-danger' : 'text-foreground'}>
                        {isLow && <AlertTriangle className="h-[13px] w-[13px]" />}{t.quantity}
                      </span>
                      <span className="text-muted-foreground"> / {t.minimum_quantity}</span>
                    </td>
                    <td className="truncate p-2.5 text-muted-foreground">{t.tool_supplier?.name ?? supplierName(t.tool_supplier_id)}</td>
                    <td className="p-2.5 text-center">
                      {retired ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Ritirato</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/[0.14] px-2 py-0.5 text-[11px] font-medium text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-current" /> Attivo
                        </span>
                      )}
                    </td>
                    <td className="p-2.5">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => startEdit(t)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifica">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setPendingDelete(t.id)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <ToolFormModal
          tool={editTool}
          types={types}
          brands={brands}
          suppliers={suppliers}
          onClose={() => setFormOpen(false)}
          onSaved={loadTools}
        />
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questo utensile?"
        description="Questa azione non è reversibile."
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </StandardPage>
  )
}
