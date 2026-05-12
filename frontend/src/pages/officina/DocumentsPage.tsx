import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Upload, Trash2, Search, ExternalLink, X, ChevronLeft } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { timeAgo } from '@/lib/timeAgo'
import type { OfficinaDocument } from '@/types'

interface UploadForm {
  title: string
  category: string
  file: File | null
}

const emptyUpload = (): UploadForm => ({ title: '', category: '', file: null })

const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

export default function OfficinaDocumentsPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('officina.write')

  const [docs, setDocs] = useState<OfficinaDocument[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [filterCat, setFilterCat] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const [uploadForm, setUploadForm] = useState<UploadForm | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingDelete, setPendingDelete] = useState<OfficinaDocument | null>(null)

  useEscapeKey(() => setUploadForm(null), !!uploadForm)

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterCat) params.set('category', filterCat)
    if (search.trim()) params.set('q', search.trim())
    api.get(`/officina/documents?${params}`)
      .then(r => setDocs(r.data))
      .catch(() => toast.error('Errore caricamento documenti'))
      .finally(() => setLoading(false))
  }

  const loadCategories = () => {
    api.get('/officina/categories').then(r => setCategories(r.data)).catch(() => undefined)
  }

  useEffect(() => { load() }, [filterCat])
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  useEffect(() => { loadCategories() }, [])

  const openUpload = () => setUploadForm(emptyUpload())

  const handleUpload = async () => {
    if (!uploadForm || !uploadForm.file || !uploadForm.title.trim()) {
      toast.error('Titolo e file PDF sono obbligatori')
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('title', uploadForm.title.trim())
    if (uploadForm.category.trim()) fd.append('category', uploadForm.category.trim())
    fd.append('file', uploadForm.file)
    try {
      await api.post('/officina/documents', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Documento caricato')
      setUploadForm(null)
      load(); loadCategories()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore upload')
    } finally {
      setUploading(false)
    }
  }

  const openDoc = (doc: OfficinaDocument) => {
    // Apre PDF in nuova tab. Includo il token come query param via blob URL?
    // No: api.get scarica il blob col token, poi creo URL locale.
    api.get(`/officina/documents/${doc.id}/download`, { responseType: 'blob' })
      .then(res => {
        const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
        window.open(url, '_blank')
        // Cleanup URL dopo ~30s: il browser ha già aperto il PDF
        setTimeout(() => window.URL.revokeObjectURL(url), 30_000)
      })
      .catch(() => toast.error('Errore apertura PDF'))
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    try {
      await api.delete(`/officina/documents/${id}`)
      toast.success('Documento eliminato')
      load(); loadCategories()
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
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Cataloghi PDF, schede tecniche, manuali consultabili durante la lavorazione.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={openUpload}>
            <Upload className="w-4 h-4 mr-1" /> Carica PDF
          </Button>
        )}
      </div>

      {/* Filtri */}
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
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2 w-[36%] font-medium text-gray-600">Titolo</th>
                <th className="text-left p-2 w-[18%] font-medium text-gray-600">Categoria</th>
                <th className="text-right p-2 w-[10%] font-medium text-gray-600">Dimensione</th>
                <th className="text-left p-2 w-[18%] font-medium text-gray-600">Caricato</th>
                <th className="text-center p-2 w-[18%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-400">Caricamento...</td></tr>
              ) : docs.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">
                  {search || filterCat ? 'Nessun documento corrisponde ai filtri.' : 'Nessun documento ancora caricato.'}
                </td></tr>
              ) : docs.map(d => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
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
                  <td className="p-2 text-right font-mono text-xs text-gray-600">{fmtBytes(d.size_bytes)}</td>
                  <td className="p-2 text-xs text-gray-500">
                    <div>{timeAgo(d.uploaded_at)}</div>
                    {d.uploaded_by && (
                      <div className="text-[10px] text-gray-400 truncate">{d.uploaded_by.full_name || d.uploaded_by.username}</div>
                    )}
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex gap-1.5 justify-center">
                      <button onClick={() => openDoc(d)} className="p-1 hover:bg-blue-50 rounded" title="Apri PDF">
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
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Modal upload */}
      {uploadForm && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">Carica documento PDF</h3>
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
                <Input value={uploadForm.category}
                  onChange={e => setUploadForm(f => f ? { ...f, category: e.target.value } : f)}
                  placeholder="es. Schede materiali, Manuali, DPI..."
                  list="officina-categories" />
                <datalist id="officina-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Categoria libera — puoi scriverne una nuova o sceglierne una già usata.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">File PDF *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
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
                <p className="text-[11px] text-gray-400 mt-0.5">Max 50 MB, solo PDF.</p>
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
        description="Il PDF verrà rimosso dal disco e non sarà più recuperabile."
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
