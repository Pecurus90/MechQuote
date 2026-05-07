import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, TrendingUp, TrendingDown } from 'lucide-react'
import type { DashboardKPI, QuoteListItem } from '@/types'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import { toast } from 'sonner'

export default function DashboardPage() {
  const [kpi, setKpi] = useState<DashboardKPI | null>(null)
  const [quotes, setQuotes] = useState<QuoteListItem[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/dashboard/kpi'),
      api.get('/quotes?limit=20'),
    ]).then(([kpiRes, quotesRes]) => {
      setKpi(kpiRes.data)
      setQuotes(quotesRes.data)
      setLoading(false)
    }).catch(() => {
      toast.error('Errore nel caricamento dati. Verifica che il backend sia attivo.')
      setLoading(false)
    })
  }, [])

  const quoteTotal = (q: QuoteListItem) =>
    q.parts?.reduce((s, p) => s + (p.total_price || 0), 0) ?? 0

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-500">
      Caricamento...
    </div>
  )

  if (!kpi) return null

  const diff = kpi.percentage_diff
  const diffPositive = diff >= 0

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <Button onClick={() => navigate('/quotes/new')}>
          <Plus className="w-4 h-4 mr-1.5" /> Nuovo Preventivo
        </Button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Preventivi totali</CardDescription>
            <CardTitle className="text-3xl">{kpi.total_quotes}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">
            {kpi.total_quotes_this_month} questo mese
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Valore totale</CardDescription>
            <CardTitle className="text-3xl">{kpi.total_quoted_value.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">
            Media {kpi.avg_quote_value.toFixed(0)} € / preventivo
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Valore questo mese</CardDescription>
            <CardTitle className="text-3xl">{kpi.quoted_value_this_month.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €</CardTitle>
          </CardHeader>
          <CardContent className="text-sm flex items-center gap-1">
            {diffPositive
              ? <TrendingUp className="w-4 h-4 text-green-600" />
              : <TrendingDown className="w-4 h-4 text-red-500" />}
            <span className={diffPositive ? 'text-green-600' : 'text-red-500'}>
              {diffPositive ? '+' : ''}{diff.toFixed(1)}% vs mese prec.
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Codici parte totali</CardDescription>
            <CardTitle className="text-3xl">{kpi.total_part_codes}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Valore CNC preventivato</CardDescription>
            <CardTitle className="text-3xl">{kpi.cnc_quoted_value.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Valore EDM preventivato</CardDescription>
            <CardTitle className="text-3xl">{kpi.edm_quoted_value.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Recent quotes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Preventivi Recenti</CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate('/quotes/archive')}>
            Vedi archivio
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">N. Preventivo</th>
                <th className="text-left p-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left p-3 font-medium text-gray-600">Data</th>
                <th className="text-left p-3 font-medium text-gray-600">Stato</th>
                <th className="text-right p-3 font-medium text-gray-600">Totale</th>
                <th className="text-center p-3 font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-400">
                    Nessun preventivo ancora.{' '}
                    <button className="text-blue-600 underline" onClick={() => navigate('/quotes/new')}>
                      Crea il primo
                    </button>
                  </td>
                </tr>
              ) : (
                quotes.map(q => (
                  <tr
                    key={q.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/quotes/${q.id}`)}
                  >
                    <td className="p-3 font-mono font-medium text-blue-700">{q.quote_number}</td>
                    <td className="p-3">{q.customer_name || '-'}</td>
                    <td className="p-3 text-gray-500">{q.quote_date}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[q.status] || STATUS_COLORS.draft}`}>
                        {STATUS_LABELS[q.status] || q.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium">{quoteTotal(q).toFixed(2)} €</td>
                    <td className="p-3 text-center">
                      <Button
                        variant="outline" size="sm"
                        onClick={e => { e.stopPropagation(); navigate(`/quotes/${q.id}`) }}
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" /> Apri
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
