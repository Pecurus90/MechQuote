import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search, Wrench, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import type { Tool, ToolAttribute, ToolSupplier } from '@/types'

type ScanMode = 'load' | 'unload'

interface FormState {
  id: number | null
  code: string
  tool_type: string
  brand: string
  model: string
  diameter_mm: string
  toroidal_mm: string
  quantity: string
  minimum_quantity: string
  location: string
  tool_supplier_id: string
  notes: string
  active: boolean
}

const emptyForm = (): FormState => ({
  id: null, code: '', tool_type: '', brand: '', model: '',
  diameter_mm: '', toroidal_mm: '', quantity: '0', minimum_quantity: '0',
  location: '', tool_supplier_id: '', notes: '', active: true,
})

/** Dropdown vincolato + fallback testuale per valori legacy non più in catalogo. */
function AttributeSelect({
  value, options, onChange, placeholder,
}: {
  value: string
  options: ToolAttribute[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const activeNames = options.filter(o => o.active).map(o => o.name)
  // Se il valore corrente non è nel catalogo attivo (es. valore legacy),
  // mostro un input read-only con bottone per resettare → torna a select.
  const isLegacy = value !== '' && !activeNames.includes(value)
  if (isLegacy) {
    return (
      <div className="flex gap-1">
        <Input value={value} readOnly className="bg-amber-50" title="Valore non in catalogo — modificalo per riallinearti" />
        <button
          type="button"
          onClick={() => onChange('')}
          className="px-2 text-gray-500 hover:text-gray-700"
          title="Pulisci e scegli dal catalogo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }
  return (
    <select
      className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{placeholder ?? '— Seleziona —'}</option>
      {activeNames.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  )
}

export default function ToolsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tools, setTools] = useState<Tool[]>([])
  const [suppliers, setSuppliers] = useState<ToolSupplier[]>([])
  const [types, setTypes] = useState<ToolAttribute[]>([])
  const [brands, setBrands] = useState<ToolAttribute[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  // Scan
  const [scanMode, setScanMode] = useState<ScanMode>('unload')
  const [scanCode, setScanCode] = useState('')
  const scanInputRef = useRef<HTMLInputElement>(null)

  useEscapeKey(() => setForm(null), !!form)

  // Filtri lista
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(searchParams.get('low_stock') === '1')

  // Sync URL ↔ lowStockOnly
  // searchParams/setSearchParams fuori dalle deps: scriverebbero la URL
  // ad ogni cambio di URL stessa → loop. Effect deve firare SOLO su lowStockOnly.
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    if (lowStockOnly) params.set('low_stock', '1')
    else params.delete('low_stock')
    setSearchParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowStockOnly])

  // Autofocus scan input al mount + quando si chiude un modal
  useEffect(() => {
    if (!form) scanInputRef.current?.focus()
  }, [form])

  const loadTools = () => {
    const params = new URLSearchParams()
    if (filterType) params.set('tool_type', filterType)
    if (filterBrand) params.set('brand', filterBrand)
    if (filterSupplier) params.set('tool_supplier_id', filterSupplier)
    if (lowStockOnly) params.set('low_stock_only', 'true')
    if (search.trim()) params.set('q', search.trim())
    setLoading(true)
    api.get(`/tools?${params}`)
      .then(r => setTools(r.data))
      .catch(() => toast.error('Errore caricamento utensili'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadTools() }, [filterType, filterBrand, filterSupplier, lowStockOnly])
  // Debounce ricerca: loadTools fuori dalle deps perché chiude su molte
  // variabili (filterType/Brand/Supplier/lowStock) — l'effect deve firare
  // SOLO sul cambio di `search`, gli altri filtri hanno il loro useEffect.
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

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = scanCode.trim()
    if (!code) return
    try {
      const res = await api.post('/tools/scan', { code, mode: scanMode, quantity: 1 })
      const t = res.data as Tool
      const symbol = scanMode === 'load' ? '+1' : '−1'
      toast.success(`${t.code}: ${symbol} → qty ${t.quantity}`, {
        description: t.quantity < t.minimum_quantity ? `⚠ Sotto minimo (${t.minimum_quantity})` : undefined,
      })
      setScanCode('')
      loadTools()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore scan')
      setScanCode('')
    } finally {
      // refocus input subito per scan rapidi consecutivi
      scanInputRef.current?.focus()
    }
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => (f ? { ...f, [k]: v } : f))

  const startNew = () => setForm(emptyForm())
  const startEdit = (t: Tool) => setForm({
    id: t.id,
    code: t.code,
    tool_type: t.tool_type ?? '',
    brand: t.brand ?? '',
    model: t.model ?? '',
    diameter_mm: t.diameter_mm != null ? String(t.diameter_mm) : '',
    toroidal_mm: t.toroidal_mm != null ? String(t.toroidal_mm) : '',
    quantity: String(t.quantity),
    minimum_quantity: String(t.minimum_quantity),
    location: t.location ?? '',
    tool_supplier_id: t.tool_supplier_id ? String(t.tool_supplier_id) : '',
    notes: t.notes ?? '',
    active: t.active ?? true,
  })

  const handleSave = async () => {
    if (!form || !form.code.trim()) { toast.error('Codice obbligatorio'); return }
    const payload = {
      code: form.code.trim(),
      tool_type: form.tool_type || null,
      brand: form.brand || null,
      model: form.model || null,
      diameter_mm: form.diameter_mm ? parseDecimal(form.diameter_mm) : null,
      toroidal_mm: form.toroidal_mm ? parseDecimal(form.toroidal_mm) : null,
      quantity: parseInt(form.quantity) || 0,
      minimum_quantity: parseInt(form.minimum_quantity) || 0,
      location: form.location || null,
      tool_supplier_id: form.tool_supplier_id ? Number(form.tool_supplier_id) : null,
      notes: form.notes || null,
      active: form.active,
    }
    try {
      if (form.id) await api.put(`/tools/${form.id}`, payload)
      else await api.post('/tools', payload)
      toast.success('Utensile salvato')
      setForm(null); loadTools()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    }
  }

  const handleDelete = (id: number) => setPendingDelete(id)
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
    <PageContainer width="xl">
      <SettingsPageHeader
        icon={Wrench}
        color="violet"
        title="Utensili"
        subtitle={`${tools.length} utensil${tools.length === 1 ? 'e' : 'i'} mostrati`}
        action={
          <PrimaryCtaButton color="violet" size="sm" onClick={startNew}>
            <Plus className="w-4 h-4" /> Nuovo utensile
          </PrimaryCtaButton>
        }
      />

      {/* Scan zone */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex border rounded-md overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setScanMode('load')}
                className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  scanMode === 'load'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ArrowUp className="w-4 h-4" /> Carico
              </button>
              <button
                type="button"
                onClick={() => setScanMode('unload')}
                className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  scanMode === 'unload'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ArrowDown className="w-4 h-4" /> Scarico
              </button>
            </div>
            <form onSubmit={handleScan} className="flex-1 min-w-[260px]">
              <Input
                ref={scanInputRef}
                value={scanCode}
                onChange={e => setScanCode(e.target.value)}
                placeholder={scanMode === 'load' ? 'Spara il codice per AGGIUNGERE 1 pz...' : 'Spara il codice per RIMUOVERE 1 pz...'}
                autoFocus
                className="h-11 text-base font-mono"
              />
            </form>
            <span className="text-xs text-gray-400">
              Pistola barcode → premi Enter per confermare automaticamente
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Filtri */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer ml-2">
          <input type="checkbox" checked={lowStockOnly}
            onChange={e => setLowStockOnly(e.target.checked)} />
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            Solo sotto minimo
          </span>
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2 w-[20%] font-medium text-gray-600">Codice</th>
                <th className="text-left p-2 w-[14%] font-medium text-gray-600">Tipo</th>
                <th className="text-left p-2 w-[20%] font-medium text-gray-600">Marchio · Modello</th>
                <th className="text-right p-2 w-[10%] font-medium text-gray-600">Ø (mm)</th>
                <th className="text-right p-2 w-[10%] font-medium text-gray-600">Qtà / Min</th>
                <th className="text-left p-2 w-[16%] font-medium text-gray-600">Fornitore</th>
                <th className="text-center p-2 w-[10%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-6 text-center text-gray-400">Caricamento...</td></tr>
              ) : tools.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-gray-400">Nessun utensile trovato.</td></tr>
              ) : tools.map(t => {
                const isLow = t.quantity < t.minimum_quantity && t.minimum_quantity > 0
                return (
                  <tr key={t.id} className={`border-b hover:bg-gray-50 ${isLow ? 'bg-rose-50' : ''}`}>
                    <td className="p-2 font-mono text-xs text-gray-800 truncate">{t.code}</td>
                    <td className="p-2 truncate">{t.tool_type || '—'}</td>
                    <td className="p-2 truncate">
                      <span className="font-medium">{t.brand || ''}</span>
                      {t.model && <span className="text-gray-500"> · {t.model}</span>}
                    </td>
                    <td className="p-2 text-right font-mono">{t.diameter_mm ?? '—'}</td>
                    <td className="p-2 text-right font-mono">
                      <span className={isLow ? 'text-rose-700 font-bold' : 'text-gray-800'}>{t.quantity}</span>
                      <span className="text-gray-400"> / {t.minimum_quantity}</span>
                    </td>
                    <td className="p-2 truncate text-gray-600">{t.tool_supplier?.name ?? supplierName(t.tool_supplier_id)}</td>
                    <td className="p-2 text-center">
                      <div className="flex gap-1.5 justify-center">
                        <button onClick={() => startEdit(t)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => handleDelete(t.id)} className="p-1 hover:bg-red-50 rounded">
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

      {/* Modal CRUD */}
      {form && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">{form.id ? 'Modifica' : 'Nuovo'} Utensile</h3>
              <button onClick={() => setForm(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-sm font-medium">Codice *</label>
                  <Input className="font-mono" value={form.code} onChange={e => set('code', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <AttributeSelect value={form.tool_type} options={types}
                    onChange={v => set('tool_type', v)} placeholder="— Seleziona —" />
                </div>
                <div>
                  <label className="text-sm font-medium">Marchio</label>
                  <AttributeSelect value={form.brand} options={brands}
                    onChange={v => set('brand', v)} placeholder="— Seleziona —" />
                </div>
                <div>
                  <label className="text-sm font-medium">Modello</label>
                  <Input value={form.model} onChange={e => set('model', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Diametro (mm)</label>
                  <Input type="number" step="0.01" value={form.diameter_mm} onChange={e => set('diameter_mm', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Raggio torico (mm)</label>
                  <Input type="number" step="0.01" value={form.toroidal_mm} onChange={e => set('toroidal_mm', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Quantità</label>
                  <Input type="number" min={0} value={form.quantity} onChange={e => set('quantity', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Quantità minima</label>
                  <Input type="number" min={0} value={form.minimum_quantity} onChange={e => set('minimum_quantity', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Posizione</label>
                  <Input value={form.location} onChange={e => set('location', e.target.value)} placeholder="es. 1-C-2" />
                </div>
                <div>
                  <label className="text-sm font-medium">Fornitore</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={form.tool_supplier_id} onChange={e => set('tool_supplier_id', e.target.value)}
                  >
                    <option value="">Nessuno</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Note</label>
                  <Input value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <PrimaryCtaButton color="violet" onClick={handleSave}>Salva</PrimaryCtaButton>
                <Button variant="outline" onClick={() => setForm(null)}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questo utensile?"
        description="Questa azione non è reversibile."
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  )
}
