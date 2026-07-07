// src/pages/orders/ToolOrdersView.tsx
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Drill, Factory, FileDown, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KpiCard, type KpiTone } from '@/components/dashboard/KpiCard'

export interface OrderKpi {
  key: string
  label: string
  value: string | number
  hint?: string
  trend?: { text: string; dir: 'up' | 'down'; tone: 'success' | 'danger' }
  icon: LucideIcon
  tone: KpiTone
}

/** Utensile sotto la scorta minima. */
export interface ToolLowStockItem {
  id: number
  code: string
  brand: string
  type: string
  currentQty: number
  minQty: number
  orderQty: number
}

/** Gruppo utensili sotto scorta per fornitore. */
export interface ToolSupplierGroup {
  supplierId: number
  supplierName: string
  items: ToolLowStockItem[]
}

interface Props {
  subtitle?: string
  kpis: OrderKpi[]
  groups: ToolSupplierGroup[]
  /** Il container mostra la conferma prima di emettere il CSV. */
  onCreateOrder: (supplierId: number) => void
}

const GRID =
  'grid grid-cols-[minmax(0,1.1fr)_120px_minmax(0,1fr)_100px_100px_130px] items-center gap-3'

export function ToolOrdersView({
  subtitle = 'Utensili sotto la scorta minima · genera l’ordine di riassortimento per fornitore',
  kpis,
  groups,
  onCreateOrder,
}: Props) {
  // Gruppi collassabili: di default chiusi, così si vedono solo le barre
  // fornitore con il pulsante CSV. Espansi on demand.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggle = (id: number) =>
    setExpanded((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <div className="rounded-2xl border border-border bg-card px-[26px] pb-[26px] pt-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* StandardPage header */}
      <div className="mb-[22px] flex items-center gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-primary/[0.13] text-primary">
          <Drill className="h-[23px] w-[23px]" />
        </div>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Ordini utensili</h1>
          <p className="text-[13.5px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-4 gap-[13px]">
        {kpis.map((k) => (
          <KpiCard
            key={k.key}
            label={k.label}
            value={k.value}
            hint={k.hint}
            trend={k.trend}
            icon={k.icon}
            tone={k.tone}
          />
        ))}
      </div>

      {/* Gruppi per fornitore */}
      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const isOpen = expanded.has(g.supplierId)
          return (
          <div key={g.supplierId} className="overflow-hidden rounded-[14px] border border-border">
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(g.supplierId)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(g.supplierId) } }}
              className={cn(
                'flex cursor-pointer items-center justify-between bg-card-muted px-[18px] py-[13px] transition-colors hover:bg-muted',
                isOpen && 'border-b border-border',
              )}
            >
              <div className="flex items-center gap-[11px]">
                <ChevronDown
                  className={cn('h-[17px] w-[17px] flex-none text-muted-foreground transition-transform', !isOpen && '-rotate-90')}
                />
                <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-danger/[0.13] text-danger">
                  <Factory className="h-[17px] w-[17px]" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-foreground">{g.supplierName}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {g.items.length} utensili sotto minimo
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCreateOrder(g.supplierId) }}
                className="inline-flex h-9 items-center gap-[7px] rounded-[9px] bg-primary px-[15px] text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105"
              >
                <FileDown className="h-[15px] w-[15px]" />
                Crea CSV ordine
              </button>
            </div>
            {isOpen && (
              <>
                {/* head */}
                <div
                  className={cn(
                    GRID,
                    'border-b border-border bg-card px-[18px] py-[9px] text-[10.5px] font-semibold uppercase tracking-[0.03em] text-muted-foreground',
                  )}
                >
                  <div>Codice</div>
                  <div>Marca</div>
                  <div>Tipo</div>
                  <div className="text-right">Q.tà attuale</div>
                  <div className="text-right">Minimo</div>
                  <div className="text-right">Da ordinare</div>
                </div>
                {g.items.map((it, i) => {
                  const last = i === g.items.length - 1
                  return (
                    <div
                      key={it.id}
                      className={cn(GRID, 'px-[18px] py-[11px] text-[12.5px]', !last && 'border-b border-border')}
                    >
                      <div className="font-mono font-semibold text-foreground">{it.code}</div>
                      <div className="text-muted-foreground">{it.brand}</div>
                      <div className="text-foreground">{it.type}</div>
                      <div className="text-right font-mono font-semibold text-danger">{it.currentQty}</div>
                      <div className="text-right font-mono text-muted-foreground">{it.minQty}</div>
                      <div className="text-right font-mono font-semibold text-foreground">{it.orderQty}</div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
