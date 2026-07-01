import { Card, CardContent } from '@/components/ui/card'

export interface KpiItem {
  label: string
  value: string | number
  hint?: string
  color?: 'gray' | 'blue' | 'orange' | 'green' | 'rose'
}

const COLOR_MAP: Record<NonNullable<KpiItem['color']>, string> = {
  gray:   'text-foreground',
  blue:   'text-primary',
  orange: 'text-orange-600',
  green:  'text-green-700',
  rose:   'text-rose-600',
}

/** Riga di KPI card per mini-dashboard inline.
 *  Layout grid 4 colonne (responsive: 2 su md, 1 su mobile). */
export default function KpiBar({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <Card key={i}>
          <CardContent className="p-3">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {it.label}
            </div>
            <div className={`text-2xl font-bold mt-0.5 ${COLOR_MAP[it.color ?? 'gray']}`}>
              {it.value}
            </div>
            {it.hint && (
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{it.hint}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
