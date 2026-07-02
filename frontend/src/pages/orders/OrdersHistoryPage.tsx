import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, History, FileDown, Trash2, Package, Wrench } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import type { MaterialOrder, ToolOrder } from '@/types'

type Tab = 'materials' | 'tools'

// Scarica un blob con nome preso dal Content-Disposition (fallback prudente).
async function downloadBlob(url: string, fallbackName: string) {
  const res = await api.get(url, { responseType: 'blob' })
  const cd = res.headers['content-disposition'] as string | undefined
  const match = cd?.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : fallbackName
  const objUrl = window.URL.createObjectURL(new Blob([res.data]))
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(objUrl)
}

export default function OrdersHistoryPage() {
  const { hasPermission } = useAuth()
  const canMaterials = hasPermission('orders.materials')
  const canTools = hasPermission('tools')

  const [tab, setTab] = useState<Tab>(canMaterials ? 'materials' : 'tools')
  const [search, setSearch] = useState('')
  const [matOrders, setMatOrders] = useState<MaterialOrder[]>([])
  const [toolOrders, setToolOrders] = useState<ToolOrder[]>([])

  const loadMaterials = (term = search) => {
    const params = new URLSearchParams()
    if (term.trim()) params.set('q', term.trim())
    api.get(`/orders/materials?${params}`)
      .then(r => setMatOrders(r.data))
      .catch(() => toast.error('Errore nel caricamento dello storico materiali'))
  }

  const loadTools = (term = search) => {
    const params = new URLSearchParams()
    if (term.trim()) params.set('q', term.trim())
    api.get(`/orders/tools?${params}`)
      .then(r => setToolOrders(r.data))
      .catch(() => toast.error('Errore nel caricamento dello storico utensili'))
  }

  const reload = (term = search) => {
    if (tab === 'materials') loadMaterials(term)
    else loadTools(term)
  }

  // Ricarica al cambio tab (reset ricerca) e in debounce sulla ricerca.
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])
  useEffect(() => {
    const t = setTimeout(() => reload(search), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const deleteMaterialOrder = async (o: MaterialOrder) => {
    const num = `MO-${String(o.id).padStart(4, '0')}`
    if (!window.confirm(
      `Eliminare l'ordine ${num}?\n\nI preventivi inclusi non ancora completati torneranno "da ordinare" e riselezionabili. L'operazione non è reversibile.`
    )) return
    try {
      const res = await api.delete(`/orders/materials/${o.id}`)
      const { reverted = [], kept_completed = [] } = res.data as {
        reverted?: string[]; kept_completed?: string[]
      }
      if (kept_completed.length > 0) {
        toast.warning(
          `Ordine ${num} eliminato. ${reverted.length} preventiv${reverted.length === 1 ? 'o riaperto' : 'i riaperti'}; ` +
          `${kept_completed.length} già completat${kept_completed.length === 1 ? 'o non riaperto' : 'i non riaperti'}: ${kept_completed.join(', ')}`
        )
      } else {
        toast.success(`Ordine ${num} eliminato`)
      }
      loadMaterials()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione dell\'ordine')
    }
  }

  const deleteToolOrder = async (o: ToolOrder) => {
    const num = `UO-${String(o.id).padStart(4, '0')}`
    if (!window.confirm(`Eliminare l'ordine ${num} dallo storico?\n\nL'operazione non è reversibile.`)) return
    try {
      await api.delete(`/orders/tools/${o.id}`)
      toast.success(`Ordine ${num} eliminato`)
      loadTools()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'eliminazione dell\'ordine')
    }
  }

  const downloadMat = (kind: 'csv' | 'pdf', id: number) =>
    downloadBlob(`/orders/materials/${id}/${kind}`, `ordine_materiali_${String(id).padStart(4, '0')}.${kind}`)
      .catch((e) => {
        const err = e as { response?: { data?: { detail?: string } } }
        toast.error(err?.response?.data?.detail || `Errore nel download del ${kind.toUpperCase()}`)
      })

  const downloadToolCsv = (id: number) =>
    downloadBlob(`/orders/tools/${id}/csv`, `ordine_utensili_UO${String(id).padStart(4, '0')}.csv`)
      .catch(() => toast.error('Errore download CSV'))

  const count = tab === 'materials' ? matOrders.length : toolOrders.length

  const tabs = useMemo(() => ([
    { key: 'materials' as Tab, label: 'Ordini materiali', icon: Package, show: canMaterials },
    { key: 'tools' as Tab, label: 'Ordini utensili', icon: Wrench, show: canTools },
  ].filter(t => t.show)), [canMaterials, canTools])

  return (
    <StandardPage
      icon={History}
      color="gray"
      width="xl"
      title="Storico ordini"
      subtitle="Recupera e scarica gli ordini già emessi, o eliminali dallo storico."
    >
      {/* Selettore materiali / utensili */}
      <div className="flex items-center gap-1 border-b">
        {tabs.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => { setSearch(''); setTab(t.key) }}
              className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={tab === 'materials'
            ? 'Cerca per numero ordine (MO-0023), preventivo, o creatore...'
            : 'Cerca per numero ordine (UO-0001), fornitore, codice utensile, o creatore...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {tab === 'materials' ? (
            <table className="table-fixed w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left p-3 w-[11%] font-medium text-muted-foreground">Numero</th>
                  <th className="text-left p-3 w-[16%] font-medium text-muted-foreground">Data</th>
                  <th className="text-left p-3 w-[15%] font-medium text-muted-foreground">Fornitore</th>
                  <th className="text-left p-3 w-[14%] font-medium text-muted-foreground">Creato da</th>
                  <th className="text-left p-3 w-[6%] font-medium text-muted-foreground">Prev.</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Preventivi</th>
                  <th className="text-center p-3 w-[22%] font-medium text-muted-foreground">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {matOrders.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                    {search ? 'Nessun ordine corrisponde alla ricerca.' : 'Nessun ordine ancora.'}
                  </td></tr>
                )}
                {matOrders.map(o => (
                  <tr key={o.id} className="border-b hover:bg-muted">
                    <td className="p-3 font-mono text-primary">MO-{String(o.id).padStart(4, '0')}</td>
                    <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleString('it-IT')}</td>
                    <td className="p-3 text-foreground truncate">{o.supplier_name || '—'}</td>
                    <td className="p-3 truncate">{o.created_by?.full_name || o.created_by?.username || '—'}</td>
                    <td className="p-3 font-mono text-center">{o.quote_count}</td>
                    <td className="p-3 text-xs text-muted-foreground font-mono truncate">
                      {o.quote_numbers.slice(0, 3).join(', ')}{o.quote_numbers.length > 3 && ` +${o.quote_numbers.length - 3}`}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => downloadMat('csv', o.id)} className="mr-1">
                        <FileDown className="w-3.5 h-3.5 mr-1" /> CSV
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadMat('pdf', o.id)} className="mr-1">
                        <FileDown className="w-3.5 h-3.5 mr-1" /> PDF
                      </Button>
                      {canMaterials && (
                        <Button size="sm" variant="ghost" onClick={() => deleteMaterialOrder(o)}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="table-fixed w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left p-3 w-[12%] font-medium text-muted-foreground">Numero</th>
                  <th className="text-left p-3 w-[18%] font-medium text-muted-foreground">Data</th>
                  <th className="text-left p-3 w-[20%] font-medium text-muted-foreground">Fornitore</th>
                  <th className="text-left p-3 w-[16%] font-medium text-muted-foreground">Creato da</th>
                  <th className="text-left p-3 w-[9%] font-medium text-muted-foreground">Utensili</th>
                  <th className="text-left p-3 w-[9%] font-medium text-muted-foreground">Qtà tot.</th>
                  <th className="text-center p-3 w-[16%] font-medium text-muted-foreground">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {toolOrders.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                    {search ? 'Nessun ordine corrisponde alla ricerca.' : 'Nessun ordine ancora.'}
                  </td></tr>
                )}
                {toolOrders.map(o => (
                  <tr key={o.id} className="border-b hover:bg-muted">
                    <td className="p-3 font-mono text-primary">UO-{String(o.id).padStart(4, '0')}</td>
                    <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleString('it-IT')}</td>
                    <td className="p-3 text-foreground truncate">{o.supplier_name || '—'}</td>
                    <td className="p-3 truncate">{o.created_by?.full_name || o.created_by?.username || '—'}</td>
                    <td className="p-3 font-mono">{o.item_count}</td>
                    <td className="p-3 font-mono">{o.total_quantity} pz</td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => downloadToolCsv(o.id)} className="mr-1">
                        <FileDown className="w-3.5 h-3.5 mr-1" /> CSV
                      </Button>
                      {canTools && (
                        <Button size="sm" variant="ghost" onClick={() => deleteToolOrder(o)}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        {count} ordin{count === 1 ? 'e' : 'i'} mostrat{count === 1 ? 'o' : 'i'}
      </p>
    </StandardPage>
  )
}
