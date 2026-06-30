import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Hammer, Percent } from 'lucide-react'
import type { DashboardKPI } from '@/types'
import { fmtEur } from './dashboardUtil'

export default function KpiGrid({ kpi }: { kpi: DashboardKPI }) {
  const diff = kpi.percentage_diff
  const diffPositive = diff >= 0
  // Card "Valore stampi" mostrata solo quando ci sono preventivi stampo
  // in archivio: per officine senza modulo stampi attivo resta a 4+1 card.
  const showDies = (kpi.dies_quoted_value ?? 0) > 0
  // Margine medio: solo se ho almeno un preventivo (cost > 0)
  const margin = kpi.avg_margin_percent ?? 0
  const showMargin = kpi.total_quotes > 0
  const lgCols = (showDies && showMargin) ? 'lg:grid-cols-6'
    : (showDies || showMargin) ? 'lg:grid-cols-5'
    : 'lg:grid-cols-4'
  const marginColor = margin >= 30 ? 'text-green-600' : margin >= 15 ? 'text-amber-600' : 'text-red-500'
  return (
    <div className={`grid grid-cols-2 ${lgCols} gap-4`}>
      <Card>
        <CardHeader className="pb-1">
          <CardDescription>Valore totale preventivato</CardDescription>
          <CardTitle className="text-3xl">{fmtEur(kpi.total_quoted_value)} €</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          {kpi.total_quotes} preventivi
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardDescription>Valore mese corrente</CardDescription>
          <CardTitle className="text-3xl">{fmtEur(kpi.quoted_value_this_month)} €</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          {kpi.total_quotes_this_month} preventivi
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardDescription>Trend vs mese precedente</CardDescription>
          <CardTitle className={`text-3xl flex items-center gap-2 ${diffPositive ? 'text-green-600' : 'text-red-500'}`}>
            {diffPositive
              ? <TrendingUp className="w-7 h-7" />
              : <TrendingDown className="w-7 h-7" />}
            {diffPositive ? '+' : ''}{diff.toFixed(1)}%
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          {fmtEur(kpi.quoted_value_prev_month)} € il mese scorso
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardDescription>Media per preventivo</CardDescription>
          <CardTitle className="text-3xl">{fmtEur(kpi.avg_quote_value)} €</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          su {kpi.total_quotes} preventivi
        </CardContent>
      </Card>

      {showDies && (
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5"><Hammer className="w-3.5 h-3.5" /> Valore stampi</CardDescription>
            <CardTitle className="text-3xl text-rose-700">{fmtEur(kpi.dies_quoted_value || 0)} €</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">
            Preventivi modulo Stampi
          </CardContent>
        </Card>
      )}

      {showMargin && (
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" /> Margine medio</CardDescription>
            <CardTitle className={`text-3xl ${marginColor}`}>{margin.toFixed(1)}%</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">
            Su preventivi standard (no stampi)
          </CardContent>
        </Card>
      )}
    </div>
  )
}
