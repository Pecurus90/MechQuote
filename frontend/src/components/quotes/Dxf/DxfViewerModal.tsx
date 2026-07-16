import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { DxfAnalysis } from '@/types'
import DxfProfileCanvas from '@/components/quotes/Dxf/DxfProfileCanvas'

interface Props {
  /** PartFile.id del DXF allegato: ri-analizzato lato server. */
  partFileId: number
  filename?: string
  /** Profili da evidenziare (es. quelli scelti sulla fase EDM). [] = nessuno. */
  selectedIds?: number[]
  rawX?: number
  rawY?: number
  onClose: () => void
}

/** Anteprima DXF in sola lettura: mostra il disegno con gli eventuali profili
 *  selezionati evidenziati, senza modificare nulla (gemello "read-only" del
 *  Dxf2dReselectModal). */
export default function DxfViewerModal({ partFileId, filename, selectedIds = [], rawX, rawY, onClose }: Props) {
  const [analysis, setAnalysis] = useState<DxfAnalysis | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<DxfAnalysis>(`/dxf/analyze-part-file/${partFileId}`)
      .then(r => setAnalysis(r.data))
      .catch(() => toast.error('Errore nel caricamento del DXF'))
      .finally(() => setLoading(false))
  }, [partFileId])

  const sel = new Set(selectedIds)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <FileText className="h-4 w-4" /> {filename || 'Disegno DXF'}
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="animate-pulse text-sm text-primary">Caricamento DXF…</p>}
          {analysis && (
            <>
              <DxfProfileCanvas analysis={analysis} selectedIds={sel} onToggle={() => {}} readOnly height={480} rawX={rawX} rawY={rawY} />
              {selectedIds.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {selectedIds.length} profili selezionati (evidenziati) su questo disegno.
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end border-t border-border bg-muted px-5 py-3">
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </div>
      </div>
    </div>
  )
}
