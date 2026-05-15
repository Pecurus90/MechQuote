import { useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { Part } from '@/types'

interface Props {
  plates: Part[]
}

// Colori per ruolo piastra (visivi, non semantici nel cost engine)
const ROLE_COLORS: Record<string, { top: string; front: string; right: string; label: string }> = {
  cappello:        { top: '#475569', front: '#334155', right: '#1e293b', label: 'Cappello' },
  porta_punzoni:   { top: '#3b82f6', front: '#2563eb', right: '#1d4ed8', label: 'Porta-punzoni' },
  premilamiera:    { top: '#fbbf24', front: '#f59e0b', right: '#d97706', label: 'Premilamiera' },
  matrice:         { top: '#fb923c', front: '#f97316', right: '#ea580c', label: 'Matrice' },
  base:            { top: '#94a3b8', front: '#64748b', right: '#475569', label: 'Base' },
}
const DEFAULT_COLOR = { top: '#a3a3a3', front: '#737373', right: '#525252', label: 'Piastra' }

// Proiezione isometrica classica (angoli 30° + 30°):
//   X mondo → X svg = x × cos(30°)
//   Y mondo → Y svg = -y × cos(30°)
//   Z mondo → contributo verticale: (x + y) × sin(30°) verso il basso o l'alto.
// Convenzione: vista da fronte/destra/sopra, asse Z verso alto.
const COS30 = Math.cos(Math.PI / 6)
const SIN30 = Math.sin(Math.PI / 6)

interface Vec2 { x: number; y: number }
function project(x: number, y: number, z: number): Vec2 {
  // Asse SVG: Y cresce verso il basso, quindi invertiamo z (alto = -y_svg).
  return {
    x: (x - y) * COS30,
    y: (x + y) * SIN30 - z,
  }
}

/** Renderer isometrico SVG del castello stampo. Visualizza le piastre come
 *  parallelepipedi stratificati in Z (matrice in basso, cappello in alto),
 *  con 3 facce visibili (top + front + right) e ombreggiatura per ruolo.
 *
 *  Non interattivo. Puramente visivo: niente logica di costo (snapshot
 *  vive nel cost engine). Ordina le piastre per sort_order/role canonico
 *  e impila in Z. Usa raw_x/raw_y/raw_z di ogni Part. */
export default function DieIsometricView({ plates }: Props) {
  const hasGeometry = plates.some(p => p.raw_x_mm && p.raw_y_mm && p.raw_z_mm)

  const data = useMemo(() => {
    // Ordine canonico: base in fondo, matrice → premilamiera → porta_punzoni → cappello.
    const order = ['base', 'matrice', 'premilamiera', 'porta_punzoni', 'cappello']
    const sortKey = (p: Part) => {
      const idx = p.plate_role ? order.indexOf(p.plate_role) : -1
      return idx === -1 ? 99 : idx
    }
    const sorted = [...plates].sort((a, b) => sortKey(a) - sortKey(b))

    // Bounding box uniforme per stack: usa max(x), max(y); spessori = raw_z.
    // Centriamo le piastre più piccole nello stack (gap_x/y).
    const maxX = Math.max(...sorted.map(p => p.raw_x_mm || 0), 1)
    const maxY = Math.max(...sorted.map(p => p.raw_y_mm || 0), 1)

    let zCumul = 0
    const layers = sorted.map((p) => {
      const w = p.raw_x_mm || maxX
      const h = p.raw_y_mm || maxY
      const t = p.raw_z_mm || 10
      const off_x = (maxX - w) / 2
      const off_y = (maxY - h) / 2
      const z0 = zCumul
      const z1 = z0 + t
      zCumul = z1
      const color = (p.plate_role && ROLE_COLORS[p.plate_role]) || DEFAULT_COLOR
      const labelText = (p.plate_role && ROLE_COLORS[p.plate_role]?.label) || (p.description || 'Piastra')
      return { part: p, w, h, t, off_x, off_y, z0, z1, color, labelText }
    })

    // Calcola viewbox da tutti i 8 vertici di ogni piastra proiettati
    let minSvgX = Infinity, maxSvgX = -Infinity, minSvgY = Infinity, maxSvgY = -Infinity
    for (const l of layers) {
      const corners = [
        project(l.off_x, l.off_y, l.z0),
        project(l.off_x + l.w, l.off_y, l.z0),
        project(l.off_x + l.w, l.off_y + l.h, l.z0),
        project(l.off_x, l.off_y + l.h, l.z0),
        project(l.off_x, l.off_y, l.z1),
        project(l.off_x + l.w, l.off_y, l.z1),
        project(l.off_x + l.w, l.off_y + l.h, l.z1),
        project(l.off_x, l.off_y + l.h, l.z1),
      ]
      for (const c of corners) {
        minSvgX = Math.min(minSvgX, c.x)
        maxSvgX = Math.max(maxSvgX, c.x)
        minSvgY = Math.min(minSvgY, c.y)
        maxSvgY = Math.max(maxSvgY, c.y)
      }
    }
    const pad = Math.max((maxSvgX - minSvgX) * 0.06, 10)

    return { layers, maxX, maxY, zCumul, viewBox: {
      x: minSvgX - pad,
      y: minSvgY - pad,
      w: maxSvgX - minSvgX + 2 * pad,
      h: maxSvgY - minSvgY + 2 * pad,
    }}
  }, [plates])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Castello (vista isometrica)</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasGeometry ? (
          <div className="text-center text-sm text-gray-400 py-8">
            Compila dimensioni grezzo (X/Y/Z) sulle piastre per visualizzare il castello.
          </div>
        ) : (
          <svg
            viewBox={`${data.viewBox.x} ${data.viewBox.y} ${data.viewBox.w} ${data.viewBox.h}`}
            className="w-full"
            style={{ maxHeight: 360 }}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Disegna le piastre dal basso verso l'alto: quelle sotto vengono
                coperte dalle facce orizzontali di quelle sopra (z-order corretto). */}
            {data.layers.map((l, idx) => {
              // 4 vertici top
              const tA = project(l.off_x, l.off_y, l.z1)
              const tB = project(l.off_x + l.w, l.off_y, l.z1)
              const tC = project(l.off_x + l.w, l.off_y + l.h, l.z1)
              const tD = project(l.off_x, l.off_y + l.h, l.z1)
              // 2 vertici front-bottom (per faccia frontale a y=0)
              const fA = project(l.off_x, l.off_y, l.z0)
              const fB = project(l.off_x + l.w, l.off_y, l.z0)
              // 2 vertici right-bottom (per faccia destra a x=maxX)
              const rB = project(l.off_x + l.w, l.off_y, l.z0)
              const rC = project(l.off_x + l.w, l.off_y + l.h, l.z0)
              return (
                <g key={l.part.id ?? idx}>
                  {/* Faccia frontale */}
                  <polygon
                    points={`${tA.x},${tA.y} ${tB.x},${tB.y} ${fB.x},${fB.y} ${fA.x},${fA.y}`}
                    fill={l.color.front}
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth="0.5"
                  />
                  {/* Faccia destra */}
                  <polygon
                    points={`${tB.x},${tB.y} ${tC.x},${tC.y} ${rC.x},${rC.y} ${rB.x},${rB.y}`}
                    fill={l.color.right}
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth="0.5"
                  />
                  {/* Faccia top */}
                  <polygon
                    points={`${tA.x},${tA.y} ${tB.x},${tB.y} ${tC.x},${tC.y} ${tD.x},${tD.y}`}
                    fill={l.color.top}
                    stroke="rgba(0,0,0,0.4)"
                    strokeWidth="0.5"
                  />
                  {/* Label centrata sulla faccia top */}
                  <text
                    x={(tA.x + tC.x) / 2}
                    y={(tA.y + tC.y) / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize={Math.max(data.viewBox.w / 35, 5)}
                    fontFamily="system-ui, sans-serif"
                    style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                  >
                    {l.labelText} · {l.w.toFixed(0)}×{l.h.toFixed(0)}×{l.t.toFixed(0)}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
        {hasGeometry && (
          <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
            {data.layers.map((l, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 border">
                <span className="w-3 h-3 rounded-sm" style={{ background: l.color.top }} />
                {l.labelText}
              </span>
            ))}
            <span className="px-2 py-0.5 text-gray-400">
              Altezza totale: {data.zCumul.toFixed(0)} mm
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
