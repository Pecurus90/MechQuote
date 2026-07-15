import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X, Plus } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { MATERIAL_FAMILIES } from '@/lib/materialFamilies'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { parseDecimal } from '@/lib/decimalInput'
import type { Material, MaterialAlias, MaterialSupplier } from '@/types'

interface MatForm {
  name: string; family: string; density: string; cost: string
  edm: string; cnc: string; scrap: string; supplier_id: string; active: boolean
}

const fromMaterial = (m: Material | null, defaultName = ''): MatForm => ({
  name: m?.name ?? defaultName,
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
  defaultName?: string          // precompila il nome (creando da import distinta)
  onClose: () => void
  onSaved: (saved?: Material) => void  // restituisce il materiale salvato al chiamante
}

export default function MaterialFormModal({ material, suppliers, defaultName, onClose, onSaved }: Props) {
  const [form, setForm] = useState<MatForm>(fromMaterial(material, defaultName))
  const [saving, setSaving] = useState(false)
  // Alias: gestiti come sotto-risorsa (persistono subito, indipendenti dal
  // Salva principale — come la scheda PDF). Solo per un materiale esistente.
  const [aliases, setAliases] = useState<MaterialAlias[]>(material?.aliases ?? [])
  const [newAlias, setNewAlias] = useState('')
  const [aliasBusy, setAliasBusy] = useState(false)
  useEscapeKey(onClose, true)

  const set = <K extends keyof MatForm>(k: K, v: MatForm[K]) => setForm(f => ({ ...f, [k]: v }))

  const addAlias = async () => {
    const v = newAlias.trim()
    if (!material || !v) return
    setAliasBusy(true)
    try {
      const res = await api.post(`/materials/${material.id}/aliases`, { csv_name: v })
      setAliases((res.data as Material).aliases ?? [])
      setNewAlias('')
      onSaved()   // tiene fresca la lista materiali del genitore
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'aggiunta dell\'alias')
    } finally { setAliasBusy(false) }
  }

  const removeAlias = async (aliasId: number) => {
    if (!material) return
    setAliasBusy(true)
    try {
      const res = await api.delete(`/materials/${material.id}/aliases/${aliasId}`)
      setAliases((res.data as Material).aliases ?? [])
      onSaved()
    } catch { toast.error('Errore nella rimozione dell\'alias') }
    finally { setAliasBusy(false) }
  }

  const handleSave = async () => {
    const payload = {
      name: form.name, family: form.family,
      density_kg_dm3: parseDecimal(form.density), cost_per_kg: parseDecimal(form.cost),
      edm_coefficient: parseDecimal(form.edm), cnc_machinability_coefficient: parseDecimal(form.cnc),
      default_scrap_percent: parseDecimal(form.scrap),
      supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      active: form.active,
    }
    setSaving(true)
    try {
      const res = material
        ? await api.put(`/materials/${material.id}`, payload)
        : await api.post('/materials', payload)
      toast.success('Materiale salvato')
      onSaved(res.data as Material)
      onClose()
    } catch { toast.error('Errore nel salvataggio') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl bg-card shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold">{material ? 'Modifica' : 'Nuovo'} Materiale</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
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
              <Input type="text" inputMode="decimal" value={form.density} onChange={e => set('density', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Costo €/kg</label>
              <Input type="text" inputMode="decimal" value={form.cost} onChange={e => set('cost', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">EDM Coeff.</label>
              <Input type="text" inputMode="decimal" value={form.edm} onChange={e => set('edm', e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-0.5">Usato in fase di import DXF/STEP (in arrivo)</p>
            </div>
            <div>
              <label className="text-sm font-medium">CNC Coeff. lavorabilità</label>
              <Input type="text" inputMode="decimal" value={form.cnc} onChange={e => set('cnc', e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-0.5">Usato in fase di import DXF/STEP (in arrivo)</p>
            </div>
            <div>
              <label className="text-sm font-medium">Sfrido %</label>
              <Input type="text" inputMode="decimal" value={form.scrap} onChange={e => set('scrap', e.target.value)} />
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

          {/* Alias: nomi alternativi con cui il materiale compare in distinta */}
          {material ? (
            <div className="mt-4 border-t pt-4">
              <label className="text-sm font-medium">Alias (nomi alternativi in distinta)</label>
              <p className="text-[11px] text-muted-foreground mb-2">
                Nomi con cui questo materiale compare nelle distinte importate.
                L'import "ordini da file" li riconosce e li abbina a questo materiale.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {aliases.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">Nessun alias</span>
                )}
                {aliases.map(a => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                    {a.csv_name}
                    <button
                      type="button"
                      onClick={() => removeAlias(a.id)}
                      disabled={aliasBusy}
                      className="hover:text-red-600 disabled:opacity-50"
                      title="Rimuovi alias"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-9 text-sm"
                  placeholder="Aggiungi alias (es. C45 EN10083)"
                  value={newAlias}
                  onChange={e => setNewAlias(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlias() } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addAlias} disabled={aliasBusy || !newAlias.trim()}>
                  <Plus className="w-4 h-4" /> Aggiungi
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 border-t pt-4 text-[11px] text-muted-foreground italic">
              Salva il materiale per poter aggiungere alias (nomi alternativi in distinta).
            </p>
          )}

          <div className="flex gap-2 mt-6">
            <PrimaryCtaButton color="blue" onClick={handleSave} disabled={saving}>Salva</PrimaryCtaButton>
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
