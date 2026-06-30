import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { MATERIAL_FAMILIES } from '@/lib/materialFamilies'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { Material, MaterialSupplier } from '@/types'

interface MatForm {
  name: string; family: string; density: string; cost: string
  edm: string; cnc: string; scrap: string; supplier_id: string; active: boolean
}

const fromMaterial = (m: Material | null): MatForm => ({
  name: m?.name ?? '',
  family: m?.family ?? '',
  density: m != null ? String(m.density_kg_dm3) : '',
  cost: m != null ? String(m.cost_per_kg) : '',
  edm: m != null ? String(m.edm_coefficient) : '1.0',
  cnc: m != null ? String(m.cnc_machinability_coefficient) : '1.0',
  scrap: m != null ? String(m.default_scrap_percent) : '10',
  supplier_id: m?.supplier_id ? String(m.supplier_id) : '',
  active: m?.active ?? true,
})

interface Props {
  material: Material | null     // null = nuovo
  suppliers: MaterialSupplier[]
  onClose: () => void
  onSaved: () => void
}

export default function MaterialFormModal({ material, suppliers, onClose, onSaved }: Props) {
  const [form, setForm] = useState<MatForm>(fromMaterial(material))
  const [saving, setSaving] = useState(false)
  useEscapeKey(onClose, true)

  const set = <K extends keyof MatForm>(k: K, v: MatForm[K]) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    const payload = {
      name: form.name, family: form.family,
      density_kg_dm3: Number(form.density), cost_per_kg: Number(form.cost),
      edm_coefficient: Number(form.edm), cnc_machinability_coefficient: Number(form.cnc),
      default_scrap_percent: Number(form.scrap),
      supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      active: form.active,
    }
    setSaving(true)
    try {
      if (material) await api.put(`/materials/${material.id}`, payload)
      else await api.post('/materials', payload)
      toast.success('Materiale salvato')
      onSaved()
      onClose()
    } catch { toast.error('Errore nel salvataggio') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold">{material ? 'Modifica' : 'Nuovo'} Materiale</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Famiglia</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.family}
                onChange={e => set('family', e.target.value)}
              >
                <option value="">— scegli —</option>
                {MATERIAL_FAMILIES.map(fam => (
                  <option key={fam.slug} value={fam.slug}>{fam.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Densità (kg/dm³)</label>
              <Input type="number" step="0.01" value={form.density} onChange={e => set('density', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Costo €/kg</label>
              <Input type="number" step="0.01" value={form.cost} onChange={e => set('cost', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">EDM Coeff.</label>
              <Input type="number" step="0.1" value={form.edm} onChange={e => set('edm', e.target.value)} />
              <p className="text-[11px] text-gray-400 mt-0.5">Usato in fase di import DXF/STEP (in arrivo)</p>
            </div>
            <div>
              <label className="text-sm font-medium">CNC Coeff. lavorabilità</label>
              <Input type="number" step="0.1" value={form.cnc} onChange={e => set('cnc', e.target.value)} />
              <p className="text-[11px] text-gray-400 mt-0.5">Usato in fase di import DXF/STEP (in arrivo)</p>
            </div>
            <div>
              <label className="text-sm font-medium">Sfrido %</label>
              <Input type="number" step="0.5" value={form.scrap} onChange={e => set('scrap', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Fornitore materiale</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.supplier_id}
                onChange={e => set('supplier_id', e.target.value)}
              >
                <option value="">Nessun fornitore</option>
                {[...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'it')).map(s => (
                  <option key={s.id} value={s.id}>{s.name} — {s.shipping_cost.toFixed(2)} € spedizione</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-3">
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="w-4 h-4" />
            Attivo
          </label>
          <div className="flex gap-2 mt-6">
            <PrimaryCtaButton color="blue" onClick={handleSave} disabled={saving}>Salva</PrimaryCtaButton>
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
