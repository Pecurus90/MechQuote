import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DxfProfile } from '@/types'

interface Props {
  profiles: DxfProfile[]
  selectedIds: Set<number>
  onToggle: (profileId: number) => void
}

export default function Dxf2dProfileList({ profiles, selectedIds, onToggle }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Profili rilevati ({profiles.length})</CardTitle></CardHeader>
      <CardContent className="p-0 max-h-64 overflow-y-auto">
        <ul className="text-sm divide-y">
          {profiles.map(p => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40">
              <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => onToggle(p.id)} />
              <span className="font-mono text-xs text-muted-foreground w-8">#{p.id}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${p.closed ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
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
