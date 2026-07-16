import { useMemo, useRef, useState } from 'react'
import { Maximize } from 'lucide-react'
import type { DxfAnalysis, DxfBbox } from '@/types'
import DxfCanvas, { type DxfCanvasHandle, type ViewBox } from '@/components/quotes/Dxf/DxfCanvas'

interface Props {
  analysis: DxfAnalysis
  selectedIds: Set<number>
  onToggle: (id: number) => void
  height?: number
  readOnly?: boolean
  /** Rettangolo grezzo (mm reali) centrato sui profili selezionati (o globale). */
  rawX?: number
  rawY?: number
  /** Fattore per scalare il disegno ai mm reali (override unità mm/pollici).
   *  1 = coordinate come dal backend. Il rettangolo grezzo è in mm reali, quindi
   *  scalando il disegno per lo stesso fattore restano coerenti. */
  unitScale?: number
}

/**
 * Viewer profili DXF interattivo (zoom/pan + hover + click-to-select), sul
 * viewport condiviso DxfCanvas. Sostituisce il vecchio DxfViewer statico nel
 * picker del preventivatore 2D. Ogni profilo si evidenzia al passaggio del
 * mouse; il clic (fermo) lo include/esclude dal taglio.
 */
export default function DxfProfileCanvas({ analysis, selectedIds, onToggle, height = 420, readOnly = false, rawX, rawY, unitScale = 1 }: Props) {
  const { profiles, bbox_global } = analysis
  const k = unitScale
  const scaledBbox = { x: bbox_global.x * k, y: bbox_global.y * k, w: bbox_global.w * k, h: bbox_global.h * k }
  const canvasRef = useRef<DxfCanvasHandle | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const hoveredRef = useRef<number | null>(null); hoveredRef.current = hovered

  const selectedBbox = useMemo<DxfBbox | null>(() => {
    const sel = profiles.filter(p => selectedIds.has(p.id))
    if (!sel.length) return null
    const x0 = Math.min(...sel.map(p => p.bbox.x)), y0 = Math.min(...sel.map(p => p.bbox.y))
    const x1 = Math.max(...sel.map(p => p.bbox.x + p.bbox.w)), y1 = Math.max(...sel.map(p => p.bbox.y + p.bbox.h))
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }, [profiles, selectedIds])

  const rawRect = useMemo(() => {
    if (!rawX || !rawY || rawX <= 0 || rawY <= 0) return null
    const b = selectedBbox ?? bbox_global
    const base = { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k }   // in mm reali
    const cx = base.x + base.w / 2, cy = base.y + base.h / 2
    return { x: cx - rawX / 2, y: cy - rawY / 2, w: rawX, h: rawY, undersize: rawX < base.w || rawY < base.h }
  }, [selectedBbox, bbox_global, rawX, rawY, k])

  const profileEls = profiles.map(p => {
    const sel = readOnly ? true : selectedIds.has(p.id)
    const isHover = p.id === hovered
    const base = p.closed ? (sel ? '#2563eb' : '#94a3b8') : (sel ? '#ea580c' : '#fbbf24')
    const sw = sel ? 2 : 1.2
    return (
      <g key={p.id}>
        <path d={p.svg_path} fill="none" stroke="transparent" strokeWidth={8} vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'stroke', cursor: readOnly ? 'default' : 'pointer' }}
          onPointerEnter={() => !readOnly && setHovered(p.id)} onPointerLeave={() => setHovered(c => (c === p.id ? null : c))} />
        <path d={p.svg_path} fill="none" stroke={isHover ? '#2563eb' : base} strokeWidth={isHover ? sw + 0.8 : sw}
          strokeDasharray={p.closed ? undefined : '4 3'} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
      </g>
    )
  })

  const overlay = (_view: ViewBox) => (
    rawRect ? (
      <rect x={rawRect.x} y={-(rawRect.y + rawRect.h)} width={rawRect.w} height={rawRect.h}
        fill={rawRect.undersize ? 'rgba(220,38,38,0.16)' : 'rgba(34,197,94,0.16)'}
        stroke={rawRect.undersize ? '#dc2626' : '#16a34a'} strokeWidth={1.4} strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
    ) : null
  )

  if (profiles.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed bg-muted/30 text-sm text-muted-foreground" style={{ height }}>
        Nessun profilo trovato nel DXF.
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-lg border bg-white" style={{ height }}>
      <DxfCanvas ref={canvasRef} bbox={scaledBbox} content={<g transform={`scale(${k})`}>{profileEls}</g>} overlay={overlay}
        cursor={readOnly ? 'grab' : 'pointer'}
        onPick={() => { if (!readOnly && hoveredRef.current != null) onToggle(hoveredRef.current) }} />
      <button type="button" onClick={() => canvasRef.current?.fit()} title="Adatta alla vista"
        className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border bg-card/90 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-muted">
        <Maximize className="h-3 w-3" /> Adatta
      </button>
    </div>
  )
}
