import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, HandCoins, Receipt } from 'lucide-react'
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

  const startNew = () => { setEditSale(null); setShowForm(true) }

  const actions = (
    <div className="flex items-center gap-3">
      <select
        value={year}
        onChange={e => setYear(Number(e.target.value))}
        className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm"
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <PrimaryCtaButton color="sales" size="sm" onClick={startNew}>
        <Plus className="h-4 w-4" /> Nuova vendita
      </PrimaryCtaButton>
    </div>
  )

  return (
    <StandardPage
      icon={HandCoins}
      color="sales"
      width="xl"
      title="Vendite dirette"
      subtitle="Vendite di componenti fuori preventivo (ricambi). Confluiscono nel venduto annuo."
      actions={actions}
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <colgroup>
              <col style={{ width: 120 }} /><col /><col style={{ width: 92 }} />
              <col style={{ width: 112 }} /><col style={{ width: 104 }} /><col style={{ width: 64 }} />
              <col style={{ width: 132 }} /><col style={{ width: 84 }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-card-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="p-2.5 text-left font-medium">Codice</th>
                <th className="p-2.5 text-left font-medium">Descrizione</th>
                <th className="p-2.5 text-left font-medium">Data</th>
                <th className="p-2.5 text-right font-medium">Prezzo/pz</th>
                <th className="p-2.5 text-right font-medium">Costo/pz</th>
                <th className="p-2.5 text-right font-medium">Q.tà</th>
                <th className="p-2.5 text-right font-medium">Venduto</th>
                <th className="p-2.5 text-center font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sales/[0.14] text-sales">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <div className="text-sm font-medium text-foreground">Nessuna vendita registrata per il {year}</div>
                      <div className="text-xs text-muted-foreground">Cambia anno dal selettore o registra la prima vendita.</div>
                      <PrimaryCtaButton color="sales" size="sm" className="mt-1" onClick={startNew}>
                        <Plus className="h-4 w-4" /> Nuova vendita
                      </PrimaryCtaButton>
                    </div>
                  </td>
                </tr>
              ) : sales.map(s => (
                <tr key={s.id} className="border-b border-border transition-colors hover:bg-muted/[0.45]">
                  <td className="truncate p-2.5 font-mono font-semibold text-foreground">{s.code}</td>
                  <td className="truncate p-2.5 text-foreground">{s.description || <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2.5 font-mono text-xs text-muted-foreground">{dateShort(s.sale_date)}</td>
                  <td className="p-2.5 text-right font-mono">{eur(s.unit_price)}</td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{eur(s.unit_cost)}</td>
                  <td className="p-2.5 text-right font-mono">{s.quantity}</td>
                  <td className="p-2.5 text-right font-mono font-semibold text-foreground">{eur(s.unit_price * s.quantity)}</td>
                  <td className="p-2.5">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => { setEditSale(s); setShowForm(true) }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifica">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setPendingDel(s.id)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {sales.length > 0 && (
              <tfoot>
                <tr className="border-t border-sales/[0.30] bg-sales/[0.08]">
                  <td colSpan={5} className="p-3 text-left font-bold text-foreground">Totale {year}</td>
                  <td colSpan={1} className="p-3 text-right text-[12px] text-muted-foreground">costo</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    <div className="text-[11px] font-normal text-muted-foreground">{eur(totalCost)}</div>
                    <div className="font-mono text-[14.5px] font-bold text-sales">{eur(totalSold)}</div>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

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
