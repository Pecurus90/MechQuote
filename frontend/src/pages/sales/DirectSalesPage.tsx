import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Receipt } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import StandardPage from '@/components/layout/StandardPage'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import DirectSaleFormModal from './DirectSaleFormModal'
import type { DirectSale } from '@/types'

const eur = (v: number) => '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateShort = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })

export default function DirectSalesPage() {
  const nowYear = new Date().getFullYear()
  const [sales, setSales] = useState<DirectSale[]>([])
  const [year, setYear] = useState<number>(nowYear)
  const [showForm, setShowForm] = useState(false)
  const [editSale, setEditSale] = useState<DirectSale | null>(null)
  const [pendingDel, setPendingDel] = useState<number | null>(null)

  const load = () => api.get(`/direct-sales?year=${year}`).then(r => setSales(r.data)).catch(() => toast.error('Errore nel caricamento delle vendite'))
  useEffect(() => { load() /* eslint-disable-next-line */ }, [year])

  const confirmDelete = async () => {
    if (pendingDel == null) return
    const id = pendingDel; setPendingDel(null)
    try { await api.delete(`/direct-sales/${id}`); toast.success('Vendita eliminata'); load() }
    catch { toast.error('Errore nell\'eliminazione') }
  }

  const totalSold = sales.reduce((s, x) => s + x.unit_price * x.quantity, 0)
  const totalCost = sales.reduce((s, x) => s + x.unit_cost * x.quantity, 0)
  const years = Array.from({ length: 6 }, (_, i) => nowYear - i)

  const actions = (
    <div className="flex items-center gap-3">
      <select value={year} onChange={e => setYear(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <PrimaryCtaButton color="emerald" size="sm" onClick={() => { setEditSale(null); setShowForm(true) }}>
        <Plus className="w-4 h-4" /> Nuova vendita
      </PrimaryCtaButton>
    </div>
  )

  return (
    <StandardPage
      icon={Receipt}
      color="emerald"
      title="Vendite dirette"
      subtitle="Vendite di componenti fuori preventivo (ricambi). Confluiscono nel venduto annuo."
      width="xl"
      actions={actions}
    >
      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className="text-left p-3 w-[14%] font-medium text-muted-foreground">Codice</th>
                <th className="text-left p-3 w-[26%] font-medium text-muted-foreground">Descrizione</th>
                <th className="text-left p-3 w-[10%] font-medium text-muted-foreground">Data</th>
                <th className="text-right p-3 w-[12%] font-medium text-muted-foreground">Prezzo/pz</th>
                <th className="text-right p-3 w-[10%] font-medium text-muted-foreground">Costo/pz</th>
                <th className="text-right p-3 w-[6%] font-medium text-muted-foreground">Q.tà</th>
                <th className="text-right p-3 w-[12%] font-medium text-muted-foreground">Venduto</th>
                <th className="text-center p-3 w-[10%] font-medium text-muted-foreground">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nessuna vendita registrata per il {year}.</td></tr>
              )}
              {sales.map(s => (
                <tr key={s.id} className="border-b hover:bg-muted">
                  <td className="p-3 font-mono font-medium truncate">{s.code}</td>
                  <td className="p-3 text-muted-foreground truncate">{s.description || '—'}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{dateShort(s.sale_date)}</td>
                  <td className="p-3 text-right font-mono">{eur(s.unit_price)}</td>
                  <td className="p-3 text-right font-mono text-muted-foreground">{eur(s.unit_cost)}</td>
                  <td className="p-3 text-right font-mono">{s.quantity}</td>
                  <td className="p-3 text-right font-mono font-semibold">{eur(s.unit_price * s.quantity)}</td>
                  <td className="p-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => { setEditSale(s); setShowForm(true) }} className="p-1 hover:bg-muted rounded"><Pencil className="w-4 h-4 text-blue-600" /></button>
                      <button onClick={() => setPendingDel(s.id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-600" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {sales.length > 0 && (
              <tfoot className="border-t bg-muted/40">
                <tr>
                  <td colSpan={6} className="p-3 text-right font-medium text-muted-foreground">Totale {year}</td>
                  <td className="p-3 text-right font-mono font-bold">{eur(totalSold)}</td>
                  <td className="p-3 text-center text-[11px] text-muted-foreground">costo {eur(totalCost)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      {showForm && <DirectSaleFormModal sale={editSale} onClose={() => setShowForm(false)} onSaved={load} />}
      <ConfirmDialog
        open={pendingDel != null}
        title="Eliminare questa vendita?"
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDel(null)}
      />
    </StandardPage>
  )
}
