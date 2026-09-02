// src/pages/orders/OrderHistoryView.tsx
import { useEffect, useState } from 'react'
import { History, Search, Package, Drill, Bolt, FileDown, Trash2, FileSpreadsheet, ClipboardList, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type HistoryTab = 'materials' | 'tools' | 'normalized'

/** Ordine materiali emesso. `source`: da preventivi / da richiesta materiale /
 *  misto / da distinta (storico). */
export interface MaterialOrder {
  id: number
  number: string // "MO-2026-014"
  date: string | null
  supplierName: string
  createdBy: string
  source: 'quotes' | 'request' | 'mixed' | 'file'
  quoteRefs?: string[] // presenti se l'ordine include preventivi (quotes/mixed)
  rowCount?: number // righe snapshot (request/mixed/file)
  totalCost?: number // totale SOLO materiale (grezzo + spedizione + taglio)
}

export interface ToolOrder {
  id: number
  number: string // "UO-2026-031"
  date: string | null
  supplierName: string
  createdBy: string
  toolCount: number
  pieceCount: number
}

/** Ordine di componenti normalizzati (da distinta). */
export interface NormOrder {
  id: number
  number: string // "NO-2026-005"
  date: string | null
  supplierName: string
  createdBy: string
  itemCount: number
}

// ─── Righe (item) di dettaglio, dagli endpoint /{id}/items ──────────────────
export interface MaterialItemRow {
  reference: string; material_name: string; shape: string; dimensions: string
  quantity: number; weight_kg: number | null; material_cost: number | null
}
export interface ToolItemRow {
  code: string; tool_type: string; brand: string; model: string
  diameter_mm: number | null; quantity_at_time: number; minimum_at_time: number; quantity_to_order: number
}
export interface NormItemRow {
  reference: string; article: string; description: string
  quantity: number; unit_price: number | null; cost: number | null
}
export type OrderItemRow = MaterialItemRow | ToolItemRow | NormItemRow

interface Props {
  subtitle?: string
  tab: HistoryTab
  onTabChange: (tab: HistoryTab) => void
  search: string
  onSearch: (value: string) => void
  materialOrders: MaterialOrder[]
  toolOrders: ToolOrder[]
  normalizedOrders: NormOrder[]
  onDownloadCsv: (id: number) => void
  /** Il container mostra la conferma prima di eliminare. */
  onDelete: (order: MaterialOrder | ToolOrder | NormOrder) => void
  /** Carica le righe dell'ordine (lazy, all'espansione). */
  fetchItems: (tab: HistoryTab, id: number) => Promise<OrderItemRow[]>
}

const GRID =
  'grid grid-cols-[150px_90px_minmax(0,1fr)_130px_minmax(0,1.7fr)_96px] items-center gap-3'

const TABS: { key: HistoryTab; label: string; icon: typeof Package }[] = [
  { key: 'materials', label: 'Ordini materiali', icon: Package },
  { key: 'normalized', label: 'Ordini normalizzati', icon: Bolt },
  { key: 'tools', label: 'Ordini utensili', icon: Drill },
]

const dateShort = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—'

const numIt = (n: number | null | undefined, dec = 0): string =>
  n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const kgIt = (n: number | null | undefined): string => (n == null ? '—' : `${numIt(n, 2)} kg`)
const eurIt = (n: number | null | undefined): string => (n == null ? '—' : `€ ${numIt(n, 2)}`)

function RowActions({ onCsv, onDel }: { onCsv: () => void; onDel: () => void }) {
  // AUD-42: button accessibili (focus da tastiera + nome) invece di SVG nudi.
  // stopPropagation: il click sulle azioni non deve espandere/chiudere la riga.
  return (
    <div className="flex justify-end gap-2 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onCsv}
        title="Scarica CSV"
        aria-label="Scarica CSV dell'ordine"
        className="flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors hover:text-foreground"
      >
        <FileDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDel}
        title="Elimina ordine"
        aria-label="Elimina ordine"
        className="flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors hover:text-danger"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Cella "Numero" con chevron di espansione. */
function NumberCell({ number, expanded }: { number: string; expanded: boolean }) {
  return (
    <div className="flex items-center gap-1.5 font-mono font-semibold text-foreground">
      <ChevronRight className={cn('h-3.5 w-3.5 flex-none text-muted-foreground transition-transform', expanded && 'rotate-90')} />
      {number}
    </div>
  )
}

function TableHead() {
  return (
    <div
      className={cn(
        GRID,
        'border-b border-border bg-card-muted px-[18px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground',
      )}
    >
      <div>Numero</div>
      <div>Data</div>
      <div>Fornitore</div>
      <div>Creato da</div>
      <div>Contenuto</div>
      <div className="text-right">Azioni</div>
    </div>
  )
}

// ─── Pannello righe (sub-tabella per tab) ───────────────────────────────────

const TH = 'px-2.5 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.03em] text-muted-foreground'
const TD = 'px-2.5 py-1.5 text-[12.5px] text-foreground'
const TDnum = cn(TD, 'text-right font-mono tabular-nums')

function ItemsPanel({ tab, rows, loading }: { tab: HistoryTab; rows?: OrderItemRow[]; loading: boolean }) {
  if (loading) return <div className="py-2 text-[13px] text-muted-foreground">Caricamento righe…</div>
  if (!rows || rows.length === 0) return <div className="py-2 text-[13px] text-muted-foreground">Nessuna riga.</div>

  if (tab === 'materials') {
    const items = rows as MaterialItemRow[]
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className={TH}>Riferimento</th><th className={TH}>Materiale</th>
              <th className={TH}>Forma</th><th className={TH}>Misure</th>
              <th className={cn(TH, 'text-right')}>Q.tà</th>
              <th className={cn(TH, 'text-right')}>Peso</th>
              <th className={cn(TH, 'text-right')}>Costo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className={cn(TD, 'font-mono text-muted-foreground')}>{it.reference || '—'}</td>
                <td className={cn(TD, 'font-medium')}>{it.material_name || '—'}</td>
                <td className={cn(TD, 'capitalize text-muted-foreground')}>{it.shape}</td>
                <td className={cn(TD, 'text-muted-foreground')}>{it.dimensions}</td>
                <td className={TDnum}>{numIt(it.quantity)}</td>
                <td className={TDnum}>{kgIt(it.weight_kg)}</td>
                <td className={cn(TDnum, 'text-foreground')}>{eurIt(it.material_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (tab === 'tools') {
    const items = rows as ToolItemRow[]
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className={TH}>Codice</th><th className={TH}>Tipo</th>
              <th className={TH}>Marca</th><th className={TH}>Modello</th>
              <th className={cn(TH, 'text-right')}>Ø</th>
              <th className={cn(TH, 'text-right')}>Attuale</th>
              <th className={cn(TH, 'text-right')}>Minimo</th>
              <th className={cn(TH, 'text-right')}>Da ordinare</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className={cn(TD, 'font-mono font-medium')}>{it.code}</td>
                <td className={cn(TD, 'text-muted-foreground')}>{it.tool_type || '—'}</td>
                <td className={cn(TD, 'text-muted-foreground')}>{it.brand || '—'}</td>
                <td className={cn(TD, 'text-muted-foreground')}>{it.model || '—'}</td>
                <td className={TDnum}>{it.diameter_mm == null ? '—' : numIt(it.diameter_mm, 1)}</td>
                <td className={TDnum}>{numIt(it.quantity_at_time)}</td>
                <td className={TDnum}>{numIt(it.minimum_at_time)}</td>
                <td className={cn(TDnum, 'font-semibold text-foreground')}>{numIt(it.quantity_to_order)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const items = rows as NormItemRow[]
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className={TH}>Riferimento</th><th className={TH}>Articolo</th>
            <th className={TH}>Descrizione</th>
            <th className={cn(TH, 'text-right')}>Q.tà</th>
            <th className={cn(TH, 'text-right')}>Prezzo</th>
            <th className={cn(TH, 'text-right')}>Costo</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              <td className={cn(TD, 'font-mono text-muted-foreground')}>{it.reference || '—'}</td>
              <td className={cn(TD, 'font-medium')}>{it.article || '—'}</td>
              <td className={cn(TD, 'text-muted-foreground')}>{it.description || '—'}</td>
              <td className={TDnum}>{numIt(it.quantity)}</td>
              <td className={TDnum}>{eurIt(it.unit_price)}</td>
              <td className={cn(TDnum, 'text-foreground')}>{eurIt(it.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function OrderHistoryView({
  subtitle = 'Ordini emessi · apri una riga per vederne il contenuto, scarica il CSV o elimina',
  tab,
  onTabChange,
  search,
  onSearch,
  materialOrders,
  toolOrders,
  normalizedOrders,
  onDownloadCsv,
  onDelete,
  fetchItems,
}: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [itemsById, setItemsById] = useState<Record<number, OrderItemRow[]>>({})
  const [loadingId, setLoadingId] = useState<number | null>(null)

  // Cambiando tab, azzera espansione e cache (gli id possono collidere tra tab
  // e le righe hanno forma diversa).
  useEffect(() => {
    setExpanded(null)
    setItemsById({})
  }, [tab])

  const toggle = (id: number) => {
    if (expanded === id) {
      setExpanded(null)
      return
    }
    setExpanded(id)
    if (!itemsById[id]) {
      setLoadingId(id)
      fetchItems(tab, id)
        .then((rows) => setItemsById((prev) => ({ ...prev, [id]: rows })))
        .catch(() => setItemsById((prev) => ({ ...prev, [id]: [] })))
        .finally(() => setLoadingId(null))
    }
  }

  const orders =
    tab === 'materials' ? materialOrders : tab === 'tools' ? toolOrders : normalizedOrders

  return (
    <div className="rounded-2xl border border-border bg-card px-[26px] pb-[26px] pt-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {/* StandardPage header */}
      <div className="mb-[22px] flex items-center gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-primary/[0.13] text-primary">
          <History className="h-[23px] w-[23px]" />
        </div>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Storico ordini</h1>
          <p className="text-[13.5px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* tab + ricerca */}
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-[3px] rounded-[10px] bg-muted p-[3px]">
          {TABS.map((t) => {
            const active = tab === t.key
            const Icon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                className={cn(
                  'flex h-[34px] items-center gap-[7px] rounded-[7px] px-4 text-[13px] font-semibold transition-colors',
                  active
                    ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                    : 'text-muted-foreground',
                )}
              >
                <Icon className="h-[15px] w-[15px]" />
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="relative w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-[11px] h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Cerca per numero, fornitore, materiale, descrizione…"
            className="h-[38px] w-full rounded-[9px] border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-border">
        <TableHead />
        {orders.length === 0 && (
          <div className="px-[18px] py-6 text-center text-[13px] text-muted-foreground">Nessun ordine.</div>
        )}
        {orders.map((o, i) => {
          const last = i === orders.length - 1
          const isOpen = expanded === o.id
          return (
            <div key={o.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggle(o.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(o.id) } }}
                className={cn(
                  GRID,
                  'cursor-pointer px-[18px] py-[13px] text-[13.5px] transition-colors hover:bg-muted/40',
                  (!last || isOpen) && 'border-b border-border',
                )}
              >
                <NumberCell number={o.number} expanded={isOpen} />
                <div className="font-mono text-[13px] text-muted-foreground">{dateShort(o.date)}</div>
                <div className="font-medium text-foreground">{o.supplierName}</div>
                <div className="text-[13px] text-muted-foreground">{o.createdBy}</div>
                <div className="flex min-w-0 items-center gap-2">
                  {tab === 'materials' && <MaterialContent o={o as MaterialOrder} />}
                  {tab === 'materials' && (o as MaterialOrder).totalCost != null && (
                    <span
                      title="Totale solo materiale: grezzo + spedizione + taglio"
                      className="ml-auto flex-none font-mono text-[13.5px] font-semibold text-foreground"
                    >
                      {eurIt((o as MaterialOrder).totalCost)}
                    </span>
                  )}
                  {tab === 'tools' && (
                    <span className="text-[12.5px] text-muted-foreground">
                      {(o as ToolOrder).toolCount} utensili · {(o as ToolOrder).pieceCount} pezzi
                    </span>
                  )}
                  {tab === 'normalized' && (
                    <span className="text-[12.5px] text-muted-foreground">{(o as NormOrder).itemCount} righe</span>
                  )}
                </div>
                <RowActions onCsv={() => onDownloadCsv(o.id)} onDel={() => onDelete(o)} />
              </div>
              {isOpen && (
                <div className={cn('bg-card-muted px-[18px] py-3', !last && 'border-b border-border')}>
                  <ItemsPanel tab={tab} rows={itemsById[o.id]} loading={loadingId === o.id} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Cella "Contenuto" per gli ordini materiali (badge sorgente + refs/righe). */
function MaterialContent({ o }: { o: MaterialOrder }) {
  return (
    <>
      {(o.source === 'quotes' || o.source === 'mixed') && (
        <>
          <span className="text-[12.5px] text-muted-foreground">
            {(o.quoteRefs?.length ?? 0)} {(o.quoteRefs?.length ?? 0) === 1 ? 'preventivo' : 'preventivi'}
          </span>
          {o.quoteRefs?.map((ref) => (
            <span key={ref} className="rounded-[6px] bg-muted px-[7px] py-[2px] font-mono text-[11px] text-muted-foreground">
              {ref}
            </span>
          ))}
        </>
      )}
      {(o.source === 'request' || o.source === 'mixed') && (
        <span className="inline-flex items-center gap-[5px] rounded-full bg-warning/[0.13] px-[9px] py-[2px] text-[10.5px] font-semibold text-warning">
          <ClipboardList className="h-[11px] w-[11px]" />
          {o.source === 'mixed' ? 'Con richiesta' : 'Richiesta materiale'}
        </span>
      )}
      {o.source === 'file' && (
        <span className="inline-flex items-center gap-[5px] rounded-full bg-info/[0.13] px-[9px] py-[2px] text-[10.5px] font-semibold text-info">
          <FileSpreadsheet className="h-[11px] w-[11px]" />
          Distinta (da file)
        </span>
      )}
      {o.source !== 'quotes' && (
        <span className="text-[12.5px] text-muted-foreground">{o.rowCount ?? 0} righe</span>
      )}
    </>
  )
}
