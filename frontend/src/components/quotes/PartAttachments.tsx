import { useRef, useState } from 'react'
import { Paperclip, FileText, Image as ImageIcon, Box, Scan, Eye, Download, Trash2, Upload } from 'lucide-react'
import api, { getApiErrorDetail } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { PartFile } from '@/types'
import DxfViewerModal from '@/components/quotes/Dxf/DxfViewerModal'
import ConfirmDialog from '@/components/ui/confirm-dialog'

interface Props {
  partId: number
  files: PartFile[]
  /** Preventivo bloccato: si può vedere/scaricare, non caricare/eliminare. */
  readOnly?: boolean
  onReload?: () => void | Promise<void>
}

const ICON: Record<string, typeof FileText> = {
  dxf: Scan, step: Box, pdf: FileText, image: ImageIcon,
}
const TYPE_LABEL: Record<string, string> = {
  dxf: 'DXF', step: 'STEP 3D', pdf: 'PDF', image: 'Immagine',
}
const ACCEPT = '.dxf,.step,.stp,.pdf,.png,.jpg,.jpeg,.gif,.bmp'

/** Sezione "Disegni & allegati" della parte: carica/lista/vedi/scarica/elimina.
 *  I file sono serviti dall'endpoint autenticato GET /files/{id} (via blob). */
export function PartAttachments({ partId, files, readOnly, onReload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dxfView, setDxfView] = useState<PartFile | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PartFile | null>(null)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post(`/parts/${partId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Allegato caricato')
      await onReload?.()
    } catch (e) {
      toast.error(getApiErrorDetail(e, 'Errore nel caricamento'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // PDF/immagini → apri inline; STEP/DXF → scarica. Serve via blob autenticato.
  const openBlob = async (f: PartFile, download: boolean) => {
    try {
      const res = await api.get(`/files/${f.id}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(res.data as Blob)
      if (download) {
        const a = document.createElement('a')
        a.href = url; a.download = f.filename; a.click()
      } else {
        window.open(url, '_blank')
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
    } catch {
      toast.error('Impossibile aprire il file')
    }
  }

  const view = (f: PartFile) => {
    if (f.file_type === 'dxf') { setDxfView(f); return }        // viewer interno
    if (f.file_type === 'step') { openBlob(f, true); return }   // 3D: nessun viewer → scarica
    openBlob(f, false)                                          // pdf/immagine: inline
  }

  const confirmDelete = async () => {
    const f = pendingDelete
    setPendingDelete(null)
    if (!f) return
    try {
      await api.delete(`/files/${f.id}`)
      toast.success('Allegato eliminato')
      await onReload?.()
    } catch (e) {
      toast.error(getApiErrorDetail(e, "Errore nell'eliminazione"))
    }
  }

  return (
    <div className="mt-5 rounded-[14px] border border-border bg-card px-[18px] py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.02em] text-muted-foreground">
          <Paperclip className="h-4 w-4" /> Disegni & allegati
        </div>
        {!readOnly && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border bg-background px-3 text-[12.5px] font-semibold text-foreground transition-[filter] hover:brightness-105 disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" /> {uploading ? 'Caricamento…' : 'Carica'}
            </button>
          </>
        )}
      </div>

      {files.length === 0 ? (
        <p className="py-3 text-center text-[12.5px] text-muted-foreground">
          Nessun allegato. {!readOnly && 'Carica un disegno DXF, un PDF o un’immagine.'}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {files.map((f) => {
            const Icon = ICON[f.file_type] ?? FileText
            return (
              <div key={f.id} className="flex items-center gap-3 rounded-[9px] border border-border bg-background px-3 py-2">
                <Icon className="h-4 w-4 flex-none text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{f.filename}</span>
                <span className="flex-none rounded-full bg-muted px-2 py-[1px] text-[10.5px] font-semibold text-muted-foreground">
                  {TYPE_LABEL[f.file_type] ?? f.file_type}
                </span>
                <button type="button" onClick={() => view(f)} title="Vedi"
                  className="flex-none rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
                  <Eye className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => openBlob(f, true)} title="Scarica"
                  className="flex-none rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
                  <Download className="h-4 w-4" />
                </button>
                {!readOnly && (
                  <button type="button" onClick={() => setPendingDelete(f)} title="Elimina"
                    className={cn('flex-none rounded p-1 text-muted-foreground transition-colors hover:text-danger')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {dxfView && (
        <DxfViewerModal partFileId={dxfView.id} filename={dxfView.filename} onClose={() => setDxfView(null)} />
      )}
      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare l'allegato?"
        description={pendingDelete ? `"${pendingDelete.filename}" verrà rimosso dalla parte.` : undefined}
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
