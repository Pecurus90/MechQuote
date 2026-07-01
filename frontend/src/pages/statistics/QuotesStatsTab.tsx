import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { Statistics } from '@/types'
import {
  type Period, fmtEur, Loading, KpiCards, TrendArea, RankBars, FineDonut,
} from './statsShared'

interface CustomerOpt { id: number; name: string }

const eur = (v: number) => `€ ${fmtEur(v)}`
const kEur = (v: number) => `${fmtEur(v / 1000)}k`

export default function QuotesStatsTab({ period }: { period: Period }) {
  const [data, setData] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [quoteType, setQuoteType] = useState<'all' | 'standard' | 'die'>('all')
  const [customerId, setCustomerId] = useState<string>('')
  const [customers, setCustomers] = useState<CustomerOpt[]>([])

  useEffect(() => {
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => undefined)
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ period })
    if (quoteType !== 'all') params.set('quote_type', quoteType)
    if (customerId) params.set('customer_id', customerId)
    api.get(`/dashboard/statistics?${params}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche preventivi'))
      .finally(() => setLoading(false))
  }, [period, quoteType, customerId])

  if (loading || !data) return <Loading />

  const totalValue = data.trend_monthly.reduce((s, p) => s + p.standard + p.dies, 0)
  const avgMargin = data.margin_monthly.length === 0
    ? 0 : data.margin_monthly.reduce((s, p) => s + p.margin_percent, 0) / data.margin_monthly.length

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={quoteType} onChange={e => setQuoteType(e.target.value as typeof quoteType)}>
            <option value="all">Tutti</option>
            <option value="standard">Standard</option>
            <option value="die">Stampi</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Cliente</label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm min-w-[180px]" value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Tutti i clienti</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <KpiCards items={[
        { label: 'Preventivi', value: String(data.standard_count + data.dies_count), hint: `${data.standard_count} std · ${data.dies_count} stampi` },
        { label: 'Standard', value: String(data.standard_count) },
        { label: '€ preventivato', value: eur(totalValue) },
        { label: 'Margine medio', value: `${avgMargin.toFixed(1)}%` },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Andamento per tipo (€)</CardTitle></CardHeader>
          <CardContent>
            <TrendArea data={data.trend_monthly} xKey="month" idPrefix="q-trend"
              series={[{ key: 'standard', name: 'Standard', color: '#6366f1' }, { key: 'dies', name: 'Stampi', color: '#f472b6' }]}
              yFmt={kEur} tipFmt={eur} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Margine medio mensile</CardTitle></CardHeader>
          <CardContent>
            <TrendArea data={data.margin_monthly} xKey="month" idPrefix="q-margin"
              series={[{ key: 'margin_percent', name: 'Margine', color: '#34d399' }]}
              yFmt={(v) => `${v}%`} tipFmt={(v) => `${v.toFixed(1)}%`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Top 10 clienti (€)</CardTitle></CardHeader>
          <CardContent>
            <RankBars data={data.top_customers} labelKey="customer_name" valueKey="total" valueFmt={eur} unit="€" labelWidth={120} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Preventivi per categoria</CardTitle></CardHeader>
          <CardContent>
            <FineDonut data={data.by_category.map(c => ({ name: c.category_code, value: c.count }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Ore per macchina</CardTitle></CardHeader>
          <CardContent>
            <RankBars data={data.hours_by_machine} labelKey="label" valueKey="hours" valueFmt={(v) => `${v.toFixed(0)}h`} unit="ore" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Ore per lavorazione</CardTitle></CardHeader>
          <CardContent>
            <RankBars data={data.hours_by_operation} labelKey="label" valueKey="hours" valueFmt={(v) => `${v.toFixed(0)}h`} unit="ore" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
