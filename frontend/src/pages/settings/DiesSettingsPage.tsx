import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Plus, Save, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import type {
  DieSettings, DieDimensionBracket, DieTemplate, DieTemplatePlate,
  DieSubtype, DieDifficulty, Material, Treatment,
} from '@/types'

type Tab = 'rates' | 'brackets' | 'templates'

export default function DiesSettingsPage() {
  const [tab, setTab] = useState<Tab>('rates')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Impostazioni Stampi</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tariffe orarie, costi feature, fasce dimensionali castello e template stampo usati dal cost engine del preventivatore stampi.
        </p>
      </div>

      <div className="flex gap-2 border-b">
        <TabButton active={tab === 'rates'} onClick={() => setTab('rates')}>Tariffe & costi</TabButton>
        <TabButton active={tab === 'brackets'} onClick={() => setTab('brackets')}>Fasce dimensionali</TabButton>
        <TabButton active={tab === 'templates'} onClick={() => setTab('templates')}>Template</TabButton>
      </div>

      {tab === 'rates' && <RatesTab />}
      {tab === 'brackets' && <BracketsTab />}
      {tab === 'templates' && <TemplatesTab />}
    </div>
  )
}

function TabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active ? 'border-rose-600 text-rose-700' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}>{children}</button>
  )
}

// ─── Tab 1: Tariffe & costi (DieSettings singleton) ─────────────────────

function RatesTab() {
  const [settings, setSettings] = useState<DieSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<DieSettings>('/die-settings')
      .then(r => setSettings(r.data))
      .catch(() => toast.error('Errore nel caricamento delle impostazioni'))
      .finally(() => setLoading(false))
  }, [])

  const update = (k: keyof DieSettings, v: number) => {
    setSettings(s => s ? { ...s, [k]: v } : s)
  }

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const { id, ...payload } = settings
      const res = await api.put<DieSettings>('/die-settings', payload)
      setSettings(res.data)
      toast.success('Impostazioni salvate')
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Caricamento...</div>
  if (!settings) return null

  return (
    <div className="space-y-4">
      <Section title="Tariffe orarie officina (€/h)">
        <Field label="Fresatura" value={settings.hourly_rate_milling} onChange={v => update('hourly_rate_milling', v)} />
        <Field label="Rettifica" value={settings.hourly_rate_grinding} onChange={v => update('hourly_rate_grinding', v)} />
        <Field label="EDM filo" value={settings.hourly_rate_edm_wire} onChange={v => update('hourly_rate_edm_wire', v)} />
        <Field label="EDM tuffo" value={settings.hourly_rate_edm_die} onChange={v => update('hourly_rate_edm_die', v)} />
      </Section>

      <Section title="Costo unitario pieghe (€)">
        <Field label="Semplice" value={settings.cost_bend_simple} onChange={v => update('cost_bend_simple', v)} />
        <Field label="Media" value={settings.cost_bend_medium} onChange={v => update('cost_bend_medium', v)} />
        <Field label="Complessa" value={settings.cost_bend_complex} onChange={v => update('cost_bend_complex', v)} />
      </Section>

      <Section title="Costo unitario punzoni (€)">
        <Field label="Semplice" value={settings.cost_punch_simple} onChange={v => update('cost_punch_simple', v)} />
        <Field label="Medio" value={settings.cost_punch_medium} onChange={v => update('cost_punch_medium', v)} />
        <Field label="Complesso" value={settings.cost_punch_complex} onChange={v => update('cost_punch_complex', v)} />
      </Section>

      <Section title="Costo base per piastra (€)">
        <Field label="Costo base × n piastre" value={settings.cost_per_plate_base} onChange={v => update('cost_per_plate_base', v)} />
      </Section>

      <Section title="Moltiplicatori difficoltà globale">
        <Field label="Base" value={settings.diff_mult_base} step={0.1} onChange={v => update('diff_mult_base', v)} />
        <Field label="Medio" value={settings.diff_mult_medium} step={0.1} onChange={v => update('diff_mult_medium', v)} />
        <Field label="Difficile" value={settings.diff_mult_hard} step={0.1} onChange={v => update('diff_mult_hard', v)} />
      </Section>

      <Section title="Progettazione (ore CAD × tariffa)">
        <Field label="Ore base" value={settings.design_hours_base} onChange={v => update('design_hours_base', v)} />
        <Field label="Ore medio" value={settings.design_hours_medium} onChange={v => update('design_hours_medium', v)} />
        <Field label="Ore difficile" value={settings.design_hours_hard} onChange={v => update('design_hours_hard', v)} />
        <Field label="Tariffa €/h" value={settings.design_hourly_rate} onChange={v => update('design_hourly_rate', v)} />
      </Section>

      <Section title="Montaggio e collaudo (forfait €)">
        <Field label="Base" value={settings.assembly_forfeit_base} onChange={v => update('assembly_forfeit_base', v)} />
        <Field label="Medio" value={settings.assembly_forfeit_medium} onChange={v => update('assembly_forfeit_medium', v)} />
        <Field label="Difficile" value={settings.assembly_forfeit_hard} onChange={v => update('assembly_forfeit_hard', v)} />
      </Section>

      <Section title="Default per nuovo preventivo">
        <Field label="Margine default (%)" value={settings.default_margin_percent} onChange={v => update('default_margin_percent', v)} />
        <Field label="Offset castello X (mm)" value={settings.default_castle_offset_x_mm} onChange={v => update('default_castle_offset_x_mm', v)} />
        <Field label="Offset castello Y (mm)" value={settings.default_castle_offset_y_mm} onChange={v => update('default_castle_offset_y_mm', v)} />
      </Section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Salvataggio...' : 'Salva impostazioni'}
        </Button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
      </CardContent>
    </Card>
  )
}

function Field({ label, value, onChange, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={step} className="mt-1 h-9 text-sm"
        value={value} onChange={e => onChange(parseDecimal(e.target.value) || 0)} />
    </div>
  )
}

// ─── Tab 2: Fasce dimensionali castello ──────────────────────────────────

function BracketsTab() {
  const [brackets, setBrackets] = useState<DieDimensionBracket[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<DieDimensionBracket> | null>(null)

  const load = () => {
    setLoading(true)
    api.get<DieDimensionBracket[]>('/die-dimension-brackets')
      .then(r => setBrackets(r.data))
      .catch(() => toast.error('Errore nel caricamento'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const save = async () => {
    if (!editing || !editing.label) {
      toast.error('Label obbligatoria')
      return
    }
    try {
      if (editing.id) {
        await api.put(`/die-dimension-brackets/${editing.id}`, editing)
      } else {
        await api.post('/die-dimension-brackets', editing)
      }
      toast.success('Fascia salvata')
      setEditing(null)
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Eliminare la fascia?')) return
    try {
      await api.delete(`/die-dimension-brackets/${id}`)
      toast.success('Fascia eliminata')
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore eliminazione')
    }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Caricamento...</div>

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">Fasce dimensionali castello (area dm² → coefficiente L3)</CardTitle>
        {!editing && (
          <Button size="sm" onClick={() => setEditing({ label: '', area_min_dm2: 0, area_max_dm2: null, coefficient: 1.0, sort_order: brackets.length + 1 })}>
            <Plus className="w-4 h-4 mr-1" /> Nuova fascia
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-3 font-medium text-gray-600">Label</th>
              <th className="text-right p-3 font-medium text-gray-600">Area min (dm²)</th>
              <th className="text-right p-3 font-medium text-gray-600">Area max (dm²)</th>
              <th className="text-right p-3 font-medium text-gray-600">Coefficiente</th>
              <th className="text-right p-3 font-medium text-gray-600">Ordine</th>
              <th className="text-center p-3 font-medium text-gray-600 w-24">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {brackets.map(b => (
              <tr key={b.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{b.label}</td>
                <td className="p-3 text-right font-mono">{b.area_min_dm2}</td>
                <td className="p-3 text-right font-mono">{b.area_max_dm2 ?? '∞'}</td>
                <td className="p-3 text-right font-mono">{b.coefficient.toFixed(2)}</td>
                <td className="p-3 text-right">{b.sort_order}</td>
                <td className="p-3 text-center">
                  <div className="flex gap-1 justify-center">
                    <button onClick={() => setEditing(b)} className="p-1 hover:bg-gray-100 rounded" title="Modifica">
                      <Pencil className="w-4 h-4 text-blue-600" />
                    </button>
                    <button onClick={() => remove(b.id)} className="p-1 hover:bg-red-50 rounded" title="Elimina">
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {editing && (
              <tr className="bg-blue-50 border-b">
                <td className="p-2">
                  <Input className="h-8 text-sm" value={editing.label || ''}
                    onChange={e => setEditing({ ...editing, label: e.target.value })} placeholder="S, M, L..." />
                </td>
                <td className="p-2">
                  <Input type="number" min={0} step={1} className="h-8 text-sm text-right"
                    value={editing.area_min_dm2 ?? 0}
                    onChange={e => setEditing({ ...editing, area_min_dm2: parseDecimal(e.target.value) || 0 })} />
                </td>
                <td className="p-2">
                  <Input type="number" min={0} step={1} className="h-8 text-sm text-right"
                    value={editing.area_max_dm2 ?? ''} placeholder="∞"
                    onChange={e => setEditing({ ...editing, area_max_dm2: e.target.value === '' ? null : parseDecimal(e.target.value) })} />
                </td>
                <td className="p-2">
                  <Input type="number" min={0} step={0.1} className="h-8 text-sm text-right"
                    value={editing.coefficient ?? 1.0}
                    onChange={e => setEditing({ ...editing, coefficient: parseDecimal(e.target.value) || 1.0 })} />
                </td>
                <td className="p-2">
                  <Input type="number" min={0} step={1} className="h-8 text-sm text-right"
                    value={editing.sort_order ?? 0}
                    onChange={e => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })} />
                </td>
                <td className="p-2 text-center">
                  <div className="flex gap-1 justify-center">
                    <button onClick={save} className="p-1 hover:bg-green-100 rounded" title="Salva">
                      <Save className="w-4 h-4 text-green-600" />
                    </button>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-gray-100 rounded" title="Annulla">
                      <X className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ─── Tab 3: Template stampo ──────────────────────────────────────────────

const STANDARD_PLATE_ROLES = ['cappello', 'porta_punzoni', 'premilamiera', 'matrice', 'base']

const EMPTY_TEMPLATE: Partial<DieTemplate> = {
  name: '',
  description: '',
  die_subtype: 'passo',
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
  plates: [],
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<DieTemplate[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<DieTemplate> | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get<DieTemplate[]>('/die-templates'),
      api.get<Material[]>('/materials'),
      api.get<Treatment[]>('/treatments'),
    ]).then(([tpl, mat, tr]) => {
      setTemplates(tpl.data)
      setMaterials(mat.data)
      setTreatments(tr.data)
    }).catch(() => toast.error('Errore nel caricamento'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const remove = async (id: number) => {
    if (!confirm('Eliminare il template?')) return
    try {
      await api.delete(`/die-templates/${id}`)
      toast.success('Template eliminato')
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore eliminazione')
    }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Caricamento...</div>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm">Template stampo ({templates.length})</CardTitle>
          {!editing && (
            <Button size="sm" className="bg-rose-600 hover:bg-rose-700"
              onClick={() => setEditing({
                ...EMPTY_TEMPLATE,
                plates: STANDARD_PLATE_ROLES.map((r, i) => ({
                  plate_role: r, default_thickness_mm: 25, sort_order: i + 1,
                })),
              })}>
              <Plus className="w-4 h-4 mr-1" /> Nuovo template
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {templates.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-400">Nessun template. Crea il primo!</p>
          )}
          {templates.length > 0 && (
            <ul className="divide-y">
              {templates.map(t => (
                <li key={t.id} className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${
                        t.die_subtype === 'passo' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>{t.die_subtype}</span>
                    </div>
                    {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {t.plates.length} piastre · pieghe {t.suggested_n_bends_simple + t.suggested_n_bends_medium + t.suggested_n_bends_complex} · punzoni {t.suggested_n_punches_simple + t.suggested_n_punches_medium + t.suggested_n_punches_complex} · {t.default_difficulty}
                    </p>
                  </div>
                  <button onClick={() => setEditing(t)} className="p-1.5 hover:bg-gray-100 rounded" title="Modifica">
                    <Pencil className="w-4 h-4 text-blue-600" />
                  </button>
                  <button onClick={() => remove(t.id)} className="p-1.5 hover:bg-red-50 rounded" title="Elimina">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editing && (
        <TemplateEditor
          template={editing}
          materials={materials}
          treatments={treatments}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function TemplateEditor({ template, materials, treatments, onCancel, onSaved }: {
  template: Partial<DieTemplate>
  materials: Material[]
  treatments: Treatment[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [tpl, setTpl] = useState<Partial<DieTemplate>>(template)
  const [saving, setSaving] = useState(false)

  const upd = <K extends keyof DieTemplate>(k: K, v: DieTemplate[K]) =>
    setTpl(t => ({ ...t, [k]: v }))

  const addPlate = () => {
    const plates = [...(tpl.plates || [])]
    plates.push({ plate_role: '', default_thickness_mm: 25, sort_order: plates.length + 1 })
    upd('plates', plates as DieTemplatePlate[])
  }
  const updPlate = (idx: number, field: keyof DieTemplatePlate, v: unknown) => {
    const plates = [...(tpl.plates || [])]
    plates[idx] = { ...plates[idx], [field]: v } as DieTemplatePlate
    upd('plates', plates as DieTemplatePlate[])
  }
  const rmPlate = (idx: number) => {
    upd('plates', (tpl.plates || []).filter((_, i) => i !== idx) as DieTemplatePlate[])
  }

  const save = async () => {
    if (!tpl.name) { toast.error('Nome obbligatorio'); return }
    setSaving(true)
    try {
      const payload = {
        name: tpl.name,
        description: tpl.description ?? null,
        die_subtype: tpl.die_subtype || 'passo',
        suggested_stations: tpl.suggested_stations ?? null,
        suggested_pitch_mm: tpl.suggested_pitch_mm ?? null,
        suggested_n_bends_simple: tpl.suggested_n_bends_simple ?? 0,
        suggested_n_bends_medium: tpl.suggested_n_bends_medium ?? 0,
        suggested_n_bends_complex: tpl.suggested_n_bends_complex ?? 0,
        suggested_n_punches_simple: tpl.suggested_n_punches_simple ?? 0,
        suggested_n_punches_medium: tpl.suggested_n_punches_medium ?? 0,
        suggested_n_punches_complex: tpl.suggested_n_punches_complex ?? 0,
        default_difficulty: tpl.default_difficulty || 'base',
        active: tpl.active ?? true,
        plates: (tpl.plates || []).map((p, i) => ({
          plate_role: p.plate_role,
          default_thickness_mm: p.default_thickness_mm ?? 0,
          default_material_id: p.default_material_id ?? null,
          default_treatment_id: p.default_treatment_id ?? null,
          sort_order: p.sort_order ?? i + 1,
        })),
      }
      if (tpl.id) {
        await api.put(`/die-templates/${tpl.id}`, payload)
      } else {
        await api.post('/die-templates', payload)
      }
      toast.success('Template salvato')
      onSaved()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">{tpl.id ? 'Modifica template' : 'Nuovo template'}</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Annulla</Button>
          <Button size="sm" onClick={save} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Salvataggio...' : 'Salva'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Metadati */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nome</label>
            <Input className="mt-1 h-9 text-sm" value={tpl.name || ''}
              onChange={e => upd('name', e.target.value)} placeholder="es. Progressivo 5 stazioni" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo stampo</label>
            <select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={tpl.die_subtype || 'passo'}
              onChange={e => upd('die_subtype', e.target.value as DieSubtype)}>
              <option value="passo">Passo (progressivo)</option>
              <option value="blocco">Blocco</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Descrizione</label>
            <Input className="mt-1 h-9 text-sm" value={tpl.description || ''}
              onChange={e => upd('description', e.target.value)} />
          </div>
        </div>

        {/* Suggerimenti feature */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Difficoltà default</label>
            <select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={tpl.default_difficulty || 'base'}
              onChange={e => upd('default_difficulty', e.target.value as DieDifficulty)}>
              <option value="base">Base</option>
              <option value="medium">Medio</option>
              <option value="hard">Difficile</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">N° stazioni (passo)</label>
            <Input type="number" min={1} className="mt-1 h-9 text-sm"
              value={tpl.suggested_stations ?? ''}
              onChange={e => upd('suggested_stations', e.target.value === '' ? null : parseInt(e.target.value, 10))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Passo (mm)</label>
            <Input type="number" min={0} step={0.5} className="mt-1 h-9 text-sm"
              value={tpl.suggested_pitch_mm ?? ''}
              onChange={e => upd('suggested_pitch_mm', e.target.value === '' ? null : parseDecimal(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <PlateCountField label="Pieghe semplici" v={tpl.suggested_n_bends_simple ?? 0} on={v => upd('suggested_n_bends_simple', v)} />
          <PlateCountField label="Pieghe medie" v={tpl.suggested_n_bends_medium ?? 0} on={v => upd('suggested_n_bends_medium', v)} />
          <PlateCountField label="Pieghe complesse" v={tpl.suggested_n_bends_complex ?? 0} on={v => upd('suggested_n_bends_complex', v)} />
          <PlateCountField label="Punzoni semplici" v={tpl.suggested_n_punches_simple ?? 0} on={v => upd('suggested_n_punches_simple', v)} />
          <PlateCountField label="Punzoni medi" v={tpl.suggested_n_punches_medium ?? 0} on={v => upd('suggested_n_punches_medium', v)} />
          <PlateCountField label="Punzoni complessi" v={tpl.suggested_n_punches_complex ?? 0} on={v => upd('suggested_n_punches_complex', v)} />
        </div>

        {/* Piastre */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Piastre ({(tpl.plates || []).length})</h3>
            <Button size="sm" variant="outline" onClick={addPlate}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi piastra
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2 font-medium text-gray-600">Ruolo</th>
                <th className="text-right p-2 font-medium text-gray-600 w-24">Spessore</th>
                <th className="text-left p-2 font-medium text-gray-600">Materiale default</th>
                <th className="text-left p-2 font-medium text-gray-600">Trattamento default</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {(tpl.plates || []).map((p, idx) => (
                <tr key={idx} className="border-b">
                  <td className="p-1">
                    <Input className="h-8 text-sm" value={p.plate_role}
                      onChange={e => updPlate(idx, 'plate_role', e.target.value)} placeholder="es. matrice" />
                  </td>
                  <td className="p-1">
                    <Input type="number" min={0} step={0.5} className="h-8 text-sm text-right"
                      value={p.default_thickness_mm}
                      onChange={e => updPlate(idx, 'default_thickness_mm', parseDecimal(e.target.value) || 0)} />
                  </td>
                  <td className="p-1">
                    <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={p.default_material_id ?? ''}
                      onChange={e => updPlate(idx, 'default_material_id', e.target.value ? Number(e.target.value) : null)}>
                      <option value="">— nessuno —</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>
                  <td className="p-1">
                    <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={p.default_treatment_id ?? ''}
                      onChange={e => updPlate(idx, 'default_treatment_id', e.target.value ? Number(e.target.value) : null)}>
                      <option value="">— nessuno —</option>
                      {treatments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className="p-1 text-center">
                    <button onClick={() => rmPlate(idx)} className="p-1 hover:bg-red-50 rounded">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </CardContent>
    </Card>
  )
}

function PlateCountField({ label, v, on }: { label: string; v: number; on: (n: number) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input type="number" min={0} step={1} className="mt-1 h-9 text-sm"
        value={v} onChange={e => on(parseInt(e.target.value, 10) || 0)} />
    </div>
  )
}
