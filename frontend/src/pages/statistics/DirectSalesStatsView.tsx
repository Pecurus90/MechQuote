// src/pages/statistics/DirectSalesStatsView.tsx
// Tab "Vendite dirette": statistiche delle SOLE vendite extra-preventivo.
// Vista isolata — nel tab Marginalità le stesse vendite sono invece sommate ai
// preventivi. Presentazionale: dati via props.
import { Info } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { useChartTheme } from '@/components/charts/chartTheme'
import GroupedBarsCard from '@/components/charts/GroupedBarsCard'
import SignedBarsCard from '@/components/charts/SignedBarsCard'
import RankBarsCard from '@/components/charts/RankBarsCard'
import DonutCard from '@/components/charts/DonutCard'
import type { StatKpi } from '@/pages/statistics/StatisticsView'

interface Props {
  kpis: StatKpi[]
  /** { month, venduto, costo } (month già etichettato) */
  monthly: Array<Record<string, string | number>>
  /** { month, guadagno } */
  guadagno: Array<Record<string, string | number>>
  /** top clienti per venduto — { name, value } (già ordinate) */
  topCustomers: Array<Record<string, string | number>>
  /** ripartizione venduto per categoria — { name, value } */
  byCategory: Array<{ name: string; value: number; color?: string }>
}

const eur = (v: number): string =>
  '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })
const eurK = (v: number): string => '€ ' + Math.round((v || 0) / 1000) + 'k'
const eurSigned = (v: number): string =>
  (v < 0 ? '−€ ' : '€ ') + Math.abs(Math.round(v || 0)).toLocaleString('it-IT')

export function DirectSalesStatsView({ kpis, monthly, guadagno, topCustomers, byCategory }: Props) {
  const c = useChartTheme()

  return (
    <div>
      {/* Banner informativo */}
      <div className="mb-4 flex items-start gap-2 rounded-[11px] border border-sales/[0.22] bg-sales/[0.08] px-3.5 py-[11px] text-[12.5px] text-foreground">
        <Info className="mt-[1px] h-4 w-4 flex-none text-sales" />
        <span>
          Solo <strong>vendite dirette</strong> (ricambi, fuori preventivo). Le stesse vendite
          confluiscono anche nel tab <strong>Marginalità</strong>, sommate ai preventivi.
        </span>
      </div>

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
          title="Venduto → Costo"
          subtitle="Confronto € nel periodo · mensile"
          data={monthly}
          xKey="month"
          series={[
            { key: 'venduto', name: 'Venduto', color: c.succ },
            { key: 'costo', name: 'Costo', color: c.warn },
          ]}
          yFmt={eurK}
          tipFmt={(v, n) => [eur(v), n]}
        />
        <SignedBarsCard
          title="Guadagno mensile"
          subtitle="Venduto − costo"
          data={guadagno}
          xKey="month"
          valueKey="guadagno"
          yFmt={eurK}
          tipFmt={(v, n) => [eurSigned(v), n]}
          valueName="Guadagno"
        />
        <RankBarsCard
          title="Top clienti (venduto)"
          subtitle="Venduto realizzato nel periodo"
          data={topCustomers}
          labelKey="name"
          valueKey="value"
          height={330}
          barSize={12}
          valueFmt={eurK}
        />
        <DonutCard
          title="Ripartizione per categoria"
          subtitle="Venduto per lettera categoria"
          data={byCategory}
        />
      </div>
    </div>
  )
}
