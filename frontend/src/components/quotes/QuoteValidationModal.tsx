// src/components/quotes/QuoteValidationModal.tsx
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ValidationPart {
  id: number
  /** Etichetta già composta (es. "P-002 · Punzone Ø42 temprato"). */
  label: string
  issues: string[]
}

interface Props {
  open: boolean
  parts: ValidationPart[]
  onOpenPart?: (id: number) => void
  onCancel: () => void
  onGenerate: () => void
}

export function QuoteValidationModal(props: Props) {
  const { open, parts, onOpenPart, onCancel, onGenerate } = props
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] overflow-hidden rounded-[15px] border border-border bg-card shadow-[0_24px_60px_rgba(0,0,0,0.28)]"
      >
        {/* header */}
        <div className="flex items-center gap-[11px] border-b border-border px-[22px] py-[18px]">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-warning/[0.14] text-warning">
            <AlertTriangle className="h-[19px] w-[19px]" />
          </div>
          <div>
            <div className="text-[15.5px] font-bold text-foreground">Problemi rilevati</div>
            <div className="text-[12.5px] text-muted-foreground">
              {parts.length} {parts.length === 1 ? 'parte presenta avvisi' : 'parti presentano avvisi'}{' '}
              bloccanti
            </div>
          </div>
        </div>

        {/* body */}
        <div className="max-h-[280px] overflow-y-auto px-[22px] py-4">
          {parts.map((p, i) => (
            <div key={p.id} className={i < parts.length - 1 ? 'mb-4' : undefined}>
              <button
                type="button"
                onClick={() => onOpenPart?.(p.id)}
                className="mb-2 block text-left font-mono text-[13.5px] font-semibold text-primary hover:underline"
              >
                {p.label}
              </button>
              {p.issues.map((issue, j) => (
                <div
                  key={j}
                  className="flex items-center gap-2.5 py-[5px] text-[12.5px] text-muted-foreground"
                >
                  <span className="h-[5px] w-[5px] flex-none rounded-full bg-danger" />
                  {issue}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2.5 border-t border-border bg-card-muted/50 px-[22px] py-4">
          <Button variant="outline" onClick={onCancel} className="h-10 rounded-[10px]">
            Annulla
          </Button>
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex h-10 items-center gap-[7px] rounded-[10px] bg-warning px-[18px] text-[13.5px] font-semibold text-white transition-[filter] hover:brightness-105"
          >
            Genera comunque
            <ArrowRight className="h-[15px] w-[15px]" />
          </button>
        </div>
      </div>
    </div>
  )
}
