import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Wrench, FileDown, History, X, AlertTriangle, ChevronRight } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
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
  const [showPicker, setShowPicker] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  useEscapeKey(() => setShowHistory(false), showHistory)
  useEscapeKey(() => setShowPicker(false), showPicker)

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

  const downloadCsv = async (orderId: number) => {
    try {
      const res = await api.get(`/orders/tools/${orderId}/csv`, { responseType: 'blob' })
      // Il backend nomina il file per-fornitore (AAAAMMGG_HHmm_fornitore.csv):
      // lo leggo dall'header, con fallback prudente.
      const cd = res.headers['content-disposition'] as string | undefined
      const match = cd?.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : `ordine_utensili_UO${orderId.toString().padStart(4, '0')}.csv`
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch { toast.error('Errore download CSV') }
  }

  const createOrder = async (supplierId: number, supplierName: string) => {
    setCreating(true)
    try {
      const res = await api.post('/orders/tools', { supplier_id: supplierId })
      const order = res.data as ToolOrder
      await downloadCsv(order.id)
      toast.success(`Ordine UO-${String(order.id).padStart(4, '0')} creato per ${supplierName} — CSV scaricato`)
      setShowPicker(false)
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
  // Solo i gruppi con fornitore reale sono ordinabili (il "Senza fornitore"
  // non può generare un ordine — nessun destinatario).
  const orderableGroups = preview?.groups.filter(g => g.supplier_id != null) ?? []

  return (
    <StandardPage
      icon={Wrench}
      color="violet"
      width="xl"
      title="Ordini utensili"
      subtitle={`Utensili sotto quantità minima raggruppati per fornitore. "Crea CSV" genera un ordine (UO-NNNN) e un file CSV per il fornitore scelto.`}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <PrimaryCtaButton
            color="violet"
            size="sm"
            onClick={() => setShowPicker(true)}
            disabled={creating || orderableGroups.length === 0}
            title={orderableGroups.length > 0 ? 'Scegli il fornitore e crea l\'ordine CSV' : 'Nessun utensile sotto minimo'}
          >
            <FileDown className="w-4 h-4" />
            Crea CSV ordine
          </PrimaryCtaButton>
          <Button variant="outline" size="sm" onClick={() => setShowHistory(s => !s)}>
            <History className="w-4 h-4 mr-1" /> Storico {orders.length > 0 && `(${orders.length})`}
          </Button>
        </div>
      }
    >

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

      {/* Picker fornitore: scegli per chi creare l'ordine CSV */}
      {showPicker && (
        <div
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowPicker(false)}
        >
          <Card className="w-full max-w-lg max-h-[85vh] flex flex-col bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
              <h3 className="font-semibold flex items-center gap-2">
                <FileDown className="w-4 h-4 text-violet-700" /> Crea CSV ordine — scegli il fornitore
              </h3>
              <button onClick={() => setShowPicker(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              <p className="text-xs text-gray-500 px-1">
                Ogni fornitore genera un ordine e un file CSV separati. Verrà inviata
                notifica a ufficio tecnico e amministrazione.
              </p>
              {orderableGroups.map(g => {
                const qty = g.items.reduce((s, it) => s + it.quantity_to_order, 0)
                return (
                  <button
                    key={g.supplier_id}
                    disabled={creating}
                    onClick={() => createOrder(g.supplier_id as number, g.supplier_name)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-md border hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50 text-left transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-800">{g.supplier_name}</div>
                      <div className="text-xs text-gray-500">
                        {g.items.length} {g.items.length === 1 ? 'utensile' : 'utensili'} · {qty} pz da ordinare
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
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
                  placeholder="Cerca per numero ordine (UO-0001), fornitore, codice utensile, o creatore..."
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
                    <th className="text-left p-3 w-[13%] font-medium text-gray-600">Numero</th>
                    <th className="text-left p-3 w-[19%] font-medium text-gray-600">Data</th>
                    <th className="text-left p-3 w-[20%] font-medium text-gray-600">Fornitore</th>
                    <th className="text-left p-3 w-[16%] font-medium text-gray-600">Creato da</th>
                    <th className="text-left p-3 w-[9%] font-medium text-gray-600">Utensili</th>
                    <th className="text-left p-3 w-[9%] font-medium text-gray-600">Qtà tot.</th>
                    <th className="text-center p-3 w-[14%] font-medium text-gray-600">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-gray-400">
                      {historySearch ? 'Nessun ordine corrisponde alla ricerca.' : 'Nessun ordine ancora.'}
                    </td></tr>
                  )}
                  {orders.map(o => (
                    <tr key={o.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-mono text-blue-700">UO-{String(o.id).padStart(4, '0')}</td>
                      <td className="p-3 text-gray-600">{new Date(o.created_at).toLocaleString('it-IT')}</td>
                      <td className="p-3 text-gray-700 truncate">{o.supplier_name || '—'}</td>
                      <td className="p-3 truncate">{o.created_by?.full_name || o.created_by?.username || '—'}</td>
                      <td className="p-3 font-mono">{o.item_count}</td>
                      <td className="p-3 font-mono">{o.total_quantity} pz</td>
                      <td className="p-3 text-center">
                        <Button size="sm" variant="outline" onClick={() => downloadCsv(o.id)}>
                          <FileDown className="w-3.5 h-3.5 mr-1" /> CSV
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
    </StandardPage>
  )
}
