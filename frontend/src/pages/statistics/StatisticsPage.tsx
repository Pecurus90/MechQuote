// Sezione Statistiche & Grafici — container (design handoff).
// Shell StatisticsView (header + periodo + tab bar) + 3 tab. Il tab Preventivi
// è sulla nuova grafica (dati reali da /dashboard/statistics); i tab Materiali
// e Utensili usano temporaneamente i corpi esistenti (MaterialsStatsTab /
// ToolsStatsTab) dentro la nuova shell — adozione graduale, in attesa dei dati
// backend mancanti (spesa €/mese, spesa per famiglia; utensili a quantità).
import { useEffect, useState } from 'react'
import { FileText, Layers, Euro, Percent } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Statistics } from '@/types'
import { StatisticsView } from '@/pages/statistics/StatisticsView'
import type { StatTab, StatPeriod, StatKpi } from '@/pages/statistics/StatisticsView'
import { QuotesStatsView } from '@/pages/statistics/QuotesStatsView'
import type { QuoteStatType } from '@/pages/statistics/QuotesStatsView'
import { type Period, Loading } from '@/pages/statistics/statsShared'
import MaterialsStatsTab from '@/pages/statistics/MaterialsStatsTab'
import ToolsStatsTab from '@/pages/statistics/ToolsStatsTab'

// I preset del redesign ↔ i valori attesi dagli endpoint /dashboard/statistics.
const PERIOD_MAP: Record<StatPeriod, Period> = {
  current_year: 'year',
  last_12m: '12m',
  last_year: 'prev_year',
  all: 'all',
}

const MONTHS_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
// "YYYY-MM" → "gen 26" (disambigua gli anni nei periodi lunghi).
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const idx = parseInt(m, 10) - 1
  return `${MONTHS_IT[idx] ?? m} ${(y ?? '').slice(2)}`
}

const eur = (v: number): string =>
  '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })

interface CustomerOpt { id: number; name: string }

export default function StatisticsPage() {
  const [tab, setTab] = useState<StatTab>('quotes')
  const [period, setPeriod] = useState<StatPeriod>('current_year')

  // Filtri locali tab Preventivi.
  const [quoteType, setQuoteType] = useState<QuoteStatType>('all')
  const [customer, setCustomer] = useState<string>('all')
  const [customers, setCustomers] = useState<CustomerOpt[]>([])

  const [data, setData] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (tab !== 'quotes') return
    setLoading(true)
    const params = new URLSearchParams({ period: PERIOD_MAP[period] })
    if (quoteType !== 'all') params.set('quote_type', quoteType)
    if (customer !== 'all') params.set('customer_id', customer)
    api.get(`/dashboard/statistics?${params}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche preventivi'))
      .finally(() => setLoading(false))
  }, [tab, period, quoteType, customer])

  return (
    <div className="px-6 pb-10 pt-[22px]">
      <StatisticsView
        activeTab={tab}
        onTabChange={setTab}
        period={period}
        onPeriodChange={setPeriod}
      >
        {tab === 'quotes' && (
          (loading || !data) ? <Loading /> : (
            <QuotesStatsView
              type={quoteType}
              onTypeChange={setQuoteType}
              customer={customer}
              customers={[
                { value: 'all', label: 'Cliente · tutti' },
                ...customers.map(c => ({ value: String(c.id), label: c.name })),
              ]}
              onCustomerChange={setCustomer}
              kpis={buildQuoteKpis(data)}
              trendByType={data.trend_monthly.map(p => ({ month: monthLabel(p.month), standard: p.standard, stampi: p.dies }))}
              monthlyMargin={data.margin_monthly.map(p => ({ month: monthLabel(p.month), margine: p.margin_percent }))}
              topCustomers={data.top_customers.map(c => ({ name: c.customer_name ?? '—', value: c.total }))}
              byCategory={data.by_category.map(c => ({ name: c.category_code, value: c.count }))}
              hoursByMachine={data.hours_by_machine.map(h => ({ name: h.label, value: h.hours }))}
              hoursByProcess={data.hours_by_operation.map(h => ({ name: h.label, value: h.hours }))}
            />
          )
        )}

        {/* Tab in migrazione: corpo esistente dentro la nuova shell. */}
        {tab === 'materials' && <MaterialsStatsTab period={PERIOD_MAP[period]} />}
        {tab === 'tools' && <ToolsStatsTab period={PERIOD_MAP[period]} />}
      </StatisticsView>
    </div>
  )
}

function buildQuoteKpis(data: Statistics): StatKpi[] {
  const totalValue = data.trend_monthly.reduce((s, p) => s + p.standard + p.dies, 0)
  const avgMargin = data.margin_monthly.length === 0
    ? 0
    : data.margin_monthly.reduce((s, p) => s + p.margin_percent, 0) / data.margin_monthly.length
  const count = data.standard_count + data.dies_count
  return [
    { key: 'count', label: 'Preventivi', value: count, hint: 'nel periodo', icon: FileText, tone: 'primary' },
    { key: 'split', label: 'Standard / Stampi', value: `${data.standard_count} / ${data.dies_count}`, hint: 'per tipologia', icon: Layers, tone: 'info' },
    { key: 'value', label: '€ preventivato', value: eur(totalValue), hint: 'valore nel periodo', icon: Euro, tone: 'success' },
    { key: 'margin', label: 'Margine medio', value: `${avgMargin.toFixed(1).replace('.', ',')}%`, hint: 'sui preventivi', icon: Percent, tone: 'confirmed' },
  ]
}
