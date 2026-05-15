import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Plus, Save, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import type { DieSettings, DieDimensionBracket } from '@/types'

type Tab = 'rates' | 'brackets'

export default function DiesSettingsPage() {
  const [tab, setTab] = useState<Tab>('rates')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Impostazioni Stampi</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tariffe orarie, costi feature e fasce dimensionali castello usati dal cost engine del preventivatore stampi.
        </p>
      </div>

      <div className="flex gap-2 border-b">
        <TabButton active={tab === 'rates'} onClick={() => setTab('rates')}>Tariffe & costi</TabButton>
        <TabButton active={tab === 'brackets'} onClick={() => setTab('brackets')}>Fasce dimensionali</TabButton>
      </div>

      {tab === 'rates' && <RatesTab />}
      {tab === 'brackets' && <BracketsTab />}
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
