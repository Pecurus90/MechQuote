import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, HandCoins, Receipt, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import DirectSaleFormModal from './DirectSaleFormModal'
import type { DirectSale, Customer, Category } from '@/types'
import { dateShort } from '@/lib/utils'

const eur = (v: number) => '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Campo non compilato: in rosso, per farlo risaltare.
const missingCell = <span className="font-mono text-danger">—</span>

const PAGE_SIZE = 20
type PrevFilter = 'all' | 'with' | 'without'

export default function DirectSalesPage() {
  const nowYear = new Date().getFullYear()
  const [sales, setSales] = useState<DirectSale[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [year, setYear] = useState<number>(nowYear)
  const [showForm, setShowForm] = useState(false)
  const [editSale, setEditSale] = useState<DirectSale | null>(null)
  const [pendingDel, setPendingDel] = useState<number | null>(null)

  // Filtri locali (client-side sui dati dell'anno caricato).
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [prevFilter, setPrevFilter] = useState<PrevFilter>('all')
  const [page, setPage] = useState(1)

  const load = () => api.get(`/direct-sales?year=${year}`).then(r => setSales(r.data)).catch(() => toast.error('Errore nel caricamento delle vendite'))
  useEffect(() => { load() /* eslint-disable-next-line */ }, [year])
  useEffect(() => {
    api.get('/customers?active_only=true').then(r => setCustomers(r.data)).catch(() => undefined)
    api.get('/quote-categories').then(r => setCategories(r.data)).catch(() => undefined)
  }, [])

  // Ogni cambio di filtro riporta alla prima pagina.
  useEffect(() => { setPage(1) }, [year, search, catFilter, prevFilter])

  const confirmDelete = async () => {
    if (pendingDel == null) return
    const id = pendingDel; setPendingDel(null)
    try { await api.delete(`/direct-sales/${id}`); toast.success('Vendita eliminata'); load() }
    catch { toast.error('Errore nell\'eliminazione') }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sales.filter(s => {
      if (catFilter !== 'all' && s.category_code !== catFilter) return false
      if (prevFilter === 'with' && s.quoted_value == null) return false
      if (prevFilter === 'without' && s.quoted_value != null) return false
      if (q) {
        const hay = `${s.code} ${s.customer_name || ''} ${s.description || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [sales, search, catFilter, prevFilter])

  // Totali sul set filtrato (tutte le pagine, non solo quella visibile).
  const totalSold = filtered.reduce((s, x) => s + x.unit_price * x.quantity, 0)
  const totalCost = filtered.reduce((s, x) => s + x.unit_cost * x.quantity, 0)
  const totalPrev = filtered.reduce((s, x) => s + (x.quoted_value != null ? x.quoted_value * x.quantity : 0), 0)

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamped = Math.min(page, pageCount)
  const pageRows = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE)
  const rangeFrom = filtered.length === 0 ? 0 : (pageClamped - 1) * PAGE_SIZE + 1
  const rangeTo = Math.min(pageClamped * PAGE_SIZE, filtered.length)

  const years = Array.from({ length: 6 }, (_, i) => nowYear - i)
  const hasFilters = search.trim() !== '' || catFilter !== 'all' || prevFilter !== 'all'

  const startNew = () => { setEditSale(null); setShowForm(true) }

  const actions = (
    <div className="flex items-center gap-3">
      <select
        value={year}
        onChange={e => setYear(Number(e.target.value))}
        className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm"
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <PrimaryCtaButton color="sales" size="sm" onClick={startNew}>
        <Plus className="h-4 w-4" /> Nuova vendita
      </PrimaryCtaButton>
    </div>
  )

  return (
    <StandardPage
      icon={HandCoins}
      color="sales"
      width="xl"
      title="Vendite dirette"
      subtitle="Vendite di componenti fuori preventivo (ricambi). Confluiscono nel venduto annuo."
      actions={actions}
    >
      {/* Barra filtri */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per codice, cliente o descrizione…"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/[0.18]"
          />
        </div>
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">Categoria · tutte</option>
          {categories.map(c => <option key={c.id} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
        <select
          value={prevFilter}
          onChange={e => setPrevFilter(e.target.value as PrevFilter)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">Preventivo · tutte</option>
          <option value="with">Con preventivo al volo</option>
          <option value="without">Vendita secca</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setCatFilter('all'); setPrevFilter('all') }}
            className="h-9 rounded-md px-2.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Azzera filtri
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <colgroup>
              <col style={{ width: 130 }} /><col style={{ width: 150 }} /><col /><col style={{ width: 92 }} />
              <col style={{ width: 64 }} /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 130 }} />
              <col style={{ width: 84 }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-card-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="p-2.5 text-left font-medium">Codice</th>
                <th className="p-2.5 text-left font-medium">Cliente</th>
                <th className="p-2.5 text-left font-medium">Descrizione</th>
                <th className="p-2.5 text-left font-medium">Data</th>
                <th className="p-2.5 text-right font-medium">Q.tà</th>
                <th className="p-2.5 text-right font-medium">Preventivato</th>
                <th className="p-2.5 text-right font-medium">Costo</th>
                <th className="p-2.5 text-right font-medium">Venduto</th>
                <th className="p-2.5 text-center font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sales/[0.14] text-sales">
                        <Receipt className="h-5 w-5" />
                      </div>
                      {sales.length === 0 ? (
                        <>
                          <div className="text-sm font-medium text-foreground">Nessuna vendita registrata per il {year}</div>
                          <div className="text-xs text-muted-foreground">Cambia anno dal selettore o registra la prima vendita.</div>
                          <PrimaryCtaButton color="sales" size="sm" className="mt-1" onClick={startNew}>
                            <Plus className="h-4 w-4" /> Nuova vendita
                          </PrimaryCtaButton>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-medium text-foreground">Nessun risultato per i filtri</div>
                          <div className="text-xs text-muted-foreground">Modifica la ricerca o azzera i filtri.</div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : pageRows.map(s => (
                <tr key={s.id} className="border-b border-border transition-colors hover:bg-muted/[0.45]">
                  <td className="truncate p-2.5 font-mono font-semibold text-foreground">{s.code}</td>
                  <td className="truncate p-2.5 text-foreground">{s.customer_name || <span className="text-muted-foreground">—</span>}</td>
                  <td className="truncate p-2.5 text-foreground">{s.description || <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2.5 font-mono text-xs text-muted-foreground">{dateShort(s.sale_date)}</td>
                  <td className="p-2.5 text-right font-mono tabular-nums">{s.quantity}</td>
                  <td className="p-2.5 text-right font-mono tabular-nums text-muted-foreground">{s.quoted_value != null ? eur(s.quoted_value * s.quantity) : missingCell}</td>
                  <td className="p-2.5 text-right font-mono tabular-nums text-muted-foreground">{s.unit_cost ? eur(s.unit_cost * s.quantity) : missingCell}</td>
                  <td className="p-2.5 text-right font-mono tabular-nums font-semibold text-foreground">{s.unit_price ? eur(s.unit_price * s.quantity) : missingCell}</td>
                  <td className="p-2.5">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => { setEditSale(s); setShowForm(true) }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifica">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setPendingDel(s.id)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-sales/[0.30] bg-sales/[0.08]">
                  <td colSpan={5} className="p-3 text-left font-bold text-foreground">{hasFilters ? 'Totale filtrato' : `Totale ${year}`}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-[13px] text-muted-foreground">{eur(totalPrev)}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-[13px] text-muted-foreground">{eur(totalCost)}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-[14.5px] font-bold text-sales">{eur(totalSold)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Paginazione */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{rangeFrom}–{rangeTo} di {filtered.length}</span>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={pageClamped <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
                  title="Pagina precedente"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-mono text-xs">{pageClamped} / {pageCount}</span>
                <button
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                  disabled={pageClamped >= pageCount}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
                  title="Pagina successiva"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showForm && <DirectSaleFormModal sale={editSale} customers={customers} categories={categories} onClose={() => setShowForm(false)} onSaved={load} />}
      <ConfirmDialog
        open={pendingDel != null}
        title="Eliminare questa vendita?"
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDel(null)}
      />
    </StandardPage>
  )
}
