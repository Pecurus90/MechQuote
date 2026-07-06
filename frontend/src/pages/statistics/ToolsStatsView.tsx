// src/pages/statistics/ToolsStatsView.tsx
// Adattato a SOLA QUANTITÀ (scelta utente: gli utensili non hanno un costo a
// catalogo). Niente grafici a €: andamento ordini, top utensili più ordinati,
// ripartizione per tipo, sotto scorta per marca.
import { useTheme } from '@/lib/theme'
import { KpiCard } from '@/components/dashboard/KpiCard'
import TrendAreaCard from '@/components/charts/TrendAreaCard'
import RankBarsCard from '@/components/charts/RankBarsCard'
import DonutCard from '@/components/charts/DonutCard'
import type { StatKpi } from '@/pages/statistics/StatisticsView'

interface Props {
  kpis: StatKpi[]
  /** ordini utensili per mese — righe { <xKey>, count } */
  monthlyOrders: Array<Record<string, string | number>>
  /** top utensili più ordinati (pz) — righe { name, value } (già ordinate) */
  topTools: Array<Record<string, string | number>>
  /** ripartizione per tipo utensile (quantità) */
  byType: Array<{ name: string; value: number; color?: string }>
  /** utensili sotto scorta per marca — righe { name, value } */
  lowStockByBrand: Array<Record<string, string | number>>
  xKey?: string
}

export function ToolsStatsView({
  kpis,
  monthlyOrders,
  topTools,
  byType,
  lowStockByBrand,
  xKey = 'month',
}: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const col = dark ? { ordini: 'hsl(263 84% 72%)' } : { ordini: 'hsl(262 78% 56%)' }

  return (
    <div>
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
          subtitle="Ordini utensili emessi · mensile"
          data={monthlyOrders}
          xKey={xKey}
          series={[{ key: 'count', name: 'Ordini', color: col.ordini }]}
        />
        <RankBarsCard
          title="Top utensili più ordinati"
          subtitle="Quantità nel periodo"
          data={topTools}
          labelKey="name"
          valueKey="value"
          labelWidth={112}
          unit="pz"
        />
        <DonutCard title="Ripartizione per tipo" subtitle="Quantità ordinata per tipo" data={byType} />
        <RankBarsCard
          title="Sotto scorta per marca"
          subtitle="Utensili sotto il minimo"
          data={lowStockByBrand}
          labelKey="name"
          valueKey="value"
          labelWidth={90}
          barSize={15}
          unit="utensili"
        />
      </div>
    </div>
  )
}
