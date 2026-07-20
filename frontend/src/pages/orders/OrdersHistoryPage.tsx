// Container Storico ordini: fetch materiali+utensili, mappa sulle props di
// OrderHistoryView (design handoff). Download CSV + elimina con conferma.
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import PageContainer from '@/components/ui/page-container'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import {
  OrderHistoryView, type HistoryTab,
  type MaterialOrder as VMaterialOrder, type ToolOrder as VToolOrder, type NormOrder as VNormOrder,
} from '@/pages/orders/OrderHistoryView'
import type { MaterialOrder, ToolOrder } from '@/types'

interface NormalizedOrderApi {
  id: number
  created_at: string | null
  created_by?: { full_name?: string | null; username?: string } | null
  supplier_name?: string | null
  item_count: number
}

async function downloadBlob(url: string, fallbackName: string) {
  const res = await api.get(url, { responseType: 'blob' })
  const cd = res.headers['content-disposition'] as string | undefined
  const match = cd?.match(/filename="?([^"]+)"?/)
  const objUrl = window.URL.createObjectURL(new Blob([res.data]))
  const a = document.createElement('a')
  a.href = objUrl; a.download = match ? match[1] : fallbackName
  document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(objUrl)
}

const userName = (u: { full_name?: string | null; username?: string } | null): string =>
  u?.full_name || u?.username || '—'

export default function OrdersHistoryPage() {
  const { hasPermission } = useAuth()
  const canMaterials = hasPermission('orders.materials')
  const canNormalized = hasPermission('orders.normalized')

  const [tab, setTab] = useState<HistoryTab>(canMaterials ? 'materials' : canNormalized ? 'normalized' : 'tools')
  const [search, setSearch] = useState('')
  const [matOrders, setMatOrders] = useState<MaterialOrder[]>([])
  const [toolOrders, setToolOrders] = useState<ToolOrder[]>([])
  const [normOrders, setNormOrders] = useState<NormalizedOrderApi[]>([])
  // AUD-8: gate di conferma unico per l'eliminazione ordini (era window.confirm).
  const [pendingDelete, setPendingDelete] = useState<{ title: string; description: string; run: () => void } | null>(null)

  const loadMaterials = (term = search) => {
    const p = new URLSearchParams(); if (term.trim()) p.set('q', term.trim())
    api.get(`/orders/materials?${p}`).then(r => setMatOrders(r.data)).catch(() => toast.error('Errore nel caricamento dello storico materiali'))
  }
  const loadTools = (term = search) => {
    const p = new URLSearchParams(); if (term.trim()) p.set('q', term.trim())
    api.get(`/orders/tools?${p}`).then(r => setToolOrders(r.data)).catch(() => toast.error('Errore nel caricamento dello storico utensili'))
  }
  const loadNormalized = () => api.get('/orders/normalized').then(r => setNormOrders(r.data)).catch(() => toast.error('Errore nel caricamento dello storico normalizzati'))
  const reload = (term = search) => {
    if (tab === 'materials') loadMaterials(term)
    else if (tab === 'normalized') loadNormalized()
    else loadTools(term)
  }

  useEffect(() => { reload() /* eslint-disable-next-line */ }, [tab])
  useEffect(() => { const t = setTimeout(() => reload(search), 250); return () => clearTimeout(t) /* eslint-disable-next-line */ }, [search])

  const deleteMaterial = async (id: number) => {
    const num = `MO-${String(id).padStart(4, '0')}`
    try {
      const res = await api.delete(`/orders/materials/${id}`)
      const { reopened = [] } = res.data as { reverted?: string[]; reopened?: string[] }
      if (reopened.length > 0) {
        toast.warning(`Ordine ${num} eliminato. ${reopened.length} preventivi riaperti (da completo a confermato): ${reopened.join(', ')}`)
      } else toast.success(`Ordine ${num} eliminato`)
      loadMaterials()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione dell\'ordine')
    }
  }
  const deleteTool = async (id: number) => {
    const num = `UO-${String(id).padStart(4, '0')}`
    try { await api.delete(`/orders/tools/${id}`); toast.success(`Ordine ${num} eliminato`); loadTools() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione dell\'ordine') }
  }
  const deleteNormalized = async (id: number) => {
    const num = `NO-${String(id).padStart(4, '0')}`
    try { await api.delete(`/orders/normalized/${id}`); toast.success(`Ordine ${num} eliminato`); loadNormalized() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione dell\'ordine') }
  }

  const matRows: VMaterialOrder[] = matOrders.map(o => ({
    id: o.id,
    number: `MO-${String(o.id).padStart(4, '0')}`,
    date: o.created_at,
    supplierName: o.supplier_name || '—',
    createdBy: userName(o.created_by),
    source: (['request', 'mixed', 'file'].includes(o.source ?? '') ? o.source : 'quotes') as 'quotes' | 'request' | 'mixed' | 'file',
    quoteRefs: o.quote_numbers,
    rowCount: o.item_count,
  }))
  const toolRows: VToolOrder[] = toolOrders.map(o => ({
    id: o.id,
    number: `UO-${String(o.id).padStart(4, '0')}`,
    date: o.created_at,
    supplierName: o.supplier_name || '—',
    createdBy: userName(o.created_by),
    toolCount: o.item_count,
    pieceCount: o.total_quantity,
  }))
  const normRows: VNormOrder[] = normOrders.map(o => ({
    id: o.id,
    number: `NO-${String(o.id).padStart(4, '0')}`,
    date: o.created_at,
    supplierName: o.supplier_name || '—',
    createdBy: userName(o.created_by ?? null),
    itemCount: o.item_count,
  }))

  return (
    <PageContainer width="xl">
      <OrderHistoryView
        tab={tab}
        onTabChange={setTab}
        search={search}
        onSearch={setSearch}
        materialOrders={matRows}
        toolOrders={toolRows}
        normalizedOrders={normRows}
        onDownloadCsv={(id) => {
          if (tab === 'materials') return downloadBlob(`/orders/materials/${id}/csv`, `ordine_materiali_${id}.csv`).catch((e) => { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nel download del CSV') })
          if (tab === 'normalized') return downloadBlob(`/orders/normalized/${id}/csv`, `ordine_normalizzati_${id}.csv`).catch(() => toast.error('Errore download CSV'))
          return downloadBlob(`/orders/tools/${id}/csv`, `ordine_utensili_UO${id}.csv`).catch(() => toast.error('Errore download CSV'))
        }}
        onDelete={(o) => {
          if (tab === 'materials') {
            const num = `MO-${String(o.id).padStart(4, '0')}`
            setPendingDelete({ title: `Eliminare l'ordine ${num}?`, description: 'I preventivi inclusi torneranno "da ordinare" e riselezionabili; quelli già completati verranno riaperti (da completo a confermato). Non reversibile.', run: () => deleteMaterial(o.id) })
          } else if (tab === 'normalized') {
            const num = `NO-${String(o.id).padStart(4, '0')}`
            setPendingDelete({ title: `Eliminare l'ordine ${num}?`, description: "Rimosso dallo storico. Non reversibile.", run: () => deleteNormalized(o.id) })
          } else {
            const num = `UO-${String(o.id).padStart(4, '0')}`
            setPendingDelete({ title: `Eliminare l'ordine ${num}?`, description: "Rimosso dallo storico. Non reversibile.", run: () => deleteTool(o.id) })
          }
        }}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        variant="destructive"
        title={pendingDelete?.title ?? ''}
        description={pendingDelete?.description}
        confirmLabel="Elimina"
        onConfirm={() => { const p = pendingDelete; setPendingDelete(null); p?.run() }}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  )
}
