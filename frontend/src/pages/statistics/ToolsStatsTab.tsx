import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { Wrench } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { ToolsStats } from '@/types'
import { type Period, Loading, EmptyChart } from './statsShared'

export default function ToolsStatsTab({ period }: { period: Period }) {
  const [data, setData] = useState<ToolsStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/dashboard/statistics/tools?period=${period}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Errore caricamento statistiche utensili'))
      .finally(() => setLoading(false))
  }, [period])

  if (loading || !data) return <Loading />

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Wrench className="w-4 h-4" /> Trend ordini per mese</CardTitle>
          <p className="text-xs text-gray-500">N. ordini utensili emessi mese su mese</p>
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
          <CardTitle className="text-base">Top fornitori utensili</CardTitle>
          <p className="text-xs text-gray-500">N. righe ordine per fornitore (snapshot al momento dell'ordine)</p>
        </CardHeader>
        <CardContent>
          {data.top_suppliers.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.top_suppliers} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="supplier_name" fontSize={11} width={140} />
                <Tooltip />
                <Bar dataKey="count" fill="#7c3aed" name="Utensili" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top 10 utensili più ordinati</CardTitle>
          <p className="text-xs text-gray-500">Codice utensile + quantità cumulata nel periodo</p>
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
  )
}
