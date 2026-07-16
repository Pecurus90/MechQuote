import type { DxfUnit } from '@/lib/dxfUnits'
import { cn } from '@/lib/utils'

/** Selettore mm/pollici per correggere un DXF con header unità errata.
 *  Renderizzalo solo quando l'override ha senso (isDxfUnitOverridable). */
export default function DxfUnitToggle({ unit, onChange, className }: {
  unit: DxfUnit
  onChange: (u: DxfUnit) => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1 text-[12px] text-muted-foreground', className)}>
      <span>Disegno in:</span>
      <div className="flex overflow-hidden rounded-md border border-border">
        {(['mm', 'in'] as const).map(u => (
          <button
            key={u}
            type="button"
            onClick={() => onChange(u)}
            className={cn(
              'px-2 py-0.5 text-[12px] font-medium',
              unit === u ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
            )}
          >
            {u === 'mm' ? 'mm' : 'pollici'}
          </button>
        ))}
      </div>
    </div>
  )
}
