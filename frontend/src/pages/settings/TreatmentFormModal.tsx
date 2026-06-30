import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { Supplier, Treatment } from '@/types'

interface TreatForm {
  name: string; treatmentType: string; costPerKg: string
  minimumCost: string; minimumWeightKg: string; supplierId: string; notes: string
}

const fromTreatment = (t: Treatment | null): TreatForm => ({
  name: t?.name ?? '',
  treatmentType: t?.treatment_type || '',
  costPerKg: t != null ? String(t.cost_per_kg || 0) : '0',
  minimumCost: t != null ? String(t.minimum_cost || 0) : '0',
  minimumWeightKg: t?.minimum_weight_kg != null ? String(t.minimum_weight_kg) : '',
  supplierId: t?.supplier_id ? String(t.supplier_id) : '',
  notes: t?.notes || '',
})

interface Props {
  treatment: Treatment | null     // null = nuovo
  suppliers: Supplier[]
  onClose: () => void
  onSaved: () => void
}

export default function TreatmentFormModal({ treatment, suppliers, onClose, onSaved }: Props) {
  const [form, setForm] = useState<TreatForm>(fromTreatment(treatment))
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose, true)

  const set = <K extends keyof TreatForm>(k: K, v: TreatForm[K]) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    const payload = {
      name: form.name,
      treatment_type: form.treatmentType,
      cost_per_kg: Number(form.costPerKg),
      minimum_cost: Number(form.minimumCost),
      minimum_weight_kg: form.minimumWeightKg !== '' ? Number(form.minimumWeightKg) : null,
      supplier_id: form.supplierId ? Number(form.supplierId) : null,
      notes: form.notes,
    }
    setSaving(true)
    try {
      if (treatment) await api.put(`/treatments/${treatment.id}`, payload)
      else await api.post('/treatments', payload)
      toast.success('Trattamento salvato')
      onSaved()
      onClose()
    } catch { toast.error('Errore nel salvataggio') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold">{treatment ? 'Modifica' : 'Nuovo'} Trattamento</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <Input value={form.treatmentType} placeholder="Es. Zincatura, Anodizzazione" onChange={e => set('treatmentType', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Costo per kg (€)</label>
              <Input type="number" step="0.01" value={form.costPerKg} onChange={e => set('costPerKg', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Costo minimo (€)</label>
              <Input type="number" step="0.01" value={form.minimumCost} onChange={e => set('minimumCost', e.target.value)} />
              <p className="text-[10px] text-gray-400 mt-0.5">Si applica se il lotto è sotto la soglia peso</p>
            </div>
            <div>
              <label className="text-sm font-medium">Soglia peso lotto (kg)</label>
              <Input type="number" step="0.1" min="0" placeholder="—"
                value={form.minimumWeightKg}
                onChange={e => set('minimumWeightKg', e.target.value)} />
              <p className="text-[10px] text-gray-400 mt-0.5">Se peso totale lotto {'<'} soglia → applica costo minimo</p>
            </div>
            <div>
              <label className="text-sm font-medium">Fornitore</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.supplierId}
                onChange={e => set('supplierId', e.target.value)}
              >
                <option value="">Nessun fornitore</option>
                {[...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'it')).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Note</label>
              <Input value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <PrimaryCtaButton color="orange" onClick={handleSave} disabled={saving}>Salva</PrimaryCtaButton>
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
