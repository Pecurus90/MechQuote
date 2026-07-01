import { Trash2, Copy, Plus } from 'lucide-react'
import type { Quote } from '@/types'

interface Props {
  quote: Quote
  selectedPartIdx: number  // -1 = pannello "Dati preventivo"
  isLocked: boolean
  partsWithIssues: Set<number>
  onSelect: (idx: number) => void
  onAdd: () => void
  onDuplicate: (idx: number) => void
  onRequestDelete: (idx: number) => void
}

/** Sidebar parti a sinistra dell'editor preventivo: lista cliccabile + add
 *  + duplica/elimina (commessa, non-locked). Mostra ⚠ se la parte ha
 *  validation issues; evidenzia la riga selezionata.
 *
 *  Estratto da QuoteEditor per coesione: questo è un componente puramente
 *  presentazionale, tutte le mutazioni avvengono via callback.
 */
export default function PartsSidebar({
  quote, selectedPartIdx, isLocked, partsWithIssues,
  onSelect, onAdd, onDuplicate, onRequestDelete,
}: Props) {
  return (
    <div className="w-64 bg-card border-r flex flex-col shrink-0">
      <div className="p-3 border-b flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Parti ({quote.parts.length})
        </span>
        {quote.quote_type !== 'single' && !isLocked && (
          <button onClick={onAdd} className="p-0.5 hover:text-blue-600 text-muted-foreground" title="Aggiungi parte">
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      <div
        onClick={() => onSelect(-1)}
        className={`px-3 py-2 cursor-pointer border-b text-xs text-muted-foreground hover:bg-muted ${
          selectedPartIdx === -1 ? 'bg-primary/10 border-l-2 border-l-blue-600' : ''
        }`}
      >
        ⚙ Dati preventivo
      </div>
      <div className="flex-1 overflow-y-auto">
        {quote.parts.map((part, idx) => (
          <div
            key={part.id ?? idx}
            onClick={() => onSelect(idx)}
            className={`px-3 py-2.5 cursor-pointer border-b hover:bg-muted ${
              selectedPartIdx === idx ? 'bg-primary/10 border-l-2 border-l-blue-600' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-mono font-medium text-foreground truncate">{part.part_code}</span>
              <div className="flex items-center gap-1 shrink-0">
                {partsWithIssues.has(idx) && (
                  <span className="text-amber-500 text-xs" title="Dati mancanti">⚠</span>
                )}
                {quote.quote_type !== 'single' && !isLocked && (
                  <button onClick={e => { e.stopPropagation(); onDuplicate(idx) }}
                    className="p-1 hover:text-blue-600 hover:bg-primary/10 rounded text-muted-foreground" title="Duplica">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
                {quote.quote_type !== 'single' && !isLocked && (
                  <button onClick={e => { e.stopPropagation(); onRequestDelete(idx) }}
                    className="p-1 hover:text-red-600 hover:bg-red-50 rounded text-muted-foreground" title="Elimina">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="text-xs text-muted-foreground truncate">{part.description || 'Nessuna descrizione'}</div>
            <div className="text-xs font-semibold text-blue-600 mt-0.5">{part.total_price.toFixed(2)} €</div>
          </div>
        ))}
      </div>
    </div>
  )
}
