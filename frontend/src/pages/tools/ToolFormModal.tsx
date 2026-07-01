import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { Tool, ToolAttribute, ToolSupplier } from '@/types'

interface FormState {
  code: string
  tool_type: string
  brand: string
  model: string
  diameter_mm: string
  toroidal_mm: string
  quantity: string
  minimum_quantity: string
  location: string
  tool_supplier_id: string
  notes: string
  active: boolean
}

const fromTool = (t: Tool | null): FormState => ({
  code: t?.code ?? '',
  tool_type: t?.tool_type ?? '',
  brand: t?.brand ?? '',
  model: t?.model ?? '',
  diameter_mm: t?.diameter_mm != null ? String(t.diameter_mm) : '',
  toroidal_mm: t?.toroidal_mm != null ? String(t.toroidal_mm) : '',
  quantity: t ? String(t.quantity) : '0',
  minimum_quantity: t ? String(t.minimum_quantity) : '0',
  location: t?.location ?? '',
  tool_supplier_id: t?.tool_supplier_id ? String(t.tool_supplier_id) : '',
  notes: t?.notes ?? '',
  active: t?.active ?? true,
})

/** Dropdown vincolato + fallback testuale per valori legacy non più in catalogo. */
function AttributeSelect({
  value, options, onChange, placeholder,
}: {
  value: string
  options: ToolAttribute[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const activeNames = options.filter(o => o.active).map(o => o.name)
  const isLegacy = value !== '' && !activeNames.includes(value)
  if (isLegacy) {
    return (
      <div className="flex gap-1">
        <Input value={value} readOnly className="bg-amber-50" title="Valore non in catalogo — modificalo per riallinearti" />
        <button type="button" onClick={() => onChange('')} className="px-2 text-muted-foreground hover:text-foreground" title="Pulisci e scegli dal catalogo">
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }
  return (
    <select
      className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{placeholder ?? '— Seleziona —'}</option>
      {activeNames.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  )
}

interface Props {
  tool: Tool | null            // null = nuovo
  types: ToolAttribute[]
  brands: ToolAttribute[]
  suppliers: ToolSupplier[]
  onClose: () => void
  onSaved: () => void
}

export default function ToolFormModal({ tool, types, brands, suppliers, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(fromTool(tool))
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose, true)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error('Codice obbligatorio'); return }
    const payload = {
      code: form.code.trim(),
      tool_type: form.tool_type || null,
      brand: form.brand || null,
      model: form.model || null,
      diameter_mm: form.diameter_mm ? parseDecimal(form.diameter_mm) : null,
      toroidal_mm: form.toroidal_mm ? parseDecimal(form.toroidal_mm) : null,
      quantity: parseInt(form.quantity) || 0,
      minimum_quantity: parseInt(form.minimum_quantity) || 0,
      location: form.location || null,
      tool_supplier_id: form.tool_supplier_id ? Number(form.tool_supplier_id) : null,
      notes: form.notes || null,
      active: form.active,
    }
    setSaving(true)
    try {
      if (tool) await api.put(`/tools/${tool.id}`, payload)
      else await api.post('/tools', payload)
      toast.success('Utensile salvato')
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
      <Card className="w-full max-w-2xl bg-card shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold">{tool ? 'Modifica' : 'Nuovo'} Utensile</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium">Codice *</label>
              <Input className="font-mono" value={form.code} onChange={e => set('code', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <AttributeSelect value={form.tool_type} options={types}
                onChange={v => set('tool_type', v)} placeholder="— Seleziona —" />
            </div>
            <div>
              <label className="text-sm font-medium">Marchio</label>
              <AttributeSelect value={form.brand} options={brands}
                onChange={v => set('brand', v)} placeholder="— Seleziona —" />
            </div>
            <div>
              <label className="text-sm font-medium">Modello</label>
              <Input value={form.model} onChange={e => set('model', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Diametro (mm)</label>
              <Input type="number" step="0.01" value={form.diameter_mm} onChange={e => set('diameter_mm', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Raggio torico (mm)</label>
              <Input type="number" step="0.01" value={form.toroidal_mm} onChange={e => set('toroidal_mm', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Quantità</label>
              <Input type="number" min={0} value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Quantità minima</label>
              <Input type="number" min={0} value={form.minimum_quantity} onChange={e => set('minimum_quantity', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Posizione</label>
              <Input value={form.location} onChange={e => set('location', e.target.value)} placeholder="es. 1-C-2" />
            </div>
            <div>
              <label className="text-sm font-medium">Fornitore</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={form.tool_supplier_id} onChange={e => set('tool_supplier_id', e.target.value)}
              >
                <option value="">Nessuno</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Note</label>
              <Input value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="w-4 h-4" />
                Attivo
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <PrimaryCtaButton color="violet" onClick={handleSave} disabled={saving}>Salva</PrimaryCtaButton>
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
