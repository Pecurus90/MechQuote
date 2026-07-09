import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X } from 'lucide-react'
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

export default function DirectSaleFormModal({ sale, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(fromSale(sale))
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose, true)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const qty = Math.max(1, parseInt(form.quantity, 10) || 1)
  const totalSold = (Number(form.unit_price) || 0) * qty
  const totalCost = (Number(form.unit_cost) || 0) * qty

  const save = async () => {
    if (!form.code.trim()) { toast.error('Codice obbligatorio'); return }
    if (!form.sale_date) { toast.error('Data obbligatoria'); return }
    const payload = {
      code: form.code.trim(),
      description: form.description.trim() || null,
      sale_date: form.sale_date,
      unit_price: Number(form.unit_price) || 0,
      unit_cost: Number(form.unit_cost) || 0,
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
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-xl bg-card shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold">{sale ? 'Modifica' : 'Nuova'} vendita diretta</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
        </div>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Codice *</label>
              <Input value={form.code} onChange={e => set('code', e.target.value)} placeholder="es. RIC-0042" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium">Data *</label>
              <Input type="date" value={form.sale_date} onChange={e => set('sale_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Descrizione</label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="es. Cuscinetto SKF 6204 di ricambio" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Prezzo vendita €/pz</label>
              <Input type="number" min={0} step="0.01" value={form.unit_price} onChange={e => set('unit_price', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Costo €/pz</label>
              <Input type="number" min={0} step="0.01" value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Quantità</label>
              <Input type="number" min={1} step="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Note</label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="cliente, riferimento..." />
          </div>
          <div className="flex items-center justify-end gap-4 rounded-[10px] bg-muted/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Totale venduto <b className="text-foreground">{eur(totalSold)}</b></span>
            <span className="text-muted-foreground">costo <b className="text-foreground">{eur(totalCost)}</b></span>
            <span className={totalSold - totalCost >= 0 ? 'text-green-700' : 'text-red-600'}>margine <b>{eur(totalSold - totalCost)}</b></span>
          </div>
          <div className="flex gap-2 mt-2">
            <PrimaryCtaButton color="emerald" onClick={save} disabled={saving}>Salva</PrimaryCtaButton>
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
