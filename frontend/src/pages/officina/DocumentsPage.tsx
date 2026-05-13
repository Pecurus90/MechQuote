import { useEffect, useState, useRef, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  FileText, Upload, Trash2, Search, ExternalLink, X, ChevronLeft,
  Image as ImageIcon, FileSpreadsheet, FileType2, Box,
} from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import DxfPreviewModal from '@/components/officina/DxfPreviewModal'
import { timeAgo } from '@/lib/timeAgo'
import type { OfficinaDocument, OfficinaCategory, Customer, MaterialSupplier, ToolSupplier, NormalizedSupplier } from '@/types'

type RefKind = 'none' | 'customer' | 'material_supplier' | 'tool_supplier' | 'normalized_supplier'

interface UploadForm {
  title: string
  category: string
  ref_kind: RefKind
  ref_id: string  // id del cliente/fornitore selezionato
  file: File | null
}

const emptyUpload = (): UploadForm => ({
  title: '', category: '', ref_kind: 'none', ref_id: '', file: null,
})

const fmtCustomer = (c: { customer_number: number; name: string }) =>
  `${String(c.customer_number).padStart(3, '0')} — ${c.name}`

const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

const ALLOWED_ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.dxf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/gif'

/** Determina come "aprire" il file in base all'estensione. */
type FileKind = 'pdf' | 'image' | 'dxf' | 'office' | 'other'
function fileKind(filename: string): FileKind {
  const ext = filename.toLowerCase().split('.').pop() || ''
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'image'
  if (ext === 'dxf') return 'dxf'
  if (['doc', 'docx', 'xls', 'xlsx'].includes(ext)) return 'office'
  return 'other'
}

function FileTypeBadge({ kind }: { kind: FileKind }) {
  const map: Record<FileKind, { icon: typeof FileText; color: string; label: string }> = {
    pdf:    { icon: FileText,        color: 'text-red-600',   label: 'PDF' },
    image:  { icon: ImageIcon,       color: 'text-pink-600',  label: 'IMG' },
    dxf:    { icon: Box,             color: 'text-blue-600',  label: 'DXF' },
    office: { icon: FileSpreadsheet, color: 'text-green-700', label: 'DOC' },
    other:  { icon: FileType2,       color: 'text-gray-500',  label: '—' },
  }
  const { icon: Icon, color, label } = map[kind]
  return (
    <span className={`inline-flex items-center gap-1 ${color} font-mono text-[10px] font-semibold uppercase`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  )
}

export default function OfficinaDocumentsPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('officina.write')
  const [searchParams, setSearchParams] = useSearchParams()

  const [docs, setDocs] = useState<OfficinaDocument[]>([])
  const [categories, setCategories] = useState<OfficinaCategory[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [matSuppliers, setMatSuppliers] = useState<MaterialSupplier[]>([])
  const [toolSuppliers, setToolSuppliers] = useState<ToolSupplier[]>([])
  const [normSuppliers, setNormSuppliers] = useState<NormalizedSupplier[]>([])
  const [filterCat, setFilterCat] = useState(searchParams.get('category') ?? '')
  // Filtro riferimento unificato: 'c:ID', 'm:ID', 't:ID', '' = nessuno
  const [filterRef, setFilterRef] = useState(() => {
    const sp = searchParams
    if (sp.get('customer_id')) return `c:${sp.get('customer_id')}`
    if (sp.get('material_supplier_id')) return `m:${sp.get('material_supplier_id')}`
    if (sp.get('tool_supplier_id')) return `t:${sp.get('tool_supplier_id')}`
    if (sp.get('normalized_supplier_id')) return `n:${sp.get('normalized_supplier_id')}`
    return ''
  })
  const [groupByCustomer, setGroupByCustomer] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const [uploadForm, setUploadForm] = useState<UploadForm | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingDelete, setPendingDelete] = useState<OfficinaDocument | null>(null)
  const [dxfPreview, setDxfPreview] = useState<OfficinaDocument | null>(null)

  useEscapeKey(() => setUploadForm(null), !!uploadForm)

  // Sync filtri ↔ query string. filterRef è 'c:ID' | 'm:ID' | 't:ID'.
  // searchParams/setSearchParams fuori dalle deps: re-firare ad ogni URL
  // change causerebbe loop. Effect deve scattare solo quando i filtri locali
  // cambiano.
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    if (filterCat) params.set('category', filterCat); else params.delete('category')
    params.delete('customer_id'); params.delete('material_supplier_id'); params.delete('tool_supplier_id'); params.delete('normalized_supplier_id')
    if (filterRef.startsWith('c:')) params.set('customer_id', filterRef.slice(2))
    if (filterRef.startsWith('m:')) params.set('material_supplier_id', filterRef.slice(2))
    if (filterRef.startsWith('t:')) params.set('tool_supplier_id', filterRef.slice(2))
    if (filterRef.startsWith('n:')) params.set('normalized_supplier_id', filterRef.slice(2))
    setSearchParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCat, filterRef])

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterCat) params.set('category', filterCat)
    if (filterRef.startsWith('c:')) params.set('customer_id', filterRef.slice(2))
    if (filterRef.startsWith('m:')) params.set('material_supplier_id', filterRef.slice(2))
    if (filterRef.startsWith('t:')) params.set('tool_supplier_id', filterRef.slice(2))
    if (filterRef.startsWith('n:')) params.set('normalized_supplier_id', filterRef.slice(2))
    if (search.trim()) params.set('q', search.trim())
    api.get(`/officina/documents?${params}`)
      .then(r => setDocs(r.data))
      .catch(() => toast.error('Errore caricamento documenti'))
      .finally(() => setLoading(false))
  }

  const loadCategories = () => {
    api.get('/officina/categories-full').then(r => setCategories(r.data)).catch(() => undefined)
  }
  const loadCustomers = () => {
    api.get('/customers?active_only=true').then(r => setCustomers(r.data)).catch(() => undefined)
  }
  const loadSuppliers = () => {
    api.get('/material-suppliers').then(r => setMatSuppliers(r.data)).catch(() => undefined)
    api.get('/tools/suppliers').then(r => setToolSuppliers(r.data)).catch(() => undefined)
    api.get('/normalized-suppliers').then(r => setNormSuppliers(r.data)).catch(() => undefined)
  }

  useEffect(() => { load() }, [filterCat, filterRef])
  // Debounce ricerca testo: `load` fuori dalle deps perché chiude su
  // filterCat/filterRef che hanno già il loro useEffect (riga sopra).
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  useEffect(() => { loadCategories(); loadCustomers(); loadSuppliers() }, [])

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'it')),
    [categories],
  )

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.customer_number - b.customer_number),
    [customers],
  )
  const sortedMatSuppliers = useMemo(
    () => [...matSuppliers].filter(s => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [matSuppliers],
  )
  const sortedToolSuppliers = useMemo(
    () => [...toolSuppliers].filter(s => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [toolSuppliers],
  )
  const sortedNormSuppliers = useMemo(
    () => [...normSuppliers].filter(s => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [normSuppliers],
  )

  const openUpload = () => {
    const defaultCat = filterCat || sortedCategories[0]?.name || ''
    // Pre-popolo il riferimento dal filtro attivo se presente
    let kind: RefKind = 'none'
    let refId = ''
    if (filterRef.startsWith('c:')) { kind = 'customer'; refId = filterRef.slice(2) }
    else if (filterRef.startsWith('m:')) { kind = 'material_supplier'; refId = filterRef.slice(2) }
    else if (filterRef.startsWith('t:')) { kind = 'tool_supplier'; refId = filterRef.slice(2) }
    else if (filterRef.startsWith('n:')) { kind = 'normalized_supplier'; refId = filterRef.slice(2) }
    setUploadForm({ ...emptyUpload(), category: defaultCat, ref_kind: kind, ref_id: refId })
  }

  const handleUpload = async () => {
    if (!uploadForm || !uploadForm.file || !uploadForm.title.trim()) {
      toast.error('Titolo e file sono obbligatori')
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('title', uploadForm.title.trim())
    if (uploadForm.category.trim()) fd.append('category', uploadForm.category.trim())
    if (uploadForm.ref_kind === 'customer' && uploadForm.ref_id) fd.append('customer_id', uploadForm.ref_id)
    if (uploadForm.ref_kind === 'material_supplier' && uploadForm.ref_id) fd.append('material_supplier_id', uploadForm.ref_id)
    if (uploadForm.ref_kind === 'tool_supplier' && uploadForm.ref_id) fd.append('tool_supplier_id', uploadForm.ref_id)
    if (uploadForm.ref_kind === 'normalized_supplier' && uploadForm.ref_id) fd.append('normalized_supplier_id', uploadForm.ref_id)
    fd.append('file', uploadForm.file)
    try {
      await api.post('/officina/documents', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Documento caricato')
      setUploadForm(null)
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore upload')
    } finally {
      setUploading(false)
    }
  }

  const openDoc = (doc: OfficinaDocument) => {
    const kind = fileKind(doc.filename)

    if (kind === 'dxf') {
      setDxfPreview(doc)
      return
    }
    // PDF / immagini → inline nel browser via blob URL.
    // Office / other → download forzato (il browser non li renderizza).
    api.get(`/officina/documents/${doc.id}/download`, { responseType: 'blob' })
      .then(res => {
        const ct = res.headers['content-type']
        const mime = typeof ct === 'string' ? ct : 'application/octet-stream'
        const url = window.URL.createObjectURL(new Blob([res.data], { type: mime }))
        if (kind === 'pdf' || kind === 'image') {
          window.open(url, '_blank')
        } else {
          // Force download
          const a = document.createElement('a')
          a.href = url
          a.download = doc.filename
          document.body.appendChild(a)
          a.click()
          a.remove()
        }
        setTimeout(() => window.URL.revokeObjectURL(url), 30_000)
      })
      .catch(() => toast.error('Errore apertura file'))
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    try {
      await api.delete(`/officina/documents/${id}`)
      toast.success('Documento eliminato')
      load()
    } catch { toast.error('Errore eliminazione') }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link to="/officina" className="hover:text-blue-700 flex items-center gap-1">
              <ChevronLeft className="w-3 h-3" /> Officina
            </Link>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-700" /> Documenti
            {filterCat && (
              <span className="text-base font-normal text-gray-500">— {filterCat}</span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            PDF, Word, Excel, immagini e DXF consultabili dall'officina. Click su un file
            per aprirlo: i PDF/immagini si aprono in nuova tab, i DXF mostrano l'anteprima
            del disegno, gli altri si scaricano.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={openUpload}>
            <Upload className="w-4 h-4 mr-1" /> Carica file
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input placeholder="Cerca per titolo..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="">Tutte le categorie</option>
          {sortedCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[220px]"
          value={filterRef}
          onChange={e => setFilterRef(e.target.value)}
        >
          <option value="">Tutti (clienti + fornitori)</option>
          {sortedCustomers.length > 0 && (
            <optgroup label="Clienti">
              {sortedCustomers.map(c => <option key={`c-${c.id}`} value={`c:${c.id}`}>{fmtCustomer(c)}</option>)}
            </optgroup>
          )}
          {sortedMatSuppliers.length > 0 && (
            <optgroup label="Fornitori materiali">
              {sortedMatSuppliers.map(s => <option key={`m-${s.id}`} value={`m:${s.id}`}>{s.name}</option>)}
            </optgroup>
          )}
          {sortedToolSuppliers.length > 0 && (
            <optgroup label="Fornitori utensili">
              {sortedToolSuppliers.map(s => <option key={`t-${s.id}`} value={`t:${s.id}`}>{s.name}</option>)}
            </optgroup>
          )}
          {sortedNormSuppliers.length > 0 && (
            <optgroup label="Fornitori normalizzati">
              {sortedNormSuppliers.map(s => <option key={`n-${s.id}`} value={`n:${s.id}`}>{s.name}</option>)}
            </optgroup>
          )}
        </select>
        <label className="text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer ml-2">
          <input type="checkbox" checked={groupByCustomer} onChange={e => setGroupByCustomer(e.target.checked)} />
          Raggruppa per riferimento
        </label>
      </div>

      {(() => {
        // Helpers per riferimento unificato
        const refKeyLabel = (d: OfficinaDocument): { key: string; label: string } => {
          if (d.customer) return { key: `c${d.customer.id}`, label: `Cliente · ${fmtCustomer(d.customer)}` }
          if (d.material_supplier) return { key: `m${d.material_supplier.id}`, label: `Fornitore materiali · ${d.material_supplier.name}` }
          if (d.tool_supplier) return { key: `t${d.tool_supplier.id}`, label: `Fornitore utensili · ${d.tool_supplier.name}` }
          if (d.normalized_supplier) return { key: `n${d.normalized_supplier.id}`, label: `Fornitori normalizzati · ${d.normalized_supplier.name}` }
          return { key: 'none', label: 'Senza riferimento' }
        }
        const refInlineCell = (d: OfficinaDocument) => {
          if (d.customer) return (
            <span title={d.customer.name}>
              <span className="text-[10px] font-semibold text-blue-600 uppercase mr-1">CL</span>
              <span className="font-mono text-gray-400">{String(d.customer.customer_number).padStart(3, '0')}</span>
              {' '}{d.customer.name}
            </span>
          )
          if (d.material_supplier) return (
            <span title={d.material_supplier.name}>
              <span className="text-[10px] font-semibold text-amber-600 uppercase mr-1">MAT</span>
              {d.material_supplier.name}
            </span>
          )
          if (d.tool_supplier) return (
            <span title={d.tool_supplier.name}>
              <span className="text-[10px] font-semibold text-purple-600 uppercase mr-1">UT</span>
              {d.tool_supplier.name}
            </span>
          )
          if (d.normalized_supplier) return (
            <span title={d.normalized_supplier.name}>
              <span className="text-[10px] font-semibold text-orange-600 uppercase mr-1">NORM</span>
              {d.normalized_supplier.name}
            </span>
          )
          return <span className="text-gray-300">—</span>
        }

        // Raggruppamento per riferimento quando attivo
        const groups: Array<{ key: string; label: string; items: OfficinaDocument[] }> = []
        if (groupByCustomer) {
          const map = new Map<string, OfficinaDocument[]>()
          for (const d of docs) {
            const { key } = refKeyLabel(d)
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(d)
          }
          for (const [key, items] of map) {
            const { label } = refKeyLabel(items[0])
            groups.push({ key, label, items })
          }
          groups.sort((a, b) => {
            if (a.key === 'none') return 1
            if (b.key === 'none') return -1
            return a.label.localeCompare(b.label, 'it')
          })
        }

        const renderRow = (d: OfficinaDocument) => {
          const kind = fileKind(d.filename)
          return (
            <tr key={d.id} className="border-b hover:bg-gray-50">
              <td className="p-2"><FileTypeBadge kind={kind} /></td>
              <td className="p-2">
                <div className="font-medium text-gray-900 truncate">{d.title}</div>
                <div className="text-[11px] text-gray-400 font-mono truncate">{d.filename}</div>
              </td>
              <td className="p-2">
                {d.category ? (
                  <span className="inline-block bg-blue-50 text-blue-700 text-[11px] font-medium px-2 py-0.5 rounded">
                    {d.category}
                  </span>
                ) : <span className="text-gray-300">—</span>}
              </td>
              <td className="p-2 text-xs text-gray-600 truncate">{refInlineCell(d)}</td>
              <td className="p-2 text-right font-mono text-xs text-gray-600">{fmtBytes(d.size_bytes)}</td>
              <td className="p-2 text-xs text-gray-500">
                <div>{timeAgo(d.uploaded_at)}</div>
                {d.uploaded_by && (
                  <div className="text-[10px] text-gray-400 truncate">{d.uploaded_by.full_name || d.uploaded_by.username}</div>
                )}
              </td>
              <td className="p-2 text-center">
                <div className="flex gap-1.5 justify-center">
                  <button onClick={() => openDoc(d)} className="p-1 hover:bg-blue-50 rounded"
                    title={kind === 'dxf' ? 'Anteprima DXF' : kind === 'office' || kind === 'other' ? 'Scarica' : 'Apri in nuova tab'}>
                    <ExternalLink className="w-4 h-4 text-blue-600" />
                  </button>
                  {canWrite && (
                    <button onClick={() => setPendingDelete(d)} className="p-1 hover:bg-red-50 rounded" title="Elimina">
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )
        }

        return (
          <Card>
            <CardContent className="p-0">
              <table className="table-fixed w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-2 w-[7%] font-medium text-gray-600">Tipo</th>
                    <th className="text-left p-2 w-[26%] font-medium text-gray-600">Titolo</th>
                    <th className="text-left p-2 w-[13%] font-medium text-gray-600">Categoria</th>
                    <th className="text-left p-2 w-[20%] font-medium text-gray-600">Riferimento</th>
                    <th className="text-right p-2 w-[9%] font-medium text-gray-600">Dim.</th>
                    <th className="text-left p-2 w-[13%] font-medium text-gray-600">Caricato</th>
                    <th className="text-center p-2 w-[12%] font-medium text-gray-600">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="p-6 text-center text-gray-400">Caricamento...</td></tr>
                  ) : docs.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-gray-400">
                      {search || filterCat || filterRef
                        ? 'Nessun documento corrisponde ai filtri.'
                        : 'Nessun documento ancora caricato.'}
                    </td></tr>
                  ) : groupByCustomer ? (
                    groups.flatMap(g => [
                      <tr key={`h-${g.key}`} className="bg-blue-50/60 border-b">
                        <td colSpan={7} className="px-2 py-1.5 text-xs font-semibold text-blue-900">
                          {g.label} <span className="text-gray-500 font-normal">— {g.items.length} {g.items.length === 1 ? 'doc' : 'doc'}</span>
                        </td>
                      </tr>,
                      ...g.items.map(renderRow),
                    ])
                  ) : (
                    docs.map(renderRow)
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )
      })()}

      {/* Modal upload */}
      {uploadForm && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">Carica file</h3>
              <button onClick={() => setUploadForm(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <CardContent className="pt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Titolo *</label>
                <Input value={uploadForm.title}
                  onChange={e => setUploadForm(f => f ? { ...f, title: e.target.value } : f)}
                  placeholder="es. Catalogo Sandvik 2024" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium">Categoria</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm mt-1"
                  value={uploadForm.category}
                  onChange={e => setUploadForm(f => f ? { ...f, category: e.target.value } : f)}
                >
                  <option value="">— Nessuna —</option>
                  {sortedCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Le categorie sono gestite dall'amministratore (Hub Officina → "Nuova categoria").
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Tipo riferimento</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm mt-1"
                    value={uploadForm.ref_kind}
                    onChange={e => setUploadForm(f => f ? { ...f, ref_kind: e.target.value as RefKind, ref_id: '' } : f)}
                  >
                    <option value="none">— Nessuno —</option>
                    <option value="customer">Cliente</option>
                    <option value="material_supplier">Fornitore materiali</option>
                    <option value="tool_supplier">Fornitore utensili</option>
                    <option value="normalized_supplier">Fornitori normalizzati</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">
                    {uploadForm.ref_kind === 'customer' ? 'Cliente' :
                     uploadForm.ref_kind === 'material_supplier' ? 'Fornitore materiali' :
                     uploadForm.ref_kind === 'tool_supplier' ? 'Fornitore utensili' :
                     uploadForm.ref_kind === 'normalized_supplier' ? 'Fornitori normalizzati' : 'Selezione'}
                  </label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm mt-1 disabled:opacity-50"
                    value={uploadForm.ref_id}
                    disabled={uploadForm.ref_kind === 'none'}
                    onChange={e => setUploadForm(f => f ? { ...f, ref_id: e.target.value } : f)}
                  >
                    <option value="">— Seleziona —</option>
                    {uploadForm.ref_kind === 'customer' && sortedCustomers.map(c => (
                      <option key={c.id} value={c.id}>{fmtCustomer(c)}</option>
                    ))}
                    {uploadForm.ref_kind === 'material_supplier' && sortedMatSuppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    {uploadForm.ref_kind === 'tool_supplier' && sortedToolSuppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    {uploadForm.ref_kind === 'normalized_supplier' && sortedNormSuppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">File *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_ACCEPT}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) setUploadForm(s => s ? { ...s, file: f } : s)
                  }}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100 cursor-pointer mt-1"
                />
                {uploadForm.file && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    {uploadForm.file.name} ({fmtBytes(uploadForm.file.size)})
                  </p>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Max 50 MB. Accettati: PDF, Word, Excel, immagini (PNG/JPG/GIF), DXF.
                </p>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={handleUpload} disabled={uploading}>
                  <Upload className="w-4 h-4 mr-1" /> {uploading ? 'Caricamento...' : 'Carica'}
                </Button>
                <Button variant="outline" onClick={() => setUploadForm(null)} disabled={uploading}>
                  Annulla
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title={`Eliminare "${pendingDelete?.title ?? ''}"?`}
        description="Il file verrà rimosso dal disco e non sarà più recuperabile."
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {dxfPreview && (
        <DxfPreviewModal
          documentId={dxfPreview.id}
          documentTitle={dxfPreview.title}
          onClose={() => setDxfPreview(null)}
        />
      )}
    </div>
  )
}
