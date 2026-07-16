import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { DxfAnalysis } from '@/types'
import { useDxfUnit } from '@/lib/dxfUnits'
import DxfProfileCanvas from '@/components/quotes/Dxf/DxfProfileCanvas'
import DxfUnitToggle from '@/components/quotes/Dxf/DxfUnitToggle'
import Dxf2dProfileList from '@/components/quotes/Dxf/Dxf2dProfileList'
import Dxf2dSelectionSummary from '@/components/quotes/Dxf/Dxf2dSelectionSummary'

export interface ReselectResult {
  selectedIds: number[]
  selectedLengthMm: number
  selectedClosedCount: number
}

interface Props {
  /** PartFile.id del DXF già allegato alla parte: viene ri-analizzato lato
   *  server senza richiedere all'utente di ricaricare il file. */
  partFileId: number
  /** Selezione corrente (i profili già flaggati sulla fase EDM). */
  initialSelectedIds: number[]
  /** Dimensioni grezzo per disegnare il rettangolo overlay nel viewer. */
  rawX?: number
  rawY?: number
  onClose: () => void
  onConfirm: (r: ReselectResult) => Promise<void> | void
}

/** Modale per modificare la selezione dei profili di una fase EDM senza
 *  ri-uploadare il DXF. Mostra viewer + lista con le selezioni precaricate
 *  dall'analisi server-side del PartFile esistente.
 */
export default function Dxf2dReselectModal({ partFileId, initialSelectedIds, rawX, rawY, onClose, onConfirm }: Props) {
  const [analysis, setAnalysis] = useState<DxfAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(initialSelectedIds))
  const [submitting, setSubmitting] = useState(false)
  // Override unità mm/pollici (audit A3): senza, un DXF con header errato faceva
  // salvare la lunghezza taglio ×25.4. Fonte unica in lib/dxfUnits.
  const { unit, setUnit, overridable, unitScale } = useDxfUnit(analysis)

  useEffect(() => {
    api.get<DxfAnalysis>(`/dxf/analyze-part-file/${partFileId}`)
      .then(r => setAnalysis(r.data))
      .catch(() => toast.error('Errore nel caricamento del DXF allegato'))
      .finally(() => setLoading(false))
  }, [partFileId])

  const selectedProfiles = useMemo(
    () => analysis?.profiles.filter(p => selectedIds.has(p.id)) ?? [],
    [analysis, selectedIds],
  )
  const selectedLengthMm = useMemo(
    () => selectedProfiles.reduce((s, p) => s + p.length_mm, 0) * unitScale,
    [selectedProfiles, unitScale],
  )
  const selectedClosedCount = useMemo(
    () => selectedProfiles.filter(p => p.closed).length,
    [selectedProfiles],
  )

  const toggleProfile = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const selectAll = (selected: boolean) => {
    if (!analysis) return
    setSelectedIds(selected ? new Set(analysis.profiles.map(p => p.id)) : new Set())
  }

  const confirm = async () => {
    if (selectedIds.size === 0) {
      toast.error('Seleziona almeno un profilo')
      return
    }
    setSubmitting(true)
    try {
      await onConfirm({
        selectedIds: Array.from(selectedIds),
        selectedLengthMm,
        selectedClosedCount,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/70 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" /> Modifica selezione profili DXF
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Il DXF è già allegato. Modifica la selezione dei profili e conferma per
            aggiornare lunghezza taglio e numero di pierce della fase.
          </p>
          {loading && <p className="text-sm text-blue-600 animate-pulse">Caricamento DXF...</p>}
          {analysis && (
            <>
              {overridable && <DxfUnitToggle unit={unit} onChange={setUnit} />}
              <DxfProfileCanvas
                analysis={analysis}
                selectedIds={selectedIds}
                onToggle={toggleProfile}
                height={360}
                rawX={rawX}
                rawY={rawY}
                unitScale={unitScale}
              />
              <Dxf2dProfileList
                profiles={analysis.profiles}
                selectedIds={selectedIds}
                onToggle={toggleProfile}
                onSelectAll={selectAll}
              />
              <Dxf2dSelectionSummary
                selectedCount={selectedProfiles.length}
                selectedLengthMm={selectedLengthMm}
                selectedClosedCount={selectedClosedCount}
              />
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-muted">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={confirm}
            disabled={!analysis || selectedIds.size === 0 || submitting}
          >
            {submitting ? 'Salvataggio...' : 'Aggiorna selezione'}
          </Button>
        </div>
      </div>
    </div>
  )
}
