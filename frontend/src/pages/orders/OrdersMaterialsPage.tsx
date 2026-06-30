import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Package, History } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import { STATUS_LABELS } from '@/lib/constants'
import { timeAgo } from '@/lib/timeAgo'
import KpiBar from '@/components/ui/kpi-bar'
import OrderHistoryModal from './OrderHistoryModal'
import AggregatePreview from './AggregatePreview'
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

  // Debounce ricerca storico: loadOrders fuori dalle deps (effect deve
  // firare solo su historySearch, non quando loadOrders cambia per closure).
  useEffect(() => {
    const t = setTimeout(() => loadOrders(historySearch), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySearch])

  // Search con debounce minimo: stesso pattern del debounce sopra.
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
    <StandardPage
      icon={Package}
      color="blue"
      width="xl"
      title="Ordini materiali"
      subtitle='Seleziona preventivi e genera un PDF lista materiali raggruppato per fornitore. I preventivi inclusi vengono marcati "materiale ordinato".'
      actions={
        <Button variant="outline" size="sm" onClick={() => setShowHistory(s => !s)}>
          <History className="w-4 h-4 mr-1" /> Storico {orders.length > 0 && `(${orders.length})`}
        </Button>
      }
    >

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

      {showHistory && (
        <OrderHistoryModal
          orders={orders}
          search={historySearch}
          onSearchChange={setHistorySearch}
          onDownloadPdf={downloadPdf}
          onClose={() => setShowHistory(false)}
        />
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

        <AggregatePreview
          aggregate={aggregate}
          loading={loadingPreview}
          selectedCount={selectedIds.size}
          totalQty={totalQty}
          totalWeight={totalWeight}
          exporting={exporting}
          onExport={exportOrder}
        />
      </div>
    </StandardPage>
  )
}
