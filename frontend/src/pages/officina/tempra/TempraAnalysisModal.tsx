import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { X, BarChart3 } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { HeatTreatmentResult } from '@/types'
import { analyzeMaterial, distinctMaterials, formatDelta, deltaClass, DIM_COLORS } from './tempraCalc'

export default function TempraAnalysisModal({
  rows, initialMaterial, onClose,
}: {
  rows: HeatTreatmentResult[]
  initialMaterial?: string
  onClose: () => void
}) {
  const materials = distinctMaterials(rows)
  const [material, setMaterial] = useState<string>(
    initialMaterial && materials.includes(initialMaterial) ? initialMaterial : (materials[0] ?? ''),
  )
  useEscapeKey(onClose, true)

  const analyses = material ? analyzeMaterial(rows, material) : []

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl bg-card shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b sticky top-0 bg-card z-10">
          <h3 className="font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-600" /> Analisi deformazioni per materiale
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <CardContent className="pt-4 space-y-5">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Materiale</label>
            <select
              className="flex h-10 rounded-md border border-input bg-background px-2 text-sm min-w-[16rem]"
              value={material}
              onChange={e => setMaterial(e.target.value)}
            >
              {materials.length === 0 && <option value="">— nessun dato —</option>}
              {materials.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {analyses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nessuna misura per questo materiale.</p>
          ) : analyses.map(a => (
            <div key={a.shape} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold capitalize">{a.shape}</h4>
                <span className="text-xs text-muted-foreground">
                  {a.recordCount} {a.recordCount === 1 ? 'misura' : 'misure'}
                </span>
              </div>

              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={a.trend} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip
                    formatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(3)} mm`}
                  />
                  <Legend />
                  {a.dims.map((d, i) => (
                    <Line
                      key={d.key}
                      type="monotone"
                      dataKey={d.key}
                      name={d.label}
                      stroke={DIM_COLORS[i % DIM_COLORS.length]}
                      strokeWidth={2}
                      connectNulls
                      dot
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-1.5 font-medium">Dimensione</th>
                    <th className="py-1.5 font-medium text-right">Δ medio</th>
                    <th className="py-1.5 font-medium text-right">min</th>
                    <th className="py-1.5 font-medium text-right">max</th>
                    <th className="py-1.5 font-medium text-right">n°</th>
                  </tr>
                </thead>
                <tbody>
                  {a.stats.map(s => (
                    <tr key={s.key} className="border-b last:border-0">
                      <td className="py-1.5">{s.label}</td>
                      <td className={`py-1.5 text-right tabular-nums font-medium ${deltaClass(s.avg)}`}>
                        {s.count ? `${formatDelta(s.avg)} mm` : '—'}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{s.count ? formatDelta(s.min) : '—'}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{s.count ? formatDelta(s.max) : '—'}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
