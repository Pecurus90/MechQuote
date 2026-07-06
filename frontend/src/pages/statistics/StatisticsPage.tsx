// Sezione Statistiche & Grafici — container (design handoff).
// Shell StatisticsView (header + periodo + tab bar) + 3 tab presentazionali.
// - Preventivi: dati reali /dashboard/statistics (mappa 1:1)
// - Materiali: adattato ai dati esistenti (no spesa €/mese né per famiglia)
// - Utensili: sola quantità (scelta utente) + sotto scorta per marca
import { useEffect, useState } from 'react'
import {
  FileText, Layers, Euro, Percent, Scale, Truck, Package, Boxes, Drill, AlertTriangle,
} from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Statistics, MaterialsStats, ToolsStats } from '@/types'
import { StatisticsView } from '@/pages/statistics/StatisticsView'
import type { StatTab, StatPeriod, StatKpi } from '@/pages/statistics/StatisticsView'
import { QuotesStatsView } from '@/pages/statistics/QuotesStatsView'
import type { QuoteStatType } from '@/pages/statistics/QuotesStatsView'
import { MaterialsStatsView } from '@/pages/statistics/MaterialsStatsView'
import { ToolsStatsView } from '@/pages/statistics/ToolsStatsView'
import { type Period, Loading } from '@/pages/statistics/statsShared'

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
const kg = (v: number): string =>
  Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 }) + ' kg'

interface CustomerOpt { id: number; name: string }

export default function StatisticsPage() {
  const [tab, setTab] = useState<StatTab>('quotes')
  const [period, setPeriod] = useState<StatPeriod>('current_year')

  // Filtri locali tab Preventivi.
  const [quoteType, setQuoteType] = useState<QuoteStatType>('all')
  const [customer, setCustomer] = useState<string>('all')
  const [customers, setCustomers] = useState<CustomerOpt[]>([])

  const [qData, setQData] = useState<Statistics | null>(null)
  const [mData, setMData] = useState<MaterialsStats | null>(null)
  const [tData, setTData] = useState<ToolsStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => undefined)
  }, [])

  useEffect(() => {
    const p = PERIOD_MAP[period]
    setLoading(true)
    const done = () => setLoading(false)
    if (tab === 'quotes') {
      const params = new URLSearchParams({ period: p })
      if (quoteType !== 'all') params.set('quote_type', quoteType)
      if (customer !== 'all') params.set('customer_id', customer)
      api.get(`/dashboard/statistics?${params}`).then(r => setQData(r.data))
        .catch(() => toast.error('Errore caricamento statistiche preventivi')).finally(done)
    } else if (tab === 'materials') {
      api.get(`/dashboard/statistics/orders-materials?period=${p}`).then(r => setMData(r.data))
        .catch(() => toast.error('Errore caricamento statistiche materiali')).finally(done)
    } else {
      api.get(`/dashboard/statistics/tools?period=${p}`).then(r => setTData(r.data))
        .catch(() => toast.error('Errore caricamento statistiche utensili')).finally(done)
    }
  }, [tab, period, quoteType, customer])

  return (
    <div className="px-6 pb-10 pt-[22px]">
      <StatisticsView activeTab={tab} onTabChange={setTab} period={period} onPeriodChange={setPeriod}>
        {tab === 'quotes' && (
          (loading || !qData) ? <Loading /> : (
            <QuotesStatsView
              type={quoteType}
              onTypeChange={setQuoteType}
              customer={customer}
              customers={[
                { value: 'all', label: 'Cliente · tutti' },
                ...customers.map(c => ({ value: String(c.id), label: c.name })),
              ]}
              onCustomerChange={setCustomer}
              kpis={buildQuoteKpis(qData)}
              trendByType={qData.trend_monthly.map(p => ({ month: monthLabel(p.month), standard: p.standard, stampi: p.dies }))}
              monthlyMargin={qData.margin_monthly.map(p => ({ month: monthLabel(p.month), margine: p.margin_percent }))}
              topCustomers={qData.top_customers.map(c => ({ name: c.customer_name ?? '—', value: c.total }))}
              byCategory={qData.by_category.map(c => ({ name: c.category_code, value: c.count }))}
              hoursByMachine={qData.hours_by_machine.map(h => ({ name: h.label, value: h.hours }))}
              hoursByProcess={qData.hours_by_operation.map(h => ({ name: h.label, value: h.hours }))}
            />
          )
        )}

        {tab === 'materials' && (
          (loading || !mData) ? <Loading /> : (
            <MaterialsStatsView
              kpis={buildMaterialKpis(mData)}
              monthlyOrders={mData.trend_monthly.map(p => ({ month: monthLabel(p.month), count: p.count }))}
              topMaterials={mData.by_material.map(m => ({ name: m.material_name, value: m.material_cost }))}
              bySupplier={mData.by_supplier.map(s => ({ name: s.supplier_name, value: s.material_cost }))}
              leadTime={mData.lead_time_monthly.map(p => ({ month: monthLabel(p.month), days: p.avg_days }))}
            />
          )
        )}

        {tab === 'tools' && (
          (loading || !tData) ? <Loading /> : (
            <ToolsStatsView
              kpis={buildToolKpis(tData)}
              monthlyOrders={tData.trend_monthly.map(p => ({ month: monthLabel(p.month), count: p.count }))}
              topTools={tData.top_tools.map(t => ({ name: t.code, value: t.total_quantity }))}
              byType={tData.by_type.map(t => ({ name: t.label, value: t.quantity }))}
              lowStockByBrand={tData.low_stock_by_brand.map(b => ({ name: b.name, value: b.value }))}
            />
          )
        )}
      </StatisticsView>
    </div>
  )
}

function buildQuoteKpis(data: Statistics): StatKpi[] {
  const totalValue = data.trend_monthly.reduce((s, p) => s + p.standard + p.dies, 0)
  const avgMargin = data.margin_monthly.length === 0
    ? 0
    : data.margin_monthly.reduce((s, p) => s + p.margin_percent, 0) / data.margin_monthly.length
  return [
    { key: 'count', label: 'Preventivi', value: data.standard_count + data.dies_count, hint: 'nel periodo', icon: FileText, tone: 'primary' },
    { key: 'split', label: 'Standard / Stampi', value: `${data.standard_count} / ${data.dies_count}`, hint: 'per tipologia', icon: Layers, tone: 'info' },
    { key: 'value', label: '€ preventivato', value: eur(totalValue), hint: 'valore nel periodo', icon: Euro, tone: 'success' },
    { key: 'margin', label: 'Margine medio', value: `${avgMargin.toFixed(1).replace('.', ',')}%`, hint: 'sui preventivi', icon: Percent, tone: 'confirmed' },
  ]
}

function buildMaterialKpis(data: MaterialsStats): StatKpi[] {
  return [
    { key: 'cost', label: 'Costo materiale', value: eur(data.total_material_cost), hint: 'grezzo ordinato', icon: Euro, tone: 'success' },
    { key: 'weight', label: 'Peso totale', value: kg(data.total_weight_kg), hint: 'nel periodo', icon: Scale, tone: 'info' },
    { key: 'shipping', label: 'Spedizioni', value: eur(data.total_shipping), hint: 'costi di trasporto', icon: Truck, tone: 'warning' },
    { key: 'orders', label: 'Ordini', value: data.orders_count, hint: 'materiale emessi', icon: Package, tone: 'primary' },
  ]
}

function buildToolKpis(data: ToolsStats): StatKpi[] {
  return [
    { key: 'orders', label: 'Ordini utensili', value: data.orders_count, hint: 'nel periodo', icon: Package, tone: 'primary' },
    { key: 'qty', label: 'Quantità ordinata', value: data.total_quantity, hint: 'pezzi nel periodo', icon: Boxes, tone: 'info' },
    { key: 'distinct', label: 'Utensili distinti', value: data.distinct_tools, hint: 'codici ordinati', icon: Drill, tone: 'confirmed' },
    { key: 'low', label: 'Sotto scorta', value: data.low_stock_total, hint: 'sotto il minimo', icon: AlertTriangle, tone: 'danger' },
  ]
}
