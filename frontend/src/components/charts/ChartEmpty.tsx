// Stato vuoto standard dei grafici (handoff Statistiche v2, Richiesta 1).
import { BarChart3 } from 'lucide-react'

export default function ChartEmpty({ height = 240 }: { height?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-border"
      style={{ height }}
    >
      <BarChart3 className="h-[26px] w-[26px] text-muted-foreground opacity-55" />
      <span className="text-[12.5px] font-medium text-muted-foreground">
        Nessun dato per questo periodo
      </span>
    </div>
  )
}
