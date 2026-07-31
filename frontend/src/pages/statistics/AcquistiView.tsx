// src/pages/statistics/AcquistiView.tsx
// Tab "Acquisti": raggruppa Materiali e Utensili sotto un selettore interno.
// Shell presentazionale — la vista attiva arriva come children (i dati e i
// filtri restano di StatisticsPage, come per gli altri tab).
import type { ReactNode } from 'react'
import { Package, Drill } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AcquistiInner = 'materials' | 'tools'

const INNER: { key: AcquistiInner; label: string; icon: typeof Package }[] = [
  { key: 'materials', label: 'Materiali', icon: Package },
  { key: 'tools', label: 'Utensili', icon: Drill },
]

interface Props {
  inner: AcquistiInner
  onInnerChange: (v: AcquistiInner) => void
  children: ReactNode
}

export function AcquistiView({ inner, onInnerChange, children }: Props) {
  return (
    <div>
      <div className="mb-4 inline-flex gap-[3px] rounded-[10px] bg-muted p-[3px]">
        {INNER.map((t) => {
          const active = inner === t.key
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onInnerChange(t.key)}
              className={cn(
                'flex h-[32px] items-center gap-[7px] whitespace-nowrap rounded-[7px] px-[15px] text-[13px] font-semibold transition-colors',
                active
                  ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-muted-foreground',
              )}
            >
              <Icon className="h-[15px] w-[15px]" />
              {t.label}
            </button>
          )
        })}
      </div>
      {children}
    </div>
  )
}
