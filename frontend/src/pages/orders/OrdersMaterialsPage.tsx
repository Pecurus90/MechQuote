import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Package } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import { STATUS_LABELS } from '@/lib/constants'
import { timeAgo } from '@/lib/timeAgo'
import KpiBar from '@/components/ui/kpi-bar'
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
  { value: 'confermato', label: 'Confermati' },
  { value: 'completo', label: 'Completi' },
  { value: 'letto', label: 'Letti' },
  { value: 'inviato', label: 'Inviati' },
  { value: 'bozza', label: 'Bozze' },
  { value: '', label: 'Tutti gli stati' },
]

export default function OrdersMaterialsPage() {
  const [quotes, setQuotes] = useState<QuoteListItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [statusFilter, setStatusFilter] = useState('confermato')
  const [onlyUnordered, setOnlyUnordered] = useState(true)
  const [search, setSearch] = useState('')
  const [aggregate, setAggregate] = useState<MaterialAggregateResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [creatingSupplierId, setCreatingSupplierId] = useState<number | null>(null)
  const [stats, setStats] = useState<MaterialsStats | null>(null)

  const loadStats = () => {
    api.get('/orders/materials/stats')
      .then(r => setStats(r.data))
      .catch(() => undefined)
  }

  const loadQuotes = () => {
    const params = new URLSearchParams()
    // Passo sempre `status`, anche vuoto: il default backend è "confermato",
    // quindi se non lo settassi la voce "Tutti gli stati" (value='') tornerebbe
    // solo confermati.
    params.set('status', statusFilter)
    if (search.trim()) params.set('q', search.trim())
    params.set('only_unordered', String(onlyUnordered))
    api.get(`/orders/materials/quotes-selectable?${params}`)
      .then(r => setQuotes(r.data))
      .catch(() => toast.error('Errore nel caricamento dei preventivi'))
  }

  useEffect(() => { loadQuotes() }, [statusFilter, onlyUnordered])
  useEffect(() => { loadStats() }, [])

  // Search con debounce minimo.
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

  const downloadCsv = async (orderId: number) => {
    try {
      const res = await api.get(`/orders/materials/${orderId}/csv`, { responseType: 'blob' })
      // Il backend nomina il file per-fornitore (AAAAMMGG_HHmm_fornitore.csv).
      const cd = res.headers['content-disposition'] as string | undefined
      const match = cd?.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : `ordine_materiali_${orderId.toString().padStart(4, '0')}.csv`
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel download del CSV')
    }
  }

  const createSupplierOrder = async (supplierId: number, supplierName: string) => {
    if (selectedIds.size === 0) { toast.error('Seleziona almeno un preventivo'); return }
    setCreatingSupplierId(supplierId)
    try {
      const res = await api.post('/orders/materials', {
        quote_ids: Array.from(selectedIds),
        material_supplier_id: supplierId,
      })
      const order = res.data as MaterialOrder
      await downloadCsv(order.id)
      toast.success(`Ordine MO-${String(order.id).padStart(4, '0')} creato per ${supplierName} — CSV scaricato`)
      loadQuotes()
      loadStats()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nella creazione dell\'ordine')
    } finally {
      setCreatingSupplierId(null)
    }
  }

  return (
    <StandardPage
      icon={Package}
      color="blue"
      width="xl"
      title="Ordini materiali"
      subtitle='Seleziona preventivi e genera un CSV lista materiali raggruppato per fornitore. I preventivi inclusi vengono marcati "materiale ordinato".'
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

      {/* Nuovo ordine: lista preventivi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Seleziona preventivi</h2>
          <div className="flex items-center gap-2 mb-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={onlyUnordered}
                onChange={e => setOnlyUnordered(e.target.checked)}
              />
              Solo non ordinati
            </label>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
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
                <thead className="bg-muted border-b">
                  <tr>
                    <th className="p-2 w-8">
                      <input
                        type="checkbox"
                        checked={quotes.length > 0 && selectedIds.size === quotes.length}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Numero</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-right p-2 w-16 font-medium text-muted-foreground">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Nessun preventivo da mostrare con i filtri attuali.
                    </td></tr>
                  )}
                  {quotes.map(q => (
                    <tr
                      key={q.id}
                      className={`border-b hover:bg-muted cursor-pointer ${selectedIds.has(q.id) ? 'bg-primary/10' : ''}`}
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
                      <td className="p-2 font-mono font-medium text-primary">{q.quote_number}</td>
                      <td className="p-2 text-foreground truncate">{q.customer_name || '—'}</td>
                      <td className="p-2 text-right text-xs text-muted-foreground">{STATUS_LABELS[q.status] ?? q.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground mt-2">
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
          creatingSupplierId={creatingSupplierId}
          onCreateSupplierOrder={createSupplierOrder}
        />
      </div>
    </StandardPage>
  )
}
