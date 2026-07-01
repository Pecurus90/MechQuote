import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { NormalizedItem, NormalizedSupplier } from '@/types'

interface FormState {
  code: string
  description: string
  category: string
  supplier_id: number | null
  unit_price: number
  notes: string
  active: boolean
}

const fromItem = (it: NormalizedItem | null): FormState => ({
  code: it?.code ?? '',
  description: it?.description ?? '',
  category: it?.category ?? '',
  supplier_id: it?.supplier_id ?? null,
  unit_price: it?.unit_price ?? 0,
  notes: it?.notes ?? '',
  active: it?.active ?? true,
})

interface Props {
  item: NormalizedItem | null     // null = nuovo
  suppliers: NormalizedSupplier[]
  categories: string[]
  onClose: () => void
  onSaved: () => void
}

export default function NormalizedItemFormModal({ item, suppliers, categories, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(fromItem(item))
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose, true)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.code.trim()) { toast.error('Codice obbligatorio'); return }
    if (!form.description.trim()) { toast.error('Descrizione obbligatoria'); return }
    if (form.unit_price < 0) { toast.error('Il prezzo non può essere negativo'); return }
    const payload = {
      code: form.code.trim(),
      description: form.description.trim(),
      category: form.category.trim() || null,
      supplier_id: form.supplier_id,
      unit_price: form.unit_price,
      notes: form.notes.trim() || null,
      active: form.active,
    }
    setSaving(true)
    try {
      if (item) await api.put(`/normalized-items/${item.id}`, payload)
      else await api.post('/normalized-items', payload)
      toast.success(item ? 'Voce aggiornata' : 'Voce creata')
      onSaved()
      onClose()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-xl bg-card shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold">{item ? 'Modifica' : 'Nuovo'} normalizzato</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Codice *</label>
              <Input value={form.code} onChange={e => set('code', e.target.value)} placeholder="es. COL-D32-L250-RAB" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium">Categoria</label>
              <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="es. colonne, viti, molle" list="categories-suggest" />
              <datalist id="categories-suggest">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Descrizione *</label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="es. Colonna Ø32 L250 Rabourdin" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Fornitore</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm h-9"
                value={form.supplier_id ?? ''}
                onChange={e => set('supplier_id', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— nessuno —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Prezzo €/pz</label>
              <Input type="number" min={0} step="0.01" value={form.unit_price}
                onChange={e => set('unit_price', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Note</label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="riferimenti, link scheda tecnica..." />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="w-4 h-4" />
            Attivo
          </label>
          <div className="flex gap-2 mt-4">
            <PrimaryCtaButton color="sky" onClick={save} disabled={saving}>Salva</PrimaryCtaButton>
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
