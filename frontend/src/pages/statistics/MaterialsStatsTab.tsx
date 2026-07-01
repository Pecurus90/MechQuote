import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { MaterialsStats } from '@/types'
import { MATERIAL_FAMILIES } from '@/lib/materialFamilies'
import {
  type Period, fmtEur, Loading, KpiCards, TrendArea, RankBars,
} from './statsShared'

interface SupplierOpt { id: number; name: string }

const eur = (v: number) => `€ ${fmtEur(v)}`
const kEur = (v: number) => `${fmtEur(v / 1000)}k`

export default function MaterialsStatsTab({ period }: { period: Period }) {
  const [data, setData] = useState<MaterialsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [supplierId, setSupplierId] = useState<string>('')
  const [family, setFamily] = useState<string>('')
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([])

  useEffect(() => {
    api.get('/material-suppliers').then(r => setSuppliers(r.data)).catch(() => undefined)
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ period })
    if (supplierId) params.set('supplier_id', supplierId)
    if (family) params.set('family', family)
    api.get(`/dashboard/statistics/orders-materials?${params}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche materiali'))
      .finally(() => setLoading(false))
  }, [period, supplierId, family])

  if (loading || !data) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Fornitore</label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm min-w-[160px]" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">Tutti i fornitori</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo materiale</label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm min-w-[160px]" value={family} onChange={e => setFamily(e.target.value)}>
            <option value="">Tutti i tipi</option>
            {MATERIAL_FAMILIES.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <KpiCards items={[
        { label: 'Costo materiale', value: eur(data.total_material_cost), hint: 'grezzo ordinato' },
        { label: 'Peso totale', value: `${fmtEur(data.total_weight_kg)} kg` },
        { label: 'Spedizioni', value: eur(data.total_shipping) },
        { label: 'Ordini', value: String(data.orders_count) },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Andamento ordini</CardTitle></CardHeader>
          <CardContent>
            <TrendArea data={data.trend_monthly} xKey="month" idPrefix="m-trend"
              series={[{ key: 'count', name: 'Ordini', color: '#22d3ee' }]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Lead time confermato → ordine</CardTitle></CardHeader>
          <CardContent>
            <TrendArea data={data.lead_time_monthly} xKey="month" idPrefix="m-lt"
              series={[{ key: 'avg_days', name: 'Giorni', color: '#a78bfa' }]}
              yFmt={(v) => `${v}g`} tipFmt={(v) => `${v.toFixed(1)} giorni`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Costo per fornitore (€)</CardTitle></CardHeader>
          <CardContent>
            <RankBars data={data.by_supplier} labelKey="supplier_name" valueKey="material_cost" valueFmt={kEur} unit="€" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Top 10 materiali per costo (€)</CardTitle></CardHeader>
          <CardContent>
            <RankBars data={data.by_material} labelKey="material_name" valueKey="material_cost" valueFmt={kEur} unit="€" />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Dettaglio per fornitore</CardTitle></CardHeader>
          <CardContent className="p-0">
            {data.by_supplier.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">Nessun dato</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 font-medium">Fornitore</th>
                    <th className="text-right p-2 font-medium">Costo materiale</th>
                    <th className="text-right p-2 font-medium">Peso</th>
                    <th className="text-right p-2 font-medium">Spedizioni</th>
                    <th className="text-right p-2 font-medium">Ordini</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_supplier.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-2">{s.supplier_name}</td>
                      <td className="p-2 text-right font-mono">{eur(s.material_cost)}</td>
                      <td className="p-2 text-right font-mono">{fmtEur(s.weight_kg)} kg</td>
                      <td className="p-2 text-right font-mono">{eur(s.shipping_cost)}</td>
                      <td className="p-2 text-right font-mono">{s.orders_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
