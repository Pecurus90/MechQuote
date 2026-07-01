import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { ToolsStats } from '@/types'
import {
  type Period, Loading, KpiCards, TrendArea, RankBars,
} from './statsShared'

interface Named { id: number; name: string }

export default function ToolsStatsTab({ period }: { period: Period }) {
  const [data, setData] = useState<ToolsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [toolType, setToolType] = useState<string>('')
  const [supplier, setSupplier] = useState<string>('')
  const [types, setTypes] = useState<Named[]>([])
  const [suppliers, setSuppliers] = useState<Named[]>([])

  useEffect(() => {
    api.get('/tools/types').then(r => setTypes(r.data)).catch(() => undefined)
    api.get('/tools/suppliers').then(r => setSuppliers(r.data)).catch(() => undefined)
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ period })
    if (toolType) params.set('tool_type', toolType)
    if (supplier) params.set('supplier', supplier)
    api.get(`/dashboard/statistics/tools?${params}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche utensili'))
      .finally(() => setLoading(false))
  }, [period, toolType, supplier])

  if (loading || !data) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo utensile</label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm min-w-[150px]" value={toolType} onChange={e => setToolType(e.target.value)}>
            <option value="">Tutti i tipi</option>
            {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Fornitore</label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm min-w-[150px]" value={supplier} onChange={e => setSupplier(e.target.value)}>
            <option value="">Tutti i fornitori</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* solo quantità, nessun costo (scelta utente) */}
      <KpiCards items={[
        { label: 'Ordini utensili', value: String(data.orders_count) },
        { label: 'Quantità ordinata', value: String(data.total_quantity), hint: 'pezzi nel periodo' },
        { label: 'Utensili distinti', value: String(data.distinct_tools) },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Andamento ordini</CardTitle></CardHeader>
          <CardContent>
            <TrendArea data={data.trend_monthly} xKey="month" idPrefix="t-trend"
              series={[{ key: 'count', name: 'Ordini', color: '#a78bfa' }]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Quantità per tipo</CardTitle></CardHeader>
          <CardContent>
            <RankBars data={data.by_type} labelKey="label" valueKey="quantity" unit="pz" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Top fornitori utensili</CardTitle></CardHeader>
          <CardContent>
            <RankBars data={data.top_suppliers} labelKey="supplier_name" valueKey="count" unit="righe" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Top 10 utensili più ordinati</CardTitle></CardHeader>
          <CardContent>
            <RankBars data={data.top_tools} labelKey="code" valueKey="total_quantity" unit="pz" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
