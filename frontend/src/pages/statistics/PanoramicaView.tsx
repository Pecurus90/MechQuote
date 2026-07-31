// src/pages/statistics/PanoramicaView.tsx
// Tab "Panoramica": il quadro d'insieme in una schermata. Tre riepiloghi
// affiancati — Preventivi, Vendite dirette, Totale (confronto + somma) — così
// il valore di OGNI fonte è esposto in chiaro, senza filtri. Sotto: barra di
// confronto incassato + andamento realizzato + top clienti.
// Presentazionale: dati via props da StatisticsPage.
import { FileText, HandCoins, Sigma } from 'lucide-react'
import { useChartTheme } from '@/components/charts/chartTheme'
import GroupedBarsCard from '@/components/charts/GroupedBarsCard'
import RankBarsCard from '@/components/charts/RankBarsCard'
import { cn } from '@/lib/utils'

interface Props {
  /** riepilogo preventivi (completi) */
  preventivi: { offerto: number; vinto: number; incassato: number; guadagno: number | null; costo: number }
  /** riepilogo vendite dirette */
  dirette: { venduto: number; costo: number; guadagno: number | null }
  /** totale combinato (preventivi + vendite dirette) */
  totale: { incassato: number; costo: number; guadagno: number | null; margine: number | null }
  /** andamento realizzato mensile { month, incassato, costo } (month già etichettato) */
  trend: Array<Record<string, string | number>>
  /** top clienti per incassato — { name, value } (già ordinate) */
  topCustomers: Array<Record<string, string | number>>
}

const eur = (v: number | null): string =>
  v == null ? '—' : '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })
const pct = (v: number | null): string => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`)

interface Row { label: string; value: string; strong?: boolean; tone?: string }

function RiepilogoCard({
  title, icon: Icon, accent, rows,
}: { title: string; icon: typeof FileText; accent: string; rows: Row[] }) {
  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-[8px]" style={{ background: `${accent}20`, color: accent }}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[15px] font-semibold text-foreground">{title}</span>
      </div>
      <div>
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between border-b border-border/60 py-[7px] last:border-0">
            <span className="text-[13px] text-muted-foreground">{r.label}</span>
            <span
              className={cn('font-mono tabular-nums text-foreground', r.strong ? 'text-[16px] font-bold' : 'text-[13.5px]')}
              style={r.tone ? { color: r.tone } : undefined}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Barra orizzontale di confronto: due valori proporzionali al maggiore. */
function CompareBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <span className="font-mono text-[13.5px] font-semibold text-foreground">{eur(value)}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: color }} />
      </div>
    </div>
  )
}

export function PanoramicaView({ preventivi, dirette, totale, trend, topCustomers }: Props) {
  const c = useChartTheme()
  const maxInc = Math.max(1, preventivi.incassato, dirette.venduto)

  return (
    <div>
      {/* Tre riepiloghi affiancati: Preventivi · Vendite dirette · Totale */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <RiepilogoCard
          title="Preventivi"
          icon={FileText}
          accent={c.blu}
          rows={[
            { label: 'Offerto', value: eur(preventivi.offerto) },
            { label: 'Vinto', value: eur(preventivi.vinto) },
            { label: 'Incassato', value: eur(preventivi.incassato), strong: true, tone: c.succ },
            { label: 'Costo reale', value: eur(preventivi.costo) },
            { label: 'Guadagno', value: eur(preventivi.guadagno) },
          ]}
        />
        <RiepilogoCard
          title="Vendite dirette"
          icon={HandCoins}
          accent={c.warn}
          rows={[
            { label: 'Venduto', value: eur(dirette.venduto), strong: true, tone: c.succ },
            { label: 'Costo reale', value: eur(dirette.costo) },
            { label: 'Guadagno', value: eur(dirette.guadagno) },
          ]}
        />
        <RiepilogoCard
          title="Totale (preventivi + dirette)"
          icon={Sigma}
          accent={c.succ}
          rows={[
            { label: 'Incassato', value: eur(totale.incassato), strong: true, tone: c.succ },
            { label: 'Costo reale', value: eur(totale.costo) },
            { label: 'Guadagno reale', value: eur(totale.guadagno) },
            { label: 'Margine reale', value: pct(totale.margine) },
          ]}
        />
      </div>

      {/* Confronto incassato: preventivi vs vendite dirette + andamento */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
          <div className="mb-4">
            <div className="text-[15px] font-semibold text-foreground">Incassato a confronto</div>
            <div className="text-xs text-muted-foreground">Quanto pesa ogni fonte sul realizzato</div>
          </div>
          <div className="flex flex-col gap-3.5">
            <CompareBar label="Preventivi" value={preventivi.incassato} max={maxInc} color={c.blu} />
            <CompareBar label="Vendite dirette" value={dirette.venduto} max={maxInc} color={c.warn} />
          </div>
          <div className="mt-4 border-t border-border pt-3 text-[13px] text-muted-foreground">
            Totale incassato{' '}
            <span className="font-mono font-semibold text-foreground">{eur(totale.incassato)}</span>
          </div>
        </div>
        <GroupedBarsCard
          title="Incassato vs costo per mese"
          subtitle="La riga di fondo · preventivi + vendite dirette"
          data={trend}
          xKey="month"
          series={[
            { key: 'incassato', name: 'Incassato', color: c.succ },
            { key: 'costo', name: 'Costo', color: c.warn },
          ]}
          yFmt={eur}
          yWidth={72}
          tipFmt={(v, n) => [eur(v), n]}
        />
        <RankBarsCard
          title="Top clienti (incassato)"
          subtitle="Venduto realizzato · preventivi + vendite dirette"
          data={topCustomers}
          labelKey="name"
          valueKey="value"
          height={300}
          barSize={12}
          valueFmt={eur}
        />
      </div>
    </div>
  )
}
