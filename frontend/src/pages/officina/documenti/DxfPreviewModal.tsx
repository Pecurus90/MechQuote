import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X, AlertTriangle, FileText } from 'lucide-react'
import api from '@/lib/api'
import { useEscapeKey } from '@/lib/useEscapeKey'
import DxfProfileCanvas from '@/components/quotes/Dxf/DxfProfileCanvas'
import type { DxfAnalysis } from '@/types'

interface Props {
  documentId: number
  documentTitle: string
  onClose: () => void
}

/** Modal di anteprima DXF integrata.
 *
 * Flusso:
 *  1. GET blob da /api/officina/documents/{id}/download
 *  2. POST blob a /api/dxf/analyze → DxfAnalysis
 *  3. Render con DxfViewer readOnly
 *
 * Nessun caching client-side (il file potrebbe essere stato sostituito).
 */
export default function DxfPreviewModal({ documentId, documentTitle, onClose }: Props) {
  const [analysis, setAnalysis] = useState<DxfAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(onClose)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const blobRes = await api.get(`/officina/documents/${documentId}/download`, {
          responseType: 'blob',
        })
        if (cancelled) return
        const fd = new FormData()
        fd.append('file', new Blob([blobRes.data], { type: 'application/dxf' }), 'preview.dxf')
        const analysisRes = await api.post('/dxf/analyze', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        if (cancelled) return
        setAnalysis(analysisRes.data)
      } catch (e) {
        if (cancelled) return
        const err = e as { response?: { data?: { detail?: string } } }
        setError(err?.response?.data?.detail || 'Errore nel parsing DXF')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [documentId])

  return (
    <div
      className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-card shadow-xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="truncate">{documentTitle}</span>
            <span className="text-xs text-muted-foreground font-mono">DXF</span>
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <CardContent className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="text-center text-muted-foreground py-12">Analisi DXF in corso...</div>
          )}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger/30 rounded-md">
              <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <div className="font-medium text-danger">Anteprima non disponibile</div>
                <div className="text-danger mt-1">{error}</div>
              </div>
            </div>
          )}
          {analysis && !error && (
            <>
              <DxfProfileCanvas
                analysis={analysis}
                selectedIds={new Set()}
                onToggle={() => undefined}
                readOnly
                height={500}
              />
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
                <span>Profili: <strong>{analysis.profiles.length}</strong></span>
                <span>Chiusi: <strong>{analysis.n_closed_profiles}</strong></span>
                <span>Lunghezza totale: <strong>{analysis.total_length_mm?.toFixed(1)} mm</strong></span>
                {analysis.units && <span>Unità: <strong>{analysis.units}</strong></span>}
              </div>
              {analysis.warnings && analysis.warnings.length > 0 && (
                <div className="mt-3 text-xs text-warning bg-warning/10 border border-warning/30 rounded p-2">
                  <div className="font-medium mb-1">⚠ Avvisi:</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {analysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
        <div className="px-5 py-3 border-t shrink-0 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Chiudi</Button>
        </div>
      </Card>
    </div>
  )
}
