import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X, Circle, Square } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimalOrNull } from '@/lib/decimalInput'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { HeatTreatmentResult, HeatTreatmentShape } from '@/types'

interface FormState {
  material: string
  shape: HeatTreatmentShape
  temp_insertion_c: string
  temp_quench_c: string
  temp_temper_c: string
  temper_time_min: string
  outer_dia_pre_mm: string
  outer_dia_post_mm: string
  inner_dia_pre_mm: string
  inner_dia_post_mm: string
  width_pre_mm: string
  width_post_mm: string
  height_pre_mm: string
  height_post_mm: string
  length_pre_mm: string
  length_post_mm: string
  hardness: string
  notes: string
}

const num = (v: number | null | undefined): string => (v == null ? '' : String(v))

// La dicitura "HRC" è gestita in automatico: nel form l'utente vede/edita solo
// il valore (es. "58"), la sigla viene aggiunta al salvataggio e tolta in lettura.
const stripHrc = (v: string | null | undefined): string =>
  (v ?? '').replace(/\s*HRC\s*$/i, '').trim()

// Definito fuori dal componente: se stesse dentro, ogni render lo tratterebbe
// come un componente nuovo e rimonterebbe gli Input, facendo perdere il focus
// a ogni battitura (l'utente doveva ri-cliccare a ogni cifra).
const PrePostRow = ({ label, prePost }: {
  label: string
  prePost: {
    preValue: string; postValue: string
    onPre: (v: string) => void; onPost: (v: string) => void
  }
}) => (
  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
    <label className="text-sm font-medium">{label}</label>
    <Input type="text" inputMode="decimal" className="w-28" placeholder="pre"
      value={prePost.preValue} onChange={e => prePost.onPre(e.target.value)} />
    <Input type="text" inputMode="decimal" className="w-28" placeholder="post"
      value={prePost.postValue} onChange={e => prePost.onPost(e.target.value)} />
  </div>
)

const fromResult = (r: HeatTreatmentResult | null): FormState => ({
  material: r?.material ?? '',
  shape: r?.shape ?? 'tondo',
  temp_insertion_c: num(r?.temp_insertion_c),
  temp_quench_c: num(r?.temp_quench_c),
  temp_temper_c: num(r?.temp_temper_c),
  temper_time_min: num(r?.temper_time_min),
  outer_dia_pre_mm: num(r?.outer_dia_pre_mm),
  outer_dia_post_mm: num(r?.outer_dia_post_mm),
  inner_dia_pre_mm: num(r?.inner_dia_pre_mm),
  inner_dia_post_mm: num(r?.inner_dia_post_mm),
  width_pre_mm: num(r?.width_pre_mm),
  width_post_mm: num(r?.width_post_mm),
  height_pre_mm: num(r?.height_pre_mm),
  height_post_mm: num(r?.height_post_mm),
  length_pre_mm: num(r?.length_pre_mm),
  length_post_mm: num(r?.length_post_mm),
  hardness: stripHrc(r?.hardness),
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
    const isRound = form.shape === 'tondo'
    const h = stripHrc(form.hardness)
    const payload = {
      material: form.material.trim(),
      shape: form.shape,
      temp_insertion_c: parseDecimalOrNull(form.temp_insertion_c),
      temp_quench_c: parseDecimalOrNull(form.temp_quench_c),
      temp_temper_c: parseDecimalOrNull(form.temp_temper_c),
      temper_time_min: parseDecimalOrNull(form.temper_time_min),
      // Solo le misure della forma scelta; le altre azzerate per dati puliti.
      outer_dia_pre_mm: isRound ? parseDecimalOrNull(form.outer_dia_pre_mm) : null,
      outer_dia_post_mm: isRound ? parseDecimalOrNull(form.outer_dia_post_mm) : null,
      inner_dia_pre_mm: isRound ? parseDecimalOrNull(form.inner_dia_pre_mm) : null,
      inner_dia_post_mm: isRound ? parseDecimalOrNull(form.inner_dia_post_mm) : null,
      width_pre_mm: isRound ? null : parseDecimalOrNull(form.width_pre_mm),
      width_post_mm: isRound ? null : parseDecimalOrNull(form.width_post_mm),
      height_pre_mm: isRound ? null : parseDecimalOrNull(form.height_pre_mm),
      height_post_mm: isRound ? null : parseDecimalOrNull(form.height_post_mm),
      length_pre_mm: parseDecimalOrNull(form.length_pre_mm),
      length_post_mm: parseDecimalOrNull(form.length_post_mm),
      hardness: h ? `${h} HRC` : null,
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

  const prePost = (preKey: keyof FormState, postKey: keyof FormState) => ({
    preValue: form[preKey] as string,
    postValue: form[postKey] as string,
    onPre: (v: string) => set(preKey, v),
    onPost: (v: string) => set(postKey, v),
  })

  const isRound = form.shape === 'tondo'

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl bg-card shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b sticky top-0 bg-card z-10">
          <h3 className="font-semibold">{result ? 'Modifica' : 'Nuovo'} risultato tempra</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <CardContent className="pt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Materiale *</label>
            <Input value={form.material} onChange={e => set('material', e.target.value)} placeholder="es. 1.2842, C45, 100Cr6" />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Forma del pezzo</label>
            <div className="flex gap-2">
              {([
                { v: 'tondo' as const, Icon: Circle },
                { v: 'quadrato' as const, Icon: Square },
              ]).map(({ v, Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('shape', v)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md border text-sm capitalize transition-colors ${
                    form.shape === v
                      ? 'bg-success text-white border-success'
                      : 'bg-card text-foreground border-border hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Temperature e tempi</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Gradi inserimento (°C)</label>
                <Input type="text" inputMode="decimal" value={form.temp_insertion_c} onChange={e => set('temp_insertion_c', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Gradi tempra (°C)</label>
                <Input type="text" inputMode="decimal" value={form.temp_quench_c} onChange={e => set('temp_quench_c', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Gradi rinvenimento (°C)</label>
                <Input type="text" inputMode="decimal" value={form.temp_temper_c} onChange={e => set('temp_temper_c', e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Tempo rinvenimento (min)</label>
                <Input type="text" inputMode="decimal" value={form.temper_time_min} onChange={e => set('temper_time_min', e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Misure pre / post tempra (mm)</p>
              <span className="text-[11px] text-muted-foreground">pre · post</span>
            </div>
            <div className="space-y-2">
              {isRound ? (
                <>
                  <PrePostRow label="Ø esterno" prePost={prePost('outer_dia_pre_mm', 'outer_dia_post_mm')} />
                  <PrePostRow label="Ø interno" prePost={prePost('inner_dia_pre_mm', 'inner_dia_post_mm')} />
                </>
              ) : (
                <>
                  <PrePostRow label="Larghezza" prePost={prePost('width_pre_mm', 'width_post_mm')} />
                  <PrePostRow label="Altezza" prePost={prePost('height_pre_mm', 'height_post_mm')} />
                </>
              )}
              <PrePostRow label="Lunghezza" prePost={prePost('length_pre_mm', 'length_post_mm')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Durezza ottenuta</label>
              <div className="flex items-center gap-2">
                <Input value={form.hardness} onChange={e => set('hardness', e.target.value)} placeholder="es. 58 oppure 60-62" />
                <span className="text-sm font-medium text-muted-foreground shrink-0">HRC</span>
              </div>
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
