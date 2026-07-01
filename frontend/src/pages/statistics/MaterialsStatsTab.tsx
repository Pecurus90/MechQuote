import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { Package } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { MaterialsStats } from '@/types'
import { type Period, Loading, EmptyChart } from './statsShared'

export default function MaterialsStatsTab({ period }: { period: Period }) {
  const [data, setData] = useState<MaterialsStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/dashboard/statistics/orders-materials?period=${period}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche materiali'))
      .finally(() => setLoading(false))
  }, [period])

  if (loading || !data) return <Loading />

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Trend ordini per mese</CardTitle>
          <p className="text-xs text-gray-500">N. ordini materiale emessi mese su mese</p>
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
          <CardTitle className="text-base">Top 10 fornitori materiali</CardTitle>
          <p className="text-xs text-gray-500">N. preventivi distinti ordinati per fornitore</p>
        </CardHeader>
        <CardContent>
          {data.top_suppliers.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.top_suppliers} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="supplier_name" fontSize={11} width={140} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" name="Preventivi" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Lead time medio "confermato → ordine"</CardTitle>
          <p className="text-xs text-gray-500">
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
  )
}
