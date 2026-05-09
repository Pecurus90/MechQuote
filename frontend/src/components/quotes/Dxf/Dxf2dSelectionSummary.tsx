import { Card, CardContent } from '@/components/ui/card'

interface Props {
  selectedCount: number
  selectedLengthMm: number
  selectedClosedCount: number
}

export default function Dxf2dSelectionSummary({ selectedCount, selectedLengthMm, selectedClosedCount }: Props) {
  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardContent className="p-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Profili selezionati</p>
          <p className="font-semibold text-base">{selectedCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Lunghezza taglio</p>
          <p className="font-semibold text-base">{selectedLengthMm.toFixed(1)} mm</p>
        </div>
        <div>
          <p className="text-muted-foreground">Profili chiusi</p>
          <p className="font-semibold text-base">{selectedClosedCount}</p>
        </div>
      </CardContent>
    </Card>
  )
}
