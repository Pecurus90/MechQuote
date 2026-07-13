import { Pencil, Trash2, Check, X } from 'lucide-react'
import type { CSSProperties } from 'react'

// Kit condiviso per il pattern P1 (tabella inline-edit) — garantisce che tutte
// le pagine impostazioni con inline-edit siano visivamente identiche.

export const tWrap = 'overflow-hidden rounded-2xl border border-border bg-card'
export const tHead = 'border-b border-border bg-card-muted text-[11px] uppercase tracking-wide text-muted-foreground'
export const tRow = 'border-b border-border transition-colors hover:bg-muted/[0.45]'

/** Riga in modifica: barra accento a sinistra (inset 3px). Abbinare a `bg-{accent}/[0.05]`. */
export const editRowStyle = (accent: string): CSSProperties => ({ boxShadow: `inset 3px 0 0 hsl(var(--${accent}))` })

export function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-center gap-1">
      <button onClick={onEdit} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifica"><Pencil className="h-4 w-4" /></button>
      <button onClick={onDelete} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina"><Trash2 className="h-4 w-4" /></button>
    </div>
  )
}

export function EditActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-center gap-1">
      <button onClick={onSave} className="rounded p-1.5 text-success hover:bg-success/10" title="Conferma (Invio)"><Check className="h-4 w-4" /></button>
      <button onClick={onCancel} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Annulla (Esc)"><X className="h-4 w-4" /></button>
    </div>
  )
}
