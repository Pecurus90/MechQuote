import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileText, X, AlertTriangle } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { DxfAnalysis, DxfBbox, DxfProfile } from '@/types'
import DxfViewer from '@/components/quotes/Dxf/DxfViewer'
import Dxf2dProfileList from '@/components/quotes/Dxf/Dxf2dProfileList'
import Dxf2dSelectionSummary from '@/components/quotes/Dxf/Dxf2dSelectionSummary'

export interface DxfPickerState {
  file: File
  analysis: DxfAnalysis
  selectedIds: number[]
  selectedProfiles: DxfProfile[]
  selectedLengthMm: number
  selectedClosedCount: number
  /** Bbox unione dei profili selezionati. Null se selezione vuota. Usato dal
   *  parent per dimensionare il grezzo precompilato (raw_x/raw_y) — adesivo
   *  alla scelta dell'utente invece che al bbox globale del DXF. */
  selectedBbox: DxfBbox | null
}

interface Props {
  /** Riceve null finché non c'è una selezione valida; uno stato pieno appena
   *  l'utente carica un DXF e (auto-)seleziona dei profili. */
  onChange: (state: DxfPickerState | null) => void
  viewerHeight?: number
  /** Overlay grezzo sul viewer: rettangolo tratteggiato centrato sui profili. */
  rawX?: number
  rawY?: number
}

/** Carica un file DXF, mostra il viewer SVG con click-to-toggle sui profili,
 *  e riporta al parent lo stato corrente via `onChange`.
 *
 *  Estratto da NewQuote2DPage per essere riusato sia nel wizard 2D sia nel
 *  modale "Carica DXF" della fase Wire EDM nel preventivatore manuale.
 */
export default function DxfProfilePicker({ onChange, viewerHeight = 420, rawX, rawY }: Props) {
  const [dxfFile, setDxfFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<DxfAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const selectedProfiles = useMemo(
    () => analysis?.profiles.filter(p => selectedIds.has(p.id)) ?? [],
    [analysis, selectedIds],
  )
  const selectedLengthMm = useMemo(
    () => selectedProfiles.reduce((s, p) => s + p.length_mm, 0),
    [selectedProfiles],
  )
  const selectedClosedCount = useMemo(
    () => selectedProfiles.filter(p => p.closed).length,
    [selectedProfiles],
  )
  const selectedBbox = useMemo<DxfBbox | null>(() => {
    if (selectedProfiles.length === 0) return null
    const x0 = Math.min(...selectedProfiles.map(p => p.bbox.x))
    const y0 = Math.min(...selectedProfiles.map(p => p.bbox.y))
    const x1 = Math.max(...selectedProfiles.map(p => p.bbox.x + p.bbox.w))
    const y1 = Math.max(...selectedProfiles.map(p => p.bbox.y + p.bbox.h))
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }, [selectedProfiles])

  // Notifica al parent ogni volta che lo stato semantico cambia.
  useEffect(() => {
    if (!dxfFile || !analysis) {
      onChange(null)
      return
    }
    onChange({
      file: dxfFile,
      analysis,
      selectedIds: Array.from(selectedIds),
      selectedProfiles,
      selectedLengthMm,
      selectedClosedCount,
      selectedBbox,
    })
    // onChange volutamente fuori dalle deps: il parent passa una callback inline
    // (riferimento nuovo a ogni render) e finiremmo in un loop. I valori
    // semantici sono già coperti dalle altre deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dxfFile, analysis, selectedIds, selectedProfiles, selectedLengthMm, selectedClosedCount, selectedBbox])

  const toggleProfile = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const selectAllProfiles = (selected: boolean) => {
    if (!analysis) return
    setSelectedIds(selected ? new Set(analysis.profiles.map(p => p.id)) : new Set())
  }

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      toast.error('Solo file .dxf supportati (DWG va convertito esternamente)')
      return
    }
    setDxfFile(file)
    setAnalyzing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post<DxfAnalysis>('/dxf/analyze', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAnalysis(res.data)
      // Pre-seleziona i profili chiusi (sono quelli da tagliare)
      setSelectedIds(new Set(res.data.profiles.filter(p => p.closed).map(p => p.id)))
      if (res.data.units && res.data.units !== 'mm' && res.data.units !== 'unitless') {
        toast.warning(`Unità DXF rilevate: ${res.data.units}. Verifica le dimensioni.`)
      }
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'analisi del DXF')
      setDxfFile(null)
    } finally {
      setAnalyzing(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const clearDxf = () => {
    setDxfFile(null)
    setAnalysis(null)
    setSelectedIds(new Set())
  }

  if (!analysis) {
    return (
      <Card>
        <CardContent className="p-0">
          <label
            htmlFor="dxf-picker-input"
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            className="block border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-primary/10/30 transition-colors"
          >
            <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Trascina qui un file DXF o clicca per selezionarlo</p>
            <p className="text-xs text-muted-foreground mt-1">Solo formato .dxf · max 50 MB</p>
            {analyzing && <p className="text-xs text-blue-600 mt-2 animate-pulse">Analisi in corso...</p>}
            <input
              id="dxf-picker-input" type="file" accept=".dxf" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {dxfFile?.name}
            </CardTitle>
            <button onClick={clearDxf} className="text-xs text-muted-foreground hover:text-red-500 flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Cambia file
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <DxfViewer analysis={analysis} selectedIds={selectedIds} onToggle={toggleProfile} height={viewerHeight} rawX={rawX} rawY={rawY} />
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-blue-600" /> chiuso selezionato
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-slate-400" /> chiuso non selezionato
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-amber-400" style={{ borderTop: '1px dashed #fbbf24' }} /> aperto
            </span>
          </div>
          {analysis.warnings.length > 0 && (
            <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200">
              {analysis.warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-800 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {w}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dxf2dProfileList profiles={analysis.profiles} selectedIds={selectedIds} onToggle={toggleProfile} onSelectAll={selectAllProfiles} />

      <Dxf2dSelectionSummary
        selectedCount={selectedProfiles.length}
        selectedLengthMm={selectedLengthMm}
        selectedClosedCount={selectedClosedCount}
      />
    </div>
  )
}
