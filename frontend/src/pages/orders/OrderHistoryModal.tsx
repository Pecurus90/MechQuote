import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, History, X, FileDown } from 'lucide-react'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { MaterialOrder } from '@/types'

interface Props {
  orders: MaterialOrder[]
  search: string
  onSearchChange: (v: string) => void
  onDownloadPdf: (orderId: number) => void
  onDownloadCsv: (orderId: number) => void
  onClose: () => void
}

export default function OrderHistoryModal({ orders, search, onSearchChange, onDownloadPdf, onDownloadCsv, onClose }: Props) {
  useEscapeKey(onClose, true)
  return (
    <div
      className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card className="w-full max-w-4xl max-h-[85vh] flex flex-col bg-card shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h3 className="font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> Storico ordini materiali
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Cerca per numero ordine (MO-0023), preventivo (001-26A_010), o creatore..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="pl-9 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-muted border-b sticky top-0">
              <tr>
                <th className="text-left p-3 w-[12%] font-medium text-muted-foreground">Numero</th>
                <th className="text-left p-3 w-[17%] font-medium text-muted-foreground">Data</th>
                <th className="text-left p-3 w-[16%] font-medium text-muted-foreground">Fornitore</th>
                <th className="text-left p-3 w-[15%] font-medium text-muted-foreground">Creato da</th>
                <th className="text-left p-3 w-[7%] font-medium text-muted-foreground">Prev.</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Preventivi</th>
                <th className="text-center p-3 w-[16%] font-medium text-muted-foreground">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {search ? 'Nessun ordine corrisponde alla ricerca.' : 'Nessun ordine ancora.'}
                </td></tr>
              )}
              {orders.map(o => (
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
                    <Button size="sm" variant="outline" onClick={() => onDownloadCsv(o.id)} className="mr-1">
                      <FileDown className="w-3.5 h-3.5 mr-1" /> CSV
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onDownloadPdf(o.id)}>
                      <FileDown className="w-3.5 h-3.5 mr-1" /> PDF
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2 border-t text-xs text-muted-foreground shrink-0">
          {orders.length} ordin{orders.length === 1 ? 'e' : 'i'} mostrat{orders.length === 1 ? 'o' : 'i'}
        </div>
      </Card>
    </div>
  )
}
