// Render top-view (pianta) del castello stampo: 3 rettangoli concentrici
// (castello → striscia → pezzo). Se viene fornita una `DxfAnalysis`, il
// profilo del pezzo è disegnato dentro il rettangolo pezzo (centrato sul
// suo bbox). Coordinate scalate da `computeDieGeometry` (gemello DRY).
import { useMemo } from 'react'
import type { DxfAnalysis } from '@/types'
import { computeDieGeometry } from '@/lib/dieCalc'

interface Props {
  subtype: 'passo' | 'blocco'
  bboxX: number
  bboxY: number
  nStations?: number
  stripOffsetY?: number
  blockOffset?: number
  castleOffsetX?: number
  castleOffsetY?: number
  dxfAnalysis?: DxfAnalysis | null
  height?: number
}

const COLOR = {
  pieceFill:   'rgba(37, 99, 235, 0.10)',    // blue-600/10
  pieceStroke: '#2563eb',
  stripFill:   'rgba(236, 72, 153, 0.06)',   // pink-500/6
  stripStroke: '#ec4899',
  castleFill:  'rgba(100, 116, 139, 0.04)',  // slate-500/4
  castleStroke: '#475569',                   // slate-600
  profileStroke: '#1d4ed8',                  // blue-700 — più nitido sopra il fill
}

export default function DieTopView({
  subtype, bboxX, bboxY, nStations, stripOffsetY, blockOffset,
  castleOffsetX, castleOffsetY, dxfAnalysis, height = 360,
}: Props) {
  const geom = useMemo(() => computeDieGeometry({
    subtype, bboxX, bboxY, nStations, stripOffsetY, blockOffset,
    castleOffsetX, castleOffsetY,
  }), [subtype, bboxX, bboxY, nStations, stripOffsetY, blockOffset, castleOffsetX, castleOffsetY])

  // ViewBox: castello centrato in (0,0) con padding 10%. Striscia e pezzo
  // sono centrati nello stesso punto del castello (semplificazione: in
  // realtà nei progressivi la striscia non è centrata orizzontalmente, ma
  // per il render schematico è chiaro e leggibile).
  const cx = 0, cy = 0
  const padding = Math.max(geom.castleX, geom.castleY) * 0.1 + 10
  const view = {
    x: -geom.castleX / 2 - padding,
    y: -geom.castleY / 2 - padding,
    w: geom.castleX + 2 * padding,
    h: geom.castleY + 2 * padding,
  }
  const flipY = 2 * view.y + view.h

  // Bbox profili DXF: serve per centrare il profilo dentro il pezzo.
  const dxfTransform = useMemo(() => {
    if (!dxfAnalysis || dxfAnalysis.profiles.length === 0) return null
    const b = dxfAnalysis.bbox_global
    const bcx = b.x + b.w / 2
    const bcy = b.y + b.h / 2
    // Trasforma il profilo dal suo sistema (DXF) al sistema del pezzo:
    // centra il bbox del profilo sull'origine (centro del pezzo, anch'esso (0,0)).
    return `translate(${cx - bcx}, ${cy - bcy})`
  }, [dxfAnalysis, cx, cy])

  if (geom.castleX <= 0 || geom.castleY <= 0) {
    return (
      <div className="rounded-lg border border-dashed bg-gray-50 flex items-center justify-center text-xs text-gray-400" style={{ height }}>
        Inserisci le dimensioni del pezzo per vedere l'anteprima
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ height }}>
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        <g transform={`translate(0, ${flipY}) scale(1, -1)`}>
          {/* Castello */}
          <rect
            x={cx - geom.castleX / 2}
            y={cy - geom.castleY / 2}
            width={geom.castleX}
            height={geom.castleY}
            fill={COLOR.castleFill}
            stroke={COLOR.castleStroke}
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
          />
          {/* Striscia */}
          <rect
            x={cx - geom.stripX / 2}
            y={cy - geom.stripY / 2}
            width={geom.stripX}
            height={geom.stripY}
            fill={COLOR.stripFill}
            stroke={COLOR.stripStroke}
            strokeWidth={1.4}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
          {/* Pezzi: per progressivo, ripete il pezzo n_stations volte sulla striscia */}
          {subtype === 'passo' && (nStations || 1) > 1 ? (
            Array.from({ length: nStations || 1 }, (_, i) => {
              const total = (nStations || 1)
              const pX = cx - geom.stripX / 2 + i * bboxX
              return (
                <rect
                  key={i}
                  x={pX}
                  y={cy - bboxY / 2}
                  width={bboxX}
                  height={bboxY}
                  fill={i === 0 ? COLOR.pieceFill : 'rgba(37, 99, 235, 0.05)'}
                  stroke={COLOR.pieceStroke}
                  strokeWidth={i === 0 ? 1.4 : 1}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })
          ) : (
            <rect
              x={cx - bboxX / 2}
              y={cy - bboxY / 2}
              width={bboxX}
              height={bboxY}
              fill={COLOR.pieceFill}
              stroke={COLOR.pieceStroke}
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* Profilo DXF: disegnato sopra il primo pezzo (centro) */}
          {dxfAnalysis && dxfTransform && (
            <g transform={dxfTransform}>
              {dxfAnalysis.profiles.map(p => (
                <path
                  key={p.id}
                  d={p.svg_path}
                  fill="none"
                  stroke={COLOR.profileStroke}
                  strokeWidth={1.4}
                  strokeDasharray={p.closed ? undefined : '4 3'}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          )}
        </g>
        {/* Labels: dimensioni castello in alto e a destra (fuori dal flip Y) */}
        <text x={view.x + view.w / 2} y={view.y + 14}
          textAnchor="middle" fontSize={11} fill="#475569" fontFamily="ui-monospace, monospace">
          Castello {Math.round(geom.castleX)} × {Math.round(geom.castleY)} mm — {geom.castleAreaDm2.toFixed(2)} dm²
        </text>
      </svg>
    </div>
  )
}
