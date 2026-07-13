// Tipi/util condivisi dei tab Statistiche.
// Il toolkit grafico (area/barre/donut + palette) è stato spostato in
// components/charts/* con la palette centralizzata useChartTheme() — questo
// file tiene solo ciò che è ancora usato dal container.

export type Period = 'year' | '12m' | 'prev_year' | 'all'

export function Loading() {
  return <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento…</div>
}
