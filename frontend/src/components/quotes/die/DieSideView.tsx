// Render side-view (spaccato verticale) del castello stampo: le piastre
// del template selezionato impilate dall'alto (cappello in cima, base in
// fondo), con spessori in scala e etichette ruolo a destra. Mostrato solo
// se è stato scelto un template (altrimenti placeholder).
import type { DieTemplatePlate } from '@/types'

interface Props {
  plates: DieTemplatePlate[]
  castleX: number       // mm — usato per la larghezza dei rettangoli
  height?: number
}

const PLATE_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  cappello:       { fill: '#dbeafe', stroke: '#2563eb', label: 'Cappello' },
  porta_punzoni:  { fill: '#ede9fe', stroke: '#7c3aed', label: 'Porta punzoni' },
  premilamiera:   { fill: '#fed7aa', stroke: '#ea580c', label: 'Premilamiera' },
  matrice:        { fill: '#fecaca', stroke: '#dc2626', label: 'Matrice' },
  base:           { fill: '#e2e8f0', stroke: '#475569', label: 'Base' },
}
const DEFAULT_COLOR = { fill: '#f1f5f9', stroke: '#64748b', label: '' }

export default function DieSideView({ plates, castleX, height = 220 }: Props) {
  if (plates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-gray-50 flex items-center justify-center text-xs text-gray-400" style={{ height }}>
        Seleziona un template per vedere lo spaccato verticale
      </div>
    )
  }

  // Ordino per sort_order così cappello sta in alto, base in fondo.
  const sorted = [...plates].sort((a, b) => a.sort_order - b.sort_order)
  const totalThickness = sorted.reduce((s, p) => s + (p.default_thickness_mm || 0), 0)
  if (totalThickness <= 0 || castleX <= 0) {
    return (
      <div className="rounded-lg border border-dashed bg-gray-50 flex items-center justify-center text-xs text-gray-400" style={{ height }}>
        Dati piastra incompleti
      </div>
    )
  }

  // ViewBox: castello largo `castleX` mm, alto `totalThickness` mm.
  // Aggiungiamo padding orizzontale per etichette a destra (peso ~castleX*0.6 per leggibilità).
  const labelPad = castleX * 0.7
  const padding = Math.max(castleX, totalThickness) * 0.06
  const view = {
    x: -padding,
    y: -padding,
    w: castleX + labelPad + 2 * padding,
    h: totalThickness + 2 * padding,
  }

  let cursorY = 0
  return (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ height }}>
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        {sorted.map(p => {
          const c = PLATE_COLORS[p.plate_role] || { ...DEFAULT_COLOR, label: p.plate_role }
          const y = cursorY
          const h = p.default_thickness_mm || 0
          cursorY += h
          const labelX = castleX + padding
          const labelY = y + h / 2
          // fontSize proporzionato al viewBox per restare leggibile a ogni scala.
          const fs = Math.max(view.h * 0.045, 4)
          return (
            <g key={p.id ?? `${p.plate_role}-${p.sort_order}`}>
              <rect
                x={0}
                y={y}
                width={castleX}
                height={h}
                fill={c.fill}
                stroke={c.stroke}
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={labelX}
                y={labelY}
                dominantBaseline="middle"
                fontSize={fs}
                fill="#334155"
                fontFamily="ui-sans-serif, system-ui"
              >
                {c.label || p.plate_role} — {h} mm
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
