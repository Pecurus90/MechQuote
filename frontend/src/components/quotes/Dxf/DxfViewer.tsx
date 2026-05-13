import { useMemo } from 'react'
import type { DxfAnalysis, DxfProfile } from '@/types'

interface Props {
  analysis: DxfAnalysis
  selectedIds: Set<number>
  onToggle: (profileId: number) => void
  height?: number
  /** Disabilita click sui profili (solo visualizzazione, niente picking).
   *  Usato dal viewer Officina dove serve solo l'anteprima. */
  readOnly?: boolean
}

const COLOR = {
  closedSelected: '#2563eb',     // blue-600
  closedUnselected: '#94a3b8',   // slate-400
  openSelected: '#ea580c',       // orange-600
  openUnselected: '#fbbf24',     // amber-400
  hoverHalo: 'rgba(37, 99, 235, 0.2)',
}

function profileColor(p: DxfProfile, selected: boolean): string {
  if (p.closed) return selected ? COLOR.closedSelected : COLOR.closedUnselected
  return selected ? COLOR.openSelected : COLOR.openUnselected
}

export default function DxfViewer({ analysis, selectedIds, onToggle, height = 480, readOnly = false }: Props) {
  const { bbox_global, profiles } = analysis

  // ViewBox con padding 5% per leggibilità.
  const view = useMemo(() => {
    const padX = Math.max(bbox_global.w * 0.05, 1)
    const padY = Math.max(bbox_global.h * 0.05, 1)
    const x = bbox_global.x - padX
    const y = bbox_global.y - padY
    const w = bbox_global.w + 2 * padX
    const h = bbox_global.h + 2 * padY
    return { x, y, w, h, flipY: 2 * y + h }
  }, [bbox_global])

  if (profiles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground" style={{ height }}>
        Nessun profilo trovato nel DXF.
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ height }}>
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        style={{ background: 'rgba(148, 163, 184, 0.04)' }}
      >
        {/* Flip Y: in DXF Y va verso l'alto, in SVG verso il basso */}
        <g transform={`translate(0, ${view.flipY}) scale(1, -1)`}>
          {profiles.map(p => {
            // In readOnly tutti i profili appaiono col colore "selected" (più nitidi).
            const selected = readOnly ? true : selectedIds.has(p.id)
            const color = profileColor(p, selected)
            return (
              <g key={p.id}
                className={readOnly ? '' : 'cursor-pointer'}
                onClick={readOnly ? undefined : () => onToggle(p.id)}>
                {/* path "ghost" pesante per facilitare il click */}
                <path
                  d={p.svg_path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={8}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'stroke' }}
                />
                {/* path visibile */}
                <path
                  d={p.svg_path}
                  fill="none"
                  stroke={color}
                  strokeWidth={selected ? 2 : 1.2}
                  strokeDasharray={p.closed ? undefined : '4 3'}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
