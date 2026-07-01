import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DxfProfile } from '@/types'

interface Props {
  profiles: DxfProfile[]
  selectedIds: Set<number>
  onToggle: (profileId: number) => void
  onSelectAll: (selected: boolean) => void
}

export default function Dxf2dProfileList({ profiles, selectedIds, onToggle, onSelectAll }: Props) {
  const allSelected = profiles.length > 0 && profiles.every(p => selectedIds.has(p.id))
  const noneSelected = selectedIds.size === 0

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">Profili rilevati ({profiles.length})</CardTitle>
        <div className="flex items-center gap-1 text-[11px]">
          <button
            type="button"
            onClick={() => onSelectAll(true)}
            disabled={allSelected}
            className="px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Seleziona tutti
          </button>
          <button
            type="button"
            onClick={() => onSelectAll(false)}
            disabled={noneSelected}
            className="px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Deseleziona tutti
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0 max-h-64 overflow-y-auto">
        <ul className="text-sm divide-y">
          {profiles.map(p => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40">
              <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => onToggle(p.id)} />
              <span className="font-mono text-xs text-muted-foreground w-8">#{p.id}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${p.closed ? 'bg-blue-100 text-primary' : 'bg-amber-100 text-amber-700'}`}>
                {p.closed ? 'chiuso' : 'aperto'}
              </span>
              <span className="flex-1 text-xs text-muted-foreground">
                {p.length_mm.toFixed(1)} mm · bbox {p.bbox.w.toFixed(0)}×{p.bbox.h.toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
