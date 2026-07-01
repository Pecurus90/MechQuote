import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { Package } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { MaterialsStats } from '@/types'
import { MATERIAL_FAMILIES } from '@/lib/materialFamilies'
import { type Period, fmtEur, CATEGORY_COLORS, Loading, EmptyChart, KpiCards } from './statsShared'

interface SupplierOpt { id: number; name: string }

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
      {/* Filtri */}
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

      {/* KPI */}
      <KpiCards items={[
        { label: 'Costo materiale', value: `€ ${fmtEur(data.total_material_cost)}`, hint: 'grezzo ordinato nel periodo' },
        { label: 'Peso totale', value: `${fmtEur(data.total_weight_kg)} kg` },
        { label: 'Spedizioni', value: `€ ${fmtEur(data.total_shipping)}` },
        { label: 'Ordini', value: String(data.orders_count) },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Trend ordini per mese</CardTitle>
            <p className="text-xs text-muted-foreground">N. ordini materiale emessi mese su mese</p>
          </CardHeader>
          <CardContent>
            {data.trend_monthly.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.trend_monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563eb" name="Ordini" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Costo materiale per fornitore</CardTitle>
            <p className="text-xs text-muted-foreground">€ grezzo ordinato per fornitore nel periodo</p>
          </CardHeader>
          <CardContent>
            {data.by_supplier.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.by_supplier} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} tickFormatter={(v) => `${fmtEur(v / 1000)}k`} />
                  <YAxis type="category" dataKey="supplier_name" fontSize={11} width={140} />
                  <Tooltip formatter={(v: number) => `€ ${fmtEur(v)}`} />
                  <Bar dataKey="material_cost" name="Costo materiale">
                    {data.by_supplier.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 materiali per costo</CardTitle>
            <p className="text-xs text-muted-foreground">€ grezzo ordinato per materiale</p>
          </CardHeader>
          <CardContent>
            {data.by_material.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.by_material} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} tickFormatter={(v) => `${fmtEur(v / 1000)}k`} />
                  <YAxis type="category" dataKey="material_name" fontSize={11} width={140} />
                  <Tooltip formatter={(v: number) => `€ ${fmtEur(v)}`} />
                  <Bar dataKey="material_cost" name="Costo">
                    {data.by_material.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dettaglio per fornitore</CardTitle>
            <p className="text-xs text-muted-foreground">Costo · peso · spedizioni · n° ordini</p>
          </CardHeader>
          <CardContent className="p-0">
            {data.by_supplier.length === 0 ? <EmptyChart /> : (
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
                      <td className="p-2 text-right font-mono">€ {fmtEur(s.material_cost)}</td>
                      <td className="p-2 text-right font-mono">{fmtEur(s.weight_kg)} kg</td>
                      <td className="p-2 text-right font-mono">€ {fmtEur(s.shipping_cost)}</td>
                      <td className="p-2 text-right font-mono">{s.orders_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lead time medio "confermato → ordine"</CardTitle>
            <p className="text-xs text-muted-foreground">
              Giorni medi tra conferma preventivo e generazione ordine materiale ·
              media periodo: <span className="font-semibold text-blue-700">{data.lead_time_avg_days.toFixed(1)} gg</span>
            </p>
          </CardHeader>
          <CardContent>
            {data.lead_time_monthly.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.lead_time_monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${v}gg`} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(1)} giorni`} />
                  <Line type="monotone" dataKey="avg_days" stroke="#2563eb" strokeWidth={2} name="Giorni medi" dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
