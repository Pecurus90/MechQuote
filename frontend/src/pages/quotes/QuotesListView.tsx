// src/pages/quotes/QuotesListView.tsx — vista presentazionale liste preventivi.
import type { LucideIcon } from 'lucide-react'
import {
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Hourglass,
  CheckCheck,
  XCircle,
  Trash2,
  SearchX,
} from 'lucide-react'
import { useState, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { parseDecimalOrNull } from '@/lib/decimalInput'
import type { QuoteListItem } from '@/types'
import { StatusBadge, MaterialStatusBadge } from '@/components/dashboard/StatusBadges'
import type { QuoteStatus, MaterialStatus } from '@/components/dashboard/StatusBadges'
import { TypeBadge, type QuoteType } from '@/components/quotes/TypeBadge'
import { QuoteArticleRows, type ArticleMaterialRow } from '@/components/quotes/QuoteArticleRows'

export type QuoteTypeFilter = 'all' | QuoteType

export interface ListFilters {
  search: string
  year: string
  status: string
  type: QuoteTypeFilter
}

export interface SelectOption {
  value: string
  label: string
}

/** Riga già arricchita dal container: totale e stato materiale aggregato pronti. */
export interface QuotesListRow extends QuoteListItem {
  total_price: number
  materialStatus?: MaterialStatus
}

interface Props {
  title: string
  icon: LucideIcon
  subtitle: string
  onNew?: () => void

  rows: QuotesListRow[]
  emptyText: string

  expandedId: number | null
  onToggleExpand: (id: number) => void
  articleRows: ArticleMaterialRow[]

  filters: ListFilters
  onFilterChange: <K extends keyof ListFilters>(key: K, val: ListFilters[K]) => void
  years: SelectOption[]
  statusOptions: SelectOption[]

  onOpen: (id: number) => void
  onAwaitClient?: (id: number) => void
  onConfirm?: (id: number) => void
  onNotOrdered?: (id: number) => void
  onMaterialCsv?: (id: number) => void
  onDelete?: (id: number) => void
  canAwaitClient?: (row: QuotesListRow) => boolean
  canConfirm?: (row: QuotesListRow) => boolean
  canNotOrdered?: (row: QuotesListRow) => boolean
  canMaterialCsv?: (row: QuotesListRow) => boolean
  canDelete?: (row: QuotesListRow) => boolean

  /** Archivio: mostra le colonne prezzo (Venduto/Costo/Margine) editabili
      inline al posto di Data/Materiale. Solo i completi sono editabili. */
  showPrices?: boolean
  onSavePrice?: (id: number, field: 'sold_price' | 'actual_cost', value: number | null) => void

  pagination?: ReactNode
}

const GRID_ACTIVE =
  'grid grid-cols-[30px_minmax(0,1.5fr)_minmax(0,1.1fr)_90px_122px_138px_108px_132px] items-center gap-3'
const GRID_ARCHIVE =
  'grid grid-cols-[30px_minmax(0,1.4fr)_minmax(0,1fr)_112px_104px_112px_112px_104px_116px] items-center gap-3'

const TYPE_FILTERS: { key: QuoteTypeFilter; label: string }[] = [
  { key: 'all', label: 'Tutti' },
  { key: 'single', label: 'Singolo' },
  { key: 'commessa', label: 'Commessa' },
  { key: 'die', label: 'Stampo' },
]

const eur0 = (v: number): string =>
  '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })

const dateShort = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—'

function toQuoteType(t?: string | null): QuoteType {
  return t === 'die' ? 'die' : t === 'commessa' ? 'commessa' : 'single'
}

/** Cella prezzo editabile inline (Archivio). Click → input; Invio/blur salva,
    Esc annulla. Non editabile → "—". */
function PriceCell({ value, editable, onSave }: {
  value: number | null | undefined
  editable: boolean
  onSave: (v: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Evita il doppio commit (Enter → setEditing(false) → l'input si smonta →
  // scatta onBlur → secondo commit) e i salvataggi inutili.
  const doneRef = useRef(false)

  if (!editable) return <div className="text-right text-muted-foreground">—</div>

  const commit = () => {
    if (doneRef.current) return
    doneRef.current = true
    setEditing(false)
    const parsed = parseDecimalOrNull(draft)   // parser IT: gestisce "1.300,50"
    if (parsed !== (value ?? null)) onSave(parsed)  // salva solo se cambiato
  }
  const cancel = () => { doneRef.current = true; setEditing(false) }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-[7px] border border-ring bg-background px-2 py-1 text-right font-mono text-[13px] text-foreground outline-none focus:ring-2 focus:ring-ring/[0.18]"
      />
    )
  }

  return (
    <button
      type="button"
      title="Modifica"
      onClick={(e) => { e.stopPropagation(); doneRef.current = false; setDraft(value != null ? String(value) : ''); setEditing(true) }}
      className="w-full rounded-[7px] px-2 py-1 text-right font-mono text-[13px] transition-colors hover:bg-muted"
    >
      {value != null
        ? <span className="font-semibold text-foreground">{eur0(value)}</span>
        : <span className="text-primary/80">inserisci</span>}
    </button>
  )
}

export function QuotesListView(props: Props) {
  const {
    title, icon: Icon, subtitle, onNew, rows, emptyText,
    expandedId, onToggleExpand, articleRows,
    filters, onFilterChange, years, statusOptions,
    onOpen, onAwaitClient, onConfirm, onNotOrdered, onMaterialCsv, onDelete,
    canAwaitClient, canConfirm, canNotOrdered, canMaterialCsv, canDelete,
    showPrices = false, onSavePrice, pagination,
  } = props

  const GRID = showPrices ? GRID_ARCHIVE : GRID_ACTIVE

  return (
    <div className="rounded-2xl border border-border bg-card px-[26px] pb-[22px] pt-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="mb-[22px] flex items-center gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-primary/[0.13] text-primary">
          <Icon className="h-[23px] w-[23px]" />
        </div>
        <div className="flex-1">
          <h2 className="mb-[3px] text-[22px] font-bold tracking-tight text-foreground">{title}</h2>
          <p className="text-[13.5px] text-muted-foreground">{subtitle}</p>
        </div>
        {onNew && (
          <button
            type="button"
            onClick={onNew}
            className="inline-flex h-10 flex-none items-center gap-2 rounded-[10px] bg-primary px-[18px] text-sm font-semibold text-primary-foreground transition-[filter] hover:brightness-105"
          >
            <Plus className="h-[17px] w-[17px]" />
            Nuovo preventivo
          </button>
        )}
      </div>

      {/* Toolbar filtri */}
      <div className="mb-[18px] flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-[11px] h-4 w-4 text-muted-foreground" />
          <input
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            placeholder="Cerca per numero o cliente…"
            className="h-[38px] w-full rounded-[9px] border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
          />
        </div>
        <div className="relative w-[132px]">
          <select
            value={filters.year}
            onChange={(e) => onFilterChange('year', e.target.value)}
            className="h-[38px] w-full cursor-pointer appearance-none rounded-[9px] border border-input bg-background pl-3 pr-8 text-[13.5px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
          >
            {years.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-[11px] top-[11px] h-[15px] w-[15px] text-muted-foreground" />
        </div>
        {statusOptions.length > 1 && (
          <div className="relative w-[150px]">
            <select
              value={filters.status}
              onChange={(e) => onFilterChange('status', e.target.value)}
              className="h-[38px] w-full cursor-pointer appearance-none rounded-[9px] border border-input bg-background pl-3 pr-8 text-[13.5px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
            >
              {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-[11px] top-[11px] h-[15px] w-[15px] text-muted-foreground" />
          </div>
        )}
        <div className="flex h-[38px] gap-[3px] rounded-[9px] bg-muted p-[3px]">
          {TYPE_FILTERS.map((t) => {
            const active = filters.type === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onFilterChange('type', t.key)}
                className={cn(
                  'flex items-center rounded-[7px] px-[13px] text-[12.5px] font-semibold transition-colors',
                  active ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted-foreground',
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tabella */}
      <div className="overflow-hidden rounded-[14px] border border-border">
        <div className={cn(GRID, 'border-b border-border bg-card-muted px-[18px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground')}>
          <div />
          <div>Numero</div>
          <div>Cliente</div>
          {showPrices ? (
            <>
              <div>Stato</div>
              <div className="text-right">Preventivato</div>
              <div className="text-right">Venduto</div>
              <div className="text-right">Costo</div>
              <div className="text-right">Margine</div>
              <div className="text-right">Azioni</div>
            </>
          ) : (
            <>
              <div>Data</div>
              <div>Stato</div>
              <div>Materiale</div>
              <div className="text-right">Totale</div>
              <div className="text-right">Azioni</div>
            </>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 flex h-13 w-13 items-center justify-center rounded-[14px] bg-muted p-3 text-muted-foreground">
              <SearchX className="h-[26px] w-[26px]" />
            </div>
            <div className="mb-1 text-[15px] font-semibold text-foreground">Nessun preventivo</div>
            <p className="max-w-[340px] text-[13px] text-muted-foreground">{emptyText}</p>
          </div>
        ) : (
          rows.map((r, i) => {
            const expanded = expandedId === r.id
            const last = i === rows.length - 1
            const showAwaitClient = !!onAwaitClient && (canAwaitClient ? canAwaitClient(r) : true)
            const showConfirm = !!onConfirm && (canConfirm ? canConfirm(r) : true)
            const showNotOrdered = !!onNotOrdered && (canNotOrdered ? canNotOrdered(r) : true)
            const showMaterialCsv = !!onMaterialCsv && (canMaterialCsv ? canMaterialCsv(r) : true)
            const showDelete = !!onDelete && (canDelete ? canDelete(r) : true)
            // Consuntivo (Archivio): compilabile solo sui completi.
            const editablePrice = showPrices && r.status === 'completo'
            const sold = r.sold_price ?? null
            const cost = r.actual_cost ?? null
            const margin = sold != null && cost != null ? sold - cost : null
            const marginPct = margin != null && sold ? (margin / sold) * 100 : null
            return (
              <div key={r.id} className={cn(!last && 'border-b border-border')}>
                <div
                  onClick={() => onToggleExpand(r.id)}
                  className={cn(GRID, 'cursor-pointer px-[18px] py-[13px] text-[13.5px] transition-colors hover:bg-muted/50', expanded && 'bg-muted/40')}
                >
                  {expanded ? (
                    <ChevronDown className="h-[17px] w-[17px] text-foreground" />
                  ) : (
                    <ChevronRight className="h-[17px] w-[17px] text-muted-foreground" />
                  )}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="whitespace-nowrap font-mono text-[13px] font-semibold text-foreground">{r.quote_number}</span>
                    <TypeBadge type={toQuoteType(r.quote_type)} />
                  </div>
                  <div className="min-w-0 truncate font-medium text-foreground">{r.customer_name ?? '—'}</div>
                  {showPrices ? (
                    <>
                      <div><StatusBadge status={r.status as QuoteStatus} /></div>
                      <div className="text-right font-mono text-[13px] text-muted-foreground">{eur0(r.total_price)}</div>
                      <PriceCell value={sold} editable={editablePrice} onSave={(v) => onSavePrice?.(r.id, 'sold_price', v)} />
                      <PriceCell value={cost} editable={editablePrice} onSave={(v) => onSavePrice?.(r.id, 'actual_cost', v)} />
                      <div className="text-right font-mono text-[13px]">
                        {margin != null ? (
                          <span className={cn('font-semibold', margin >= 0 ? 'text-success' : 'text-danger')}>
                            {eur0(margin)}{marginPct != null ? ` · ${marginPct.toFixed(0)}%` : ''}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-mono text-[13px] text-muted-foreground">{dateShort(r.quote_date)}</div>
                      <div><StatusBadge status={r.status as QuoteStatus} /></div>
                      <div>
                        {r.materialStatus ? (
                          <MaterialStatusBadge status={r.materialStatus} />
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="text-right font-mono font-semibold text-foreground">{eur0(r.total_price)}</div>
                    </>
                  )}
                  <div className="flex items-center justify-end gap-[9px]" onClick={(e) => e.stopPropagation()}>
                    <button type="button" title="Apri preventivo" aria-label="Apri preventivo"
                      className="text-muted-foreground transition-colors hover:text-foreground" onClick={() => onOpen(r.id)}>
                      <FileText className="h-4 w-4" />
                    </button>
                    {showAwaitClient && (
                      <button type="button" title="In attesa del cliente" aria-label="In attesa del cliente"
                        className="text-state-attesa transition-[filter] hover:brightness-110" onClick={() => onAwaitClient?.(r.id)}>
                        <Hourglass className="h-4 w-4" />
                      </button>
                    )}
                    {showConfirm && (
                      <button type="button" title="Conferma ordine" aria-label="Conferma ordine"
                        className="text-state-confermato transition-[filter] hover:brightness-110" onClick={() => onConfirm?.(r.id)}>
                        <CheckCheck className="h-4 w-4" />
                      </button>
                    )}
                    {showNotOrdered && (
                      <button type="button" title="Segna come non ordinato" aria-label="Segna come non ordinato"
                        className="text-state-perso transition-[filter] hover:brightness-110" onClick={() => onNotOrdered?.(r.id)}>
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                    {showMaterialCsv && (
                      <button type="button" title="Scarica CSV materiali" aria-label="Scarica CSV materiali"
                        className="text-muted-foreground transition-colors hover:text-foreground" onClick={() => onMaterialCsv?.(r.id)}>
                        <FileSpreadsheet className="h-4 w-4" />
                      </button>
                    )}
                    {showDelete && (
                      <button type="button" title="Elimina preventivo" aria-label="Elimina preventivo"
                        className="text-muted-foreground transition-colors hover:text-danger" onClick={() => onDelete?.(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {expanded && (
                  <div className="bg-muted/40 py-2 pl-[60px] pr-[18px] pb-[18px]">
                    <div className="mb-2.5 mt-2 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Articoli &amp; materiale
                    </div>
                    <QuoteArticleRows rows={articleRows} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {pagination && <div className="flex items-center justify-between px-1 pb-0.5 pt-3.5">{pagination}</div>}
    </div>
  )
}
