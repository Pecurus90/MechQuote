import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimalOrNull } from '@/lib/decimalInput'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { HeatTreatmentResult } from '@/types'

interface FormState {
  material: string
  temp_insertion_c: string
  temp_quench_c: string
  temp_temper_c: string
  temper_time_min: string
  outer_dia_pre_mm: string
  outer_dia_post_mm: string
  inner_dia_pre_mm: string
  inner_dia_post_mm: string
  length_pre_mm: string
  length_post_mm: string
  hardness: string
  notes: string
}

const num = (v: number | null | undefined): string =>
  v == null ? '' : String(v)

const fromResult = (r: HeatTreatmentResult | null): FormState => ({
  material: r?.material ?? '',
  temp_insertion_c: num(r?.temp_insertion_c),
  temp_quench_c: num(r?.temp_quench_c),
  temp_temper_c: num(r?.temp_temper_c),
  temper_time_min: num(r?.temper_time_min),
  outer_dia_pre_mm: num(r?.outer_dia_pre_mm),
  outer_dia_post_mm: num(r?.outer_dia_post_mm),
  inner_dia_pre_mm: num(r?.inner_dia_pre_mm),
  inner_dia_post_mm: num(r?.inner_dia_post_mm),
  length_pre_mm: num(r?.length_pre_mm),
  length_post_mm: num(r?.length_post_mm),
  hardness: r?.hardness ?? '',
  notes: r?.notes ?? '',
})

export default function TempraFormModal({
  result, onClose, onSaved,
}: {
  result: HeatTreatmentResult | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(fromResult(result))
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose, true)

  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.material.trim()) {
      toast.error('Il materiale è obbligatorio')
      return
    }
    const payload = {
      material: form.material.trim(),
      temp_insertion_c: parseDecimalOrNull(form.temp_insertion_c),
      temp_quench_c: parseDecimalOrNull(form.temp_quench_c),
      temp_temper_c: parseDecimalOrNull(form.temp_temper_c),
      temper_time_min: parseDecimalOrNull(form.temper_time_min),
      outer_dia_pre_mm: parseDecimalOrNull(form.outer_dia_pre_mm),
      outer_dia_post_mm: parseDecimalOrNull(form.outer_dia_post_mm),
      inner_dia_pre_mm: parseDecimalOrNull(form.inner_dia_pre_mm),
      inner_dia_post_mm: parseDecimalOrNull(form.inner_dia_post_mm),
      length_pre_mm: parseDecimalOrNull(form.length_pre_mm),
      length_post_mm: parseDecimalOrNull(form.length_post_mm),
      hardness: form.hardness.trim() || null,
      notes: form.notes.trim() || null,
    }
    setSaving(true)
    try {
      if (result) {
        await api.put(`/officina/heat-treatments/${result.id}`, payload)
        toast.success('Risultato tempra aggiornato')
      } else {
        await api.post('/officina/heat-treatments', payload)
        toast.success('Risultato tempra aggiunto')
      }
      onSaved()
      onClose()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b sticky top-0 bg-white z-10">
          <h3 className="font-semibold">{result ? 'Modifica' : 'Nuovo'} risultato tempra</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <CardContent className="pt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Materiale *</label>
            <Input value={form.material} onChange={e => set('material', e.target.value)} placeholder="es. 1.2842, C45, 100Cr6" />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Temperature e tempi</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Gradi inserimento (°C)</label>
                <Input type="number" step="1" value={form.temp_insertion_c} onChange={e => set('temp_insertion_c', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Gradi tempra (°C)</label>
                <Input type="number" step="1" value={form.temp_quench_c} onChange={e => set('temp_quench_c', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Gradi rinvenimento (°C)</label>
                <Input type="number" step="1" value={form.temp_temper_c} onChange={e => set('temp_temper_c', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Tempo rinvenimento (min)</label>
                <Input type="number" step="1" value={form.temper_time_min} onChange={e => set('temper_time_min', e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Misure pre / post tempra (mm)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Ø esterno pre</label>
                <Input type="number" step="0.001" value={form.outer_dia_pre_mm} onChange={e => set('outer_dia_pre_mm', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Ø esterno post</label>
                <Input type="number" step="0.001" value={form.outer_dia_post_mm} onChange={e => set('outer_dia_post_mm', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Ø interno pre</label>
                <Input type="number" step="0.001" value={form.inner_dia_pre_mm} onChange={e => set('inner_dia_pre_mm', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Ø interno post</label>
                <Input type="number" step="0.001" value={form.inner_dia_post_mm} onChange={e => set('inner_dia_post_mm', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Lunghezza pre</label>
                <Input type="number" step="0.001" value={form.length_pre_mm} onChange={e => set('length_pre_mm', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Lunghezza post</label>
                <Input type="number" step="0.001" value={form.length_post_mm} onChange={e => set('length_post_mm', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Durezza ottenuta</label>
              <Input value={form.hardness} onChange={e => set('hardness', e.target.value)} placeholder="es. 58 HRC" />
            </div>
            <div>
              <label className="text-sm font-medium">Note</label>
              <Input value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <PrimaryCtaButton color="emerald" onClick={handleSave} disabled={saving}>Salva</PrimaryCtaButton>
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
