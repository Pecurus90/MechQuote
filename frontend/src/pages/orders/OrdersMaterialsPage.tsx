import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Package, FileDown, History, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { STATUS_LABELS } from '@/lib/constants'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { timeAgo } from '@/lib/timeAgo'
import KpiBar from '@/components/ui/kpi-bar'
import type {
  MaterialAggregateResult, MaterialOrder, QuoteListItem,
} from '@/types'

interface MaterialsStats {
  to_order: number
  orders_this_month: number
  orders_total: number
  last_order_at: string | null
}

const STATUS_OPTIONS = [
  { value: 'completato', label: 'Completati' },
  { value: 'inviato', label: 'Inviati' },
  { value: 'bozza', label: 'Bozze' },
  { value: '', label: 'Tutti gli stati' },
]

export default function OrdersMaterialsPage() {
  const [quotes, setQuotes] = useState<QuoteListItem[]>([])
  const [orders, setOrders] = useState<MaterialOrder[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [statusFilter, setStatusFilter] = useState('completato')
  const [onlyUnordered, setOnlyUnordered] = useState(true)
  const [search, setSearch] = useState('')
  const [aggregate, setAggregate] = useState<MaterialAggregateResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [stats, setStats] = useState<MaterialsStats | null>(null)
  useEscapeKey(() => setShowHistory(false), showHistory)

  const loadStats = () => {
    api.get('/orders/materials/stats')
      .then(r => setStats(r.data))
      .catch(() => undefined)
  }

  const loadQuotes = () => {
    const params = new URLSearchParams()
    // Passo sempre `status`, anche vuoto: il default backend è "completato",
    // quindi se non lo settassi la voce "Tutti gli stati" (value='') tornerebbe
    // solo completati.
    params.set('status', statusFilter)
    if (search.trim()) params.set('q', search.trim())
    params.set('only_unordered', String(onlyUnordered))
    api.get(`/orders/materials/quotes-selectable?${params}`)
      .then(r => setQuotes(r.data))
      .catch(() => toast.error('Errore nel caricamento dei preventivi'))
  }

  const loadOrders = (term = historySearch) => {
    const params = new URLSearchParams()
    if (term.trim()) params.set('q', term.trim())
    api.get(`/orders/materials?${params}`)
      .then(r => setOrders(r.data))
      .catch(() => toast.error('Errore nel caricamento dello storico'))
  }

  useEffect(() => { loadQuotes() }, [statusFilter, onlyUnordered])
  useEffect(() => { loadOrders() }, [])
  useEffect(() => { loadStats() }, [])

  // Debounce ricerca storico
  useEffect(() => {
    const t = setTimeout(() => loadOrders(historySearch), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySearch])

  // Search con debounce minimo
  useEffect(() => {
    const t = setTimeout(loadQuotes, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Preview aggregata: ricalcola quando la selezione cambia
  useEffect(() => {
    if (selectedIds.size === 0) {
      setAggregate(null)
      return
    }
    setLoadingPreview(true)
    api.post('/orders/materials/aggregate', { quote_ids: Array.from(selectedIds) })
      .then(r => setAggregate(r.data))
      .catch(() => toast.error('Errore nel calcolo aggregato'))
      .finally(() => setLoadingPreview(false))
  }, [selectedIds])

  const toggleSelected = (id: number) => {
    setSelectedIds(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === quotes.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(quotes.map(q => q.id)))
  }

  const totalQty = useMemo(() =>
    aggregate?.groups.reduce(
      (s, g) => s + g.items.reduce((ss, i) => ss + i.total_qty, 0), 0,
    ) ?? 0,
    [aggregate])

  const totalWeight = useMemo(() =>
    aggregate?.groups.reduce(
      (s, g) => s + g.items.reduce((ss, i) => ss + i.total_weight_kg, 0), 0,
    ) ?? 0,
    [aggregate])

  const downloadPdf = async (orderId: number) => {
    try {
      const res = await api.get(`/orders/materials/${orderId}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `ordine_materiali_${orderId.toString().padStart(4, '0')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch { toast.error('Errore nel download del PDF') }
  }

  const exportOrder = async () => {
    if (selectedIds.size === 0) { toast.error('Seleziona almeno un preventivo'); return }
    setExporting(true)
    try {
      const res = await api.post('/orders/materials', { quote_ids: Array.from(selectedIds) })
      const order = res.data as MaterialOrder
      await downloadPdf(order.id)
      toast.success(`Ordine #${order.id} creato — PDF scaricato, notifica inviata`)
      setSelectedIds(new Set())
      loadQuotes()
      loadOrders()
      loadStats()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nella creazione dell\'ordine')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-700" />
            Ordini materiali
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Seleziona i preventivi e genera un PDF con la lista dei materiali da
            ordinare, raggruppati per fornitore. I preventivi inclusi vengono
            marcati come <strong>"materiale ordinato"</strong>.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(s => !s)}
        >
          <History className="w-4 h-4 mr-1" /> Storico {orders.length > 0 && `(${orders.length})`}
        </Button>
      </div>

      {stats && (
        <KpiBar items={[
          {
            label: 'Da ordinare',
            value: stats.to_order,
            color: stats.to_order > 0 ? 'orange' : 'green',
            hint: stats.to_order === 0 ? 'tutti i completati ordinati' : 'preventivi pronti',
          },
          {
            label: 'Ordini mese',
            value: stats.orders_this_month,
            color: 'blue',
          },
          {
            label: 'Ordini totali',
            value: stats.orders_total,
            color: 'gray',
            hint: 'all-time',
          },
          {
            label: 'Ultimo ordine',
            value: stats.last_order_at ? timeAgo(stats.last_order_at) : '—',
            color: 'gray',
          },
        ]} />
      )}

      {/* Storico ordini — modal popup */}
      {showHistory && (
        <div
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowHistory(false)}
        >
          <Card className="w-full max-w-4xl max-h-[85vh] flex flex-col bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
              <h3 className="font-semibold flex items-center gap-2">
                <History className="w-4 h-4 text-blue-700" /> Storico ordini materiali
              </h3>
              <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  placeholder="Cerca per numero ordine (MO-0023), preventivo (001-26A_010), o creatore..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="table-fixed w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="text-left p-3 w-[14%] font-medium text-gray-600">Numero</th>
                    <th className="text-left p-3 w-[22%] font-medium text-gray-600">Data</th>
                    <th className="text-left p-3 w-[20%] font-medium text-gray-600">Creato da</th>
                    <th className="text-left p-3 w-[8%] font-medium text-gray-600">Quote</th>
                    <th className="text-left p-3 font-medium text-gray-600">Preventivi</th>
                    <th className="text-center p-3 w-[12%] font-medium text-gray-600">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-400">
                      {historySearch ? 'Nessun ordine corrisponde alla ricerca.' : 'Nessun ordine ancora.'}
                    </td></tr>
                  )}
                  {orders.map(o => (
                    <tr key={o.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-mono text-blue-700">MO-{String(o.id).padStart(4, '0')}</td>
                      <td className="p-3 text-gray-600">{new Date(o.created_at).toLocaleString('it-IT')}</td>
                      <td className="p-3">{o.created_by?.full_name || o.created_by?.username || '—'}</td>
                      <td className="p-3 font-mono text-center">{o.quote_count}</td>
                      <td className="p-3 text-xs text-gray-500 font-mono truncate">
                        {o.quote_numbers.slice(0, 3).join(', ')}{o.quote_numbers.length > 3 && ` +${o.quote_numbers.length - 3}`}
                      </td>
                      <td className="p-3 text-center">
                        <Button size="sm" variant="outline" onClick={() => downloadPdf(o.id)}>
                          <FileDown className="w-3.5 h-3.5 mr-1" /> PDF
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-2 border-t text-xs text-gray-400 shrink-0">
              {orders.length} ordin{orders.length === 1 ? 'e' : 'i'} mostrat{orders.length === 1 ? 'o' : 'i'}
            </div>
          </Card>
        </div>
      )}

      {/* Nuovo ordine: lista preventivi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Seleziona preventivi</h2>
          <div className="flex items-center gap-2 mb-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyUnordered}
                onChange={e => setOnlyUnordered(e.target.checked)}
              />
              Solo non ordinati
            </label>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cerca numero o cliente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="table-fixed w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-2 w-8">
                      <input
                        type="checkbox"
                        checked={quotes.length > 0 && selectedIds.size === quotes.length}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="text-left p-2 font-medium text-gray-600">Numero</th>
                    <th className="text-left p-2 font-medium text-gray-600">Cliente</th>
                    <th className="text-right p-2 w-16 font-medium text-gray-600">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-400">
                      Nessun preventivo da mostrare con i filtri attuali.
                    </td></tr>
                  )}
                  {quotes.map(q => (
                    <tr
                      key={q.id}
                      className={`border-b hover:bg-gray-50 cursor-pointer ${selectedIds.has(q.id) ? 'bg-blue-50' : ''}`}
                      onClick={() => toggleSelected(q.id)}
                    >
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(q.id)}
                          onChange={() => toggleSelected(q.id)}
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td className="p-2 font-mono font-medium text-blue-700">{q.quote_number}</td>
                      <td className="p-2 text-gray-700 truncate">{q.customer_name || '—'}</td>
                      <td className="p-2 text-right text-xs text-gray-500">{STATUS_LABELS[q.status] ?? q.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <p className="text-xs text-gray-400 mt-2">
            {selectedIds.size > 0
              ? `${selectedIds.size} preventiv${selectedIds.size === 1 ? 'o' : 'i'} selezionat${selectedIds.size === 1 ? 'o' : 'i'}`
              : 'Nessuna selezione'}
          </p>
        </div>

        {/* Preview aggregata */}
        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Materiali aggregati</h2>
          {selectedIds.size === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-gray-400">
                Seleziona uno o più preventivi per vedere l'aggregazione.
              </CardContent>
            </Card>
          ) : loadingPreview ? (
            <Card><CardContent className="p-8 text-center text-sm text-gray-400">Calcolo...</CardContent></Card>
          ) : !aggregate || aggregate.groups.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-amber-700 bg-amber-50">
                Nessun materiale da ordinare nei preventivi selezionati
                (potrebbero essere tutti in conto lavoro o senza materiale).
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {aggregate.groups.map((g, gi) => (
                <Card key={gi}>
                  <CardContent className="p-0">
                    <div className="bg-blue-50 border-b border-blue-100 px-3 py-2 flex items-center justify-between">
                      <span className="font-semibold text-sm text-blue-900">{g.supplier_name}</span>
                      <span className="text-xs text-blue-700">{g.items.length} {g.items.length === 1 ? 'materiale' : 'materiali'}</span>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {g.items.map((it, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="p-2">
                              <div className="font-medium text-gray-800">
                                {it.material_name}
                                {it.family && <span className="text-gray-400 font-normal"> ({it.family.replace(/_/g, ' ')})</span>}
                              </div>
                              <div className="text-gray-500 text-[11px]">{it.dim_str}</div>
                            </td>
                            <td className="p-2 text-right font-mono whitespace-nowrap">
                              <div className="font-semibold text-blue-700">{it.total_qty} pz</div>
                              <div className="text-[11px] text-gray-500">{it.total_weight_kg.toFixed(2)} kg</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}

              <Card>
                <CardContent className="p-3 flex items-center justify-between bg-gray-50 text-sm">
                  <span className="text-gray-600">Totali</span>
                  <span className="font-mono text-gray-900 font-semibold">
                    {totalQty} pz &middot; {totalWeight.toFixed(2)} kg
                  </span>
                </CardContent>
              </Card>

              <Button
                onClick={exportOrder}
                disabled={exporting || selectedIds.size === 0}
                variant="outline"
                size="lg"
                className="w-full"
              >
                <FileDown className="w-4 h-4 mr-2" />
                {exporting ? 'Generazione in corso...' : `PDF ordine (${selectedIds.size} preventiv${selectedIds.size === 1 ? 'o' : 'i'})`}
              </Button>
              <p className="text-[11px] text-gray-400 text-center">
                I preventivi selezionati saranno marcati come "materiale ordinato"
                e verrà inviata notifica a ufficio tecnico e amministrazione.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
