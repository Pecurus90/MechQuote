import { Input } from '@/components/ui/input'
import { Zap, Unlock } from 'lucide-react'
import type { Phase, CuttingCycle } from '@/types'
import { parseDecimal } from '@/lib/decimalInput'

interface Props {
  phase: Phase
  edmAuto: boolean
  cuttingCycles: CuttingCycle[]
  onChange: (field: keyof Phase, value: Phase[keyof Phase]) => void
  onBlur: () => void
  onUnlockManual: () => void
}

/** Campi extra per fasi Wire EDM: lunghezza profilo, altezza, ciclo, n_pierce.
 * Quando i 3 campi obbligatori sono valorizzati, il backend ricalcola
 * automaticamente cycle_hours_per_part (edmAuto = true).
 */
export default function EdmPhaseFields({ phase, edmAuto, cuttingCycles, onChange, onBlur, onUnlockManual }: Props) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
          <Zap className="w-3.5 h-3.5" />
          Parametri taglio EDM
          {edmAuto && <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-amber-200 text-amber-800">auto</span>}
        </div>
        {edmAuto && (
          <button
            type="button"
            onClick={onUnlockManual}
            className="flex items-center gap-1 text-[11px] text-amber-700 hover:underline"
            title="Sblocca per inserire le ore manualmente"
          >
            <Unlock className="w-3 h-3" /> Modifica manualmente
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Lunghezza profilo (mm)</label>
          <Input onFocus={e => e.currentTarget.select()} type="number" step="1" min="0" className="mt-1 h-9 text-sm"
            value={phase.cut_length_mm ?? ''}
            placeholder="es. 320"
            onChange={e => onChange('cut_length_mm', e.target.value === '' ? null : parseDecimal(e.target.value))}
            onBlur={onBlur} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Altezza pezzo (mm)</label>
          <Input onFocus={e => e.currentTarget.select()} type="number" step="0.5" min="0" className="mt-1 h-9 text-sm"
            value={phase.cut_height_mm ?? ''}
            placeholder="es. 40"
            onChange={e => onChange('cut_height_mm', e.target.value === '' ? null : parseDecimal(e.target.value))}
            onBlur={onBlur} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Ciclo di taglio</label>
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={phase.cutting_cycle_id ?? ''}
            onChange={e => onChange('cutting_cycle_id', e.target.value === '' ? null : Number(e.target.value))}
            onBlur={onBlur}
          >
            <option value="">— scegli ciclo —</option>
            {cuttingCycles.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.passes.length} passate)</option>
            ))}
          </select>
          {cuttingCycles.length === 0 && (
            <p className="text-[10px] text-amber-700 mt-0.5">
              Configura i cicli in Impostazioni → Wire EDM
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">N° pierce (fori partenza)</label>
          <Input onFocus={e => e.currentTarget.select()} type="number" step="1" min="0" className="mt-1 h-9 text-sm"
            value={phase.n_pierce ?? ''}
            placeholder="0"
            onChange={e => onChange('n_pierce', e.target.value === '' ? null : parseInt(e.target.value, 10))}
            onBlur={onBlur} />
        </div>
      </div>
      {edmAuto && (
        <p className="text-[11px] text-amber-700 mt-2">
          Le ore ciclo sono calcolate automaticamente da area × ciclo + tempo pierce.
          Se la coppia materiale/altezza non è in tabella, popolala in Impostazioni → Wire EDM → Velocità di taglio.
        </p>
      )}
    </div>
  )
}
