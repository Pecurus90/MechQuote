import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { Wrench } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { ToolsStats } from '@/types'
import { type Period, CATEGORY_COLORS, Loading, EmptyChart, KpiCards } from './statsShared'

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
      {/* Filtri */}
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

      {/* KPI (solo quantità, nessun costo) */}
      <KpiCards items={[
        { label: 'Ordini utensili', value: String(data.orders_count) },
        { label: 'Quantità ordinata', value: String(data.total_quantity), hint: 'pezzi nel periodo' },
        { label: 'Utensili distinti', value: String(data.distinct_tools) },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Wrench className="w-4 h-4" /> Trend ordini per mese</CardTitle>
            <p className="text-xs text-muted-foreground">N. ordini utensili emessi mese su mese</p>
          </CardHeader>
          <CardContent>
            {data.trend_monthly.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.trend_monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#7c3aed" name="Ordini" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quantità per tipo utensile</CardTitle>
            <p className="text-xs text-muted-foreground">Pezzi ordinati per tipo nel periodo</p>
          </CardHeader>
          <CardContent>
            {data.by_type.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.by_type} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" fontSize={11} width={130} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Quantità">
                    {data.by_type.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top fornitori utensili</CardTitle>
            <p className="text-xs text-muted-foreground">N. righe ordine per fornitore (snapshot al momento dell'ordine)</p>
          </CardHeader>
          <CardContent>
            {data.top_suppliers.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.top_suppliers} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="supplier_name" fontSize={11} width={140} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#7c3aed" name="Righe" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 utensili più ordinati</CardTitle>
            <p className="text-xs text-muted-foreground">Codice utensile + quantità cumulata nel periodo</p>
          </CardHeader>
          <CardContent>
            {data.top_tools.length === 0 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.top_tools} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="code" fontSize={11} width={140} />
                  <Tooltip />
                  <Bar dataKey="total_quantity" fill="#7c3aed" name="Quantità" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
