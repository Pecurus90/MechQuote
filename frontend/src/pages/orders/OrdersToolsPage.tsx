// Container Ordini utensili: fetch preview low-stock + stats, mappa sulle props
// di ToolOrdersView (design handoff). Un ordine per fornitore (conferma nel
// container), CSV scaricato. Nessuna grafica qui.
import { useEffect, useState } from 'react'
import { AlertTriangle, Drill, CalendarDays, Clock } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { timeAgo } from '@/lib/timeAgo'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import PageContainer from '@/components/ui/page-container'
import { ToolOrdersView, type OrderKpi, type ToolSupplierGroup } from '@/pages/orders/ToolOrdersView'
import type { ToolLowStockPreview, ToolOrder } from '@/types'

interface ToolsStats {
  low_stock: number; total_active: number
  orders_this_month: number; orders_total: number; last_order_at: string | null
}

export default function OrdersToolsPage() {
  const [preview, setPreview] = useState<ToolLowStockPreview | null>(null)
  const [stats, setStats] = useState<ToolsStats | null>(null)
  const [pendingSupplier, setPendingSupplier] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const loadPreview = () => api.get('/orders/tools/preview').then(r => setPreview(r.data)).catch(() => toast.error('Errore caricamento preview'))
  const loadStats = () => api.get('/orders/tools/stats').then(r => setStats(r.data)).catch(() => undefined)
  useEffect(() => { loadPreview(); loadStats() }, [])

  const downloadCsv = async (orderId: number) => {
    const res = await api.get(`/orders/tools/${orderId}/csv`, { responseType: 'blob' })
    const cd = res.headers['content-disposition'] as string | undefined
    const match = cd?.match(/filename="?([^"]+)"?/)
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url; a.download = match ? match[1] : `ordine_utensili_UO${String(orderId).padStart(4, '0')}.csv`
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
  }

  const doCreate = async (supplierId: number) => {
    setCreating(true)
    try {
      const res = await api.post('/orders/tools', { supplier_id: supplierId })
      const order = res.data as ToolOrder
      await downloadCsv(order.id)
      toast.success(`Ordine UO-${String(order.id).padStart(4, '0')} creato — CSV scaricato`)
      loadPreview(); loadStats()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nella creazione dell\'ordine')
    } finally { setCreating(false); setPendingSupplier(null) }
  }

  // C5 — utensili sotto scorta ma senza fornitore: non ordinabili da qui.
  // Vengono filtrati via dalla lista (sotto), ma l'utente deve sapere che
  // esistono, altrimenti sparirebbero in silenzio.
  const noSupplierCount = (preview?.groups ?? [])
    .find(g => g.supplier_id == null)?.items.length ?? 0

  // Solo i gruppi con fornitore reale sono ordinabili.
  const groups: ToolSupplierGroup[] = (preview?.groups ?? [])
    .filter(g => g.supplier_id != null)
    .map(g => ({
      supplierId: g.supplier_id as number,
      supplierName: g.supplier_name,
      items: g.items.map(it => ({
        id: it.tool_id,
        code: it.code,
        brand: [it.brand, it.model].filter(Boolean).join(' ') || '—',
        type: [it.tool_type, it.diameter_mm != null ? `Ø${it.diameter_mm}` : null].filter(Boolean).join(' · ') || '—',
        currentQty: it.quantity,
        minQty: it.minimum_quantity,
        orderQty: it.quantity_to_order,
      })),
    }))

  const kpis: OrderKpi[] = stats ? [
    { key: 'low', label: 'Sotto scorta', value: stats.low_stock, hint: stats.low_stock === 0 ? 'tutto in stock' : 'da ordinare', icon: AlertTriangle, tone: stats.low_stock > 0 ? 'danger' : 'success' },
    { key: 'catalog', label: 'A catalogo', value: stats.total_active, hint: 'utensili attivi', icon: Drill, tone: 'primary' },
    { key: 'month', label: 'Ordini nel mese', value: stats.orders_this_month, hint: stats.orders_total > 0 ? `${stats.orders_total} in totale` : undefined, icon: CalendarDays, tone: 'info' },
    { key: 'last', label: 'Ultimo ordine', value: stats.last_order_at ? timeAgo(stats.last_order_at) : '—', icon: Clock, tone: 'warning' },
  ] : []

  const pendingName = groups.find(g => g.supplierId === pendingSupplier)?.supplierName

  return (
    <PageContainer width="xl">
      {noSupplierCount > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warning" />
          <span>
            <b>{noSupplierCount}</b>{' '}
            {noSupplierCount === 1 ? 'utensile sotto scorta è' : 'utensili sotto scorta sono'} senza
            fornitore assegnato: non {noSupplierCount === 1 ? 'è ordinabile' : 'sono ordinabili'} da qui
            finché non assegni un fornitore nell'anagrafica utensili.
          </span>
        </div>
      )}
      <ToolOrdersView kpis={kpis} groups={groups} onCreateOrder={(id) => setPendingSupplier(id)} />
      <ConfirmDialog
        open={pendingSupplier !== null}
        variant="default"
        title="Crea ordine utensili"
        description={pendingName ? `Generare l'ordine e il CSV per ${pendingName}? Verrà inviata notifica a ufficio tecnico e amministrazione.` : undefined}
        confirmLabel={creating ? 'Creazione…' : 'Crea CSV ordine'}
        onConfirm={() => { if (pendingSupplier !== null) doCreate(pendingSupplier) }}
        onCancel={() => setPendingSupplier(null)}
      />
    </PageContainer>
  )
}
