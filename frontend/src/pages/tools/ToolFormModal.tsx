import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X, Drill } from 'lucide-react'
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

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm'
const labelCls = 'mb-1 block text-[12px] font-medium text-foreground'

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
        <Input value={value} readOnly className="bg-warning/10" title="Valore fuori catalogo — modificalo per riallinearti" />
        <button type="button" onClick={() => onChange('')} className="px-2 text-muted-foreground hover:text-foreground" title="Pulisci e scegli dal catalogo">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }
  return (
    <select className={selectCls} value={value} onChange={e => onChange(e.target.value)}>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-tools/[0.14] text-tools">
              <Drill className="h-[17px] w-[17px]" />
            </div>
            <h3 className="font-semibold text-foreground">{tool ? 'Modifica utensile' : 'Nuovo utensile'}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-3.5 gap-y-3 px-5 py-4">
          <div className="col-span-2">
            <label className={labelCls}>Codice *</label>
            <Input className="font-mono" value={form.code} onChange={e => set('code', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Tipo</label>
            <AttributeSelect value={form.tool_type} options={types} onChange={v => set('tool_type', v)} />
          </div>
          <div>
            <label className={labelCls}>Marchio</label>
            <AttributeSelect value={form.brand} options={brands} onChange={v => set('brand', v)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Modello</label>
            <Input value={form.model} onChange={e => set('model', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Diametro (mm)</label>
            <Input type="number" step="0.01" className="font-mono" value={form.diameter_mm} onChange={e => set('diameter_mm', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Raggio torico (mm)</label>
            <Input type="number" step="0.01" className="font-mono" value={form.toroidal_mm} onChange={e => set('toroidal_mm', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Quantità</label>
            <Input type="number" min={0} className="font-mono" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Quantità minima</label>
            <Input type="number" min={0} className="font-mono" value={form.minimum_quantity} onChange={e => set('minimum_quantity', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Posizione</label>
            <Input className="font-mono" value={form.location} onChange={e => set('location', e.target.value)} placeholder="es. 1-C-2" />
          </div>
          <div>
            <label className={labelCls}>Fornitore</label>
            <select className={selectCls} value={form.tool_supplier_id} onChange={e => set('tool_supplier_id', e.target.value)}>
              <option value="">Nessuno</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Note</label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {/* Attivo — switch in box card-muted */}
          <div className="col-span-2 flex items-center justify-between rounded-[10px] bg-card-muted px-3.5 py-3">
            <div className="pr-4">
              <div className="text-sm font-medium text-foreground">Attivo</div>
              <div className="text-[11px] text-muted-foreground">Se spento l'utensile è "ritirato" e resta in archivio, non più selezionabile.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              onClick={() => set('active', !form.active)}
              className={`relative h-6 w-11 flex-none rounded-full transition-colors ${form.active ? 'bg-tools' : 'bg-input'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${form.active ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-card-muted px-5 py-3">
          <span className="text-[11px] text-muted-foreground">Tipo e Marchio si scelgono dal catalogo utensili.</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
            <PrimaryCtaButton color="tools" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvataggio…' : 'Salva utensile'}
            </PrimaryCtaButton>
          </div>
        </div>
      </div>
    </div>
  )
}
