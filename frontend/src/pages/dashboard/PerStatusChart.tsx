import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, LabelList } from 'recharts'
import { StatusChip } from '@/components/ui/status-badge'
import { STATUS_LABELS } from '@/lib/constants'
import { useTheme } from '@/lib/theme'

const STATE_ORDER = ['bozza', 'inviato', 'letto', 'confermato', 'completo'] as const

// Legge le triplette HSL dei token --state-* dal :root (rispetta il tema attivo).
function readStateColors(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement)
  const out: Record<string, string> = {}
  for (const s of STATE_ORDER) {
    const v = cs.getPropertyValue(`--state-${s}`).trim()
    out[s] = v ? `hsl(${v})` : 'hsl(220 9% 46%)'
  }
  return out
}

export default function PerStatusChart({
  byStatus, standardCount, dieCount, onSelect,
}: {
  byStatus: Record<string, number>
  standardCount: number
  dieCount: number
  onSelect: (status: string) => void
}) {
  const { theme } = useTheme()
  const [colors, setColors] = useState<Record<string, string>>(readStateColors)
  useEffect(() => { setColors(readStateColors()) }, [theme])

  const total = STATE_ORDER.reduce((s, k) => s + (byStatus[k] ?? 0), 0)
  const rows = STATE_ORDER.map(s => ({ status: s, label: STATUS_LABELS[s] ?? s, count: byStatus[s] ?? 0 }))
  const axisTick = { fontSize: 12, fontFamily: '"IBM Plex Mono", monospace', fill: 'hsl(var(--muted-foreground))' }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="text-[15px] font-semibold">Preventivi per stato</div>
            <div className="text-xs text-muted-foreground font-mono">
              Standard {standardCount} · Stampi {dieCount}
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">Totale {total}</span>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {rows.map(r => (
            <StatusChip key={r.status} status={r.status} count={r.count} onClick={() => onSelect(r.status)} />
          ))}
        </div>

        {total === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Nessun preventivo</div>
        ) : (
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 28, left: 6, bottom: 0 }} barSize={18}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={78} tick={axisTick} axisLine={false} tickLine={false} />
                <Bar dataKey="count" radius={[0, 5, 5, 0]} onClick={(d: { status?: string }) => d.status && onSelect(d.status)} className="cursor-pointer">
                  {rows.map(r => <Cell key={r.status} fill={colors[r.status]} />)}
                  <LabelList dataKey="count" position="right" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, fontWeight: 600, fill: 'hsl(var(--foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
