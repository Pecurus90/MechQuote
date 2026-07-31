// src/pages/statistics/PanoramicaView.tsx
// Tab "Panoramica": il quadro d'insieme in una schermata. Compone i dati
// commerciali (preventivi) e di redditività (realizzato, preventivi + vendite
// dirette). Presentazionale: dati via props da StatisticsPage.
import { KpiCard } from '@/components/dashboard/KpiCard'
import { useChartTheme } from '@/components/charts/chartTheme'
import GroupedBarsCard from '@/components/charts/GroupedBarsCard'
import RankBarsCard from '@/components/charts/RankBarsCard'
import type { StatKpi } from '@/pages/statistics/StatisticsView'

interface FunnelStage {
  label: string
  value: number
  color: string
}

interface Props {
  kpis: StatKpi[]
  /** imbuto commerciale (preventivi): Offerto → Vinto → Perso */
  commerciale: { offerto: number; vinto: number; perso: number }
  /** imbuto realizzato (tutto): Incassato → Costo → Guadagno */
  realizzato: { incassato: number; costo: number; guadagno: number }
  /** andamento mensile { month, incassato, costo } (month già etichettato) */
  trend: Array<Record<string, string | number>>
  /** top clienti per incassato — { name, value } (già ordinate) */
  topCustomers: Array<Record<string, string | number>>
}

const eur = (v: number): string =>
  '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })
const eurK = (v: number): string => '€ ' + Math.round((v || 0) / 1000) + 'k'

/** Imbuto orizzontale: barre proporzionali al valore max della striscia. */
function FunnelCard({ title, subtitle, stages }: { title: string; subtitle: string; stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => Math.abs(s.value)))
  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-4">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div className="flex flex-col gap-3">
        {stages.map((s) => (
          <div key={s.label}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[13px] text-muted-foreground">{s.label}</span>
              <span className="font-mono text-[13.5px] font-semibold text-foreground">{eur(s.value)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(2, (Math.abs(s.value) / max) * 100)}%`, background: s.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PanoramicaView({ kpis, commerciale, realizzato, trend, topCustomers }: Props) {
  const c = useChartTheme()

  return (
    <div>
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

      {/* Due imbuti: commerciale (preventivi) + realizzato (tutto) */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FunnelCard
          title="Imbuto commerciale"
          subtitle="Preventivi offerti nel periodo"
          stages={[
            { label: 'Offerto', value: commerciale.offerto, color: c.mutedBar },
            { label: 'Vinto', value: commerciale.vinto, color: c.succ },
            { label: 'Perso', value: commerciale.perso, color: c.dang },
          ]}
        />
        <FunnelCard
          title="Realizzato"
          subtitle="Business incassato · preventivi + vendite dirette"
          stages={[
            { label: 'Incassato', value: realizzato.incassato, color: c.succ },
            { label: 'Costo reale', value: realizzato.costo, color: c.warn },
            { label: 'Guadagno', value: realizzato.guadagno, color: c.blu },
          ]}
        />
      </div>

      {/* Andamento realizzato + top clienti */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GroupedBarsCard
          title="Incassato vs costo per mese"
          subtitle="La riga di fondo · preventivi + vendite dirette"
          data={trend}
          xKey="month"
          series={[
            { key: 'incassato', name: 'Incassato', color: c.succ },
            { key: 'costo', name: 'Costo', color: c.warn },
          ]}
          yFmt={eurK}
          tipFmt={(v, n) => [eur(v), n]}
        />
        <RankBarsCard
          title="Top clienti (incassato)"
          subtitle="Venduto realizzato nel periodo"
          data={topCustomers}
          labelKey="name"
          valueKey="value"
          height={330}
          barSize={12}
          valueFmt={eurK}
        />
      </div>
    </div>
  )
}
