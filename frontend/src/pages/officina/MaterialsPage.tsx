import { useEffect, useState, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Box, FileText, Upload, Trash2, Search, ExternalLink, ChevronLeft, X } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { familyLabel } from '@/lib/materialFamilies'
import type { Material } from '@/types'

const FAMILY_COLORS: Record<string, string> = {
  acciaio:        'bg-slate-100 text-slate-700',
  acciaio_inox:   'bg-blue-100 text-blue-700',
  acciaio_legato: 'bg-indigo-100 text-indigo-700',
  alluminio:      'bg-sky-100 text-sky-700',
  ottone:         'bg-amber-100 text-amber-700',
  rame:           'bg-orange-100 text-orange-700',
  bronzo:         'bg-yellow-100 text-yellow-800',
  plastica:       'bg-green-100 text-green-700',
  altro:          'bg-gray-100 text-gray-600',
}
const familyClass = (f: string | null | undefined) => f && FAMILY_COLORS[f] ? FAMILY_COLORS[f] : FAMILY_COLORS.altro

export default function OfficinaMaterialsPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('officina.write')

  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterFamily, setFilterFamily] = useState('')

  const [uploadFor, setUploadFor] = useState<Material | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Material | null>(null)

  useEscapeKey(() => { setUploadFor(null); setSelectedFile(null) }, !!uploadFor)

  const load = () => {
    setLoading(true)
    api.get('/materials')
      .then(r => setMaterials(r.data))
      .catch(() => toast.error('Errore caricamento materiali'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const families = useMemo(() =>
    Array.from(new Set(materials.map(m => m.family).filter(Boolean))).sort() as string[],
    [materials])

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase()
    return materials.filter(m => {
      if (filterFamily && m.family !== filterFamily) return false
      if (s && !m.name.toLowerCase().includes(s)) return false
      return m.active !== false
    })
  }, [materials, search, filterFamily])

  const openDatasheet = (m: Material) => {
    api.get(`/materials/${m.id}/datasheet`, { responseType: 'blob' })
      .then(res => {
        const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
        window.open(url, '_blank')
        setTimeout(() => window.URL.revokeObjectURL(url), 30_000)
      })
      .catch(() => toast.error('Errore apertura scheda PDF'))
  }

  const startUpload = (m: Material) => {
    setUploadFor(m)
    setSelectedFile(null)
  }

  const handleUpload = async () => {
    if (!uploadFor || !selectedFile) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', selectedFile)
    try {
      await api.post(`/materials/${uploadFor.id}/datasheet`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Scheda PDF allegata')
      setUploadFor(null); setSelectedFile(null); load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore upload')
    } finally {
      setUploading(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    try {
      await api.delete(`/materials/${id}/datasheet`)
      toast.success('Scheda rimossa')
      load()
    } catch { toast.error('Errore eliminazione') }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/officina" className="hover:text-emerald-700 flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> Officina
          </Link>
        </div>
        <SettingsPageHeader
          icon={Box}
          color="emerald"
          title="Materiali"
          subtitle={canWrite
            ? "Catalogo materiali con schede tecniche PDF. Allega o sostituisci una scheda per renderla consultabile dall'officinista."
            : "Catalogo materiali con schede tecniche PDF consultabili."}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input placeholder="Cerca per nome..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={filterFamily}
          onChange={e => setFilterFamily(e.target.value)}
        >
          <option value="">Tutte le famiglie</option>
          {families.map(f => <option key={f} value={f}>{familyLabel(f)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Caricamento...</div>
      ) : visible.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-400">
          {search || filterFamily ? 'Nessun materiale corrisponde ai filtri.' : 'Nessun materiale in catalogo.'}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {visible.map(m => (
            <Card key={m.id} className="hover:bg-gray-50/40 transition-colors">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-base">{m.name}</span>
                    {m.family && (
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${familyClass(m.family)}`}>
                        {familyLabel(m.family)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 font-mono">
                    {m.density_kg_dm3?.toFixed(2) ?? '—'} kg/dm³
                    {' · '}{m.cost_per_kg?.toFixed(2) ?? '—'} €/kg
                    {m.default_scrap_percent != null && <> · scrap {m.default_scrap_percent}%</>}
                  </div>
                  {m.material_supplier && (
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      Fornitore: {m.material_supplier.name}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {m.has_datasheet ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openDatasheet(m)}>
                        <FileText className="w-4 h-4 mr-1" /> Apri scheda
                      </Button>
                      {canWrite && (
                        <button onClick={() => setPendingDelete(m)}
                          className="p-1.5 hover:bg-red-50 rounded text-red-600"
                          title="Rimuovi scheda">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {canWrite && (
                        <button onClick={() => startUpload(m)}
                          className="p-1.5 hover:bg-blue-50 rounded text-blue-600"
                          title="Sostituisci scheda">
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  ) : canWrite ? (
                    <Button size="sm" variant="outline" onClick={() => startUpload(m)}>
                      <Upload className="w-4 h-4 mr-1" /> Allega scheda
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-400 italic">nessuna scheda</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {uploadFor && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">
                {uploadFor.has_datasheet ? 'Sostituisci scheda' : 'Allega scheda'} — {uploadFor.name}
              </h3>
              <button onClick={() => { setUploadFor(null); setSelectedFile(null) }}
                className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <CardContent className="pt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">File PDF *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100 cursor-pointer mt-1"
                />
                {selectedFile && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">Max 50 MB, solo PDF.</p>
                {uploadFor.has_datasheet && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    ⚠ La scheda esistente verrà sostituita.
                  </p>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <PrimaryCtaButton color="emerald" onClick={handleUpload} disabled={uploading || !selectedFile}>
                  <Upload className="w-4 h-4" /> {uploading ? 'Caricamento...' : 'Carica'}
                </PrimaryCtaButton>
                <Button variant="outline" onClick={() => { setUploadFor(null); setSelectedFile(null) }} disabled={uploading}>
                  Annulla
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title={`Rimuovere la scheda di "${pendingDelete?.name ?? ''}"?`}
        description="Il PDF verrà cancellato dal disco e non sarà più recuperabile."
        confirmLabel="Rimuovi"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
