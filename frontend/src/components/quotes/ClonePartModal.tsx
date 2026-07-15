import { useState } from 'react'
import { CopyPlus, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useEscapeKey } from '@/lib/useEscapeKey'

export interface CloneTarget {
  id: number
  part_code: string
  description: string
}

interface Props {
  sourceCode: string
  targets: CloneTarget[]
  onConfirm: (targetIds: number[]) => void
  onClose: () => void
  busy?: boolean
}

/**
 * Clona la RICETTA di un articolo (materiale, dimensioni, fasi, prezzi) su uno
 * o più altri articoli della commessa, mantenendone codice/quantità/descrizione.
 */
export function ClonePartModal({ sourceCode, targets, onConfirm, onClose, busy }: Props) {
  const [sel, setSel] = useState<Set<number>>(new Set())
  useEscapeKey(onClose, true)

  const toggle = (id: number) =>
    setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = targets.length > 0 && sel.size === targets.length
  const toggleAll = () => setSel(allSel ? new Set() : new Set(targets.map(t => t.id)))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <CopyPlus className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">
              Clona la ricetta di <span className="font-mono">{sourceCode}</span>
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-3 text-[13px] text-muted-foreground">
            Materiale, dimensioni, fasi e prezzi vengono copiati sugli articoli scelti.
            Codice, quantità e descrizione restano quelli di ogni articolo.
          </p>
          <div className="mb-3 flex items-center gap-2 rounded-[9px] border border-warning/40 bg-warning/[0.08] px-3 py-2 text-[12.5px] text-warning">
            <AlertTriangle className="h-4 w-4 flex-none" />
            La ricetta esistente degli articoli selezionati verrà sostituita.
          </div>

          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-foreground">Clona su:</span>
            {targets.length > 1 && (
              <button type="button" onClick={toggleAll} className="text-[12px] text-primary hover:underline">
                {allSel ? 'Deseleziona tutti' : 'Seleziona tutti'}
              </button>
            )}
          </div>
          <div className="max-h-[46vh] overflow-y-auto rounded-[10px] border border-border">
            {targets.map((t, i) => {
              const checked = sel.has(t.id)
              return (
                <label
                  key={t.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-3.5 py-2.5',
                    i > 0 && 'border-t border-border',
                    checked && 'bg-primary/[0.06]',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(t.id)}
                    className="h-4 w-4 flex-none accent-primary"
                  />
                  <span className="flex-none font-mono text-[13px] font-semibold text-foreground">{t.part_code}</span>
                  <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{t.description || '—'}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button variant="outline" onClick={onClose} disabled={busy}>Annulla</Button>
          <Button onClick={() => onConfirm([...sel])} disabled={busy || sel.size === 0}>
            Clona su {sel.size || ''} {sel.size === 1 ? 'articolo' : 'articoli'}
          </Button>
        </div>
      </div>
    </div>
  )
}
