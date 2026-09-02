// src/components/quotes/PartsSidebar.tsx
import { Settings2, Plus, AlertTriangle, CopyPlus, Trash2 } from 'lucide-react'
import { cn, eur0 } from '@/lib/utils'

export interface PartSidebarItem {
  id: number
  part_code: string
  description: string
  total_price: number
  hasIssues?: boolean
}

interface Props {
  parts: PartSidebarItem[]
  selected: number | 'quote'
  canAddParts: boolean
  locked: boolean
  onSelect: (id: number | 'quote') => void
  onAdd?: () => void
  /** Clona la ricetta di questa parte su altri articoli (apre il modale). */
  onClone?: (id: number) => void
  onDelete?: (id: number) => void
}


export function PartsSidebar(props: Props) {
  const { parts, selected, canAddParts, locked, onSelect, onAdd, onClone, onDelete } = props
  const showActions = canAddParts && !locked

  return (
    <div className="flex min-h-0 w-64 flex-none flex-col border-r border-border bg-sidebar">
      <div className="flex flex-none items-center justify-between px-4 pb-2.5 pt-3.5">
        <span className="text-[13px] font-semibold text-foreground">
          Parti <span className="text-muted-foreground">({parts.length})</span>
        </span>
        {canAddParts && !locked && (
          <button
            type="button"
            onClick={onAdd}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border bg-card text-foreground transition-[filter] hover:brightness-105"
          >
            <Plus className="h-[15px] w-[15px]" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        {/* Dati preventivo */}
        <button
          type="button"
          onClick={() => onSelect('quote')}
          className={cn(
            'mb-1.5 flex w-full items-center gap-2.5 rounded-[10px] border px-[11px] py-2.5 text-left transition-colors',
            selected === 'quote'
              ? 'border-primary/35 bg-primary/10'
              : 'border-transparent hover:bg-muted/55',
          )}
        >
          <Settings2
            className={cn(
              'h-4 w-4 flex-none',
              selected === 'quote' ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <span
            className={cn(
              'text-[13px]',
              selected === 'quote' ? 'font-semibold text-primary' : 'font-medium text-foreground',
            )}
          >
            Dati preventivo
          </span>
        </button>

        {/* Part rows */}
        {parts.map((p) => {
          const active = selected === p.id
          return (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={cn(
                'mb-1 cursor-pointer rounded-[10px] border px-[11px] py-2.5 transition-colors',
                active
                  ? 'border-primary/35 bg-primary/10'
                  : 'border-transparent hover:bg-muted/55',
              )}
            >
              <div className="mb-[3px] flex items-center gap-[7px]">
                <span
                  className={cn(
                    'font-mono text-[12.5px] font-semibold',
                    active ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {p.part_code}
                </span>
                {p.hasIssues && <AlertTriangle className="h-[13px] w-[13px] text-warning" />}
                <span className="flex-1" />
                {showActions && (
                  <>
                    {parts.length > 1 && (
                      <CopyPlus
                        className={cn(
                          'h-3.5 w-3.5 transition-colors hover:text-foreground',
                          active ? 'text-primary' : 'text-muted-foreground',
                        )}
                        aria-label="Clona la ricetta su altri articoli"
                        onClick={(e) => {
                          e.stopPropagation()
                          onClone?.(p.id)
                        }}
                      />
                    )}
                    <Trash2
                      className={cn(
                        'h-3.5 w-3.5 transition-colors hover:text-danger',
                        active ? 'text-primary' : 'text-muted-foreground',
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete?.(p.id)
                      }}
                    />
                  </>
                )}
              </div>
              <div
                className={cn(
                  'mb-[5px] truncate text-xs',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {p.description}
              </div>
              <div
                className={cn(
                  'text-right font-mono text-[12.5px] font-semibold',
                  active ? 'text-primary' : 'text-foreground',
                )}
              >
                {eur0(p.total_price)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
