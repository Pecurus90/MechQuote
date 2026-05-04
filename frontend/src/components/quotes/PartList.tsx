import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Copy, Trash2, GripVertical } from 'lucide-react'

interface Part {
  id?: number
  part_code: string
  revision: string
  description: string
  quantity: number
  quote_mode: string
  material_id?: number
  unit_price: number
  total_price: number
}

interface Props {
  parts: Part[]
  onAdd: () => void
  onRemove: (idx: number) => void
  onDuplicate: (idx: number) => void
  onSelect: (idx: number) => void
  selectedIdx: number
}

export default function PartList({ parts, onAdd, onRemove, onDuplicate, onSelect, selectedIdx }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">Parti ({parts.length})</h3>
          <Button size="sm" onClick={onAdd}>
            <Plus className="w-4 h-4 mr-1" /> Aggiungi
          </Button>
        </div>

        <div className="space-y-2">
          {parts.map((part, idx) => (
            <div
              key={idx}
              onClick={() => onSelect(idx)}
              className={`flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
                selectedIdx === idx ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <GripVertical className="w-4 h-4 text-gray-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{part.part_code || `Parte ${idx + 1}`}</span>
                  <span className="text-xs text-gray-500">{part.revision}</span>
                  {part.quote_mode && (
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{part.quote_mode}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">{part.description || 'Nessuna descrizione'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{part.total_price?.toFixed(2) || '0.00'} €</p>
                <p className="text-xs text-gray-500">Qtà: {part.quantity}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); onDuplicate(idx) }} className="p-1 hover:bg-gray-100 rounded">
                  <Copy className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onRemove(idx) }} className="p-1 hover:bg-red-50 rounded">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}

          {parts.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              Nessuna parte aggiunta. Clicca "Aggiungi" per iniziare.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
