// src/pages/orders/MaterialOrdersView.tsx
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Package, Factory, FileDown, Warehouse, Check, Minus, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KpiCard, type KpiTone } from '@/components/dashboard/KpiCard'
import { MaterialStatusBadge, type MaterialStatus } from '@/components/dashboard/StatusBadges'
import { TypeBadge, type QuoteType } from '@/components/quotes/TypeBadge'

/* ---------------------------------------------------------------------------
 * Tipi presentazionali (il container mappa i tipi reali su queste shape).
 * ------------------------------------------------------------------------- */
export interface OrderKpi {
  key: string
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  tone: KpiTone
}

/** Preventivo confermato selezionabile per l'ordine materiali. */
export interface SelectableQuote {
  id: number
  quote_number: string
  customer_name: string | null
  quote_type: QuoteType
  quote_date: string | null
  total_price: number
  materialStatus: MaterialStatus
}

/** Riga materiale grezzo aggregata (già raggruppata dal container). */
export interface AggregateItem {
  materialCode: string
  materialName?: string
  shape: string // "Prismatico" | "Tondo" | "Tubo" | ...
  dimensions: string // stringa già formattata (grezzo)
  quantity: number
  estimatedWeight: string // es. "12,1 kg" (già formattata)
  quoteRefs: string[]
  fromStock?: boolean
}

/** Gruppo materiali per fornitore. */
export interface SupplierAggregate {
  supplierId: number
  supplierName: string
  quoteCount: number
  items: AggregateItem[]
}

interface Props {
  subtitle?: string
  kpis: OrderKpi[]
  selectableQuotes: SelectableQuote[]
  selectedIds: number[]
  onToggle: (id: number) => void
  onToggleAll: () => void
  aggregate: SupplierAggregate[]
  onCreateOrder: (supplierId: number) => void
}

const SEL_GRID =
  'grid grid-cols-[38px_minmax(0,1.4fr)_minmax(0,1.3fr)_96px_110px_150px] items-center gap-3'
const AGG_GRID =
  'grid grid-cols-[minmax(0,1.4fr)_120px_150px_74px_100px_minmax(0,1fr)] items-center gap-3'

const eur0 = (v: number): string =>
  '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })

const dateShort = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—'

export function MaterialOrdersView({
  subtitle = 'Preventivi confermati da mettere in ordine · lista grezzi aggregata per fornitore',
  kpis,
  selectableQuotes,
  selectedIds,
  onToggle,
  onToggleAll,
  aggregate,
  onCreateOrder,
}: Props) {
  const allSelected = selectableQuotes.length > 0 && selectedIds.length === selectableQuotes.length
  const someSelected = selectedIds.length > 0 && !allSelected

  // Gruppi fornitore collassati di default: si aprono al click sull'intestazione.
  const [openSuppliers, setOpenSuppliers] = useState<Set<number>>(new Set())
  const toggleSupplier = (id: number) =>
    setOpenSuppliers(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="rounded-2xl border border-border bg-card px-[26px] pb-[26px] pt-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* StandardPage header */}
      <div className="mb-[22px] flex items-center gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-primary/[0.13] text-primary">
          <Package className="h-[23px] w-[23px]" />
        </div>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Ordini materiali</h1>
          <p className="text-[13.5px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-4 gap-[13px]">
        {kpis.map((k) => (
          <KpiCard key={k.key} label={k.label} value={k.value} hint={k.hint} icon={k.icon} tone={k.tone} />
        ))}
      </div>

      {/* Preventivi confermati selezionabili */}
      <div className="mb-[22px] overflow-hidden rounded-[14px] border border-border">
        <div className="flex items-center justify-between border-b border-border bg-card-muted px-[18px] py-3">
          <div className="text-[13px] font-semibold text-foreground">Preventivi confermati</div>
          <span className="text-[12px] text-muted-foreground">
            <span className="font-mono font-semibold text-primary">{selectedIds.length}</span> selezionati
          </span>
        </div>
        {/* head */}
        <div
          className={cn(
            SEL_GRID,
            'border-b border-border bg-card-muted px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground',
          )}
        >
          <div>
            <button
              type="button"
              onClick={onToggleAll}
              className={cn(
                'inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors',
                allSelected || someSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-transparent',
              )}
            >
              {someSelected ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" />}
            </button>
          </div>
          <div>Numero</div>
          <div>Cliente</div>
          <div>Data</div>
          <div className="text-right">Totale</div>
          <div>Stato materiale</div>
        </div>
        {/* rows */}
        {selectableQuotes.length === 0 && (
          <div className="px-6 py-10 text-center text-[13px] text-muted-foreground">
            Nessun preventivo confermato con materiale da ordinare.
          </div>
        )}
        {selectableQuotes.map((q, i) => {
          const checked = selectedIds.includes(q.id)
          const last = i === selectableQuotes.length - 1
          return (
            <div
              key={q.id}
              onClick={() => onToggle(q.id)}
              className={cn(
                SEL_GRID,
                'cursor-pointer px-[18px] py-3 text-[13.5px] transition-colors hover:bg-muted/45',
                !last && 'border-b border-border',
              )}
            >
              <div>
                <span
                  className={cn(
                    'inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px]',
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-transparent',
                  )}
                >
                  <Check className="h-3 w-3" />
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="whitespace-nowrap font-mono text-[13px] font-semibold text-foreground">
                  {q.quote_number}
                </span>
                <TypeBadge type={q.quote_type} />
              </div>
              <div className="min-w-0 truncate font-medium text-foreground">{q.customer_name ?? '—'}</div>
              <div className="font-mono text-[13px] text-muted-foreground">{dateShort(q.quote_date)}</div>
              <div className="text-right font-mono font-semibold text-foreground">{eur0(q.total_price)}</div>
              <div>
                <MaterialStatusBadge status={q.materialStatus} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Anteprima per fornitore */}
      <div className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        Anteprima materiali per fornitore
      </div>
      <div className="flex flex-col gap-4">
        {aggregate.length === 0 && (
          <div className="rounded-[14px] border border-dashed border-border px-6 py-8 text-center text-[13px] text-muted-foreground">
            Seleziona uno o più preventivi qui sopra per comporre l'ordine per fornitore.
          </div>
        )}
        {aggregate.map((g) => {
          const isOpen = openSuppliers.has(g.supplierId)
          return (
          <div key={g.supplierId} className="overflow-hidden rounded-[14px] border border-border">
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleSupplier(g.supplierId)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSupplier(g.supplierId) } }}
              className={cn(
                'flex cursor-pointer items-center justify-between bg-card-muted px-[18px] py-[13px] transition-colors hover:bg-muted',
                isOpen && 'border-b border-border',
              )}
            >
              <div className="flex items-center gap-[11px]">
                <ChevronDown
                  className={cn('h-[17px] w-[17px] flex-none text-muted-foreground transition-transform', !isOpen && '-rotate-90')}
                />
                <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-info/[0.13] text-info">
                  <Factory className="h-[17px] w-[17px]" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-foreground">{g.supplierName}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {g.items.length} materiali · da {g.quoteCount}{' '}
                    {g.quoteCount === 1 ? 'preventivo' : 'preventivi'}
                  </div>
                </div>
              </div>
              {g.items.some((it) => !it.fromStock) ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCreateOrder(g.supplierId) }}
                  className="inline-flex h-9 items-center gap-[7px] rounded-[9px] border border-border bg-card px-[15px] text-[13px] font-semibold text-foreground transition-[filter] hover:brightness-105"
                >
                  <FileDown className="h-[15px] w-[15px]" />
                  Crea CSV
                </button>
              ) : (
                // Tutte le righe del fornitore sono da magazzino: niente da
                // ordinare (il backend le esclude), quindi niente bottone CSV
                // che finirebbe in 400. Le righe restano visibili come info.
                <span className="inline-flex h-9 items-center gap-[7px] rounded-[9px] border border-dashed border-border px-[15px] text-[12.5px] font-medium text-muted-foreground">
                  <Warehouse className="h-[14px] w-[14px]" />
                  Tutto da magazzino
                </span>
              )}
            </div>
            {isOpen && (
              <>
                {/* items head */}
                <div
                  className={cn(
                    AGG_GRID,
                    'border-b border-border bg-card px-[18px] py-[9px] text-[10.5px] font-semibold uppercase tracking-[0.03em] text-muted-foreground',
                  )}
                >
                  <div>Materiale</div>
                  <div>Forma</div>
                  <div>Dimensioni</div>
                  <div className="text-right">Q.tà</div>
                  <div className="text-right">Peso stim.</div>
                  <div>Rif. preventivi</div>
                </div>
                {g.items.map((it, i) => {
                  const last = i === g.items.length - 1
                  return (
                    <div
                      key={i}
                      className={cn(AGG_GRID, 'px-[18px] py-[11px] text-[12.5px]', !last && 'border-b border-border')}
                    >
                      <div className="flex items-center gap-2">
                        <span>
                          <span className="font-mono">{it.materialCode}</span>
                          {it.materialName && <span className="text-muted-foreground"> · {it.materialName}</span>}
                        </span>
                        {it.fromStock && (
                          <span className="inline-flex items-center gap-[5px] rounded-full bg-info/[0.13] px-2 py-[2px] text-[10px] font-semibold text-info">
                            <Warehouse className="h-[11px] w-[11px]" />
                            Da magazzino
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground">{it.shape}</div>
                      <div className="font-mono text-muted-foreground">{it.dimensions}</div>
                      <div className="text-right font-mono">{it.quantity}</div>
                      <div className="text-right font-mono">{it.estimatedWeight}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{it.quoteRefs.join(' ')}</div>
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
