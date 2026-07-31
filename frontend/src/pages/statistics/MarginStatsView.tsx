// src/pages/statistics/MarginStatsView.tsx
// Tab "Marginalità & taratura" (il cuore della pagina Statistiche).
// Solo preventivi in stato completo. Presentazionale: dati via props.
import { Info } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { useChartTheme } from '@/components/charts/chartTheme'
import GroupedBarsCard from '@/components/charts/GroupedBarsCard'
import SignedBarsCard from '@/components/charts/SignedBarsCard'
import TrendAreaCard from '@/components/charts/TrendAreaCard'
import RankBarsCard from '@/components/charts/RankBarsCard'
import ChartEmpty from '@/components/charts/ChartEmpty'
import { FilterSelect } from '@/pages/statistics/StatFilterSelect'
import type { StatKpi } from '@/pages/statistics/StatisticsView'
import type { MarginMonthlyPoint, MarginBandRow, MarginWorstRow } from '@/types'

interface Coverage {
  completed: number
  withSold: number
  withCost: number
}

const FONTE_OPTIONS = [
  { value: 'all', label: 'Fonte · tutte' },
  { value: 'quotes', label: 'Solo preventivi' },
  { value: 'direct', label: 'Solo vendite dirette' },
]

interface Props {
  kpis: StatKpi[]
  /** filtro Fonte: 'all' | 'quotes' | 'direct' */
  source: string
  onSourceChange: (v: string) => void
  coverage: Coverage
  /** { month, preventivato, venduto, costo } (month già etichettato) */
  monthly: MarginMonthlyPoint[]
  /** { month, profit, cmp? } */
  profit: Array<Record<string, string | number>>
  /** { month, preventivi, vendite_dirette } — incassato/mese per fonte (stacked) */
  incassato: Array<Record<string, string | number>>
  /** { band, count } — istogramma scostamento prezzo */
  distribution: MarginBandRow[]
  worst: MarginWorstRow[]
  /** { name, value } — top clienti per venduto realizzato (incassato) */
  topCustomersSold: Array<Record<string, string | number>>
  /** nome serie di confronto (MoM/YoY); presente = degrada Guadagno ad Area+cmp */
  cmpName?: string
}

const eur = (v: number): string =>
  '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })
const eurK = (v: number): string => '€ ' + Math.round((v || 0) / 1000) + 'k'
const eurSigned = (v: number): string =>
  (v < 0 ? '−€ ' : '€ ') + Math.abs(Math.round(v || 0)).toLocaleString('it-IT')

export function MarginStatsView({ kpis, source, onSourceChange, coverage, monthly, profit, incassato, distribution, worst, topCustomersSold, cmpName }: Props) {
  const c = useChartTheme()
  // Degradazione graziosa: se il costo reale è raramente compilato, mostriamo
  // la sola parte prezzo e avvisiamo. Soglia: nessun costo, o < 60% di copertura.
  const costCoverage = coverage.completed > 0 ? coverage.withCost / coverage.completed : 0
  const showCostWarning = coverage.withCost === 0 || costCoverage < 0.6

  return (
    <div>
      {/* Filtro Fonte */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <FilterSelect value={source} options={FONTE_OPTIONS} onChange={onSourceChange} width={210} />
      </div>

      {/* Banner informativo (definizioni) */}
      <div className="mb-4 flex items-start gap-2 rounded-[11px] border border-stats/[0.22] bg-stats/[0.08] px-3.5 py-[11px] text-[12.5px] text-foreground">
        <Info className="mt-[1px] h-4 w-4 flex-none text-stats" />
        <span>
          Preventivi <strong>completi</strong> + vendite dirette. Incassato = venduto realizzato.
          Guadagno reale = venduto − costo reale (incl. vendite dirette). Taratura prezzo =
          venduto ÷ preventivato (solo vendite con preventivo al volo) · Taratura costo = costo reale ÷ stimato.
        </span>
      </div>

      {/* Avviso degradazione (costo reale insufficiente) */}
      {showCostWarning && (
        <div className="mb-4 flex items-start gap-2 rounded-[10px] border border-warning/[0.28] bg-warning/[0.10] px-3.5 py-[11px] text-[12.5px] text-foreground">
          <Info className="mt-[1px] h-4 w-4 flex-none text-warning" />
          <span>
            Compila il consuntivo costo per vedere il guadagno reale. Solo{' '}
            <strong>{coverage.withCost}/{coverage.completed}</strong> preventivi hanno il costo reale.
          </span>
        </div>
      )}

      {/* KPI row */}
      <div className="mb-4 grid grid-cols-2 gap-[13px] sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <KpiCard
            key={k.key}
            label={k.label}
            value={k.value}
            hint={k.hint}
            icon={k.icon}
            tone={k.tone}
            valueToned={k.valueToned}
            delta={k.delta}
          />
        ))}
      </div>

      {/* Chart grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GroupedBarsCard
          title="Preventivato → Venduto → Costo reale"
          subtitle="Confronto € nel periodo · mensile"
          data={monthly as unknown as Array<Record<string, string | number>>}
          xKey="month"
          series={[
            { key: 'preventivato', name: 'Preventivato', color: c.mutedBar },
            { key: 'venduto', name: 'Venduto', color: c.succ },
            { key: 'costo', name: 'Costo reale', color: c.warn },
          ]}
          yFmt={eurK}
          tipFmt={(v, n) => [eur(v), n]}
        />
        <GroupedBarsCard
          title="Incassato per mese — preventivi vs vendite dirette"
          subtitle="Venduto realizzato per fonte · barre impilate"
          data={incassato}
          xKey="month"
          stacked
          series={[
            { key: 'preventivi', name: 'Preventivi', color: c.blu },
            { key: 'vendite_dirette', name: 'Vendite dirette', color: c.warn },
          ]}
          yFmt={eurK}
          tipFmt={(v, n) => [eur(v), n]}
        />
        <RankBarsCard
          title="Top clienti (venduto)"
          subtitle="Incassato realizzato · preventivi + vendite dirette"
          data={topCustomersSold}
          labelKey="name"
          valueKey="value"
          height={330}
          barSize={12}
          valueFmt={eurK}
        />
        {cmpName ? (
          <TrendAreaCard
            title="Guadagno reale mensile"
            subtitle="Venduto − costo reale"
            data={profit}
            xKey="month"
            series={[{ key: 'profit', name: 'Guadagno', color: c.succ }]}
            yFmt={eurK}
            tipFmt={(v, n) => [eurSigned(v), n]}
            cmpKey="cmp"
            cmpName={cmpName}
          />
        ) : (
          <SignedBarsCard
            title="Guadagno reale mensile"
            subtitle="Venduto − costo reale"
            data={profit}
            xKey="month"
            valueKey="profit"
            yFmt={eurK}
            tipFmt={(v, n) => [eurSigned(v), n]}
            valueName="Guadagno"
          />
        )}
        <GroupedBarsCard
          title="Distribuzione scostamento prezzo"
          subtitle="Venduto ÷ preventivato · n. voci per fascia"
          data={distribution as unknown as Array<Record<string, string | number>>}
          xKey="band"
          series={[{ key: 'count', name: 'Voci', color: c.blu }]}
          yWidth={30}
          tipFmt={(v) => [`${v} voci`, 'Voci']}
        />

        {/* Peggiori scostamenti (tabella) */}
        <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
          <div className="mb-3">
            <div className="text-[15px] font-semibold text-foreground">Peggiori scostamenti</div>
            <div className="text-xs text-muted-foreground">Venduto molto sotto il preventivato</div>
          </div>
          {worst.length === 0 ? (
            <ChartEmpty height={230} />
          ) : (
            <div className="max-h-[280px] overflow-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase text-muted-foreground">
                    <th className="px-2 py-[9px] text-left">Numero</th>
                    <th className="px-2 py-[9px] text-left">Cliente</th>
                    <th className="px-2 py-[9px] text-right">Prev.</th>
                    <th className="px-2 py-[9px] text-right">Venduto</th>
                    <th className="px-2 py-[9px] text-right">Costo</th>
                    <th className="px-2 py-[9px] text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {worst.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-[9px] font-mono text-foreground">{r.quote_number}</td>
                      <td className="px-2 py-[9px] text-foreground">{r.customer_name}</td>
                      <td className="px-2 py-[9px] text-right font-mono text-muted-foreground">{eur(r.preventivato)}</td>
                      <td className="px-2 py-[9px] text-right font-mono text-foreground">{eur(r.venduto)}</td>
                      <td className="px-2 py-[9px] text-right font-mono text-muted-foreground">
                        {r.costo_reale != null ? eur(r.costo_reale) : '—'}
                      </td>
                      <td className="px-2 py-[9px] text-right font-mono font-semibold text-danger">
                        {r.delta_percent > 0 ? '+' : ''}{r.delta_percent.toLocaleString('it-IT', { maximumFractionDigits: 0 })}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
