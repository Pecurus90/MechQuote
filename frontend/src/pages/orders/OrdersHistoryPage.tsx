// Container Storico ordini: fetch materiali+utensili, mappa sulle props di
// OrderHistoryView (design handoff). Download CSV + elimina con conferma.
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import PageContainer from '@/components/ui/page-container'
import {
  OrderHistoryView, type HistoryTab,
  type MaterialOrder as VMaterialOrder, type ToolOrder as VToolOrder,
} from '@/pages/orders/OrderHistoryView'
import type { MaterialOrder, ToolOrder } from '@/types'

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

  const [tab, setTab] = useState<HistoryTab>(canMaterials ? 'materials' : 'tools')
  const [search, setSearch] = useState('')
  const [matOrders, setMatOrders] = useState<MaterialOrder[]>([])
  const [toolOrders, setToolOrders] = useState<ToolOrder[]>([])

  const loadMaterials = (term = search) => {
    const p = new URLSearchParams(); if (term.trim()) p.set('q', term.trim())
    api.get(`/orders/materials?${p}`).then(r => setMatOrders(r.data)).catch(() => toast.error('Errore nel caricamento dello storico materiali'))
  }
  const loadTools = (term = search) => {
    const p = new URLSearchParams(); if (term.trim()) p.set('q', term.trim())
    api.get(`/orders/tools?${p}`).then(r => setToolOrders(r.data)).catch(() => toast.error('Errore nel caricamento dello storico utensili'))
  }
  const reload = (term = search) => { if (tab === 'materials') loadMaterials(term); else loadTools(term) }

  useEffect(() => { reload() /* eslint-disable-next-line */ }, [tab])
  useEffect(() => { const t = setTimeout(() => reload(search), 250); return () => clearTimeout(t) /* eslint-disable-next-line */ }, [search])

  const deleteMaterial = async (id: number) => {
    const num = `MO-${String(id).padStart(4, '0')}`
    if (!window.confirm(`Eliminare l'ordine ${num}?\n\nI preventivi inclusi torneranno "da ordinare" e riselezionabili; quelli già completati verranno riaperti (da completo a confermato). Non reversibile.`)) return
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
    if (!window.confirm(`Eliminare l'ordine ${num} dallo storico?\n\nNon reversibile.`)) return
    try { await api.delete(`/orders/tools/${id}`); toast.success(`Ordine ${num} eliminato`); loadTools() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione dell\'ordine') }
  }

  const matRows: VMaterialOrder[] = matOrders.map(o => ({
    id: o.id,
    number: `MO-${String(o.id).padStart(4, '0')}`,
    date: o.created_at,
    supplierName: o.supplier_name || '—',
    createdBy: userName(o.created_by),
    source: (o.source === 'file' ? 'file' : 'quotes'),
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

  return (
    <PageContainer width="xl">
      <OrderHistoryView
        tab={tab}
        onTabChange={setTab}
        search={search}
        onSearch={setSearch}
        materialOrders={matRows}
        toolOrders={toolRows}
        onDownloadCsv={(id) => (tab === 'materials'
          ? downloadBlob(`/orders/materials/${id}/csv`, `ordine_materiali_${id}.csv`).catch((e) => { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nel download del CSV') })
          : downloadBlob(`/orders/tools/${id}/csv`, `ordine_utensili_UO${id}.csv`).catch(() => toast.error('Errore download CSV')))}
        onDelete={(o) => (tab === 'materials' ? deleteMaterial(o.id) : deleteTool(o.id))}
      />
    </PageContainer>
  )
}
