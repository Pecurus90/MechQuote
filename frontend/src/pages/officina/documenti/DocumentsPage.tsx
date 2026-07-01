import { useEffect, useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { FileText, Upload, Search, ChevronLeft } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import type { OfficinaDocument, OfficinaCategory, Customer, MaterialSupplier, ToolSupplier, NormalizedSupplier } from '@/types'
import { fileKind, fmtCustomer, type RefKind } from './documentsUtil'
import DocumentsTable from './DocumentsTable'
import UploadModal from './UploadModal'
import DxfPreviewModal from './DxfPreviewModal'

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
  // Filtro riferimento unificato: 'c:ID', 'm:ID', 't:ID', 'n:ID', '' = nessuno
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

  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<OfficinaDocument | null>(null)
  const [dxfPreview, setDxfPreview] = useState<OfficinaDocument | null>(null)

  // Sync filtri ↔ query string. searchParams/setSearchParams fuori dalle deps:
  // re-firare ad ogni URL change causerebbe loop. Effect scatta solo quando i
  // filtri locali cambiano.
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

  useEffect(() => { load() }, [filterCat, filterRef])
  // Debounce ricerca testo: `load` fuori dalle deps (chiude su filterCat/filterRef
  // che hanno già il loro effetto sopra).
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  useEffect(() => {
    api.get('/officina/categories-full').then(r => setCategories(r.data)).catch(() => undefined)
    api.get('/customers?active_only=true').then(r => setCustomers(r.data)).catch(() => undefined)
    api.get('/material-suppliers').then(r => setMatSuppliers(r.data)).catch(() => undefined)
    api.get('/tools/suppliers').then(r => setToolSuppliers(r.data)).catch(() => undefined)
    api.get('/normalized-suppliers').then(r => setNormSuppliers(r.data)).catch(() => undefined)
  }, [])

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

  const openDoc = (doc: OfficinaDocument) => {
    if (fileKind(doc.filename) === 'dxf') {
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
        const kind = fileKind(doc.filename)
        if (kind === 'pdf' || kind === 'image') {
          window.open(url, '_blank')
        } else {
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

  // Default per il modal upload, dal filtro attivo.
  const uploadDefaults = () => {
    let kind: RefKind = 'none'
    let refId = ''
    if (filterRef.startsWith('c:')) { kind = 'customer'; refId = filterRef.slice(2) }
    else if (filterRef.startsWith('m:')) { kind = 'material_supplier'; refId = filterRef.slice(2) }
    else if (filterRef.startsWith('t:')) { kind = 'tool_supplier'; refId = filterRef.slice(2) }
    else if (filterRef.startsWith('n:')) { kind = 'normalized_supplier'; refId = filterRef.slice(2) }
    return {
      category: filterCat || sortedCategories[0]?.name || '',
      refKind: kind,
      refId,
    }
  }

  const hasFilters = !!(search || filterCat || filterRef)

  return (
    <StandardPage
      icon={FileText}
      color="emerald"
      title={filterCat ? `Documenti — ${filterCat}` : 'Documenti'}
      subtitle="PDF, Word, Excel, immagini e DXF consultabili dall'officina"
      width="xl"
      breadcrumb={
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link to="/officina" className="hover:text-emerald-700 flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> Officina
          </Link>
        </div>
      }
      actions={canWrite ? (
        <PrimaryCtaButton color="emerald" size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="w-4 h-4" /> Carica file
        </PrimaryCtaButton>
      ) : undefined}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
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
        <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer ml-2">
          <input type="checkbox" checked={groupByCustomer} onChange={e => setGroupByCustomer(e.target.checked)} />
          Raggruppa per riferimento
        </label>
      </div>

      <DocumentsTable
        docs={docs}
        loading={loading}
        groupByCustomer={groupByCustomer}
        canWrite={canWrite}
        hasFilters={hasFilters}
        onOpen={openDoc}
        onDelete={setPendingDelete}
      />

      {uploadOpen && (() => {
        const d = uploadDefaults()
        return (
          <UploadModal
            categories={sortedCategories}
            customers={sortedCustomers}
            matSuppliers={sortedMatSuppliers}
            toolSuppliers={sortedToolSuppliers}
            normSuppliers={sortedNormSuppliers}
            defaultCategory={d.category}
            defaultRefKind={d.refKind}
            defaultRefId={d.refId}
            onClose={() => setUploadOpen(false)}
            onUploaded={load}
          />
        )
      })()}

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
    </StandardPage>
  )
}
