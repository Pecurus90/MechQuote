// src/pages/statistics/MaterialsStatsView.tsx
// Adattato ai dati realmente esposti da /dashboard/statistics/orders-materials
// (niente spesa €/mese né spesa per famiglia lato backend): mostra andamento
// ordini, top materiali per costo, costo per fornitore e lead time.
import { useTheme } from '@/lib/theme'
import { KpiCard } from '@/components/dashboard/KpiCard'
import TrendAreaCard from '@/components/charts/TrendAreaCard'
import RankBarsCard from '@/components/charts/RankBarsCard'
import DonutCard from '@/components/charts/DonutCard'
import { FilterSelect, type FilterOption } from '@/pages/statistics/StatFilterSelect'
import type { StatKpi } from '@/pages/statistics/StatisticsView'

type SelectOption = FilterOption

interface Props {
  kpis: StatKpi[]
  /** filtri locali */
  supplier: string
  suppliers: SelectOption[]
  onSupplierChange: (v: string) => void
  family: string
  families: SelectOption[]
  onFamilyChange: (v: string) => void
  /** ordini materiale per mese — righe { <xKey>, count } */
  monthlyOrders: Array<Record<string, string | number>>
  /** top materiali per costo (€) — righe { name, value } (già ordinate) */
  topMaterials: Array<Record<string, string | number>>
  /** costo per fornitore (€) — distribuzione donut */
  bySupplier: Array<{ name: string; value: number; color?: string }>
  /** lead time confermato → ordine — righe { <xKey>, days } */
  leadTime: Array<Record<string, string | number>>
  xKey?: string
}

const eurK = (v: number): string => '€ ' + Math.round((v || 0) / 1000) + 'k'

export function MaterialsStatsView({
  kpis,
  supplier,
  suppliers,
  onSupplierChange,
  family,
  families,
  onFamilyChange,
  monthlyOrders,
  topMaterials,
  bySupplier,
  leadTime,
  xKey = 'month',
}: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const col = dark
    ? { ordini: 'hsl(187 85% 53%)', lead: 'hsl(213 93% 66%)' }
    : { ordini: 'hsl(188 90% 34%)', lead: 'hsl(214 90% 52%)' }

  return (
    <div>
      {/* Filtri locali */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <FilterSelect value={supplier} options={suppliers} onChange={onSupplierChange} />
        <FilterSelect value={family} options={families} onChange={onFamilyChange} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-[13px] sm:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard
            key={k.key}
            label={k.label}
            value={k.value}
            hint={k.hint}
            icon={k.icon}
            tone={k.tone}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendAreaCard
          title="Andamento ordini"
          subtitle="Ordini materiale emessi · mensile"
          data={monthlyOrders}
          xKey={xKey}
          series={[{ key: 'count', name: 'Ordini', color: col.ordini }]}
        />
        <RankBarsCard
          title="Top materiali per costo (€)"
          subtitle="Grezzo ordinato nel periodo"
          data={topMaterials}
          labelKey="name"
          valueKey="value"
          labelWidth={112}
          valueFmt={eurK}
        />
        <DonutCard
          title="Costo per fornitore"
          subtitle="Ripartizione spesa grezzo"
          data={bySupplier}
        />
        <TrendAreaCard
          title="Lead time confermato → ordine"
          subtitle="Giorni medi · mensile"
          data={leadTime}
          xKey={xKey}
          series={[{ key: 'days', name: 'Giorni', color: col.lead }]}
          yFmt={(v) => `${v}g`}
          tipFmt={(v, n) => [`${Number(v).toFixed(1)} giorni`, n]}
        />
      </div>
    </div>
  )
}
