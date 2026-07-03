// src/pages/quotes/NewQuoteChooser.tsx
import { Plus, ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChooserTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'confirmed'

export interface QuoteMode {
  key: string
  title: string
  description: string
  icon: LucideIcon
  tone: ChooserTone
  available: boolean
}

interface Props {
  modes: QuoteMode[]
  onPick: (key: string) => void
}

// Classi statiche per tono (Tailwind JIT deve poterle leggere).
const TILE: Record<ChooserTone, string> = {
  primary: 'bg-primary/[0.13] text-primary',
  success: 'bg-success/[0.13] text-success',
  warning: 'bg-warning/[0.13] text-warning',
  danger: 'bg-danger/[0.13] text-danger',
  info: 'bg-info/[0.13] text-info',
  confirmed: 'bg-confirmed/[0.13] text-confirmed',
}
const CTA: Record<ChooserTone, string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  confirmed: 'text-confirmed',
}

export function NewQuoteChooser({ modes, onPick }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card px-9 pb-10 pt-[34px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* StandardPage header */}
      <div className="mb-[30px] flex items-start gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-primary/[0.13] text-primary">
          <Plus className="h-[23px] w-[23px]" />
        </div>
        <div>
          <h2 className="mb-[3px] text-[22px] font-bold tracking-tight text-foreground">
            Nuovo Preventivo
          </h2>
          <p className="text-[13.5px] text-muted-foreground">
            Scegli come vuoi costruire il preventivo
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {modes.map((m) => {
          const Icon = m.icon
          const disabled = !m.available
          return (
            <div
              key={m.key}
              role={disabled ? undefined : 'button'}
              tabIndex={disabled ? undefined : 0}
              onClick={disabled ? undefined : () => onPick(m.key)}
              onKeyDown={
                disabled
                  ? undefined
                  : (e) => {
                      if (e.key === 'Enter' || e.key === ' ') onPick(m.key)
                    }
              }
              className={cn(
                'relative flex flex-col rounded-[14px] border border-border bg-card p-[22px]',
                disabled
                  ? 'cursor-not-allowed opacity-55'
                  : 'cursor-pointer transition-[transform,border-color,box-shadow] duration-100 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]',
              )}
            >
              {disabled && (
                <span className="absolute right-4 top-4 rounded-full bg-muted px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.03em] text-muted-foreground">
                  In sviluppo
                </span>
              )}
              <div
                className={cn(
                  'mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-xl',
                  TILE[m.tone],
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="mb-1.5 text-[15.5px] font-bold text-foreground">{m.title}</div>
              <p className="mb-[18px] flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {m.description}
              </p>
              {disabled ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
                  Non disponibile
                </span>
              ) : (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[13px] font-semibold',
                    CTA[m.tone],
                  )}
                >
                  Inizia
                  <ArrowRight className="h-[15px] w-[15px]" />
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
