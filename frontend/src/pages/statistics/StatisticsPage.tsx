// Sezione Statistiche & Grafici — container (design handoff).
// Shell StatisticsView (header + periodo + tab bar) + 3 tab presentazionali.
// - Preventivi: dati reali /dashboard/statistics (mappa 1:1)
// - Materiali: adattato ai dati esistenti (no spesa €/mese né per famiglia)
// - Utensili: sola quantità (scelta utente) + sotto scorta per marca
import { useEffect, useState } from 'react'
import {
  FileText, Target, Euro, Percent, Scale, Truck, Package, Boxes, Drill, AlertTriangle,
  Wallet, Tag, Crosshair, Database,
} from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Statistics, MaterialsStats, ToolsStats, MarginStats } from '@/types'
import { StatisticsView } from '@/pages/statistics/StatisticsView'
import type { StatTab, StatPeriod, StatCompare, StatKpi } from '@/pages/statistics/StatisticsView'
import { QuotesStatsView } from '@/pages/statistics/QuotesStatsView'
import type { QuoteStatType } from '@/pages/statistics/QuotesStatsView'
import { MarginStatsView } from '@/pages/statistics/MarginStatsView'
import { MaterialsStatsView } from '@/pages/statistics/MaterialsStatsView'
import { ToolsStatsView } from '@/pages/statistics/ToolsStatsView'
import { type Period, Loading } from '@/pages/statistics/statsShared'
import { MATERIAL_FAMILIES } from '@/lib/materialFamilies'

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

// Fallback difensivo: se la risposta non porta `outcome` (es. backend non
// aggiornato) la pagina non deve andare in bianco.
const EMPTY_OUTCOME = {
  won_count: 0, lost_count: 0, open_count: 0,
  won_value: 0, lost_value: 0, open_value: 0,
  conversion_rate: 0, conversion_rate_value: 0,
}

interface NamedOpt { id: number; name: string }

export default function StatisticsPage() {
  const [tab, setTab] = useState<StatTab>('quotes')
  const [period, setPeriod] = useState<StatPeriod>('current_year')
  const [compare, setCompare] = useState<StatCompare>('none')

  // Filtri locali tab Preventivi.
  const [quoteType, setQuoteType] = useState<QuoteStatType>('all')
  const [customer, setCustomer] = useState<string>('all')
  const [customers, setCustomers] = useState<NamedOpt[]>([])

  // Filtri locali tab Materiali (supplier_id, family slug) e Utensili (nomi).
  const [matSupplier, setMatSupplier] = useState<string>('all')
  const [matFamily, setMatFamily] = useState<string>('all')
  const [matSuppliers, setMatSuppliers] = useState<NamedOpt[]>([])
  const [toolType, setToolType] = useState<string>('all')
  const [toolSupplier, setToolSupplier] = useState<string>('all')
  const [toolTypes, setToolTypes] = useState<NamedOpt[]>([])
  const [toolSuppliers, setToolSuppliers] = useState<NamedOpt[]>([])

  const [qData, setQData] = useState<Statistics | null>(null)
  const [gData, setGData] = useState<MarginStats | null>(null)
  const [mData, setMData] = useState<MaterialsStats | null>(null)
  const [tData, setTData] = useState<ToolsStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => undefined)
    api.get('/material-suppliers').then(r => setMatSuppliers(r.data)).catch(() => undefined)
    api.get('/tools/types').then(r => setToolTypes(r.data)).catch(() => undefined)
    api.get('/tools/suppliers').then(r => setToolSuppliers(r.data)).catch(() => undefined)
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
    } else if (tab === 'margin') {
      api.get(`/dashboard/statistics/margin?period=${p}`).then(r => setGData(r.data))
        .catch(() => toast.error('Errore caricamento marginalità')).finally(done)
    } else if (tab === 'materials') {
      const params = new URLSearchParams({ period: p })
      if (matSupplier !== 'all') params.set('supplier_id', matSupplier)
      if (matFamily !== 'all') params.set('family', matFamily)
      api.get(`/dashboard/statistics/orders-materials?${params}`).then(r => setMData(r.data))
        .catch(() => toast.error('Errore caricamento statistiche materiali')).finally(done)
    } else {
      const params = new URLSearchParams({ period: p })
      if (toolType !== 'all') params.set('tool_type', toolType)
      if (toolSupplier !== 'all') params.set('supplier', toolSupplier)
      api.get(`/dashboard/statistics/tools?${params}`).then(r => setTData(r.data))
        .catch(() => toast.error('Errore caricamento statistiche utensili')).finally(done)
    }
  }, [tab, period, quoteType, customer, matSupplier, matFamily, toolType, toolSupplier])

  return (
    <div className="px-6 pb-10 pt-[22px]">
      <StatisticsView
        activeTab={tab}
        onTabChange={setTab}
        period={period}
        onPeriodChange={setPeriod}
        compare={compare}
        onCompareChange={setCompare}
      >
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
              outcome={[
                { name: 'Vinti', value: (qData.outcome ?? EMPTY_OUTCOME).won_value, color: 'hsl(142 66% 40%)' },
                { name: 'Persi', value: (qData.outcome ?? EMPTY_OUTCOME).lost_value, color: 'hsl(349 75% 52%)' },
                { name: 'Aperti', value: (qData.outcome ?? EMPTY_OUTCOME).open_value, color: 'hsl(220 9% 60%)' },
              ]}
              trendByType={qData.trend_monthly.map(p => ({ month: monthLabel(p.month), standard: p.standard, stampi: p.dies }))}
              monthlyMargin={qData.margin_monthly.map(p => ({ month: monthLabel(p.month), margine: p.margin_percent }))}
              topCustomers={qData.top_customers.map(c => ({ name: c.customer_name ?? '—', value: c.total }))}
              byCategory={qData.by_category.map(c => ({ name: c.category_code, value: c.count }))}
              hoursByMachine={qData.hours_by_machine.map(h => ({ name: h.label, value: h.hours }))}
              hoursByProcess={qData.hours_by_operation.map(h => ({ name: h.label, value: h.hours }))}
            />
          )
        )}

        {tab === 'margin' && (
          (loading || !gData) ? <Loading /> : (
            <MarginStatsView
              kpis={buildMarginKpis(gData)}
              coverage={{ completed: gData.completed_count, withSold: gData.with_sold_count, withCost: gData.with_cost_count }}
              monthly={gData.monthly}
              profit={gData.profit_monthly}
              distribution={gData.distribution}
              worst={gData.worst}
            />
          )
        )}

        {tab === 'materials' && (
          (loading || !mData) ? <Loading /> : (
            <MaterialsStatsView
              kpis={buildMaterialKpis(mData)}
              supplier={matSupplier}
              suppliers={[
                { value: 'all', label: 'Fornitore · tutti' },
                ...matSuppliers.map(s => ({ value: String(s.id), label: s.name })),
              ]}
              onSupplierChange={setMatSupplier}
              family={matFamily}
              families={[
                { value: 'all', label: 'Tipo materiale · tutti' },
                ...MATERIAL_FAMILIES.map(f => ({ value: f.slug, label: f.label })),
              ]}
              onFamilyChange={setMatFamily}
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
              toolType={toolType}
              toolTypes={[
                { value: 'all', label: 'Tipo utensile · tutti' },
                ...toolTypes.map(t => ({ value: t.name, label: t.name })),
              ]}
              onToolTypeChange={setToolType}
              supplier={toolSupplier}
              suppliers={[
                { value: 'all', label: 'Fornitore · tutti' },
                ...toolSuppliers.map(s => ({ value: s.name, label: s.name })),
              ]}
              onSupplierChange={setToolSupplier}
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
  const o = data.outcome ?? EMPTY_OUTCOME
  return [
    { key: 'count', label: 'Preventivi', value: data.standard_count + data.dies_count, hint: `${data.standard_count} std · ${data.dies_count} stampi`, icon: FileText, tone: 'primary' },
    { key: 'conversion', label: 'Tasso conversione', value: `${o.conversion_rate.toFixed(1).replace('.', ',')}%`, hint: `${o.won_count} vinti · ${o.lost_count} persi · ${o.conversion_rate_value.toFixed(0)}% a valore`, icon: Target, tone: 'confirmed' },
    { key: 'value', label: '€ preventivato', value: eur(totalValue), hint: 'valore nel periodo', icon: Euro, tone: 'success' },
    { key: 'margin', label: 'Margine medio', value: `${avgMargin.toFixed(1).replace('.', ',')}%`, hint: 'sui preventivi', icon: Percent, tone: 'info' },
  ]
}

function buildMarginKpis(d: MarginStats): StatKpi[] {
  const ratio = (v: number | null): string =>
    v == null ? '—' : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return [
    { key: 'profit', label: 'Guadagno reale', value: d.guadagno_reale == null ? '—' : eur(d.guadagno_reale), hint: 'venduto − costo reale', icon: Wallet, tone: 'success', valueToned: true },
    { key: 'price', label: 'Scostamento prezzo', value: ratio(d.taratura_prezzo), hint: 'venduto ÷ preventivato', icon: Tag, tone: 'warning' },
    { key: 'cost', label: 'Precisione costo', value: ratio(d.taratura_costo), hint: 'costo reale ÷ stimato', icon: Crosshair, tone: 'danger' },
    { key: 'coverage', label: 'Copertura dato', value: `${d.with_sold_count}/${d.completed_count}`, hint: `${d.with_sold_count} col venduto · ${d.with_cost_count} col costo reale`, icon: Database, tone: 'info' },
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
