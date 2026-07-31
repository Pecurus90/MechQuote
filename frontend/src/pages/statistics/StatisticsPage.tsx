// Sezione Statistiche & Grafici — container.
// Shell StatisticsView (header + periodo + confronto + tab bar) + 4 tab:
// - Panoramica:  quadro d'insieme (compone commerciale + redditività)
// - Commerciale: imbuto offerto/vinto/perso sui preventivi (/dashboard/statistics)
// - Redditività: incassato/guadagno/taratura, filtro Fonte (/…/margin?source=)
// - Acquisti:    Materiali + Utensili sotto un selettore interno
import { useEffect, useState } from 'react'
import {
  FileText, Target, Euro, Percent, Scale, Truck, Package, Boxes, Drill, AlertTriangle,
  Wallet, Tag, Crosshair, Database, Banknote, Trophy, XCircle,
} from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Statistics, MaterialsStats, ToolsStats, MarginStats } from '@/types'
import { StatisticsView } from '@/pages/statistics/StatisticsView'
import type { StatTab, StatPeriod, StatCompare, StatKpi } from '@/pages/statistics/StatisticsView'
import { PanoramicaView } from '@/pages/statistics/PanoramicaView'
import { QuotesStatsView } from '@/pages/statistics/QuotesStatsView'
import { MarginStatsView } from '@/pages/statistics/MarginStatsView'
import { AcquistiView, type AcquistiInner } from '@/pages/statistics/AcquistiView'
import { MaterialsStatsView } from '@/pages/statistics/MaterialsStatsView'
import { ToolsStatsView } from '@/pages/statistics/ToolsStatsView'
import { type Period, Loading } from '@/pages/statistics/statsShared'
import { buildDelta } from '@/pages/statistics/statDelta'
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
const pct = (v: number): string => `${v.toFixed(1).replace('.', ',')}%`

// Fallback difensivo: se la risposta non porta `outcome` (es. backend non
// aggiornato) la pagina non deve andare in bianco.
const EMPTY_OUTCOME = {
  won_count: 0, lost_count: 0, open_count: 0,
  won_value: 0, lost_value: 0, open_value: 0,
  conversion_rate: 0, conversion_rate_value: 0,
}

interface NamedOpt { id: number; name: string }

export default function StatisticsPage() {
  const [tab, setTab] = useState<StatTab>('overview')
  const [period, setPeriod] = useState<StatPeriod>('current_year')
  const [compare, setCompare] = useState<StatCompare>('none')

  // Filtri locali tab Commerciale.
  const [customer, setCustomer] = useState<string>('all')
  const [customers, setCustomers] = useState<NamedOpt[]>([])

  // Filtro Fonte tab Redditività.
  const [source, setSource] = useState<string>('all')

  // Tab Acquisti: selettore interno + filtri Materiali / Utensili.
  const [acqInner, setAcqInner] = useState<AcquistiInner>('materials')
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
    if (tab === 'overview') {
      // Panoramica: compone i due endpoint (commerciale + realizzato), sempre
      // periodo pieno, niente confronto né filtro fonte.
      Promise.all([
        api.get(`/dashboard/statistics?period=${p}`).then(r => setQData(r.data)),
        api.get(`/dashboard/statistics/margin?period=${p}`).then(r => setGData(r.data)),
      ]).catch(() => toast.error('Errore caricamento panoramica')).finally(done)
    } else if (tab === 'commerciale') {
      const params = new URLSearchParams({ period: p })
      if (customer !== 'all') params.set('customer_id', customer)
      if (compare !== 'none') params.set('compare', compare)
      api.get(`/dashboard/statistics?${params}`).then(r => setQData(r.data))
        .catch(() => toast.error('Errore caricamento statistiche commerciali')).finally(done)
    } else if (tab === 'redditivita') {
      const params = new URLSearchParams({ period: p })
      if (compare !== 'none') params.set('compare', compare)
      if (source !== 'all') params.set('source', source)
      api.get(`/dashboard/statistics/margin?${params}`).then(r => setGData(r.data))
        .catch(() => toast.error('Errore caricamento redditività')).finally(done)
    } else if (acqInner === 'materials') {
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
  }, [tab, period, compare, customer, source, matSupplier, matFamily, toolType, toolSupplier, acqInner])

  // Etichette del confronto (MoM/YoY) — usate su pill KPI e serie cmp.
  const vs = compare === 'prev' ? 'vs periodo prec.' : compare === 'yoy' ? 'vs anno scorso' : ''
  const cmpSeriesName = compare === 'prev' ? 'Periodo prec.' : compare === 'yoy' ? 'Anno scorso' : undefined

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
        {tab === 'overview' && (
          (loading || !qData || !gData) ? <Loading /> : (
            <PanoramicaView
              kpis={buildOverviewKpis(qData, gData)}
              commerciale={{
                offerto: qData.trend_monthly.reduce((s, p) => s + p.standard, 0),
                vinto: (qData.outcome ?? EMPTY_OUTCOME).won_value,
                perso: (qData.outcome ?? EMPTY_OUTCOME).lost_value,
              }}
              realizzato={{
                incassato: gData.incassato,
                costo: gData.monthly.reduce((s, m) => s + m.costo, 0),
                guadagno: gData.guadagno_reale ?? 0,
              }}
              trend={gData.monthly.map(m => ({ month: monthLabel(m.month), incassato: m.venduto, costo: m.costo }))}
              topCustomers={gData.top_customers_sold.map(c => ({ name: c.customer_name, value: c.total }))}
            />
          )
        )}

        {tab === 'commerciale' && (
          (loading || !qData) ? <Loading /> : (
            <QuotesStatsView
              customer={customer}
              customers={[
                { value: 'all', label: 'Cliente · tutti' },
                ...customers.map(c => ({ value: String(c.id), label: c.name })),
              ]}
              onCustomerChange={setCustomer}
              kpis={buildQuoteKpis(qData, vs)}
              cmpName={qData.comparison ? cmpSeriesName : undefined}
              outcome={[
                { name: 'Vinti', value: (qData.outcome ?? EMPTY_OUTCOME).won_value, color: 'hsl(142 66% 40%)' },
                { name: 'Persi', value: (qData.outcome ?? EMPTY_OUTCOME).lost_value, color: 'hsl(349 75% 52%)' },
                { name: 'Aperti', value: (qData.outcome ?? EMPTY_OUTCOME).open_value, color: 'hsl(220 9% 60%)' },
              ]}
              trendByType={qData.trend_monthly.map((p, i) => ({
                month: monthLabel(p.month), standard: p.standard,
                ...(qData.comparison ? { cmp: qData.comparison.trend_total[i]?.value ?? 0 } : {}),
              }))}
              monthlyMargin={qData.margin_monthly.map((p, i) => ({
                month: monthLabel(p.month), margine: p.margin_percent,
                ...(qData.comparison ? { cmp: qData.comparison.margin_by_month[i]?.value ?? 0 } : {}),
              }))}
              topCustomers={qData.top_customers.map(c => ({ name: c.customer_name ?? '—', value: c.total }))}
              byCategory={qData.by_category.map(c => ({ name: c.category_code, value: c.count }))}
              hoursByMachine={qData.hours_by_machine.map(h => ({ name: h.label, value: h.hours }))}
              hoursByProcess={qData.hours_by_operation.map(h => ({ name: h.label, value: h.hours }))}
              lostByCustomer={qData.lost_by_customer.map(c => ({ name: c.customer_name ?? '—', value: c.total }))}
              lostMonthly={qData.lost_monthly.map(p => ({ month: monthLabel(p.month), value: p.standard }))}
            />
          )
        )}

        {tab === 'redditivita' && (
          (loading || !gData) ? <Loading /> : (
            <MarginStatsView
              kpis={buildMarginKpis(gData, vs)}
              source={source}
              onSourceChange={setSource}
              coverage={{ completed: gData.completed_count, withSold: gData.with_sold_count, withCost: gData.with_cost_count }}
              monthly={gData.monthly.map(m => ({ ...m, month: monthLabel(m.month) }))}
              profit={gData.profit_monthly.map((p, i) => ({
                month: monthLabel(p.month), profit: p.profit,
                ...(gData.comparison ? { cmp: gData.comparison.profit_by_month[i]?.profit ?? 0 } : {}),
              }))}
              incassato={gData.incassato_monthly.map(p => ({
                month: monthLabel(p.month), preventivi: p.preventivi, vendite_dirette: p.vendite_dirette,
              }))}
              distribution={gData.distribution}
              worst={gData.worst}
              topCustomersSold={gData.top_customers_sold.map(c => ({ name: c.customer_name, value: c.total }))}
              cmpName={gData.comparison ? cmpSeriesName : undefined}
            />
          )
        )}

        {tab === 'acquisti' && (
          <AcquistiView inner={acqInner} onInnerChange={setAcqInner}>
            {acqInner === 'materials' ? (
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
            ) : (
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
          </AcquistiView>
        )}
      </StatisticsView>
    </div>
  )
}

// Panoramica: 5 KPI che riassumono commerciale (offerto/conversione) e
// realizzato (incassato/guadagno/margine reale).
function buildOverviewKpis(q: Statistics, g: MarginStats): StatKpi[] {
  const offerto = q.trend_monthly.reduce((s, p) => s + p.standard, 0)
  const o = q.outcome ?? EMPTY_OUTCOME
  const guadagno = g.guadagno_reale ?? 0
  const margineReale = g.incassato > 0 ? (guadagno / g.incassato) * 100 : null
  return [
    { key: 'offerto', label: '€ offerto', value: eur(offerto), hint: 'preventivi offerti nel periodo', icon: Euro, tone: 'info' },
    { key: 'conv', label: 'Tasso conversione', value: pct(o.conversion_rate), hint: 'vinti ÷ decisi', icon: Target, tone: 'confirmed' },
    { key: 'incassato', label: 'Incassato', value: eur(g.incassato), hint: 'venduto realizzato · tutto', icon: Banknote, tone: 'success', valueToned: true },
    { key: 'guadagno', label: 'Guadagno reale', value: g.guadagno_reale == null ? '—' : eur(guadagno), hint: 'incassato − costo reale', icon: Wallet, tone: 'success', valueToned: true },
    { key: 'margine', label: 'Margine reale', value: margineReale == null ? '—' : pct(margineReale), hint: 'guadagno ÷ incassato', icon: Percent, tone: 'info' },
  ]
}

function buildQuoteKpis(data: Statistics, vs: string): StatKpi[] {
  const totalValue = data.trend_monthly.reduce((s, p) => s + p.standard, 0)
  const count = data.standard_count
  const avgMargin = data.margin_monthly.length === 0
    ? 0
    : data.margin_monthly.reduce((s, p) => s + p.margin_percent, 0) / data.margin_monthly.length
  const o = data.outcome ?? EMPTY_OUTCOME
  const c = data.comparison
  return [
    { key: 'count', label: 'Preventivi', value: count, hint: 'offerti nel periodo', icon: FileText, tone: 'primary', delta: buildDelta(count, c?.count, 'pct_rel', 'higher', vs) },
    { key: 'value', label: '€ offerto', value: eur(totalValue), hint: 'offerto nel periodo', icon: Euro, tone: 'info', delta: buildDelta(totalValue, c?.total_value, 'eur', 'higher', vs) },
    { key: 'won', label: '€ vinto', value: eur(o.won_value), hint: `${o.won_count} vinti · venduto realizzato`, icon: Trophy, tone: 'success', valueToned: true },
    { key: 'lost', label: '€ perso', value: eur(o.lost_value), hint: `${o.lost_count} non ordinati`, icon: XCircle, tone: 'danger', valueToned: true },
    { key: 'conversion', label: 'Tasso conversione', value: pct(o.conversion_rate), hint: 'vinti ÷ decisi', icon: Target, tone: 'confirmed', delta: buildDelta(o.conversion_rate, c?.conversion_rate, 'point', 'higher', vs) },
    { key: 'margin', label: 'Margine medio', value: pct(avgMargin), hint: 'sui preventivi offerti', icon: Percent, tone: 'info', delta: buildDelta(avgMargin, c?.avg_margin, 'point', 'higher', vs) },
  ]
}

function buildMarginKpis(d: MarginStats, vs: string): StatKpi[] {
  const ratio = (v: number | null): string =>
    v == null ? '—' : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const c = d.comparison
  return [
    { key: 'incassato', label: 'Incassato', value: eur(d.incassato), hint: 'venduto realizzato', icon: Banknote, tone: 'success', valueToned: true },
    { key: 'profit', label: 'Guadagno reale', value: d.guadagno_reale == null ? '—' : eur(d.guadagno_reale), hint: 'venduto − costo reale', icon: Wallet, tone: 'success', valueToned: true, delta: buildDelta(d.guadagno_reale, c?.guadagno_reale, 'eur', 'higher', vs) },
    { key: 'price', label: 'Scostamento prezzo', value: ratio(d.taratura_prezzo), hint: 'venduto ÷ preventivato', icon: Tag, tone: 'warning', delta: buildDelta(d.taratura_prezzo, c?.taratura_prezzo, 'ratio_point', 'higher', vs) },
    { key: 'cost', label: 'Precisione costo', value: ratio(d.taratura_costo), hint: 'costo reale ÷ stimato', icon: Crosshair, tone: 'danger', delta: buildDelta(d.taratura_costo, c?.taratura_costo, 'ratio_point', 'closer_to_1', vs) },
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
