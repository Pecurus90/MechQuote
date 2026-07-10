// Container Ordini materiali: seleziona preventivi confermati (non ordinati),
// aggrega per fornitore e crea l'ordine + CSV. Mappa sulle props di
// MaterialOrdersView (design handoff). Nessuna grafica qui.
import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, CalendarDays, Layers, Clock } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { timeAgo } from '@/lib/timeAgo'
import PageContainer from '@/components/ui/page-container'
import {
  MaterialOrdersView, type OrderKpi, type SelectableQuote, type SupplierAggregate,
} from '@/pages/orders/MaterialOrdersView'
import type { QuoteType } from '@/components/quotes/TypeBadge'
import type { MaterialStatus } from '@/components/dashboard/StatusBadges'
import type { MaterialAggregateResult, MaterialOrder, QuoteListItem } from '@/types'

interface MaterialsStats {
  to_order: number; orders_this_month: number; orders_total: number; last_order_at: string | null
}

const toQuoteType = (t?: string | null): QuoteType => (t === 'die' ? 'die' : t === 'commessa' ? 'commessa' : 'single')
const quoteTotal = (q: QuoteListItem): number => q.parts?.reduce((s, p) => s + (p.total_price || 0), 0) ?? 0
// Peso 0 = non calcolabile (manca densità materiale o dimensioni grezzo): "—"
// invece di "0 kg", che sembrerebbe un dato reale.
const kg = (v: number): string =>
  v ? `${Number(v).toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg` : '—'

// dim_str backend = "Prismatico 80 × 120 × 30 mm" → [forma, dimensioni].
const SHAPES = ['Prismatico', 'Tondo', 'Tubo']
function splitDim(dim: string): { shape: string; dimensions: string } {
  const first = dim.split(' ')[0]
  if (SHAPES.includes(first)) return { shape: first, dimensions: dim.slice(first.length).trim() }
  return { shape: '—', dimensions: dim }
}

export default function OrdersMaterialsPage() {
  const [quotes, setQuotes] = useState<QuoteListItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [aggregate, setAggregate] = useState<MaterialAggregateResult | null>(null)
  const [stats, setStats] = useState<MaterialsStats | null>(null)

  const loadStats = () => api.get('/orders/materials/stats').then(r => setStats(r.data)).catch(() => undefined)
  const loadQuotes = () => {
    const p = new URLSearchParams({ status: 'confermato', only_unordered: 'true' })
    api.get(`/orders/materials/quotes-selectable?${p}`).then(r => setQuotes(r.data)).catch(() => toast.error('Errore nel caricamento dei preventivi'))
  }
  useEffect(() => { loadQuotes(); loadStats() }, [])

  useEffect(() => {
    if (selectedIds.size === 0) { setAggregate(null); return }
    api.post('/orders/materials/aggregate', { quote_ids: Array.from(selectedIds) })
      .then(r => setAggregate(r.data)).catch(() => toast.error('Errore nel calcolo aggregato'))
  }, [selectedIds])

  const toggle = (id: number) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelectedIds(s => s.size === quotes.length ? new Set() : new Set(quotes.map(q => q.id)))

  const downloadCsv = async (orderId: number) => {
    const res = await api.get(`/orders/materials/${orderId}/csv`, { responseType: 'blob' })
    const cd = res.headers['content-disposition'] as string | undefined
    const match = cd?.match(/filename="?([^"]+)"?/)
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url; a.download = match ? match[1] : `ordine_materiali_${orderId}.csv`
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
  }

  const createOrder = async (supplierId: number) => {
    if (selectedIds.size === 0) { toast.error('Seleziona almeno un preventivo'); return }
    try {
      const res = await api.post('/orders/materials', { quote_ids: Array.from(selectedIds), material_supplier_id: supplierId })
      const order = res.data as MaterialOrder
      await downloadCsv(order.id)
      toast.success(`Ordine MO-${String(order.id).padStart(4, '0')} creato — CSV scaricato`)
      loadQuotes(); loadStats(); setSelectedIds(new Set())
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nella creazione dell\'ordine')
    }
  }

  const selectableQuotes: SelectableQuote[] = quotes.map(q => ({
    id: q.id,
    quote_number: q.quote_number,
    customer_name: q.customer_name ?? null,
    quote_type: toQuoteType(q.quote_type),
    quote_date: q.quote_date,
    total_price: quoteTotal(q),
    // La lista selezionabile è per default confermati-non-ordinati → materiale
    // ancora da ordinare (dettaglio fine per-riga in fase di aggregazione).
    materialStatus: (q.material_status as MaterialStatus) ?? 'non_ordinato',
  }))

  const aggregateGroups: SupplierAggregate[] = useMemo(() => (aggregate?.groups ?? [])
    .filter(g => g.supplier_id != null)
    .map(g => {
      const quoteNums = new Set(g.items.flatMap(i => i.quote_refs.map(r => r.split(' ')[0])))
      return {
        supplierId: g.supplier_id as number,
        supplierName: g.supplier_name,
        quoteCount: quoteNums.size,
        items: g.items.map(i => {
          const { shape, dimensions } = splitDim(i.dim_str)
          return {
            materialCode: i.material_name,
            materialName: i.family ? i.family.replace(/_/g, ' ') : undefined,
            shape, dimensions,
            quantity: i.total_qty,
            estimatedWeight: kg(i.total_weight_kg),
            quoteRefs: i.quote_refs,
            fromStock: i.from_stock,
          }
        }),
      }
    }), [aggregate])

  const kpis: OrderKpi[] = stats ? [
    { key: 'to-order', label: 'Da ordinare', value: stats.to_order, hint: stats.to_order === 0 ? 'tutti ordinati' : 'preventivi pronti', icon: ClipboardCheck, tone: stats.to_order > 0 ? 'primary' : 'success' },
    { key: 'month', label: 'Ordini nel mese', value: stats.orders_this_month, icon: CalendarDays, tone: 'info' },
    { key: 'total', label: 'Totale ordini', value: stats.orders_total, hint: 'in totale', icon: Layers, tone: 'confirmed' },
    { key: 'last', label: 'Ultimo ordine', value: stats.last_order_at ? timeAgo(stats.last_order_at) : '—', icon: Clock, tone: 'warning' },
  ] : []

  return (
    <PageContainer width="xl">
      <MaterialOrdersView
        kpis={kpis}
        selectableQuotes={selectableQuotes}
        selectedIds={Array.from(selectedIds)}
        onToggle={toggle}
        onToggleAll={toggleAll}
        aggregate={aggregateGroups}
        onCreateOrder={createOrder}
      />
    </PageContainer>
  )
}
