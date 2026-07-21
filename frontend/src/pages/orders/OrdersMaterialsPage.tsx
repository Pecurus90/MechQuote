// Container Ordini materiali (pool unificato): preventivi confermati +
// richieste materiale manuali inviate. Seleziona da entrambe le sorgenti,
// aggrega per fornitore e crea l'ordine + CSV. Mappa sulle props di
// MaterialOrdersView (design handoff). Nessuna grafica qui.
import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, CalendarDays, Layers, Clock } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { timeAgo } from '@/lib/timeAgo'
import PageContainer from '@/components/ui/page-container'
import {
  MaterialOrdersView, type OrderKpi, type SelectableQuote, type SelectableRequest, type SupplierAggregate,
} from '@/pages/orders/MaterialOrdersView'
import RequestEditModal from '@/pages/orders/RequestEditModal'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import BarConsolidationModal, { type BarCandidate } from '@/pages/orders/BarConsolidationModal'
import type { QuoteType } from '@/components/quotes/TypeBadge'
import type { MaterialStatus } from '@/components/dashboard/StatusBadges'
import type { BarSpec, MaterialAggregateResult, MaterialOrder, MaterialRequest, QuoteListItem } from '@/types'

interface MaterialsStats {
  to_order: number; orders_this_month: number; orders_total: number; last_order_at: string | null
}

const toQuoteType = (t?: string | null): QuoteType => (t === 'commessa' ? 'commessa' : 'single')
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
  const [requests, setRequests] = useState<MaterialRequest[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<number>>(new Set())
  const [aggregate, setAggregate] = useState<MaterialAggregateResult | null>(null)
  const [stats, setStats] = useState<MaterialsStats | null>(null)
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null)
  const [deletingRequestId, setDeletingRequestId] = useState<number | null>(null)
  // TD-3: popup consolidamento barra al "Crea CSV" (supplierId + candidati).
  const [barPrompt, setBarPrompt] = useState<{ supplierId: number; candidates: BarCandidate[] } | null>(null)

  const loadStats = () => api.get('/orders/materials/stats').then(r => setStats(r.data)).catch(() => undefined)
  const loadQuotes = () => {
    const p = new URLSearchParams({ status: 'confermato', only_unordered: 'true' })
    api.get(`/orders/materials/quotes-selectable?${p}`).then(r => setQuotes(r.data)).catch(() => toast.error('Errore nel caricamento dei preventivi'))
  }
  // Richieste inviate con almeno una riga ancora aperta (le altre sono già evase).
  const loadRequests = () =>
    api.get('/orders/material-requests?status=inviato')
      .then(r => setRequests((r.data as MaterialRequest[]).filter(x => x.open_count > 0)))
      .catch(() => toast.error('Errore nel caricamento delle richieste'))
  useEffect(() => { loadQuotes(); loadRequests(); loadStats() }, [])

  useEffect(() => {
    if (selectedIds.size === 0 && selectedRequestIds.size === 0) { setAggregate(null); return }
    api.post('/orders/materials/aggregate', {
      quote_ids: Array.from(selectedIds),
      request_ids: Array.from(selectedRequestIds),
    }).then(r => setAggregate(r.data)).catch(() => toast.error('Errore nel calcolo aggregato'))
  }, [selectedIds, selectedRequestIds])

  const toggle = (id: number) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelectedIds(s => s.size === quotes.length ? new Set() : new Set(quotes.map(q => q.id)))
  const toggleRequest = (id: number) => setSelectedRequestIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAllRequests = () => setSelectedRequestIds(s => s.size === requests.length ? new Set() : new Set(requests.map(r => r.id)))

  const downloadCsv = async (orderId: number) => {
    const res = await api.get(`/orders/materials/${orderId}/csv`, { responseType: 'blob' })
    const cd = res.headers['content-disposition'] as string | undefined
    const match = cd?.match(/filename="?([^"]+)"?/)
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url; a.download = match ? match[1] : `ordine_materiali_${orderId}.csv`
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
  }

  const postOrder = async (supplierId: number, bars: BarSpec[]) => {
    try {
      const res = await api.post('/orders/materials', {
        quote_ids: Array.from(selectedIds),
        request_ids: Array.from(selectedRequestIds),
        material_supplier_id: supplierId,
        bars,
      })
      const order = res.data as MaterialOrder
      await downloadCsv(order.id)
      toast.success(`Ordine MO-${String(order.id).padStart(4, '0')} creato — CSV scaricato`)
      loadQuotes(); loadRequests(); loadStats()
      setSelectedIds(new Set()); setSelectedRequestIds(new Set())
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nella creazione dell\'ordine')
    }
  }

  // TD-3: candidati barra = tondi da ordinare con stesso materiale + diametro
  // (≥2 pezzi complessivi) del fornitore. Righe fuse per lunghezza.
  const barCandidatesFor = (supplierId: number): BarCandidate[] => {
    const group = aggregate?.groups.find(g => g.supplier_id === supplierId)
    if (!group) return []
    const byKey = new Map<string, BarCandidate>()
    for (const it of group.items) {
      if (it.shape !== 'tondo' || it.from_stock) continue
      if (it.diameter_mm == null || it.length_mm == null) continue
      const key = `${it.material_id ?? 'n:' + it.material_name}|${it.diameter_mm}`
      let cand = byKey.get(key)
      if (!cand) {
        cand = { key, materialId: it.material_id, materialName: it.material_name, diameterMm: it.diameter_mm, rows: [] }
        byKey.set(key, cand)
      }
      const row = cand.rows.find(r => r.lengthMm === it.length_mm)
      if (row) { row.qty += it.total_qty; row.refs = [...row.refs, ...it.quote_refs] }
      else cand.rows.push({ lengthMm: it.length_mm, qty: it.total_qty, refs: it.quote_refs })
    }
    return Array.from(byKey.values()).filter(c => c.rows.reduce((s, r) => s + r.qty, 0) >= 2)
  }

  const requestCreateOrder = (supplierId: number) => {
    if (selectedIds.size === 0 && selectedRequestIds.size === 0) { toast.error('Seleziona almeno un preventivo o una richiesta'); return }
    const candidates = barCandidatesFor(supplierId)
    if (candidates.length > 0) setBarPrompt({ supplierId, candidates })
    else postOrder(supplierId, [])
  }

  const deleteRequest = async (id: number) => {
    try {
      await api.delete(`/orders/material-requests/${id}`)
      toast.success(`Richiesta RM-${String(id).padStart(4, '0')} eliminata`)
      setSelectedRequestIds(s => { const n = new Set(s); n.delete(id); return n })
      loadRequests(); loadStats()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione della richiesta')
    }
  }

  const selectableQuotes: SelectableQuote[] = quotes.map(q => ({
    id: q.id,
    quote_number: q.quote_number,
    customer_name: q.customer_name ?? null,
    quote_type: toQuoteType(q.quote_type),
    quote_date: q.quote_date,
    total_price: quoteTotal(q),
    materialStatus: (q.material_status as MaterialStatus) ?? 'non_ordinato',
  }))

  const selectableRequests: SelectableRequest[] = requests.map(r => ({
    id: r.id,
    number: `RM-${String(r.id).padStart(4, '0')}`,
    title: r.title,
    created_at: r.created_at,
    openCount: r.open_count,
    supplierNames: r.supplier_names,
  }))

  const aggregateGroups: SupplierAggregate[] = useMemo(() => (aggregate?.groups ?? [])
    .filter(g => g.supplier_id != null)
    .map(g => {
      const refs = new Set(g.items.flatMap(i => i.quote_refs.map(r => r.split(' ')[0])))
      return {
        supplierId: g.supplier_id as number,
        supplierName: g.supplier_name,
        quoteCount: refs.size,
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
    { key: 'to-order', label: 'Da ordinare', value: stats.to_order, hint: stats.to_order === 0 ? 'tutto ordinato' : 'preventivi e richieste', icon: ClipboardCheck, tone: stats.to_order > 0 ? 'primary' : 'success' },
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
        selectableRequests={selectableRequests}
        selectedRequestIds={Array.from(selectedRequestIds)}
        onToggleRequest={toggleRequest}
        onToggleAllRequests={toggleAllRequests}
        onEditRequest={setEditingRequestId}
        onDeleteRequest={setDeletingRequestId}
        aggregate={aggregateGroups}
        onCreateOrder={requestCreateOrder}
      />
      {editingRequestId != null && (
        <RequestEditModal
          requestId={editingRequestId}
          onClose={() => setEditingRequestId(null)}
          onSaved={() => { loadRequests(); loadStats(); setSelectedRequestIds(new Set()) }}
        />
      )}
      {barPrompt && (
        <BarConsolidationModal
          candidates={barPrompt.candidates}
          onCancel={() => setBarPrompt(null)}
          onConfirm={(bars) => { const sup = barPrompt.supplierId; setBarPrompt(null); postOrder(sup, bars) }}
        />
      )}
      <ConfirmDialog
        open={deletingRequestId != null}
        title={`Eliminare la richiesta RM-${String(deletingRequestId ?? 0).padStart(4, '0')}?`}
        description="La richiesta materiale e le sue righe verranno eliminate. Le righe già ordinate (evase) impediscono l'eliminazione."
        confirmLabel="Elimina"
        onConfirm={async () => { if (deletingRequestId != null) await deleteRequest(deletingRequestId); setDeletingRequestId(null) }}
        onCancel={() => setDeletingRequestId(null)}
      />
    </PageContainer>
  )
}
