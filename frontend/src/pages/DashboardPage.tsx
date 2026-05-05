import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus } from 'lucide-react'

interface KPI {
  total_quotes: number
  total_quotes_this_month: number
  total_quoted_value: number
  quoted_value_this_month: number
  quoted_value_prev_month: number
  percentage_diff: number
  avg_quote_value: number
  total_part_codes: number
  cnc_quoted_value: number
  edm_quoted_value: number
}

interface Quote {
  id: number
  quote_number: string
  customer_name: string
  date: string
  status: string
  total_value: number
}

export default function DashboardPage() {
  const [kpi, setKpi] = useState<KPI | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    setError(null)

    const timeout = setTimeout(() => {
      setLoading(false)
      setError('Timeout: impossibile caricare i dati')
    }, 10000)

    Promise.all([
      api.get('/dashboard/kpi'),
      api.get('/quotes?limit=50'),
    ]).then(([kpiRes, quotesRes]) => {
      clearTimeout(timeout)
      setKpi(kpiRes.data)
      setQuotes(quotesRes.data.map((q: any) => ({
        ...q,
        total_value: q.parts?.reduce((sum: number, p: any) => sum + (p.total_price || 0), 0) || 0,
      })))
      setLoading(false)
    }).catch(err => {
      clearTimeout(timeout)
      setLoading(false)
      setError('Errore nel caricamento')
      console.error('Dashboard API error:', err)
    })

    return () => clearTimeout(timeout)
  }, [])

  if (loading) return <div className="p-8 text-center">Caricamento...</div>

  if (error) return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">FDV</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">MechQuote</h1>
              <p className="text-xs text-gray-500">Fratelli Dalla Via</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>Home</Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-red-600 p-8">{error}</div>
        <div className="text-center">
          <Button onClick={() => window.location.reload()}>Riprova</Button>
        </div>
      </main>
    </div>
  )

  const cards = [
    { label: 'Totale Preventivi', value: kpi!.total_quotes, color: 'blue' },
    { label: 'Preventivi questo mese', value: kpi!.total_quotes_this_month, color: 'green' },
    { label: 'Valore Totale (€)', value: kpi!.total_quoted_value.toFixed(2), color: 'purple' },
    { label: 'Valore questo mese (€)', value: kpi!.quoted_value_this_month.toFixed(2), color: 'indigo' },
    { label: 'Differenza vs mese prec. (%)', value: `${kpi!.percentage_diff > 0 ? '+' : ''}${kpi!.percentage_diff.toFixed(1)}%`, color: kpi!.percentage_diff >= 0 ? 'green' : 'red' },
    { label: 'Valore medio preventivo (€)', value: kpi!.avg_quote_value.toFixed(2), color: 'gray' },
    { label: 'Totale codici parti', value: kpi!.total_part_codes, color: 'blue' },
    { label: 'Valore CNC (€)', value: kpi!.cnc_quoted_value.toFixed(2), color: 'orange' },
    { label: 'Valore EDM (€)', value: kpi!.edm_quoted_value.toFixed(2), color: 'teal' },
  ]

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">FDV</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">MechQuote</h1>
              <p className="text-xs text-gray-500">Fratelli Dalla Via</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>Home</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <Button onClick={() => navigate('/quotes/new')}>
            <Plus className="w-4 h-4 mr-1" /> Nuovo Preventivo
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {cards.map((c) => (
            <Card key={c.label} className={`border ${colorClasses[c.color]}`}>
              <CardHeader className="pb-2">
                <CardDescription className="text-sm opacity-70">{c.label}</CardDescription>
                <CardTitle className="text-2xl">{c.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Preventivi Recenti</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">N. Preventivo</th>
                  <th className="text-left p-3">Cliente</th>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Stato</th>
                  <th className="text-right p-3">Totale</th>
                  <th className="text-center p-3">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {quotes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">
                      Nessun preventivo trovato. <Button variant="link" onClick={() => navigate('/quotes/new')}>Crea il primo preventivo</Button>
                    </td>
                  </tr>
                ) : (
                  quotes.map(q => (
                    <tr key={q.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => navigate('/quotes/new')}>
                      <td className="p-3 font-medium">{q.quote_number}</td>
                      <td className="p-3">{q.customer_name || '-'}</td>
                      <td className="p-3">{q.date}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs ${q.status === 'accepted' ? 'bg-green-100 text-green-800' : q.status === 'sent' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium">{q.total_value?.toFixed(2) || '0.00'} €</td>
                      <td className="p-3 text-center">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate('/quotes/new') }}>
                          <FileText className="w-4 h-4 mr-1" /> Apri
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
