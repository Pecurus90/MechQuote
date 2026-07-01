import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Search, Wrench, AlertTriangle } from 'lucide-react'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Tool, ToolAttribute, ToolSupplier } from '@/types'
import ToolFormModal from './ToolFormModal'
import ToolScanBar from './ToolScanBar'
import ToolImportButtons from './ToolImportButtons'

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
  const [onlyActive, setOnlyActive] = useState(false)

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
  // Debounce ricerca: loadTools fuori dalle deps (chiude su molti filtri che
  // hanno già il loro useEffect; l'effect deve firare SOLO su `search`).
  useEffect(() => {
    const t = setTimeout(loadTools, 250)
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

  const supplierName = (id?: number | null) => suppliers.find(s => s.id === id)?.name ?? '—'

  return (
    <StandardPage
      icon={Wrench}
      color="violet"
      width="xl"
      title="Utensili"
      subtitle={`${tools.length} utensil${tools.length === 1 ? 'e' : 'i'} mostrati`}
      actions={
        <div className="flex items-center gap-3">
          <ToolImportButtons onImported={loadTools} />
          <PrimaryCtaButton color="violet" size="sm" onClick={startNew}>
            <Plus className="w-4 h-4" /> Nuovo utensile
          </PrimaryCtaButton>
        </div>
      }
    >
      <ToolScanBar onScanned={loadTools} />

      {/* Filtri */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Cerca codice, marchio, modello..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={filterType} onChange={e => setFilterType(e.target.value)}
        >
          <option value="">Tutti i tipi</option>
          {types.filter(t => t.active).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
        >
          <option value="">Tutti i marchi</option>
          {brands.filter(b => b.active).map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
        >
          <option value="">Tutti i fornitori</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-2">
          <input type="checkbox" checked={lowStockOnly}
            onChange={e => setLowStockOnly(e.target.checked)} />
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            Solo sotto minimo
          </span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={onlyActive}
            onChange={e => setOnlyActive(e.target.checked)} />
          Solo attivi
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className="text-left p-2 w-[18%] font-medium text-muted-foreground">Codice</th>
                <th className="text-left p-2 w-[13%] font-medium text-muted-foreground">Tipo</th>
                <th className="text-left p-2 w-[19%] font-medium text-muted-foreground">Marchio · Modello</th>
                <th className="text-right p-2 w-[9%] font-medium text-muted-foreground">Ø (mm)</th>
                <th className="text-right p-2 w-[9%] font-medium text-muted-foreground">Qtà / Min</th>
                <th className="text-left p-2 w-[15%] font-medium text-muted-foreground">Fornitore</th>
                <th className="text-center p-2 w-[7%] font-medium text-muted-foreground">Attivo</th>
                <th className="text-center p-2 w-[10%] font-medium text-muted-foreground">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Caricamento...</td></tr>
              ) : tools.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nessun utensile trovato.</td></tr>
              ) : tools.map(t => {
                const isLow = t.quantity < t.minimum_quantity && t.minimum_quantity > 0
                return (
                  <tr key={t.id} className={`border-b hover:bg-muted ${isLow ? 'bg-rose-50' : ''}`}>
                    <td className="p-2 font-mono text-xs text-foreground truncate">{t.code}</td>
                    <td className="p-2 truncate">{t.tool_type || '—'}</td>
                    <td className="p-2 truncate">
                      <span className="font-medium">{t.brand || ''}</span>
                      {t.model && <span className="text-muted-foreground"> · {t.model}</span>}
                    </td>
                    <td className="p-2 text-right font-mono">{t.diameter_mm ?? '—'}</td>
                    <td className="p-2 text-right font-mono">
                      <span className={isLow ? 'text-rose-700 font-bold' : 'text-foreground'}>{t.quantity}</span>
                      <span className="text-muted-foreground"> / {t.minimum_quantity}</span>
                    </td>
                    <td className="p-2 truncate text-muted-foreground">{t.tool_supplier?.name ?? supplierName(t.tool_supplier_id)}</td>
                    <td className="p-2 text-center">
                      {t.active === false
                        ? <span className="text-muted-foreground/50 text-xs" title="Ritirato">●</span>
                        : <span className="text-green-600 text-xs" title="Attivo">●</span>}
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex gap-1.5 justify-center">
                        <button onClick={() => startEdit(t)} className="p-1 hover:bg-muted rounded">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => setPendingDelete(t.id)} className="p-1 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

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
