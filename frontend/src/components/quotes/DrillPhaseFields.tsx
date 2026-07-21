// src/components/quotes/DrillPhaseFields.tsx
// TD-7 — pannello parametri foratura a elettrodo. Mostrato quando la macchina
// della fase è la foratrice designata (EdmConfig.default_drilling_machine_id).
// Gli input (Ø elettrodo, n° forature, profondità) fanno ricalcolare al backend
// il tempo (DrillingTime) e il costo elettrodo (variable_cost_per_part).
import { DecimalField } from '@/components/ui/decimal-field'
import { Drill } from 'lucide-react'
import type { Phase, Electrode } from '@/types'
import { parseDecimal } from '@/lib/decimalInput'

interface Props {
  phase: Phase
  electrodes: Electrode[]
  onSaveImmediate: (updates: Partial<Phase>) => void
}

export default function DrillPhaseFields({ phase, electrodes, onSaveImmediate }: Props) {
  const commitNum = (field: keyof Phase, raw: string, toInt = false) => {
    const t = raw.trim()
    const v = t === '' ? null : (toInt ? parseInt(t, 10) : parseDecimal(t))
    const val = (v != null && Number.isNaN(v)) ? null : v
    onSaveImmediate({ [field]: val } as Partial<Phase>)
  }
  const auto = !!phase.electrode_diameter_mm && !!phase.n_holes && !!phase.drill_depth_mm

  return (
    <div className="rounded-md border border-warning/30 bg-warning/[0.12] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-warning">
        <Drill className="h-3.5 w-3.5" />
        Parametri foratura EDM
        {auto && <span className="ml-2 rounded bg-warning/25 px-1.5 py-0.5 text-[10px] text-warning">auto</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Ø elettrodo (mm)</label>
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={phase.electrode_diameter_mm ?? ''}
            onChange={e => onSaveImmediate({ electrode_diameter_mm: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">— scegli —</option>
            {electrodes.map(el => <option key={el.id} value={el.diameter_mm}>Ø{el.diameter_mm}</option>)}
          </select>
          {electrodes.length === 0 && (
            <p className="mt-0.5 text-[10px] text-warning">Configura gli elettrodi in Impostazioni → EDM → Elettrodi</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">N° forature</label>
          <DecimalField className="mt-1 h-9 text-sm"
            value={phase.n_holes != null ? String(phase.n_holes) : ''}
            placeholder="0"
            onCommit={raw => commitNum('n_holes', raw, true)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Lunghezza foratura (mm)</label>
          <DecimalField className="mt-1 h-9 text-sm"
            value={phase.drill_depth_mm != null ? String(phase.drill_depth_mm) : ''}
            placeholder="es. 20"
            onCommit={raw => commitNum('drill_depth_mm', raw)} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Tempo e costo elettrodo sono calcolati automaticamente dal motore.
      </p>
    </div>
  )
}
