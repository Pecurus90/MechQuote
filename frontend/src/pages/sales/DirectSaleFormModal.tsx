import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X, HandCoins, TrendingUp, TrendingDown } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { DirectSale } from '@/types'

interface FormState {
  code: string; description: string; sale_date: string
  unit_price: string; unit_cost: string; quantity: string; notes: string
}

const today = () => new Date().toISOString().slice(0, 10)
const fromSale = (s: DirectSale | null): FormState => ({
  code: s?.code ?? '',
  description: s?.description ?? '',
  sale_date: s?.sale_date ? s.sale_date.slice(0, 10) : today(),
  unit_price: s != null ? String(s.unit_price) : '',
  unit_cost: s != null ? String(s.unit_cost) : '',
  quantity: s != null ? String(s.quantity) : '1',
  notes: s?.notes ?? '',
})

interface Props { sale: DirectSale | null; onClose: () => void; onSaved: () => void }

const eur = (v: number) => '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const labelCls = 'mb-1 block text-[12px] font-medium text-foreground'
// Parsing it-IT: accetta la virgola decimale.
const num = (s: string) => Number(String(s).replace(',', '.')) || 0

export default function DirectSaleFormModal({ sale, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(fromSale(sale))
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose, true)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const qty = Math.max(1, parseInt(form.quantity, 10) || 1)
  const totalSold = num(form.unit_price) * qty
  const totalCost = num(form.unit_cost) * qty
  const margin = totalSold - totalCost
  const marginPos = margin >= 0

  const save = async () => {
    if (!form.code.trim()) { toast.error('Codice obbligatorio'); return }
    if (!form.sale_date) { toast.error('Data obbligatoria'); return }
    const payload = {
      code: form.code.trim(),
      description: form.description.trim() || null,
      sale_date: form.sale_date,
      unit_price: num(form.unit_price),
      unit_cost: num(form.unit_cost),
      quantity: qty,
      notes: form.notes.trim() || null,
    }
    setSaving(true)
    try {
      if (sale) await api.put(`/direct-sales/${sale.id}`, payload)
      else await api.post('/direct-sales', payload)
      toast.success(sale ? 'Vendita aggiornata' : 'Vendita registrata')
      onSaved(); onClose()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-sales/[0.14] text-sales">
              <HandCoins className="h-[17px] w-[17px]" />
            </div>
            <h3 className="font-semibold text-foreground">{sale ? 'Modifica vendita diretta' : 'Nuova vendita diretta'}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className={labelCls}>Codice *</label>
              <Input className="font-mono" value={form.code} onChange={e => set('code', e.target.value)} placeholder="es. RIC-0042" autoFocus />
            </div>
            <div>
              <label className={labelCls}>Data *</label>
              <Input type="date" className="font-mono" value={form.sale_date} onChange={e => set('sale_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Descrizione</label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="es. Cuscinetto SKF 6204 di ricambio" />
          </div>
          <div className="grid grid-cols-3 gap-3.5">
            <div>
              <label className={labelCls}>Prezzo vendita €/pz</label>
              <Input type="number" min={0} step="0.01" className="font-mono" value={form.unit_price} onChange={e => set('unit_price', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Costo €/pz</label>
              <Input type="number" min={0} step="0.01" className="font-mono" value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Quantità</label>
              <Input type="number" min={1} step="1" className="font-mono" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Note</label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="cliente, riferimento…" />
          </div>

          {/* Riepilogo live */}
          <div className="grid grid-cols-3 gap-3 rounded-[10px] border border-sales/[0.35] bg-sales/[0.07] px-4 py-3">
            <div>
              <div className="text-[11px] text-muted-foreground">Totale venduto</div>
              <div className="font-mono text-[19px] font-bold text-foreground">{eur(totalSold)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Costo</div>
              <div className="font-mono text-[15px] text-muted-foreground">{eur(totalCost)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Margine</div>
              <div className={`inline-flex items-center gap-1 font-mono text-[15px] font-semibold ${marginPos ? 'text-success' : 'text-danger'}`}>
                {marginPos ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{eur(margin)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-card-muted px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          <PrimaryCtaButton color="sales" onClick={save} disabled={saving}>
            {saving ? 'Salvataggio…' : 'Registra vendita'}
          </PrimaryCtaButton>
        </div>
      </div>
    </div>
  )
}
