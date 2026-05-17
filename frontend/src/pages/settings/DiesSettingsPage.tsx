import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Hammer, Plus, X } from 'lucide-react'

import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import { useAuth } from '@/lib/auth'
import type {
  DieSettings, DieDimensionBracket, DieTemplate, DieTemplatePlate,
  Material, Treatment, DieSubtype, DieDifficulty,
} from '@/types'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
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
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
          <Hammer className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Impostazioni Stampi</h1>
          <p className="text-xs text-gray-500">Tariffe, fasce dimensionali e template per il modulo Preventivatore Stampi</p>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {(['tariffe', 'fasce', 'template'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? 'border-rose-600 text-rose-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'tariffe' && 'Tariffe & costi'}
            {t === 'fasce' && 'Fasce dimensionali'}
            {t === 'template' && 'Template stampi'}
          </button>
        ))}
      </div>

      {tab === 'tariffe' && <TariffeTab canWrite={canWrite} />}
      {tab === 'fasce' && <FasceTab canWrite={canWrite} />}
      {tab === 'template' && <TemplatesTab canWrite={canWrite} />}
    </div>
  )
}

// ─── Tab 1: Tariffe ──────────────────────────────────────────────────────────

function TariffeTab({ canWrite }: { canWrite: boolean }) {
  const [s, setS] = useState<DieSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/die-settings').then(r => setS(r.data)).catch(() => toast.error('Errore caricamento'))
  }, [])

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

  if (!s) return <p className="text-sm text-gray-500">Caricamento…</p>

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
        <CardHeader><CardTitle className="text-base">1. Tariffe orarie officina (€/h)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {num('hourly_rate_milling', 'Fresatura')}
          {num('hourly_rate_grinding', 'Rettifica')}
          {num('hourly_rate_edm_wire', 'EDM filo')}
          {num('hourly_rate_edm_die', 'EDM tuffo')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2+3. Costi feature (€/unità)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {num('cost_bend_simple', 'Piega semplice')}
          {num('cost_bend_medium', 'Piega media')}
          {num('cost_bend_complex', 'Piega complessa')}
          {num('cost_punch_simple', 'Punzone semplice')}
          {num('cost_punch_medium', 'Punzone medio')}
          {num('cost_punch_complex', 'Punzone complesso')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">4. Costo base per piastra</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {num('cost_per_plate_base', 'Costo base × n. piastre (€)')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">6. Moltiplicatori difficoltà</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          {num('diff_mult_base', 'Base')}
          {num('diff_mult_medium', 'Media')}
          {num('diff_mult_hard', 'Alta')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">7. Progettazione (ore × tariffa)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {num('design_hours_base', 'Ore base')}
          {num('design_hours_medium', 'Ore media')}
          {num('design_hours_hard', 'Ore alta')}
          {num('design_hourly_rate', 'Tariffa €/h')}
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
      <CardHeader><CardTitle className="text-base">Fasce dimensionali castello</CardTitle></CardHeader>
      <CardContent>
        <p className="text-xs text-gray-500 mb-3">Area castello in dm². Lookup: area_min ≤ area &lt; area_max. Ultima fascia: area_max vuota (= infinito).</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b">
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
                      <button onClick={() => remove(b.id)} className="text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              )
            })}
            {canWrite && (
              <tr className="bg-gray-50">
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
  { id: 0, plate_role: 'cappello',      default_thickness_mm: 25, default_material_id: null, default_treatment_id: null, sort_order: 1 },
  { id: 0, plate_role: 'porta_punzoni', default_thickness_mm: 30, default_material_id: null, default_treatment_id: null, sort_order: 2 },
  { id: 0, plate_role: 'premilamiera',  default_thickness_mm: 25, default_material_id: null, default_treatment_id: null, sort_order: 3 },
  { id: 0, plate_role: 'matrice',       default_thickness_mm: 30, default_material_id: null, default_treatment_id: null, sort_order: 4 },
  { id: 0, plate_role: 'base',          default_thickness_mm: 30, default_material_id: null, default_treatment_id: null, sort_order: 5 },
]

function TemplatesTab({ canWrite }: { canWrite: boolean }) {
  const [list, setList] = useState<DieTemplate[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [editingTpl, setEditingTpl] = useState<DieTemplate | null>(null)
  // `editingTpl.id === 0` → modalità create (POST); altrimenti edit (PUT).
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const load = () => api.get('/die-settings/templates').then(r => setList(r.data))
  useEffect(() => {
    load()
    api.get('/materials').then(r => setMaterials(r.data))
    api.get('/treatments').then(r => setTreatments(r.data))
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
      }],
    })
  }

  const removePlate = (idx: number) => {
    if (!editingTpl) return
    setEditingTpl({ ...editingTpl, plates: editingTpl.plates.filter((_, i) => i !== idx) })
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
        <p className="text-xs text-gray-500 mb-3">I template pre-compilano le piastre e i suggerimenti feature in fase di creazione.</p>
        {list.map(t => (
          <div key={t.id} className="border rounded-md">
            <div className="p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-gray-500">
                  {t.die_subtype} · {t.plates.length} piastre · difficoltà {t.default_difficulty}
                </div>
              </div>
              {canWrite && (
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => setEditingTpl(JSON.parse(JSON.stringify(t)))}>Modifica</Button>
                  <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={() => setDeleteId(t.id)}><X className="w-3.5 h-3.5" /></Button>
                </div>
              )}
            </div>
            {expandedId === t.id && (
              <div className="px-3 pb-3 border-t pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500">
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
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">{editingTpl.id === 0 ? 'Nuovo template' : 'Modifica template'}</h2>
                <button onClick={() => setEditingTpl(null)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
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
                      <tr className="text-gray-500 border-b">
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
                        <tr key={idx} className="border-b">
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
                            <button onClick={() => removePlate(idx)} className="text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
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
