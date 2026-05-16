// Render side-view (spaccato verticale) del castello stampo: le piastre
// del template selezionato impilate dall'alto (cappello in cima, base in
// fondo), con spessori in scala e etichette ruolo a destra.
//
// Implementazione HTML+CSS (non SVG): il testo SVG con coordinate viewBox
// diventava illeggibile quando il castello era largo (font reso piccolo
// in fit-to-container). Con HTML il font ha sempre dimensioni assolute
// in px, e la larghezza dei rettangoli è semplicemente width:100%.
import type { DieTemplatePlate } from '@/types'

interface Props {
  plates: DieTemplatePlate[]
  castleX: number
}

const PLATE_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  cappello:       { fill: '#dbeafe', stroke: '#2563eb', label: 'Cappello' },
  porta_punzoni:  { fill: '#ede9fe', stroke: '#7c3aed', label: 'Porta punzoni' },
  premilamiera:   { fill: '#fed7aa', stroke: '#ea580c', label: 'Premilamiera' },
  matrice:        { fill: '#fecaca', stroke: '#dc2626', label: 'Matrice' },
  base:           { fill: '#e2e8f0', stroke: '#475569', label: 'Base' },
}
const DEFAULT_COLOR = { fill: '#f1f5f9', stroke: '#64748b', label: '' }

// Altezza minima per rendere leggibile l'etichetta dentro una piastra,
// indipendentemente dallo spessore proporzionale.
const MIN_ROW_PX = 36

export default function DieSideView({ plates, castleX }: Props) {
  if (plates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-gray-50 flex items-center justify-center text-xs text-gray-400 h-32">
        Seleziona un template per vedere lo spaccato verticale
      </div>
    )
  }

  const sorted = [...plates].sort((a, b) => a.sort_order - b.sort_order)
  const totalThickness = sorted.reduce((s, p) => s + (p.default_thickness_mm || 0), 0)
  if (totalThickness <= 0 || castleX <= 0) {
    return (
      <div className="rounded-lg border border-dashed bg-gray-50 flex items-center justify-center text-xs text-gray-400 h-32">
        Dati piastra incompleti
      </div>
    )
  }

  // Ogni piastra ha altezza = max(percentuale-su-totale × baseHeight, minimo).
  // baseHeight dimensionato sul numero di piastre per dare un'altezza utile
  // anche con stack piccolo. La somma effettiva può superare baseHeight ma
  // il container è scrollabile in caso (raro: stack > 8 piastre).
  const baseHeight = Math.max(sorted.length * MIN_ROW_PX, 200)

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex flex-col gap-px">
        {sorted.map(p => {
          const c = PLATE_COLORS[p.plate_role] || { ...DEFAULT_COLOR, label: p.plate_role }
          const thickness = p.default_thickness_mm || 0
          const proportional = (thickness / totalThickness) * baseHeight
          const h = Math.max(proportional, MIN_ROW_PX)
          return (
            <div
              key={p.id ?? `${p.plate_role}-${p.sort_order}`}
              className="flex items-center justify-between px-3 rounded border"
              style={{
                height: `${h}px`,
                backgroundColor: c.fill,
                borderColor: c.stroke,
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-full inline-block rounded-sm shrink-0"
                  style={{ backgroundColor: c.stroke, minHeight: '24px' }}
                />
                <span className="font-medium text-sm text-gray-800 truncate">
                  {c.label || p.plate_role}
                </span>
              </div>
              <span className="font-mono text-sm text-gray-700 whitespace-nowrap">
                {thickness} mm
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 text-xs text-gray-500 text-right">
        Larghezza castello: <span className="font-mono">{Math.round(castleX)} mm</span> · spessore totale: <span className="font-mono">{totalThickness} mm</span>
      </div>
    </div>
  )
}
