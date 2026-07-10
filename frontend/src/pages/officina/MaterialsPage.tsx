import { useEffect, useState, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Box, Upload, Trash2, Search, ExternalLink, ChevronLeft, X } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { familyLabel } from '@/lib/materialFamilies'
import type { Material } from '@/types'

// Famiglia → classi token dark-aware (--fam-*).
const FAM_CLS: Record<string, string> = {
  acciaio:        'bg-fam-acciaio/[0.14] text-fam-acciaio',
  acciaio_inox:   'bg-fam-inox/[0.14] text-fam-inox',
  acciaio_legato: 'bg-fam-legato/[0.14] text-fam-legato',
  alluminio:      'bg-fam-alluminio/[0.14] text-fam-alluminio',
  ottone:         'bg-fam-ottone/[0.14] text-fam-ottone',
  rame:           'bg-fam-rame/[0.14] text-fam-rame',
  bronzo:         'bg-fam-bronzo/[0.14] text-fam-bronzo',
  plastica:       'bg-fam-plastica/[0.14] text-fam-plastica',
  altro:          'bg-fam-altro/[0.14] text-fam-altro',
}
const famClass = (f: string | null | undefined) => (f && FAM_CLS[f]) || FAM_CLS.altro

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
    api.get('/materials').then(r => setMaterials(r.data)).catch(() => toast.error('Errore caricamento materiali')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const families = useMemo(() =>
    Array.from(new Set(materials.map(m => m.family).filter(Boolean))).sort() as string[], [materials])

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

  const handleUpload = async () => {
    if (!uploadFor || !selectedFile) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', selectedFile)
    try {
      await api.post(`/materials/${uploadFor.id}/datasheet`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Scheda PDF allegata')
      setUploadFor(null); setSelectedFile(null); load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore upload')
    } finally { setUploading(false) }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    try { await api.delete(`/materials/${id}/datasheet`); toast.success('Scheda rimossa'); load() }
    catch { toast.error('Errore eliminazione') }
  }

  return (
    <StandardPage
      icon={Box}
      color="officina"
      width="xl"
      title="Materiali"
      subtitle={`${visible.length} material${visible.length === 1 ? 'e' : 'i'} a catalogo · sola consultazione per l'officina`}
      breadcrumb={
        <div className="mb-1 flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground">
          <Link to="/officina" className="flex items-center gap-1 hover:text-officina"><ChevronLeft className="h-3.5 w-3.5" /> Officina</Link>
        </div>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cerca per nome…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9 text-sm" />
          </div>
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filterFamily} onChange={e => setFilterFamily(e.target.value)}>
            <option value="">Tutte le famiglie</option>
            {families.map(f => <option key={f} value={f}>{familyLabel(f)}</option>)}
          </select>
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: '22%' }} /><col style={{ width: 230 }} /></colgroup>
            <thead>
              <tr className="border-b border-border bg-card-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="p-2.5 text-left font-medium">Materiale</th>
                <th className="p-2.5 text-left font-medium">Famiglia</th>
                <th className="p-2.5 text-left font-medium">Fornitore abituale</th>
                <th className="p-2.5 text-right font-medium">Scheda tecnica</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Caricamento…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{search || filterFamily ? 'Nessun materiale corrisponde ai filtri.' : 'Nessun materiale in catalogo.'}</td></tr>
              ) : visible.map(m => (
                <tr key={m.id} className="border-b border-border transition-colors hover:bg-muted/[0.45]">
                  <td className="p-2.5">
                    <div className="font-mono font-semibold text-foreground">{m.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {m.density_kg_dm3?.toFixed(2) ?? '—'} kg/dm³ · {m.cost_per_kg?.toFixed(2) ?? '—'} €/kg
                      {m.default_scrap_percent != null && <> · scrap {m.default_scrap_percent}%</>}
                    </div>
                  </td>
                  <td className="p-2.5">
                    {m.family && (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${famClass(m.family)}`}>{familyLabel(m.family)}</span>
                    )}
                  </td>
                  <td className="truncate p-2.5 text-muted-foreground">{m.material_supplier?.name ?? '—'}</td>
                  <td className="p-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {m.has_datasheet ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openDatasheet(m)}>
                            <ExternalLink className="mr-1 h-4 w-4" /> Visualizza
                          </Button>
                          {canWrite && (
                            <>
                              <button onClick={() => { setUploadFor(m); setSelectedFile(null) }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Sostituisci scheda"><Upload className="h-4 w-4" /></button>
                              <button onClick={() => setPendingDelete(m)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Rimuovi scheda"><Trash2 className="h-4 w-4" /></button>
                            </>
                          )}
                        </>
                      ) : canWrite ? (
                        <Button size="sm" variant="outline" className="border-officina/[0.45] text-officina" onClick={() => { setUploadFor(m); setSelectedFile(null) }}>
                          <Upload className="mr-1 h-4 w-4" /> Carica
                        </Button>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">nessuna scheda</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {uploadFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[500px] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h3 className="font-semibold text-foreground">{uploadFor.has_datasheet ? 'Sostituisci scheda' : 'Allega scheda'} — <span className="font-mono">{uploadFor.name}</span></h3>
              <button onClick={() => { setUploadFor(null); setSelectedFile(null) }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">File PDF *</label>
                <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="block w-full cursor-pointer text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-officina/[0.12] file:px-3 file:py-1.5 file:font-medium file:text-officina" />
                {selectedFile && <p className="mt-1 text-[11px] text-muted-foreground">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground">Max 50 MB, solo PDF.</p>
                {uploadFor.has_datasheet && <p className="mt-1 text-[11px] text-warning">La scheda esistente verrà sostituita.</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-card-muted px-5 py-3">
              <Button variant="outline" onClick={() => { setUploadFor(null); setSelectedFile(null) }} disabled={uploading}>Annulla</Button>
              <PrimaryCtaButton color="officina" onClick={handleUpload} disabled={uploading || !selectedFile}>
                <Upload className="h-4 w-4" /> {uploading ? 'Caricamento…' : 'Carica'}
              </PrimaryCtaButton>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Rimuovere la scheda tecnica?"
        description="Il PDF allegato verrà eliminato."
        confirmLabel="Rimuovi"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </StandardPage>
  )
}
