import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Hammer, Plus, X } from 'lucide-react'

import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import { useAuth } from '@/lib/auth'
import type {
  DieSettings, DieDimensionBracket, DieTemplate, DieTemplatePlate,
  DieTemplateNormalized, NormalizedSupplier,
  Material, Treatment, Machine, DieSubtype, DieDifficulty,
} from '@/types'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  )
}

type Tab = 'tariffe' | 'fasce' | 'template'

export default function DiesSettingsPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('dies.settings')
  const [tab, setTab] = useState<Tab>('tariffe')

  return (
    <StandardPage
      icon={Hammer}
      color="rose"
      title="Impostazioni Stampi"
      subtitle="Tariffe, fasce piastra e template per il modulo Preventivatore Stampi"
      width="xl"
    >
      <div className="flex gap-2 border-b">
        {(['tariffe', 'fasce', 'template'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? 'border-rose-600 text-rose-700' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'tariffe' && 'Tariffe & costi'}
            {t === 'fasce' && 'Fasce piastra'}
            {t === 'template' && 'Template stampi'}
          </button>
        ))}
      </div>

      {tab === 'tariffe' && <TariffeTab canWrite={canWrite} />}
      {tab === 'fasce' && <FasceTab canWrite={canWrite} />}
      {tab === 'template' && <TemplatesTab canWrite={canWrite} />}
    </StandardPage>
  )
}

// ─── Tab 1: Tariffe ──────────────────────────────────────────────────────────

function TariffeTab({ canWrite }: { canWrite: boolean }) {
  const [s, setS] = useState<DieSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [cycles, setCycles] = useState<{ id: number; name: string }[]>([])
  const [machines, setMachines] = useState<Machine[]>([])

  useEffect(() => {
    api.get('/die-settings').then(r => setS(r.data)).catch(() => toast.error('Errore caricamento'))
    // Cicli EDM per dropdown wire_edm_cycle_id
    api.get('/cutting-cycles').then(r => setCycles(r.data)).catch(() => { /* lista vuota: cycle_id resta editabile come number */ })
    // Macchine officina per dropdown FK Sprint F (filtrate per machine_type).
    api.get('/machines').then(r => setMachines(r.data)).catch(() => {})
  }, [])

  // Sprint F — dropdown Machine. Per wire_edm filtriamo per tipo noto;
  // per fresa/rettifica/foratura `machine_type` non è standardizzato in DB,
  // quindi mostriamo tutte (l'utente sceglie).
  const machineSelect = (key: keyof DieSettings, label: string, typeFilter?: string) => {
    const pool = typeFilter
      ? (() => {
          const filtered = machines.filter(m => m.machine_type === typeFilter)
          return filtered.length > 0 ? filtered : machines
        })()
      : machines
    return (
      <Field label={label}>
        <select
          disabled={!canWrite}
          value={(s?.[key] as number | null) ?? ''}
          onChange={e => update({ [key]: e.target.value ? parseInt(e.target.value, 10) : null } as Partial<DieSettings>)}
          className="w-full h-9 px-2 border rounded text-sm"
        >
          <option value="">— usa tariffa esplicita —</option>
          {pool.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.hourly_rate ?? 0} €/h)</option>
          ))}
        </select>
      </Field>
    )
  }

  const update = (patch: Partial<DieSettings>) => setS(prev => prev ? { ...prev, ...patch } : prev)

  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      await api.put('/die-settings', s)
      toast.success('Impostazioni salvate')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  if (!s) return <p className="text-sm text-muted-foreground">Caricamento…</p>

  const num = (key: keyof DieSettings, label: string) => (
    <Field label={label}>
      <Input
        type="number"
        disabled={!canWrite}
        value={s[key] as number}
        onChange={e => update({ [key]: parseFloat(e.target.value) || 0 } as Partial<DieSettings>)}
      />
    </Field>
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Tariffe orarie officina (€/h)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Aggancia una macchina del catalogo per propagare automaticamente la sua tariffa
            (Settings → Macchine). Altrimenti usa la tariffa esplicita inserita qui.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              {num('hourly_rate_milling', 'Fresatura (€/h fallback)')}
              {machineSelect('milling_machine_id', 'Macchina fresa (override)')}
            </div>
            <div className="space-y-2">
              {num('hourly_rate_grinding', 'Rettifica (€/h fallback)')}
              {machineSelect('grinding_machine_id', 'Macchina rettifica (override)')}
            </div>
            <div className="space-y-2">
              {num('hourly_rate_edm_die', 'EDM filo per piastre (€/h fallback)')}
              {machineSelect('edm_wire_machine_id', 'Macchina EDM filo (override)', 'wire_edm')}
            </div>
            <div className="space-y-2">
              {num('hourly_rate_edm_wire', 'EDM secondaria (€/h)')}
              {machineSelect('drilling_machine_id', 'Macchina foratura (override)')}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">7. Progettazione (ore × tariffa)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ore totali = ore[difficoltà] + bonus piega × n. pieghe + bonus punzone × n. punzoni.
            Più feature ⇒ più CAD/programmazione, indipendentemente dalla difficoltà globale.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {num('design_hours_base', 'Ore base')}
            {num('design_hours_medium', 'Ore media')}
            {num('design_hours_hard', 'Ore alta')}
            {num('design_hourly_rate', 'Tariffa €/h')}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            {num('design_h_per_bend', 'Bonus h per piega')}
            {num('design_h_per_punch', 'Bonus h per punzone')}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">8. Forfait montaggio/collaudo (€)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          {num('assembly_forfeit_base', 'Base')}
          {num('assembly_forfeit_medium', 'Media')}
          {num('assembly_forfeit_hard', 'Alta')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">9–10. Margine & offset castello default</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          {num('default_margin_percent', 'Margine default (%)')}
          {num('default_castle_offset_x_mm', 'Offset castello X (mm)')}
          {num('default_castle_offset_y_mm', 'Offset castello Y (mm)')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">11. Driver EDM filo piastre stampo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Lunghezza EDM per piastra = perimetro pezzo × n. stazioni × moltiplicatore (1.0 matrice, factor estrattore per porta-punzoni).
            Velocità di taglio prese dalla tabella Wire EDM esistente.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Ciclo EDM default">
            <select
              disabled={!canWrite}
              value={s.wire_edm_cycle_id ?? ''}
              onChange={e => update({ wire_edm_cycle_id: e.target.value ? parseInt(e.target.value, 10) : null })}
              className="w-full h-9 px-2 border rounded text-sm"
            >
              <option value="">— primo ciclo attivo —</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {num('edm_extractor_factor', 'Factor estrattore (porta-punzoni)')}
          {num('edm_punch_factor', 'Factor punzoni sagomati')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">12. Produttività officina piastre stampo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ore per dm² di superficie lavorata, per operazione. Sono parametri della MIA officina
            (cambiando macchina cambia il numero). Formula: ore_piastra = setup + Σ (area × h/dm² × n_facce) + station_bonus.
            La scala "piastra grande" è gestita dalla tab <strong>Fasce piastra</strong> a fianco.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          {num('milling_h_per_dm2', 'Fresatura (h/dm²)')}
          {num('grinding_h_per_dm2', 'Rettifica (h/dm²)')}
          {num('drilling_h_per_dm2', 'Foratura (h/dm²)')}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <PrimaryCtaButton color="rose" onClick={save} disabled={!canWrite || saving}>
          {saving ? 'Salvataggio…' : 'Salva impostazioni'}
        </PrimaryCtaButton>
      </div>
    </div>
  )
}

// ─── Tab 2: Fasce dimensionali ───────────────────────────────────────────────

function FasceTab({ canWrite }: { canWrite: boolean }) {
  const [list, setList] = useState<DieDimensionBracket[]>([])
  const [editing, setEditing] = useState<Record<number, DieDimensionBracket>>({})
  const [newRow, setNewRow] = useState<Partial<DieDimensionBracket>>({ label: '', area_min_dm2: 0, area_max_dm2: undefined, coefficient: 1.0, sort_order: 0 })

  const load = () => api.get('/die-settings/brackets').then(r => setList(r.data))
  useEffect(() => { load() }, [])

  const save = async (b: DieDimensionBracket) => {
    try {
      await api.put(`/die-settings/brackets/${b.id}`, b)
      toast.success('Fascia aggiornata')
      setEditing(prev => { const c = { ...prev }; delete c[b.id]; return c })
      await load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore salvataggio')
    }
  }

  const remove = async (id: number) => {
    try {
      await api.delete(`/die-settings/brackets/${id}`)
      toast.success('Fascia eliminata')
      await load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore eliminazione')
    }
  }

  const create = async () => {
    if (!newRow.label?.trim()) {
      toast.error('Etichetta obbligatoria')
      return
    }
    try {
      await api.post('/die-settings/brackets', newRow)
      toast.success('Fascia creata')
      setNewRow({ label: '', area_min_dm2: 0, area_max_dm2: undefined, coefficient: 1.0, sort_order: 0 })
      await load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore creazione')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fasce piastra</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Moltiplicatore ore meccaniche per area della singola piastra (gestione gru,
          manipolazione, set-up per piastre grandi). Lookup: area_min ≤ area &lt; area_max
          (ultima fascia: area_max vuoto = ∞). Esempio: area piastra 50 dm² → coeff fascia
          L (1.15) → ore meccaniche stimate × 1.15.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="text-left py-2">Etichetta</th>
              <th className="text-right py-2">Area min (dm²)</th>
              <th className="text-right py-2">Area max (dm²)</th>
              <th className="text-right py-2">Coefficiente</th>
              <th className="text-right py-2">Ordine</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map(b => {
              const e = editing[b.id]
              const cur = e || b
              return (
                <tr key={b.id} className="border-b">
                  <td className="py-1.5"><Input className="h-8" disabled={!canWrite} value={cur.label}
                    onChange={ev => setEditing(prev => ({ ...prev, [b.id]: { ...cur, label: ev.target.value } }))} /></td>
                  <td className="py-1.5"><Input className="h-8 text-right" type="number" disabled={!canWrite} value={cur.area_min_dm2}
                    onChange={ev => setEditing(prev => ({ ...prev, [b.id]: { ...cur, area_min_dm2: parseFloat(ev.target.value) || 0 } }))} /></td>
                  <td className="py-1.5"><Input className="h-8 text-right" type="number" disabled={!canWrite} value={cur.area_max_dm2 ?? ''}
                    placeholder="∞"
                    onChange={ev => setEditing(prev => ({ ...prev, [b.id]: { ...cur, area_max_dm2: ev.target.value ? parseFloat(ev.target.value) : null } }))} /></td>
                  <td className="py-1.5"><Input className="h-8 text-right" type="number" step="0.1" disabled={!canWrite} value={cur.coefficient}
                    onChange={ev => setEditing(prev => ({ ...prev, [b.id]: { ...cur, coefficient: parseFloat(ev.target.value) || 0 } }))} /></td>
                  <td className="py-1.5"><Input className="h-8 text-right" type="number" disabled={!canWrite} value={cur.sort_order}
                    onChange={ev => setEditing(prev => ({ ...prev, [b.id]: { ...cur, sort_order: parseInt(ev.target.value, 10) || 0 } }))} /></td>
                  <td className="text-right py-1.5">
                    {e ? (
                      <div className="flex justify-end gap-1">
                        <PrimaryCtaButton color="rose" size="sm" onClick={() => save(cur)}>OK</PrimaryCtaButton>
                        <Button size="sm" variant="outline" onClick={() => setEditing(prev => { const c = { ...prev }; delete c[b.id]; return c })}>Annulla</Button>
                      </div>
                    ) : canWrite && (
                      <button onClick={() => remove(b.id)} className="text-muted-foreground hover:text-red-600"><X className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              )
            })}
            {canWrite && (
              <tr className="bg-muted">
                <td className="py-1.5"><Input className="h-8" placeholder="Etichetta" value={newRow.label}
                  onChange={e => setNewRow({ ...newRow, label: e.target.value })} /></td>
                <td className="py-1.5"><Input className="h-8 text-right" type="number" value={newRow.area_min_dm2 ?? 0}
                  onChange={e => setNewRow({ ...newRow, area_min_dm2: parseFloat(e.target.value) || 0 })} /></td>
                <td className="py-1.5"><Input className="h-8 text-right" type="number" placeholder="∞" value={newRow.area_max_dm2 ?? ''}
                  onChange={e => setNewRow({ ...newRow, area_max_dm2: e.target.value ? parseFloat(e.target.value) : undefined })} /></td>
                <td className="py-1.5"><Input className="h-8 text-right" type="number" step="0.1" value={newRow.coefficient ?? 1.0}
                  onChange={e => setNewRow({ ...newRow, coefficient: parseFloat(e.target.value) || 0 })} /></td>
                <td className="py-1.5"><Input className="h-8 text-right" type="number" value={newRow.sort_order ?? 0}
                  onChange={e => setNewRow({ ...newRow, sort_order: parseInt(e.target.value, 10) || 0 })} /></td>
                <td className="text-right py-1.5"><PrimaryCtaButton color="rose" size="sm" onClick={create}><Plus className="w-3.5 h-3.5" /></PrimaryCtaButton></td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ─── Tab 3: Template stampi ──────────────────────────────────────────────────

// 5 piastre standard (cappello/porta_punzoni/premilamiera/matrice/base) con
// spessori 25/30/25/30/30 mm — stesso default del seed `_seed_die_templates`
// in `backend/app/main.py`. Riusato per i nuovi template creati dall'utente.
const STANDARD_PLATES: DieTemplatePlate[] = [
  { id: 0, plate_role: 'cappello',      default_thickness_mm: 25, default_material_id: null, default_treatment_id: null, sort_order: 1, setup_hours_fixed: 0.3, n_milled_faces: 1, n_ground_faces: 0, n_drilled_faces: 1, station_bonus_hours: 0.0 },
  { id: 0, plate_role: 'porta_punzoni', default_thickness_mm: 30, default_material_id: null, default_treatment_id: null, sort_order: 2, setup_hours_fixed: 0.5, n_milled_faces: 2, n_ground_faces: 1, n_drilled_faces: 2, station_bonus_hours: 0.4 },
  { id: 0, plate_role: 'premilamiera',  default_thickness_mm: 25, default_material_id: null, default_treatment_id: null, sort_order: 3, setup_hours_fixed: 0.4, n_milled_faces: 2, n_ground_faces: 1, n_drilled_faces: 1, station_bonus_hours: 0.0 },
  { id: 0, plate_role: 'matrice',       default_thickness_mm: 30, default_material_id: null, default_treatment_id: null, sort_order: 4, setup_hours_fixed: 0.5, n_milled_faces: 2, n_ground_faces: 2, n_drilled_faces: 2, station_bonus_hours: 0.5 },
  { id: 0, plate_role: 'base',          default_thickness_mm: 30, default_material_id: null, default_treatment_id: null, sort_order: 5, setup_hours_fixed: 0.3, n_milled_faces: 1, n_ground_faces: 0, n_drilled_faces: 1, station_bonus_hours: 0.0 },
]

function TemplatesTab({ canWrite }: { canWrite: boolean }) {
  const [list, setList] = useState<DieTemplate[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [normSuppliers, setNormSuppliers] = useState<NormalizedSupplier[]>([])
  const [editingTpl, setEditingTpl] = useState<DieTemplate | null>(null)
  // `editingTpl.id === 0` → modalità create (POST); altrimenti edit (PUT).
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const load = () => api.get('/die-settings/templates').then(r => setList(r.data))
  useEffect(() => {
    load()
    api.get('/materials').then(r => setMaterials(r.data))
    api.get('/treatments').then(r => setTreatments(r.data))
    api.get('/normalized-suppliers').then(r => setNormSuppliers(r.data)).catch(() => {})
  }, [])

  const newTemplate = () => {
    setEditingTpl({
      id: 0,
      name: '',
      description: '',
      die_subtype: 'blocco',
      suggested_stations: null,
      suggested_pitch_mm: null,
      suggested_n_bends_simple: 0,
      suggested_n_bends_medium: 0,
      suggested_n_bends_complex: 0,
      suggested_n_punches_simple: 0,
      suggested_n_punches_medium: 0,
      suggested_n_punches_complex: 0,
      default_difficulty: 'base',
      active: true,
      created_at: '',
      plates: STANDARD_PLATES.map(p => ({ ...p })),
      normalized_items: [],
    })
  }

  const confirmDelete = async () => {
    if (deleteId == null) return
    try {
      await api.delete(`/die-settings/templates/${deleteId}`)
      toast.success('Template eliminato')
      setDeleteId(null)
      await load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore eliminazione')
    }
  }

  const saveTpl = async () => {
    if (!editingTpl) return
    if (!editingTpl.name.trim()) {
      toast.error('Nome obbligatorio')
      return
    }
    try {
      const payload = {
        name: editingTpl.name.trim(),
        description: editingTpl.description,
        die_subtype: editingTpl.die_subtype,
        suggested_stations: editingTpl.suggested_stations,
        suggested_pitch_mm: editingTpl.suggested_pitch_mm,
        suggested_n_bends_simple: editingTpl.suggested_n_bends_simple,
        suggested_n_bends_medium: editingTpl.suggested_n_bends_medium,
        suggested_n_bends_complex: editingTpl.suggested_n_bends_complex,
        suggested_n_punches_simple: editingTpl.suggested_n_punches_simple,
        suggested_n_punches_medium: editingTpl.suggested_n_punches_medium,
        suggested_n_punches_complex: editingTpl.suggested_n_punches_complex,
        default_difficulty: editingTpl.default_difficulty,
        active: editingTpl.active,
        plates: editingTpl.plates.map(p => ({
          plate_role: p.plate_role,
          default_thickness_mm: p.default_thickness_mm,
          default_material_id: p.default_material_id,
          default_treatment_id: p.default_treatment_id,
          sort_order: p.sort_order,
          // Sprint B — costanti produttività per ruolo
          setup_hours_fixed: p.setup_hours_fixed,
          n_milled_faces: p.n_milled_faces,
          n_ground_faces: p.n_ground_faces,
          n_drilled_faces: p.n_drilled_faces,
          station_bonus_hours: p.station_bonus_hours,
        })),
        // Sprint C — BoM normalizzati scalabile
        normalized_items: (editingTpl.normalized_items || []).map(n => ({
          description: n.description,
          normalized_supplier_id: n.normalized_supplier_id,
          quantity_formula: n.quantity_formula,
          unit_price_default: n.unit_price_default,
          sort_order: n.sort_order,
        })),
      }
      if (editingTpl.id === 0) {
        await api.post('/die-settings/templates', payload)
        toast.success('Template creato')
      } else {
        await api.put(`/die-settings/templates/${editingTpl.id}`, payload)
        toast.success('Template aggiornato')
      }
      setEditingTpl(null)
      await load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore salvataggio')
    }
  }

  const updateTplPlate = (idx: number, patch: Partial<DieTemplatePlate>) => {
    if (!editingTpl) return
    const plates = [...editingTpl.plates]
    plates[idx] = { ...plates[idx], ...patch }
    setEditingTpl({ ...editingTpl, plates })
  }

  const addPlate = () => {
    if (!editingTpl) return
    setEditingTpl({
      ...editingTpl,
      plates: [...editingTpl.plates, {
        id: 0, plate_role: 'custom', default_thickness_mm: 25,
        default_material_id: null, default_treatment_id: null,
        sort_order: editingTpl.plates.length + 1,
        setup_hours_fixed: 0.4, n_milled_faces: 2, n_ground_faces: 0,
        n_drilled_faces: 1, station_bonus_hours: 0.0,
      }],
    })
  }

  const removePlate = (idx: number) => {
    if (!editingTpl) return
    setEditingTpl({ ...editingTpl, plates: editingTpl.plates.filter((_, i) => i !== idx) })
  }

  // Sprint C — Normalized items handlers
  const updateTplNorm = (idx: number, patch: Partial<DieTemplateNormalized>) => {
    if (!editingTpl) return
    const items = [...(editingTpl.normalized_items || [])]
    items[idx] = { ...items[idx], ...patch }
    setEditingTpl({ ...editingTpl, normalized_items: items })
  }
  const addNorm = () => {
    if (!editingTpl) return
    const items = editingTpl.normalized_items || []
    setEditingTpl({
      ...editingTpl,
      normalized_items: [...items, {
        id: 0, description: 'Nuovo componente', normalized_supplier_id: null,
        quantity_formula: '1', unit_price_default: 0, sort_order: items.length + 1,
      }],
    })
  }
  const removeNorm = (idx: number) => {
    if (!editingTpl) return
    setEditingTpl({
      ...editingTpl,
      normalized_items: (editingTpl.normalized_items || []).filter((_, i) => i !== idx),
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Template stampi</CardTitle>
          {canWrite && (
            <PrimaryCtaButton color="rose" size="sm" onClick={newTemplate}>
              <Plus className="w-3.5 h-3.5" />Nuovo template
            </PrimaryCtaButton>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground mb-3">I template pre-compilano le piastre e i suggerimenti feature in fase di creazione.</p>
        {list.map(t => (
          <div key={t.id} className="border rounded-md">
            <div className="p-3 flex items-center justify-between hover:bg-muted cursor-pointer"
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t.die_subtype} · {t.plates.length} piastre · difficoltà {t.default_difficulty}
                </div>
              </div>
              {canWrite && (
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => setEditingTpl(structuredClone(t))}>Modifica</Button>
                  <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={() => setDeleteId(t.id)}><X className="w-3.5 h-3.5" /></Button>
                </div>
              )}
            </div>
            {expandedId === t.id && (
              <div className="px-3 pb-3 border-t pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left py-1">Ruolo</th>
                      <th className="text-right py-1">Spessore (mm)</th>
                      <th className="text-left py-1 pl-2">Materiale default</th>
                      <th className="text-left py-1 pl-2">Trattamento default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.plates.map(p => (
                      <tr key={p.id} className="border-t">
                        <td className="py-1">{p.plate_role}</td>
                        <td className="text-right py-1">{p.default_thickness_mm}</td>
                        <td className="pl-2 py-1">{materials.find(m => m.id === p.default_material_id)?.name || '—'}</td>
                        <td className="pl-2 py-1">{treatments.find(tr => tr.id === p.default_treatment_id)?.name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {/* Modale editing inline */}
        {editingTpl && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditingTpl(null)}>
            <div className="bg-card rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">{editingTpl.id === 0 ? 'Nuovo template' : 'Modifica template'}</h2>
                <button onClick={() => setEditingTpl(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Nome">
                    <Input value={editingTpl.name} onChange={e => setEditingTpl({ ...editingTpl, name: e.target.value })} />
                  </Field>
                  <Field label="Tipo">
                    <select className="flex h-9 w-full rounded-md border px-2 text-sm"
                      value={editingTpl.die_subtype}
                      onChange={e => setEditingTpl({ ...editingTpl, die_subtype: e.target.value as DieSubtype })}>
                      <option value="passo">Passo</option>
                      <option value="blocco">Blocco</option>
                    </select>
                  </Field>
                  <Field label="Difficoltà default">
                    <select className="flex h-9 w-full rounded-md border px-2 text-sm"
                      value={editingTpl.default_difficulty}
                      onChange={e => setEditingTpl({ ...editingTpl, default_difficulty: e.target.value as DieDifficulty })}>
                      <option value="base">Base</option>
                      <option value="medium">Media</option>
                      <option value="hard">Alta</option>
                    </select>
                  </Field>
                  <Field label="Stazioni suggerite">
                    <Input type="number" value={editingTpl.suggested_stations ?? ''}
                      onChange={e => setEditingTpl({ ...editingTpl, suggested_stations: e.target.value ? parseInt(e.target.value, 10) : null })} />
                  </Field>
                </div>
                <div>
                  <Field label="Descrizione">
                    <textarea className="w-full border rounded p-2 text-sm" rows={2}
                      value={editingTpl.description || ''}
                      onChange={e => setEditingTpl({ ...editingTpl, description: e.target.value })} />
                  </Field>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  <Field label="P sempl"><Input type="number" value={editingTpl.suggested_n_bends_simple} onChange={e => setEditingTpl({ ...editingTpl, suggested_n_bends_simple: parseInt(e.target.value, 10) || 0 })} /></Field>
                  <Field label="P media"><Input type="number" value={editingTpl.suggested_n_bends_medium} onChange={e => setEditingTpl({ ...editingTpl, suggested_n_bends_medium: parseInt(e.target.value, 10) || 0 })} /></Field>
                  <Field label="P compl"><Input type="number" value={editingTpl.suggested_n_bends_complex} onChange={e => setEditingTpl({ ...editingTpl, suggested_n_bends_complex: parseInt(e.target.value, 10) || 0 })} /></Field>
                  <Field label="Pz sempl"><Input type="number" value={editingTpl.suggested_n_punches_simple} onChange={e => setEditingTpl({ ...editingTpl, suggested_n_punches_simple: parseInt(e.target.value, 10) || 0 })} /></Field>
                  <Field label="Pz media"><Input type="number" value={editingTpl.suggested_n_punches_medium} onChange={e => setEditingTpl({ ...editingTpl, suggested_n_punches_medium: parseInt(e.target.value, 10) || 0 })} /></Field>
                  <Field label="Pz compl"><Input type="number" value={editingTpl.suggested_n_punches_complex} onChange={e => setEditingTpl({ ...editingTpl, suggested_n_punches_complex: parseInt(e.target.value, 10) || 0 })} /></Field>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <strong className="text-sm">Piastre del template</strong>
                    <Button size="sm" variant="outline" onClick={addPlate}><Plus className="w-3.5 h-3.5 mr-1" />Aggiungi piastra</Button>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-1">Ruolo</th>
                        <th className="text-right py-1">Spessore</th>
                        <th className="text-left py-1 pl-2">Materiale default</th>
                        <th className="text-left py-1 pl-2">Trattamento default</th>
                        <th className="text-right py-1">Ord.</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {editingTpl.plates.map((p, idx) => (
                        <React.Fragment key={idx}>
                          <tr className="border-b">
                            <td className="py-1"><Input className="h-8" value={p.plate_role} onChange={e => updateTplPlate(idx, { plate_role: e.target.value })} /></td>
                            <td className="py-1"><Input className="h-8 text-right" type="number" value={p.default_thickness_mm}
                              onChange={e => updateTplPlate(idx, { default_thickness_mm: parseFloat(e.target.value) || 0 })} /></td>
                            <td className="py-1 pl-2">
                              <select className="text-xs h-8 w-full" value={p.default_material_id || ''}
                                onChange={e => updateTplPlate(idx, { default_material_id: e.target.value ? Number(e.target.value) : null })}>
                                <option value="">—</option>
                                {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </select>
                            </td>
                            <td className="py-1 pl-2">
                              <select className="text-xs h-8 w-full" value={p.default_treatment_id || ''}
                                onChange={e => updateTplPlate(idx, { default_treatment_id: e.target.value ? Number(e.target.value) : null })}>
                                <option value="">—</option>
                                {treatments.map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                              </select>
                            </td>
                            <td className="py-1"><Input className="h-8 text-right w-14" type="number" value={p.sort_order}
                              onChange={e => updateTplPlate(idx, { sort_order: parseInt(e.target.value, 10) || 0 })} /></td>
                            <td className="text-right py-1">
                              <button onClick={() => removePlate(idx)} className="text-muted-foreground hover:text-red-600"><X className="w-4 h-4" /></button>
                            </td>
                          </tr>
                          <tr className="border-b bg-muted/50">
                            <td colSpan={6} className="py-1 px-2">
                              <div className="grid grid-cols-5 gap-2 items-center">
                                <label className="text-[10px] text-muted-foreground">Setup (h)
                                  <Input className="h-7 text-xs" type="number" step="0.1" value={p.setup_hours_fixed}
                                    onChange={e => updateTplPlate(idx, { setup_hours_fixed: parseFloat(e.target.value) || 0 })} />
                                </label>
                                <label className="text-[10px] text-muted-foreground">Facce fresate
                                  <Input className="h-7 text-xs" type="number" value={p.n_milled_faces}
                                    onChange={e => updateTplPlate(idx, { n_milled_faces: parseInt(e.target.value, 10) || 0 })} />
                                </label>
                                <label className="text-[10px] text-muted-foreground">Facce rettificate
                                  <Input className="h-7 text-xs" type="number" value={p.n_ground_faces}
                                    onChange={e => updateTplPlate(idx, { n_ground_faces: parseInt(e.target.value, 10) || 0 })} />
                                </label>
                                <label className="text-[10px] text-muted-foreground">Facce forate
                                  <Input className="h-7 text-xs" type="number" value={p.n_drilled_faces}
                                    onChange={e => updateTplPlate(idx, { n_drilled_faces: parseInt(e.target.value, 10) || 0 })} />
                                </label>
                                <label className="text-[10px] text-muted-foreground">Bonus/stazione (h)
                                  <Input className="h-7 text-xs" type="number" step="0.1" value={p.station_bonus_hours}
                                    onChange={e => updateTplPlate(idx, { station_bonus_hours: parseFloat(e.target.value) || 0 })} />
                                </label>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Sprint C — Sezione BoM normalizzati di default */}
                <div className="border rounded p-3 mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-sm">Normalizzati di default (BoM scalabile)</strong>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Auto-popolati al momento della creazione del preventivo. La quantità è una mini-formula sulle variabili:
                        <code className="ml-1">n_stations</code>, <code>n_bends_total</code>, <code>n_punches_total</code>,
                        <code>area_castello_dm2</code>, <code>castle_x_mm</code>, <code>castle_y_mm</code>, <code>bbox_x_mm</code>, <code>bbox_y_mm</code>.
                        Esempi: <code>4</code>, <code>n_stations * 2 + 4</code>, <code>4 if area_castello_dm2 &lt; 30 else 6</code>.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={addNorm}><Plus className="w-3.5 h-3.5 mr-1" />Aggiungi normalizzato</Button>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-1">Descrizione</th>
                        <th className="text-left py-1 pl-2">Fornitore</th>
                        <th className="text-left py-1 pl-2">Quantità (formula)</th>
                        <th className="text-right py-1">€/u default</th>
                        <th className="text-right py-1">Ord.</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(editingTpl.normalized_items || []).length === 0 && (
                        <tr><td colSpan={6} className="py-2 text-muted-foreground italic">Nessun normalizzato di default.</td></tr>
                      )}
                      {(editingTpl.normalized_items || []).map((n, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="py-1"><Input className="h-8" value={n.description}
                            onChange={e => updateTplNorm(idx, { description: e.target.value })} /></td>
                          <td className="py-1 pl-2">
                            <select className="text-xs h-8 w-full" value={n.normalized_supplier_id || ''}
                              onChange={e => updateTplNorm(idx, { normalized_supplier_id: e.target.value ? Number(e.target.value) : null })}>
                              <option value="">—</option>
                              {normSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </td>
                          <td className="py-1 pl-2"><Input className="h-8 font-mono text-xs" value={n.quantity_formula}
                            onChange={e => updateTplNorm(idx, { quantity_formula: e.target.value })} /></td>
                          <td className="py-1"><Input className="h-8 text-right" type="number" step="0.01" value={n.unit_price_default}
                            onChange={e => updateTplNorm(idx, { unit_price_default: parseFloat(e.target.value) || 0 })} /></td>
                          <td className="py-1"><Input className="h-8 text-right w-14" type="number" value={n.sort_order}
                            onChange={e => updateTplNorm(idx, { sort_order: parseInt(e.target.value, 10) || 0 })} /></td>
                          <td className="text-right py-1">
                            <button onClick={() => removeNorm(idx)} className="text-muted-foreground hover:text-red-600"><X className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <Button variant="outline" onClick={() => setEditingTpl(null)}>Annulla</Button>
                  <PrimaryCtaButton color="rose" onClick={saveTpl}>
                    {editingTpl.id === 0 ? 'Crea template' : 'Salva template'}
                  </PrimaryCtaButton>
                </div>
              </div>
            </div>
          </div>
        )}
        <ConfirmDialog
          open={deleteId != null}
          title="Eliminare il template?"
          description="Operazione irreversibile. I preventivi già creati a partire da questo template restano invariati (le piastre sono copiate al momento dell'applicazione)."
          confirmLabel="Elimina template"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteId(null)}
        />
      </CardContent>
    </Card>
  )
}
