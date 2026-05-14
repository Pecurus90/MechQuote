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
  /** Dimensioni del grezzo (in mm). Se presenti, viene disegnato un rettangolo
   *  tratteggiato centrato sul bbox profili per visualizzare l'area materiale
   *  disponibile rispetto al disegno. Se più piccolo del bbox profili appare
   *  ancora ma in rosso, come segnale di errore. */
  rawX?: number
  rawY?: number
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

export default function DxfViewer({ analysis, selectedIds, onToggle, height = 480, readOnly = false, rawX, rawY }: Props) {
  const { bbox_global, profiles } = analysis

  // Bbox unione dei profili selezionati: il rettangolo grezzo si centra qui.
  // Se nulla è selezionato, fallback a bbox_global.
  const selectedBbox = useMemo(() => {
    const sel = profiles.filter(p => selectedIds.has(p.id))
    if (sel.length === 0) return null
    const x0 = Math.min(...sel.map(p => p.bbox.x))
    const y0 = Math.min(...sel.map(p => p.bbox.y))
    const x1 = Math.max(...sel.map(p => p.bbox.x + p.bbox.w))
    const y1 = Math.max(...sel.map(p => p.bbox.y + p.bbox.h))
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }, [profiles, selectedIds])

  // Rettangolo grezzo: centrato sul bbox dei profili selezionati (o globale se
  // nulla è selezionato). Disegnato sotto i profili. Rosso se più piccolo del
  // bbox selezionato (= grezzo non sufficiente a contenere il profilo).
  const rawRect = useMemo(() => {
    if (!rawX || !rawY || rawX <= 0 || rawY <= 0) return null
    const base = selectedBbox ?? bbox_global
    const cx = base.x + base.w / 2
    const cy = base.y + base.h / 2
    const undersize = rawX < base.w || rawY < base.h
    return {
      x: cx - rawX / 2,
      y: cy - rawY / 2,
      w: rawX,
      h: rawY,
      undersize,
    }
  }, [selectedBbox, bbox_global, rawX, rawY])

  // ViewBox con padding 5% per leggibilità. Unione bbox_global ∪ rawRect, così
  // il rect grezzo resta visibile anche quando è centrato su una selezione
  // off-center rispetto al bbox globale.
  const view = useMemo(() => {
    const xs = [bbox_global.x, bbox_global.x + bbox_global.w]
    const ys = [bbox_global.y, bbox_global.y + bbox_global.h]
    if (rawRect) {
      xs.push(rawRect.x, rawRect.x + rawRect.w)
      ys.push(rawRect.y, rawRect.y + rawRect.h)
    }
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const rangeW = x1 - x0
    const rangeH = y1 - y0
    const padX = Math.max(rangeW * 0.05, 1)
    const padY = Math.max(rangeH * 0.05, 1)
    const x = x0 - padX
    const y = y0 - padY
    const w = rangeW + 2 * padX
    const h = rangeH + 2 * padY
    return { x, y, w, h, flipY: 2 * y + h }
  }, [bbox_global, rawRect])

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
          {rawRect && (
            <rect
              x={rawRect.x}
              y={rawRect.y}
              width={rawRect.w}
              height={rawRect.h}
              fill={rawRect.undersize ? 'rgba(220, 38, 38, 0.18)' : 'rgba(34, 197, 94, 0.18)'}
              stroke={rawRect.undersize ? '#dc2626' : '#16a34a'}
              strokeWidth={1.4}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'none' }}
            />
          )}
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
