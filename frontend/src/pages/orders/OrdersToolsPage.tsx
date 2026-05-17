import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Wrench, FileDown, History, X, AlertTriangle } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { timeAgo } from '@/lib/timeAgo'
import KpiBar from '@/components/ui/kpi-bar'
import type { ToolLowStockPreview, ToolOrder } from '@/types'

interface ToolsStats {
  low_stock: number
  total_active: number
  orders_this_month: number
  orders_total: number
  last_order_at: string | null
}

export default function OrdersToolsPage() {
  const [preview, setPreview] = useState<ToolLowStockPreview | null>(null)
  const [stats, setStats] = useState<ToolsStats | null>(null)
  const [orders, setOrders] = useState<ToolOrder[]>([])
  const [creating, setCreating] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  useEscapeKey(() => setShowHistory(false), showHistory)

  const loadPreview = () => {
    api.get('/orders/tools/preview')
      .then(r => setPreview(r.data))
      .catch(() => toast.error('Errore caricamento preview'))
  }

  const loadStats = () => {
    api.get('/orders/tools/stats')
      .then(r => setStats(r.data))
      .catch(() => undefined)
  }

  const loadOrders = (term = historySearch) => {
    const params = new URLSearchParams()
    if (term.trim()) params.set('q', term.trim())
    api.get(`/orders/tools?${params}`)
      .then(r => setOrders(r.data))
      .catch(() => toast.error('Errore caricamento storico'))
  }

  useEffect(() => { loadPreview() }, [])
  useEffect(() => { loadOrders() }, [])
  useEffect(() => { loadStats() }, [])

  // Debounce ricerca storico: loadOrders fuori dalle deps (effect deve
  // firare solo su historySearch, non quando loadOrders cambia per closure).
  useEffect(() => {
    const t = setTimeout(() => loadOrders(historySearch), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySearch])

  const downloadPdf = async (orderId: number) => {
    try {
      const res = await api.get(`/orders/tools/${orderId}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `ordine_utensili_UO${orderId.toString().padStart(4, '0')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch { toast.error('Errore download PDF') }
  }

  const createOrder = async () => {
    setCreating(true)
    try {
      const res = await api.post('/orders/tools')
      const order = res.data as ToolOrder
      await downloadPdf(order.id)
      toast.success(`Ordine UO-${String(order.id).padStart(4, '0')} creato — PDF scaricato`)
      loadPreview()
      loadOrders()
      loadStats()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nella creazione dell\'ordine')
    } finally {
      setCreating(false)
    }
  }

  const hasItems = preview && preview.groups.length > 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <SettingsPageHeader
        icon={Wrench}
        color="violet"
        title="Ordini utensili"
        subtitle={`Utensili sotto quantità minima raggruppati per fornitore. "Esporta PDF" crea l'ordine (UO-NNNN nello storico).`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <PrimaryCtaButton
              color="violet"
              size="sm"
              onClick={createOrder}
              disabled={creating || !hasItems}
              title={hasItems ? 'Crea ordine + scarica PDF' : 'Nessun utensile sotto minimo'}
            >
              <FileDown className="w-4 h-4" />
              {creating ? 'Genero...' : 'Esporta PDF ordine'}
            </PrimaryCtaButton>
            <Button variant="outline" size="sm" onClick={() => setShowHistory(s => !s)}>
              <History className="w-4 h-4 mr-1" /> Storico {orders.length > 0 && `(${orders.length})`}
            </Button>
          </div>
        }
      />

      {stats && (
        <KpiBar items={[
          {
            label: 'Sotto minimo',
            value: stats.low_stock,
            color: stats.low_stock > 0 ? 'orange' : 'green',
            hint: stats.low_stock === 0 ? 'tutto in stock' : 'da ordinare',
          },
          {
            label: 'Tot. catalogo',
            value: stats.total_active,
            color: 'gray',
            hint: 'utensili attivi',
          },
          {
            label: 'Ordini mese',
            value: stats.orders_this_month,
            color: 'blue',
            hint: stats.orders_total > 0 ? `${stats.orders_total} all-time` : undefined,
          },
          {
            label: 'Ultimo ordine',
            value: stats.last_order_at ? timeAgo(stats.last_order_at) : '—',
            color: 'gray',
          },
        ]} />
      )}

      {/* Preview low-stock */}
      {!preview ? (
        <Card><CardContent className="p-8 text-center text-gray-400">Caricamento...</CardContent></Card>
      ) : !hasItems ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-green-700 bg-green-50">
            ✓ Nessun utensile sotto la quantità minima — tutto in stock.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-3 flex items-center gap-3 text-sm bg-amber-50 border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold text-amber-800">
                  {preview.total_tools} utensil{preview.total_tools === 1 ? 'e' : 'i'} sotto minimo
                </div>
                <div className="text-xs text-amber-700">
                  Totale da ordinare: {preview.total_quantity} pz · {preview.groups.length} fornitor{preview.groups.length === 1 ? 'e' : 'i'}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {preview.groups.map((g, gi) => (
              <Card key={gi}>
                <CardContent className="p-0">
                  <div className="bg-blue-50 border-b border-blue-100 px-3 py-2 flex items-center justify-between">
                    <span className="font-semibold text-sm text-blue-900">{g.supplier_name}</span>
                    <span className="text-xs text-blue-700">{g.items.length} {g.items.length === 1 ? 'utensile' : 'utensili'}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left p-2 font-medium">Codice</th>
                        <th className="text-left p-2 font-medium">Tipo / Marchio</th>
                        <th className="text-right p-2 w-20 font-medium">Qtà</th>
                        <th className="text-right p-2 w-20 font-medium">Min</th>
                        <th className="text-right p-2 w-20 font-medium">Ord.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-2 font-mono text-xs">{it.code}</td>
                          <td className="p-2 text-gray-700">
                            <div className="font-medium">{it.brand} {it.model}</div>
                            <div className="text-xs text-gray-500">
                              {it.tool_type}{it.diameter_mm != null && ` · Ø${it.diameter_mm} mm`}
                            </div>
                          </td>
                          <td className="p-2 text-right font-mono text-rose-700 font-bold">{it.quantity}</td>
                          <td className="p-2 text-right font-mono text-gray-500">{it.minimum_quantity}</td>
                          <td className="p-2 text-right font-mono text-blue-700 font-bold">{it.quantity_to_order}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </div>

        </>
      )}

      {/* Storico in popup */}
      {showHistory && (
        <div
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowHistory(false)}
        >
          <Card className="w-full max-w-4xl max-h-[85vh] flex flex-col bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
              <h3 className="font-semibold flex items-center gap-2">
                <History className="w-4 h-4 text-blue-700" /> Storico ordini utensili
              </h3>
              <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  placeholder="Cerca per numero ordine (UO-0001), codice utensile, fornitore, o creatore..."
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
                    <th className="text-left p-3 w-[10%] font-medium text-gray-600">Utensili</th>
                    <th className="text-left p-3 w-[10%] font-medium text-gray-600">Qtà totale</th>
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
                      <td className="p-3 font-mono text-blue-700">UO-{String(o.id).padStart(4, '0')}</td>
                      <td className="p-3 text-gray-600">{new Date(o.created_at).toLocaleString('it-IT')}</td>
                      <td className="p-3">{o.created_by?.full_name || o.created_by?.username || '—'}</td>
                      <td className="p-3 font-mono">{o.item_count}</td>
                      <td className="p-3 font-mono">{o.total_quantity} pz</td>
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
    </div>
  )
}
