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

export function Loading() {
  return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento…</div>
}

export function EmptyChart() {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">
      Nessun dato per questo periodo
    </div>
  )
}
