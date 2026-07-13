import React, { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Hammer, Plus, X, ChevronDown, Lock, Trash2 } from 'lucide-react'

import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import SettingsTabs from '@/components/settings/SettingsTabs'
import StandardPage from '@/components/layout/StandardPage'
import { tWrap, tHead, tRow, editRowStyle, RowActions, EditActions } from '@/components/settings/inlineEdit'
import { SettingsModal, fieldLabel } from '@/components/settings/crud'
import { useAuth } from '@/lib/auth'
import type {
  DieSettings, DieDimensionBracket, DieTemplate, DieTemplatePlate,
  DieTemplateNormalized, NormalizedSupplier,
  Material, Treatment, Machine, DieSubtype, DieDifficulty,
} from '@/types'

const selectCls = 'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className={fieldLabel}>{label}</label>{children}</div>
}

function Section({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function ReadOnlyBanner() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-warning/[0.3] bg-warning/[0.1] px-4 py-2.5 text-sm text-foreground">
      <Lock className="h-4 w-4 flex-none text-warning" /> Sola lettura: serve il permesso "Configura Stampi" per modificare questi valori.
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
      icon={Hammer} color="dies" width="xl"
      title="Impostazioni Stampi"
      subtitle="Tariffe, fasce piastra e template per il modulo Preventivatore Stampi"
    >
      <SettingsTabs
        tabs={[{ key: 'tariffe', label: 'Tariffe & costi' }, { key: 'fasce', label: 'Fasce piastra' }, { key: 'template', label: 'Template stampi' }]}
        active={tab} onChange={t => setTab(t as Tab)} accent="dies"
      />
      {tab === 'tariffe' && <TariffeTab canWrite={canWrite} />}
      {tab === 'fasce' && <FasceTab canWrite={canWrite} />}
      {tab === 'template' && <TemplatesTab canWrite={canWrite} />}
    </StandardPage>
  )
}

// ─── Tab 1: Tariffe (P3 form singleton) ──────────────────────────────────────

function TariffeTab({ canWrite }: { canWrite: boolean }) {
  const [s, setS] = useState<DieSettings | null>(null)
  const [pristine, setPristine] = useState<DieSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [cycles, setCycles] = useState<{ id: number; name: string }[]>([])
  const [machines, setMachines] = useState<Machine[]>([])

  useEffect(() => {
    api.get('/die-settings').then(r => { setS(r.data); setPristine(r.data) }).catch(() => toast.error('Errore caricamento'))
    api.get('/cutting-cycles').then(r => setCycles(r.data)).catch(() => {})
    api.get('/machines').then(r => setMachines(r.data)).catch(() => {})
  }, [])

  const update = (patch: Partial<DieSettings>) => setS(prev => prev ? { ...prev, ...patch } : prev)
  const dirty = JSON.stringify(s) !== JSON.stringify(pristine)

  const machineSelect = (key: keyof DieSettings, label: string, typeFilter?: string) => {
    const pool = typeFilter ? (() => { const f = machines.filter(m => m.machine_type === typeFilter); return f.length > 0 ? f : machines })() : machines
    return (
      <Field label={label}>
        <select disabled={!canWrite} value={(s?.[key] as number | null) ?? ''} onChange={e => update({ [key]: e.target.value ? parseInt(e.target.value, 10) : null } as Partial<DieSettings>)} className={selectCls}>
          <option value="">— usa tariffa esplicita —</option>
          {pool.map(m => <option key={m.id} value={m.id}>{m.name} ({m.hourly_rate ?? 0} €/h)</option>)}
        </select>
      </Field>
    )
  }

  const save = async () => {
    if (!s) return
    setSaving(true)
    try { await api.put('/die-settings', s); setPristine(s); toast.success('Impostazioni salvate') }
    catch (e) { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Errore salvataggio') }
    finally { setSaving(false) }
  }

  if (!s) return <p className="text-sm text-muted-foreground">Caricamento…</p>

  const num = (key: keyof DieSettings, label: string) => (
    <Field label={label}>
      <Input type="number" className="font-mono" disabled={!canWrite} value={s[key] as number} onChange={e => update({ [key]: parseFloat(e.target.value) || 0 } as Partial<DieSettings>)} />
    </Field>
  )

  return (
    <div className="space-y-4">
      {!canWrite && <ReadOnlyBanner />}

      <Section title="1. Tariffe orarie officina (€/h)" desc="Aggancia una macchina del catalogo per propagarne la tariffa; altrimenti usa la tariffa esplicita.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">{num('hourly_rate_milling', 'Fresatura (€/h fallback)')}{machineSelect('milling_machine_id', 'Macchina fresa (override)')}</div>
          <div className="space-y-2">{num('hourly_rate_grinding', 'Rettifica (€/h fallback)')}{machineSelect('grinding_machine_id', 'Macchina rettifica (override)')}</div>
          <div className="space-y-2">{num('hourly_rate_edm_die', 'EDM filo per piastre (€/h fallback)')}{machineSelect('edm_wire_machine_id', 'Macchina EDM filo (override)', 'wire_edm')}</div>
          <div className="space-y-2">{num('hourly_rate_edm_wire', 'EDM secondaria (€/h)')}{machineSelect('drilling_machine_id', 'Macchina foratura (override)')}</div>
        </div>
      </Section>

      <Section title="7. Progettazione (ore × tariffa)" desc="Ore totali = ore[difficoltà] + bonus piega × n. pieghe + bonus punzone × n. punzoni.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{num('design_hours_base', 'Ore base')}{num('design_hours_medium', 'Ore media')}{num('design_hours_hard', 'Ore alta')}{num('design_hourly_rate', 'Tariffa €/h')}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">{num('design_h_per_bend', 'Bonus h per piega')}{num('design_h_per_punch', 'Bonus h per punzone')}</div>
      </Section>

      <Section title="8. Forfait montaggio/collaudo (€)">
        <div className="grid grid-cols-3 gap-3">{num('assembly_forfeit_base', 'Base')}{num('assembly_forfeit_medium', 'Media')}{num('assembly_forfeit_hard', 'Alta')}</div>
      </Section>

      <Section title="9–10. Margine & offset castello default">
        <div className="grid grid-cols-3 gap-3">{num('default_margin_percent', 'Margine default (%)')}{num('default_castle_offset_x_mm', 'Offset castello X (mm)')}{num('default_castle_offset_y_mm', 'Offset castello Y (mm)')}</div>
      </Section>

      <Section title="11. Driver EDM filo piastre stampo" desc="Lunghezza EDM per piastra = perimetro pezzo × n. stazioni × moltiplicatore (1.0 matrice, factor estrattore per porta-punzoni).">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="Ciclo EDM default">
            <select disabled={!canWrite} value={s.wire_edm_cycle_id ?? ''} onChange={e => update({ wire_edm_cycle_id: e.target.value ? parseInt(e.target.value, 10) : null })} className={selectCls}>
              <option value="">— primo ciclo attivo —</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {num('edm_extractor_factor', 'Factor estrattore (porta-punzoni)')}
          {num('edm_punch_factor', 'Factor punzoni sagomati')}
        </div>
      </Section>

      <Section title="12. Produttività officina piastre stampo" desc={<>Ore per dm² di superficie lavorata, per operazione. La scala "piastra grande" è gestita dalla tab <strong>Fasce piastra</strong>.</>}>
        <div className="grid grid-cols-3 gap-3">{num('milling_h_per_dm2', 'Fresatura (h/dm²)')}{num('grinding_h_per_dm2', 'Rettifica (h/dm²)')}{num('drilling_h_per_dm2', 'Foratura (h/dm²)')}</div>
      </Section>

      {canWrite && (
        <div className="flex justify-end">
          <PrimaryCtaButton color="dies" onClick={save} disabled={saving || !dirty}>
            {dirty && !saving && <span className="h-1.5 w-1.5 rounded-full bg-white/90" />}
            {saving ? 'Salvataggio…' : 'Salva impostazioni'}
          </PrimaryCtaButton>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Fasce dimensionali (P1 inline-edit) ──────────────────────────────

function FasceTab({ canWrite }: { canWrite: boolean }) {
  const [list, setList] = useState<DieDimensionBracket[]>([])
  const [editing, setEditing] = useState<Record<number, DieDimensionBracket>>({})
  const [newRow, setNewRow] = useState<Partial<DieDimensionBracket>>({ label: '', area_min_dm2: 0, area_max_dm2: undefined, coefficient: 1.0, sort_order: 0 })

  const load = () => api.get('/die-settings/brackets').then(r => setList(r.data))
  useEffect(() => { load() }, [])

  const save = async (b: DieDimensionBracket) => {
    try { await api.put(`/die-settings/brackets/${b.id}`, b); toast.success('Fascia aggiornata'); setEditing(prev => { const c = { ...prev }; delete c[b.id]; return c }); await load() }
    catch (e) { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Errore salvataggio') }
  }
  const remove = async (id: number) => {
    try { await api.delete(`/die-settings/brackets/${id}`); toast.success('Fascia eliminata'); await load() }
    catch (e) { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Errore eliminazione') }
  }
  const create = async () => {
    if (!newRow.label?.trim()) { toast.error('Etichetta obbligatoria'); return }
    try { await api.post('/die-settings/brackets', newRow); toast.success('Fascia creata'); setNewRow({ label: '', area_min_dm2: 0, area_max_dm2: undefined, coefficient: 1.0, sort_order: 0 }); await load() }
    catch (e) { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Errore creazione') }
  }

  return (
    <div className="space-y-3">
      {!canWrite && <ReadOnlyBanner />}
      <p className="text-xs text-muted-foreground">
        Moltiplicatore ore meccaniche per area della singola piastra. Lookup: area_min ≤ area &lt; area_max (ultima fascia: area_max vuoto = ∞). Es. area 50 dm² → coeff fascia L (1.15) → ore × 1.15.
      </p>
      <div className={tWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <colgroup><col /><col style={{ width: 140 }} /><col style={{ width: 140 }} /><col style={{ width: 130 }} /><col style={{ width: 100 }} /><col style={{ width: 90 }} /></colgroup>
            <thead>
              <tr className={tHead}>
                <th className="p-2.5 text-left font-medium">Etichetta</th>
                <th className="p-2.5 text-right font-medium">Area min (dm²)</th>
                <th className="p-2.5 text-right font-medium">Area max (dm²)</th>
                <th className="p-2.5 text-right font-medium">Coefficiente</th>
                <th className="p-2.5 text-right font-medium">Ordine</th>
                <th className="p-2.5 text-center font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {list.map(b => {
                const e = editing[b.id]
                const cur = e || b
                return (
                  <tr key={b.id} className={e ? 'border-b border-border bg-dies/[0.05]' : tRow} style={e ? editRowStyle('dies') : undefined}>
                    <td className="p-2"><Input className="h-8" disabled={!canWrite} value={cur.label} onChange={ev => setEditing(prev => ({ ...prev, [b.id]: { ...cur, label: ev.target.value } }))} /></td>
                    <td className="p-2"><Input className="h-8 text-right font-mono" type="number" disabled={!canWrite} value={cur.area_min_dm2} onChange={ev => setEditing(prev => ({ ...prev, [b.id]: { ...cur, area_min_dm2: parseFloat(ev.target.value) || 0 } }))} /></td>
                    <td className="p-2"><Input className="h-8 text-right font-mono" type="number" disabled={!canWrite} value={cur.area_max_dm2 ?? ''} placeholder="∞" onChange={ev => setEditing(prev => ({ ...prev, [b.id]: { ...cur, area_max_dm2: ev.target.value ? parseFloat(ev.target.value) : null } }))} /></td>
                    <td className="p-2"><Input className="h-8 text-right font-mono" type="number" step="0.1" disabled={!canWrite} value={cur.coefficient} onChange={ev => setEditing(prev => ({ ...prev, [b.id]: { ...cur, coefficient: parseFloat(ev.target.value) || 0 } }))} /></td>
                    <td className="p-2"><Input className="h-8 text-right font-mono" type="number" disabled={!canWrite} value={cur.sort_order} onChange={ev => setEditing(prev => ({ ...prev, [b.id]: { ...cur, sort_order: parseInt(ev.target.value, 10) || 0 } }))} /></td>
                    <td className="p-2">
                      {e ? <EditActions onSave={() => save(cur)} onCancel={() => setEditing(prev => { const c = { ...prev }; delete c[b.id]; return c })} />
                        : canWrite ? <div className="flex justify-center"><button onClick={() => remove(b.id)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina"><Trash2 className="h-4 w-4" /></button></div>
                        : null}
                    </td>
                  </tr>
                )
              })}
              {canWrite && (
                <tr className="border-t-2 border-dashed border-border bg-dies/[0.04]">
                  <td className="p-2"><Input className="h-8" placeholder="Etichetta" value={newRow.label} onChange={e => setNewRow({ ...newRow, label: e.target.value })} /></td>
                  <td className="p-2"><Input className="h-8 text-right font-mono" type="number" value={newRow.area_min_dm2 ?? 0} onChange={e => setNewRow({ ...newRow, area_min_dm2: parseFloat(e.target.value) || 0 })} /></td>
                  <td className="p-2"><Input className="h-8 text-right font-mono" type="number" placeholder="∞" value={newRow.area_max_dm2 ?? ''} onChange={e => setNewRow({ ...newRow, area_max_dm2: e.target.value ? parseFloat(e.target.value) : undefined })} /></td>
                  <td className="p-2"><Input className="h-8 text-right font-mono" type="number" step="0.1" value={newRow.coefficient ?? 1.0} onChange={e => setNewRow({ ...newRow, coefficient: parseFloat(e.target.value) || 0 })} /></td>
                  <td className="p-2"><Input className="h-8 text-right font-mono" type="number" value={newRow.sort_order ?? 0} onChange={e => setNewRow({ ...newRow, sort_order: parseInt(e.target.value, 10) || 0 })} /></td>
                  <td className="p-2"><div className="flex justify-center"><PrimaryCtaButton color="dies" size="sm" onClick={create}><Plus className="h-3.5 w-3.5" /></PrimaryCtaButton></div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 3: Template stampi (P4 card + editor) ───────────────────────────────

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
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const load = () => api.get('/die-settings/templates').then(r => setList(r.data))
  useEffect(() => {
    load()
    api.get('/materials').then(r => setMaterials(r.data))
    api.get('/treatments').then(r => setTreatments(r.data))
    api.get('/normalized-suppliers').then(r => setNormSuppliers(r.data)).catch(() => {})
  }, [])

  const newTemplate = () => setEditingTpl({
    id: 0, name: '', description: '', die_subtype: 'blocco', suggested_stations: null, suggested_pitch_mm: null,
    suggested_n_bends_simple: 0, suggested_n_bends_medium: 0, suggested_n_bends_complex: 0,
    suggested_n_punches_simple: 0, suggested_n_punches_medium: 0, suggested_n_punches_complex: 0,
    default_difficulty: 'base', active: true, created_at: '', plates: STANDARD_PLATES.map(p => ({ ...p })), normalized_items: [],
  })

  const confirmDelete = async () => {
    if (deleteId == null) return
    try { await api.delete(`/die-settings/templates/${deleteId}`); toast.success('Template eliminato'); setDeleteId(null); await load() }
    catch (e) { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Errore eliminazione') }
  }

  const saveTpl = async () => {
    if (!editingTpl) return
    if (!editingTpl.name.trim()) { toast.error('Nome obbligatorio'); return }
    try {
      const payload = {
        name: editingTpl.name.trim(), description: editingTpl.description, die_subtype: editingTpl.die_subtype,
        suggested_stations: editingTpl.suggested_stations, suggested_pitch_mm: editingTpl.suggested_pitch_mm,
        suggested_n_bends_simple: editingTpl.suggested_n_bends_simple, suggested_n_bends_medium: editingTpl.suggested_n_bends_medium, suggested_n_bends_complex: editingTpl.suggested_n_bends_complex,
        suggested_n_punches_simple: editingTpl.suggested_n_punches_simple, suggested_n_punches_medium: editingTpl.suggested_n_punches_medium, suggested_n_punches_complex: editingTpl.suggested_n_punches_complex,
        default_difficulty: editingTpl.default_difficulty, active: editingTpl.active,
        plates: editingTpl.plates.map(p => ({ plate_role: p.plate_role, default_thickness_mm: p.default_thickness_mm, default_material_id: p.default_material_id, default_treatment_id: p.default_treatment_id, sort_order: p.sort_order, setup_hours_fixed: p.setup_hours_fixed, n_milled_faces: p.n_milled_faces, n_ground_faces: p.n_ground_faces, n_drilled_faces: p.n_drilled_faces, station_bonus_hours: p.station_bonus_hours })),
        normalized_items: (editingTpl.normalized_items || []).map(n => ({ description: n.description, normalized_supplier_id: n.normalized_supplier_id, quantity_formula: n.quantity_formula, unit_price_default: n.unit_price_default, sort_order: n.sort_order })),
      }
      if (editingTpl.id === 0) { await api.post('/die-settings/templates', payload); toast.success('Template creato') }
      else { await api.put(`/die-settings/templates/${editingTpl.id}`, payload); toast.success('Template aggiornato') }
      setEditingTpl(null); await load()
    } catch (e) { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Errore salvataggio') }
  }

  const updateTplPlate = (idx: number, patch: Partial<DieTemplatePlate>) => { if (!editingTpl) return; const plates = [...editingTpl.plates]; plates[idx] = { ...plates[idx], ...patch }; setEditingTpl({ ...editingTpl, plates }) }
  const addPlate = () => { if (!editingTpl) return; setEditingTpl({ ...editingTpl, plates: [...editingTpl.plates, { id: 0, plate_role: 'custom', default_thickness_mm: 25, default_material_id: null, default_treatment_id: null, sort_order: editingTpl.plates.length + 1, setup_hours_fixed: 0.4, n_milled_faces: 2, n_ground_faces: 0, n_drilled_faces: 1, station_bonus_hours: 0.0 }] }) }
  const removePlate = (idx: number) => { if (!editingTpl) return; setEditingTpl({ ...editingTpl, plates: editingTpl.plates.filter((_, i) => i !== idx) }) }
  const updateTplNorm = (idx: number, patch: Partial<DieTemplateNormalized>) => { if (!editingTpl) return; const items = [...(editingTpl.normalized_items || [])]; items[idx] = { ...items[idx], ...patch }; setEditingTpl({ ...editingTpl, normalized_items: items }) }
  const addNorm = () => { if (!editingTpl) return; const items = editingTpl.normalized_items || []; setEditingTpl({ ...editingTpl, normalized_items: [...items, { id: 0, description: 'Nuovo componente', normalized_supplier_id: null, quantity_formula: '1', unit_price_default: 0, sort_order: items.length + 1 }] }) }
  const removeNorm = (idx: number) => { if (!editingTpl) return; setEditingTpl({ ...editingTpl, normalized_items: (editingTpl.normalized_items || []).filter((_, i) => i !== idx) }) }

  const et = editingTpl

  return (
    <div className="space-y-3">
      {!canWrite && <ReadOnlyBanner />}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">I template pre-compilano le piastre e i suggerimenti feature in fase di creazione.</p>
        {canWrite && <PrimaryCtaButton color="dies" size="sm" onClick={newTemplate}><Plus className="h-4 w-4" /> Nuovo template</PrimaryCtaButton>}
      </div>

      <div className="space-y-2">
        {list.map(t => (
          <div key={t.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-muted/[0.45]" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
              <div className="flex items-center gap-2.5">
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedId === t.id ? 'rotate-180' : ''}`} />
                <div>
                  <div className="font-semibold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.die_subtype} · {t.plates.length} piastre · difficoltà {t.default_difficulty}</div>
                </div>
              </div>
              {canWrite && (
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => setEditingTpl(structuredClone(t))}>Modifica</Button>
                  <button onClick={() => setDeleteId(t.id)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
            {expandedId === t.id && (
              <div className="border-t border-border px-4 pb-3 pt-2">
                <table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground"><th className="py-1 text-left font-medium">Ruolo</th><th className="py-1 text-right font-medium">Spessore (mm)</th><th className="py-1 pl-2 text-left font-medium">Materiale default</th><th className="py-1 pl-2 text-left font-medium">Trattamento default</th></tr></thead>
                  <tbody>
                    {t.plates.map(p => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="py-1">{p.plate_role}</td>
                        <td className="py-1 text-right font-mono">{p.default_thickness_mm}</td>
                        <td className="py-1 pl-2">{materials.find(m => m.id === p.default_material_id)?.name || '—'}</td>
                        <td className="py-1 pl-2">{treatments.find(tr => tr.id === p.default_treatment_id)?.name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nessun template. Creane uno per pre-compilare le piastre.</div>}
      </div>

      {et && (
        <SettingsModal title={et.id === 0 ? 'Nuovo template' : 'Modifica template'} icon={Hammer} accent="dies" width="max-w-3xl" onClose={() => setEditingTpl(null)} onSave={saveTpl} saveLabel={et.id === 0 ? 'Crea template' : 'Salva template'}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome"><Input value={et.name} onChange={e => setEditingTpl({ ...et, name: e.target.value })} /></Field>
            <Field label="Tipo"><select className={selectCls} value={et.die_subtype} onChange={e => setEditingTpl({ ...et, die_subtype: e.target.value as DieSubtype })}><option value="passo">Passo</option><option value="blocco">Blocco</option></select></Field>
            <Field label="Difficoltà default"><select className={selectCls} value={et.default_difficulty} onChange={e => setEditingTpl({ ...et, default_difficulty: e.target.value as DieDifficulty })}><option value="base">Base</option><option value="medium">Media</option><option value="hard">Alta</option></select></Field>
            <Field label="Stazioni suggerite"><Input type="number" className="font-mono" value={et.suggested_stations ?? ''} onChange={e => setEditingTpl({ ...et, suggested_stations: e.target.value ? parseInt(e.target.value, 10) : null })} /></Field>
          </div>
          <Field label="Descrizione"><textarea className="w-full rounded-md border border-input bg-background p-2 text-sm" rows={2} value={et.description || ''} onChange={e => setEditingTpl({ ...et, description: e.target.value })} /></Field>
          <div className="grid grid-cols-6 gap-2">
            <Field label="P sempl"><Input type="number" className="font-mono" value={et.suggested_n_bends_simple} onChange={e => setEditingTpl({ ...et, suggested_n_bends_simple: parseInt(e.target.value, 10) || 0 })} /></Field>
            <Field label="P media"><Input type="number" className="font-mono" value={et.suggested_n_bends_medium} onChange={e => setEditingTpl({ ...et, suggested_n_bends_medium: parseInt(e.target.value, 10) || 0 })} /></Field>
            <Field label="P compl"><Input type="number" className="font-mono" value={et.suggested_n_bends_complex} onChange={e => setEditingTpl({ ...et, suggested_n_bends_complex: parseInt(e.target.value, 10) || 0 })} /></Field>
            <Field label="Pz sempl"><Input type="number" className="font-mono" value={et.suggested_n_punches_simple} onChange={e => setEditingTpl({ ...et, suggested_n_punches_simple: parseInt(e.target.value, 10) || 0 })} /></Field>
            <Field label="Pz media"><Input type="number" className="font-mono" value={et.suggested_n_punches_medium} onChange={e => setEditingTpl({ ...et, suggested_n_punches_medium: parseInt(e.target.value, 10) || 0 })} /></Field>
            <Field label="Pz compl"><Input type="number" className="font-mono" value={et.suggested_n_punches_complex} onChange={e => setEditingTpl({ ...et, suggested_n_punches_complex: parseInt(e.target.value, 10) || 0 })} /></Field>
          </div>

          <div className="border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between"><strong className="text-sm text-foreground">Piastre del template</strong><Button size="sm" variant="outline" onClick={addPlate}><Plus className="mr-1 h-3.5 w-3.5" />Aggiungi piastra</Button></div>
            <table className="w-full text-xs">
              <thead><tr className={tHead}><th className="p-1.5 text-left font-medium">Ruolo</th><th className="p-1.5 text-right font-medium">Spessore</th><th className="p-1.5 pl-2 text-left font-medium">Materiale default</th><th className="p-1.5 pl-2 text-left font-medium">Trattamento default</th><th className="p-1.5 text-right font-medium">Ord.</th><th /></tr></thead>
              <tbody>
                {et.plates.map((p, idx) => (
                  <React.Fragment key={idx}>
                    <tr className="border-b border-border">
                      <td className="p-1"><Input className="h-8" value={p.plate_role} onChange={e => updateTplPlate(idx, { plate_role: e.target.value })} /></td>
                      <td className="p-1"><Input className="h-8 text-right font-mono" type="number" value={p.default_thickness_mm} onChange={e => updateTplPlate(idx, { default_thickness_mm: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="p-1 pl-2"><select className="h-8 w-full rounded-md border border-input bg-background text-xs" value={p.default_material_id || ''} onChange={e => updateTplPlate(idx, { default_material_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></td>
                      <td className="p-1 pl-2"><select className="h-8 w-full rounded-md border border-input bg-background text-xs" value={p.default_treatment_id || ''} onChange={e => updateTplPlate(idx, { default_treatment_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{treatments.map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}</select></td>
                      <td className="p-1"><Input className="h-8 w-14 text-right font-mono" type="number" value={p.sort_order} onChange={e => updateTplPlate(idx, { sort_order: parseInt(e.target.value, 10) || 0 })} /></td>
                      <td className="p-1 text-right"><button onClick={() => removePlate(idx)} className="rounded p-1 text-muted-foreground hover:text-danger"><X className="h-4 w-4" /></button></td>
                    </tr>
                    <tr className="border-b border-border bg-muted/[0.5]">
                      <td colSpan={6} className="px-2 py-1">
                        <div className="grid grid-cols-5 items-center gap-2">
                          <label className="text-[10px] text-muted-foreground">Setup (h)<Input className="h-7 font-mono text-xs" type="number" step="0.1" value={p.setup_hours_fixed} onChange={e => updateTplPlate(idx, { setup_hours_fixed: parseFloat(e.target.value) || 0 })} /></label>
                          <label className="text-[10px] text-muted-foreground">Facce fresate<Input className="h-7 font-mono text-xs" type="number" value={p.n_milled_faces} onChange={e => updateTplPlate(idx, { n_milled_faces: parseInt(e.target.value, 10) || 0 })} /></label>
                          <label className="text-[10px] text-muted-foreground">Facce rettificate<Input className="h-7 font-mono text-xs" type="number" value={p.n_ground_faces} onChange={e => updateTplPlate(idx, { n_ground_faces: parseInt(e.target.value, 10) || 0 })} /></label>
                          <label className="text-[10px] text-muted-foreground">Facce forate<Input className="h-7 font-mono text-xs" type="number" value={p.n_drilled_faces} onChange={e => updateTplPlate(idx, { n_drilled_faces: parseInt(e.target.value, 10) || 0 })} /></label>
                          <label className="text-[10px] text-muted-foreground">Bonus/stazione (h)<Input className="h-7 font-mono text-xs" type="number" step="0.1" value={p.station_bonus_hours} onChange={e => updateTplPlate(idx, { station_bonus_hours: parseFloat(e.target.value) || 0 })} /></label>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-sm text-foreground">Normalizzati di default (BoM scalabile)</strong>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Auto-popolati alla creazione del preventivo. Quantità = mini-formula sulle variabili <code>n_stations</code>, <code>n_bends_total</code>, <code>n_punches_total</code>, <code>area_castello_dm2</code>, ecc. Es. <code>n_stations * 2 + 4</code>.</p>
              </div>
              <Button size="sm" variant="outline" onClick={addNorm}><Plus className="mr-1 h-3.5 w-3.5" />Aggiungi normalizzato</Button>
            </div>
            <table className="mt-2 w-full text-xs">
              <thead><tr className={tHead}><th className="p-1.5 text-left font-medium">Descrizione</th><th className="p-1.5 pl-2 text-left font-medium">Fornitore</th><th className="p-1.5 pl-2 text-left font-medium">Quantità (formula)</th><th className="p-1.5 text-right font-medium">€/u default</th><th className="p-1.5 text-right font-medium">Ord.</th><th /></tr></thead>
              <tbody>
                {(et.normalized_items || []).length === 0 && <tr><td colSpan={6} className="py-2 italic text-muted-foreground">Nessun normalizzato di default.</td></tr>}
                {(et.normalized_items || []).map((n, idx) => (
                  <tr key={idx} className="border-b border-border">
                    <td className="p-1"><Input className="h-8" value={n.description} onChange={e => updateTplNorm(idx, { description: e.target.value })} /></td>
                    <td className="p-1 pl-2"><select className="h-8 w-full rounded-md border border-input bg-background text-xs" value={n.normalized_supplier_id || ''} onChange={e => updateTplNorm(idx, { normalized_supplier_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{normSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                    <td className="p-1 pl-2"><Input className="h-8 font-mono text-xs" value={n.quantity_formula} onChange={e => updateTplNorm(idx, { quantity_formula: e.target.value })} /></td>
                    <td className="p-1"><Input className="h-8 text-right font-mono" type="number" step="0.01" value={n.unit_price_default} onChange={e => updateTplNorm(idx, { unit_price_default: parseFloat(e.target.value) || 0 })} /></td>
                    <td className="p-1"><Input className="h-8 w-14 text-right font-mono" type="number" value={n.sort_order} onChange={e => updateTplNorm(idx, { sort_order: parseInt(e.target.value, 10) || 0 })} /></td>
                    <td className="p-1 text-right"><button onClick={() => removeNorm(idx)} className="rounded p-1 text-muted-foreground hover:text-danger"><X className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsModal>
      )}

      <ConfirmDialog open={deleteId != null} title="Eliminare il template?" description="Operazione irreversibile. I preventivi già creati restano invariati (le piastre sono copiate al momento dell'applicazione)." confirmLabel="Elimina template" onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />
    </div>
  )
}
