// src/pages/statistics/QuotesStatsView.tsx
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/theme'
import { KpiCard } from '@/components/dashboard/KpiCard'
import TrendAreaCard from '@/components/charts/TrendAreaCard'
import RankBarsCard from '@/components/charts/RankBarsCard'
import DonutCard from '@/components/charts/DonutCard'
import type { StatKpi } from '@/pages/statistics/StatisticsView'

interface CustomerOption {
  value: string
  label: string
}

interface Props {
  /** local filters */
  customer: string
  customers: CustomerOption[]
  onCustomerChange: (v: string) => void
  /** 4 KPI (Preventivi, Tasso conversione, € preventivato, Margine medio) */
  kpis: StatKpi[]
  /** esito preventivi a valore € — Vinti / Persi / Aperti (con color) */
  outcome: Array<{ name: string; value: number; color?: string }>
  /** € per tipo, mensile — righe con { <xKey>, standard } */
  trendByType: Array<Record<string, string | number>>
  /** margine % mensile — righe con { <xKey>, margine } */
  monthlyMargin: Array<Record<string, string | number>>
  /** top 10 clienti — righe con { name, value } (già ordinate) */
  topCustomers: Array<Record<string, string | number>>
  /** preventivi per categoria */
  byCategory: Array<{ name: string; value: number; color?: string }>
  /** ore per macchina — { name, value } */
  hoursByMachine: Array<Record<string, string | number>>
  /** ore per lavorazione — { name, value } */
  hoursByProcess: Array<Record<string, string | number>>
  /** chiave asse X delle serie temporali (default "month") */
  xKey?: string
  /** nome serie di confronto (MoM/YoY); assente = nessun confronto */
  cmpName?: string
}

const eur = (v: number): string =>
  '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const eurK = (v: number): string => '€ ' + Math.round((v || 0) / 1000) + 'k'
const hours = (v: number): string => `${v} h`

export function QuotesStatsView({
  customer,
  customers,
  onCustomerChange,
  kpis,
  outcome,
  trendByType,
  monthlyMargin,
  topCustomers,
  byCategory,
  hoursByMachine,
  hoursByProcess,
  xKey = 'month',
  cmpName,
}: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const col = dark
    ? { standard: 'hsl(213 93% 66%)', margine: 'hsl(142 58% 52%)' }
    : { standard: 'hsl(214 90% 52%)', margine: 'hsl(142 66% 38%)' }

  return (
    <div>
      {/* Local filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative w-[210px]">
          <select
            value={customer}
            onChange={(e) => onCustomerChange(e.target.value)}
            className="h-[38px] w-full cursor-pointer appearance-none rounded-[9px] border border-input bg-background pl-3 pr-8 text-[13.5px] text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/[0.18]"
          >
            {customers.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-[11px] top-[11px] h-[15px] w-[15px] text-muted-foreground" />
        </div>
      </div>

      {/* KPI row */}
      <div className="mb-4 grid grid-cols-2 gap-[13px] sm:grid-cols-4">
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
        <TrendAreaCard
          title="Andamento preventivi (€)"
          subtitle="€ preventivato · mensile"
          data={trendByType}
          xKey={xKey}
          series={[
            { key: 'standard', name: 'Preventivato', color: col.standard },
          ]}
          yFmt={eurK}
          tipFmt={(v, n) => [eur(v), n]}
          cmpKey={cmpName ? 'cmp' : undefined}
          cmpName={cmpName}
        />
        <TrendAreaCard
          title="Margine medio mensile"
          subtitle="% sui preventivi confermati"
          data={monthlyMargin}
          xKey={xKey}
          series={[{ key: 'margine', name: 'Margine %', color: col.margine }]}
          yFmt={(v) => `${v}%`}
          tipFmt={(v, n) => [`${v}%`, n]}
          cmpKey={cmpName ? 'cmp' : undefined}
          cmpName={cmpName}
        />
        <DonutCard
          title="Esito preventivi (€)"
          subtitle="Vinti · Persi · Aperti (valore preventivato)"
          data={outcome}
        />
        <RankBarsCard
          title="Top 10 clienti (€)"
          subtitle="Valore preventivato nel periodo"
          data={topCustomers}
          labelKey="name"
          valueKey="value"
          height={330}
          barSize={12}
          valueFmt={eurK}
        />
        <DonutCard
          title="Preventivi per categoria"
          subtitle="Ripartizione per lavorazione"
          data={byCategory}
        />
        <RankBarsCard
          title="Ore per macchina"
          subtitle="Carico stimato nel periodo"
          data={hoursByMachine}
          labelKey="name"
          valueKey="value"
          labelWidth={110}
          valueFmt={hours}
        />
        <RankBarsCard
          title="Ore per lavorazione"
          subtitle="Distribuzione per tipo di lavorazione"
          data={hoursByProcess}
          labelKey="name"
          valueKey="value"
          labelWidth={96}
          valueFmt={hours}
        />
      </div>
    </div>
  )
}
