import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { useNavigate } from 'react-router-dom'

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

export default function DashboardPage() {
  const [kpi, setKpi] = useState<KPI | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/dashboard/kpi').then(res => setKpi(res.data)).catch(() => {})
  }, [])

  if (!kpi) return <div className="p-8 text-center">Caricamento...</div>

  const cards = [
    { label: 'Totale Preventivi', value: kpi.total_quotes, color: 'blue' },
    { label: 'Preventivi questo mese', value: kpi.total_quotes_this_month, color: 'green' },
    { label: 'Valore Totale (€)', value: kpi.total_quoted_value.toFixed(2), color: 'purple' },
    { label: 'Valore questo mese (€)', value: kpi.quoted_value_this_month.toFixed(2), color: 'indigo' },
    { label: 'Differenza vs mese prec. (%)', value: `${kpi.percentage_diff > 0 ? '+' : ''}${kpi.percentage_diff.toFixed(1)}%`, color: kpi.percentage_diff >= 0 ? 'green' : 'red' },
    { label: 'Valore medio preventivo (€)', value: kpi.avg_quote_value.toFixed(2), color: 'gray' },
    { label: 'Totale codici parti', value: kpi.total_part_codes, color: 'blue' },
    { label: 'Valore CNC (€)', value: kpi.cnc_quoted_value.toFixed(2), color: 'orange' },
    { label: 'Valore EDM (€)', value: kpi.edm_quoted_value.toFixed(2), color: 'teal' },
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
          <Button variant="outline" onClick={() => navigate('/')}>
            Home
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <Button onClick={() => navigate('/quotes/new')}>
            + Nuovo Preventivo
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((c) => (
            <Card key={c.label} className={`border ${colorClasses[c.color]}`}>
              <CardHeader className="pb-2">
                <CardDescription className="text-sm opacity-70">{c.label}</CardDescription>
                <CardTitle className="text-2xl">{c.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
