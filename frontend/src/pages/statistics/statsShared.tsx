// Tipi e componenti condivisi dai tab della pagina Statistiche.

export type Period = 'year' | '12m' | 'prev_year' | 'all'

export const PERIOD_LABEL: Record<Period, string> = {
  year:      'Anno corrente',
  '12m':     'Ultimi 12 mesi',
  prev_year: 'Anno scorso',
  all:       'Tutto',
}

export const fmtEur = (n: number) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export const CATEGORY_COLORS = ['#2563eb', '#7c3aed', '#dc2626', '#ea580c', '#16a34a', '#0891b2', '#db2777', '#475569']

// Riga di KPI-card riusabile dai tab statistiche.
export function KpiCards({ items }: { items: Array<{ label: string; value: string; hint?: string }> }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <div className="text-2xl font-bold text-foreground leading-none">{it.value}</div>
          <div className="text-sm font-medium text-muted-foreground mt-1">{it.label}</div>
          {it.hint && <div className="text-xs text-muted-foreground mt-0.5">{it.hint}</div>}
        </div>
      ))}
    </div>
  )
}

export function Loading() {
  return <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento…</div>
}

export function EmptyChart() {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
      Nessun dato per questo periodo
    </div>
  )
}
