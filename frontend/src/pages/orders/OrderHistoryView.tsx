// src/pages/orders/OrderHistoryView.tsx
import { History, Search, Package, Drill, Bolt, FileDown, Trash2, FileSpreadsheet, ClipboardList } from 'lucide-react'
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

function RowActions({ onCsv, onDel }: { onCsv: () => void; onDel: () => void }) {
  // AUD-42: button accessibili (focus da tastiera + nome) invece di SVG nudi.
  return (
    <div className="flex justify-end gap-2 text-muted-foreground">
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

export function OrderHistoryView({
  subtitle = 'Ordini emessi · scarica il CSV o elimina',
  tab,
  onTabChange,
  search,
  onSearch,
  materialOrders,
  toolOrders,
  normalizedOrders,
  onDownloadCsv,
  onDelete,
}: Props) {
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
            placeholder="Cerca per numero o fornitore…"
            className="h-[38px] w-full rounded-[9px] border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
          />
        </div>
      </div>

      {/* MATERIAL ORDERS */}
      {tab === 'materials' && (
        <div className="overflow-hidden rounded-[14px] border border-border">
          <TableHead />
          {materialOrders.map((o, i) => {
            const last = i === materialOrders.length - 1
            return (
              <div
                key={o.id}
                className={cn(GRID, 'px-[18px] py-[13px] text-[13.5px]', !last && 'border-b border-border')}
              >
                <div className="font-mono font-semibold text-foreground">{o.number}</div>
                <div className="font-mono text-[13px] text-muted-foreground">{dateShort(o.date)}</div>
                <div className="font-medium text-foreground">{o.supplierName}</div>
                <div className="text-[13px] text-muted-foreground">{o.createdBy}</div>
                <div className="flex min-w-0 items-center gap-2">
                  {(o.source === 'quotes' || o.source === 'mixed') && (
                    <>
                      <span className="text-[12.5px] text-muted-foreground">
                        {(o.quoteRefs?.length ?? 0)}{' '}
                        {(o.quoteRefs?.length ?? 0) === 1 ? 'preventivo' : 'preventivi'}
                      </span>
                      {o.quoteRefs?.map((ref) => (
                        <span
                          key={ref}
                          className="rounded-[6px] bg-muted px-[7px] py-[2px] font-mono text-[11px] text-muted-foreground"
                        >
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
                </div>
                <RowActions onCsv={() => onDownloadCsv(o.id)} onDel={() => onDelete(o)} />
              </div>
            )
          })}
        </div>
      )}

      {/* TOOL ORDERS */}
      {tab === 'tools' && (
        <div className="overflow-hidden rounded-[14px] border border-border">
          <TableHead />
          {toolOrders.map((o, i) => {
            const last = i === toolOrders.length - 1
            return (
              <div
                key={o.id}
                className={cn(GRID, 'px-[18px] py-[13px] text-[13.5px]', !last && 'border-b border-border')}
              >
                <div className="font-mono font-semibold text-foreground">{o.number}</div>
                <div className="font-mono text-[13px] text-muted-foreground">{dateShort(o.date)}</div>
                <div className="font-medium text-foreground">{o.supplierName}</div>
                <div className="text-[13px] text-muted-foreground">{o.createdBy}</div>
                <div className="text-[12.5px] text-muted-foreground">
                  {o.toolCount} utensili · {o.pieceCount} pezzi
                </div>
                <RowActions onCsv={() => onDownloadCsv(o.id)} onDel={() => onDelete(o)} />
              </div>
            )
          })}
        </div>
      )}

      {/* NORMALIZED ORDERS */}
      {tab === 'normalized' && (
        <div className="overflow-hidden rounded-[14px] border border-border">
          <TableHead />
          {normalizedOrders.map((o, i) => {
            const last = i === normalizedOrders.length - 1
            return (
              <div
                key={o.id}
                className={cn(GRID, 'px-[18px] py-[13px] text-[13.5px]', !last && 'border-b border-border')}
              >
                <div className="font-mono font-semibold text-foreground">{o.number}</div>
                <div className="font-mono text-[13px] text-muted-foreground">{dateShort(o.date)}</div>
                <div className="font-medium text-foreground">{o.supplierName}</div>
                <div className="text-[13px] text-muted-foreground">{o.createdBy}</div>
                <div className="text-[12.5px] text-muted-foreground">{o.itemCount} righe</div>
                <RowActions onCsv={() => onDownloadCsv(o.id)} onDel={() => onDelete(o)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
