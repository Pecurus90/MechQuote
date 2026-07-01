import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Pencil, X, Send, FileText, Save, AlertCircle } from 'lucide-react'

import api, { getApiErrorDetail } from '@/lib/api'
import { buildCatalogOptions } from '@/lib/catalogSelect'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import QuoteStatusActions from '@/components/quotes/QuoteStatusActions'
import { computeDiePreviewCosts, estimateDiePlateHours } from '@/lib/dieCalc'
import type {
  Quote, DieSpec, DieNormalizedItem, NormalizedSupplier, Material, Treatment,
  DieDifficulty, Part, DieSettings, DieDimensionBracket,
  EdmConfig, EdmCutSpeed, CuttingCycle, Machine,
} from '@/types'

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground block mb-1">{children}</label>
}

const PLATE_ROLE_LABELS: Record<string, string> = {
  cappello: 'Cappello',
  porta_punzoni: 'Porta punzoni',
  premilamiera: 'Premilamiera',
  matrice: 'Matrice',
  base: 'Base',
}

export default function DieQuoteEditor() {
  const { id } = useParams<{ id: string }>()
  const { hasPermission, hasRole } = useAuth()
  const canWrite = hasPermission('dies.create')
  const canSubmit = hasPermission('quotes.send')
  const canPdf = hasPermission('quotes.pdf') || hasPermission('dies.pdf')

  const [quote, setQuote] = useState<Quote | null>(null)
  const [spec, setSpec] = useState<DieSpec | null>(null)
  const [parts, setParts] = useState<Part[]>([])
  const [normalizedItems, setNormalizedItems] = useState<DieNormalizedItem[]>([])
  const [suppliers, setSuppliers] = useState<NormalizedSupplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [dieSettings, setDieSettings] = useState<DieSettings | null>(null)
  const [brackets, setBrackets] = useState<DieDimensionBracket[]>([])
  // Sprint G — pre-fetch tabelle EDM + macchine per live preview L3
  const [edmCfg, setEdmCfg] = useState<EdmConfig | null>(null)
  const [edmSpeeds, setEdmSpeeds] = useState<EdmCutSpeed[]>([])
  const [cycles, setCycles] = useState<CuttingCycle[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingOverride, setEditingOverride] = useState<null | 'material' | 'normalized' | 'machining' | 'accessories'>(null)
  const [overrideValue, setOverrideValue] = useState('')

  // Dirty tracking: ogni handler modifica SOLO lo state locale e accumula
  // il "patch" che verrà inviato col click Salva. Pattern allineato al
  // preventivo manuale (QuoteEditor.tsx): niente autosave on-change.
  // Mappiamo i patch invece di solo gli id per non sovrascrivere campi
  // auto-fillati dal backend (es. raw_x/y delle piastre dopo PUT spec).
  const [dirtySpec, setDirtySpec] = useState<Partial<DieSpec> | null>(null)
  const [dirtyQuote, setDirtyQuote] = useState<Partial<Quote> | null>(null)
  const [dirtyParts, setDirtyParts] = useState<Map<number, Partial<Part>>>(new Map())
  const [dirtyItems, setDirtyItems] = useState<Map<number, Partial<DieNormalizedItem>>>(new Map())
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  // Sprint H — tab attiva nell'editor (geometria / piastre / normalizzati / costi)
  const [activeTab, setActiveTab] = useState<'geometria' | 'piastre' | 'normalizzati' | 'costi'>('geometria')
  // Sprint G — stats find-similar per display ratio venduto/preventivato
  const [similarStats, setSimilarStats] = useState<{
    n_with_sold_price: number
    avg_sold_to_quoted_ratio: number | null
    n_with_actual_cost: number
    avg_cost_to_quoted_ratio: number | null
  } | null>(null)

  const isDirty = !!dirtySpec || !!dirtyQuote || dirtyParts.size > 0 || dirtyItems.size > 0

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      // Core endpoints (devono riuscire o l'editor non parte):
      const q = await api.get(`/dies/${id}`)
      setQuote(q.data)
      setSpec(q.data.die_spec)
      setParts(q.data.parts || [])

      // Endpoint secondari (Promise.allSettled): se uno fallisce, l'editor
      // si carica lo stesso usando i dati che ha. Es: senza die-settings i
      // preview L3/L4 cadono sui snapshot DB.
      // CAT-1 Fase 2 / stampi: filtro `?active=true` solo sui catalog di
      // scelta utente (Materiale piastra + Fornitore normalizzato). /machines
      // e /treatments NON sono filtrati: /machines è lookup automatico per le
      // tariffe (stessa logica del 2D), /treatments è oggi stato non usato
      // qui dentro (resta caricato per non rimuovere strato esistente).
      const [ni, mats, treats, sups, ds, bs, sim, ecfg, esp, cyc, mch] = await Promise.allSettled([
        api.get(`/dies/${id}/normalized-items`),
        api.get('/materials?active=true'),
        api.get('/treatments'),
        api.get('/normalized-suppliers?active=true'),
        api.get('/die-settings'),
        api.get('/die-settings/brackets'),
        api.get(`/dies/${id}/find-similar`),
        api.get('/edm-config'),
        api.get('/edm-cut-speeds'),
        api.get('/cutting-cycles'),
        api.get('/machines'),
      ])
      if (ni.status === 'fulfilled') setNormalizedItems(ni.value.data)
      if (mats.status === 'fulfilled') setMaterials(mats.value.data)
      if (treats.status === 'fulfilled') setTreatments(treats.value.data)
      if (sups.status === 'fulfilled') setSuppliers(sups.value.data)
      if (ds.status === 'fulfilled') setDieSettings(ds.value.data)
      if (bs.status === 'fulfilled') setBrackets(bs.value.data)
      if (sim.status === 'fulfilled') setSimilarStats(sim.value.data?.stats || null)
      if (ecfg.status === 'fulfilled') setEdmCfg(ecfg.value.data)
      if (esp.status === 'fulfilled') setEdmSpeeds(esp.value.data)
      if (cyc.status === 'fulfilled') setCycles(cyc.value.data)
      if (mch.status === 'fulfilled') setMachines(mch.value.data)
      // Log delle eventuali failure (no toast, è secondario)
      for (const r of [ni, mats, treats, sups, ds, bs]) {
        if (r.status === 'rejected') console.warn('Endpoint secondario fallito:', r.reason)
      }
      // Reset dirty al refresh dati
      setDirtySpec(null)
      setDirtyQuote(null)
      setDirtyParts(new Map())
      setDirtyItems(new Map())
    } catch (e) {
      console.error('DieQuoteEditor.load failed:', e)
      toast.error(getApiErrorDetail(e, 'Errore caricamento preventivo'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  // Sprint D — `DieDimensionBracket` (fasce castello) non è più usato dal
  // cost engine: la dipendenza dimensionale ora vive nei driver geometrici
  // di Sprint A/B. Lo stato `brackets` resta caricato come legacy per
  // eventuali UI di sola lettura, ma non genera più warning all'utente.

  // Rules of Hooks: TUTTI gli hooks devono essere chiamati nello stesso
  // ordine ad ogni render. Il useMemo del preview va dichiarato PRIMA
  // dell'early return per "Caricamento…": gestisce internamente il caso
  // spec=null restituendo null, così non aggiunge condizioni.
  // Sprint G — preview live anche per L3 (mech + EDM): pre-fetch tabelle
  // EDM + macchine, gemello TS di `_recalculate_die_levels`.
  const preview = useMemo(() => {
    if (!spec || !dieSettings) return null
    // Sprint F — risolvi tariffe da macchine agganciate, fallback alle hourly_rate_*
    const rateFor = (machineId: number | null | undefined, fallback: number): number => {
      if (machineId) {
        const m = machines.find(x => x.id === machineId)
        if (m && m.hourly_rate) return m.hourly_rate
      }
      return fallback || 0
    }
    const machineRates = {
      mill:  rateFor(dieSettings.milling_machine_id,  dieSettings.hourly_rate_milling),
      grind: rateFor(dieSettings.grinding_machine_id, dieSettings.hourly_rate_grinding),
      drill: rateFor(dieSettings.drilling_machine_id, dieSettings.hourly_rate_milling),
      edm:   rateFor(dieSettings.edm_wire_machine_id, dieSettings.hourly_rate_edm_die),
    }
    return computeDiePreviewCosts({
      spec, settings: dieSettings, plates: parts, materials, brackets,
      edmCfg, edmSpeeds, cycles, machineRates,
    })
  }, [spec, dieSettings, parts, materials, brackets, edmCfg, edmSpeeds, cycles, machines])

  if (loading || !quote || !spec) {
    return <div className="p-8 text-sm text-muted-foreground">Caricamento…</div>
  }

  // Spec 18: modificabile in bozza/inviato/letto; bloccato dalla Conferma (admin esente).
  const editable = ['bozza', 'inviato', 'letto'].includes(quote.status) || hasRole('admin')

  // ─── Local mutators (state-only, mark dirty) ────────────────────────────
  const setSpecLocal = (patch: Partial<DieSpec>) => {
    setSpec(s => s ? { ...s, ...patch } : s)
    setDirtySpec(d => ({ ...(d || {}), ...patch }))
  }

  const setQuoteLocal = (patch: Partial<Quote>) => {
    setQuote(q => q ? { ...q, ...patch } : q)
    setDirtyQuote(d => ({ ...(d || {}), ...patch }))
  }

  const updatePartLocal = (partId: number, patch: Partial<Part>) => {
    setParts(ps => ps.map(p => p.id === partId ? { ...p, ...patch } : p))
    setDirtyParts(m => {
      const next = new Map(m)
      next.set(partId, { ...next.get(partId), ...patch })
      return next
    })
  }

  const updateItemLocal = (itemId: number, patch: Partial<DieNormalizedItem>) => {
    setNormalizedItems(items => items.map(i => i.id === itemId ? { ...i, ...patch } : i))
    setDirtyItems(m => {
      const next = new Map(m)
      next.set(itemId, { ...next.get(itemId), ...patch })
      return next
    })
  }

  const setOverride = (key: 'material' | 'normalized' | 'machining' | 'accessories', value: number | null) => {
    const k = `override_${key}` as keyof DieSpec
    setSpecLocal({ [k]: value } as Partial<DieSpec>)
    setEditingOverride(null)
    setOverrideValue('')
  }

  // ─── Operazioni di lista (immediate POST/DELETE, eccezione strutturale) ─
  const addNormalizedItem = async () => {
    try {
      await api.post(`/dies/${id}/normalized-items`, {
        description: 'Nuovo componente',
        quantity: 1,
        unit_price: 0,
      })
      await load()
    } catch (e) {
      toast.error(getApiErrorDetail(e, 'Errore aggiunta normalizzato'))
    }
  }

  const deleteNormalizedItem = async (itemId: number) => {
    try {
      await api.delete(`/dies/${id}/normalized-items/${itemId}`)
      await load()
    } catch (e) {
      toast.error(getApiErrorDetail(e, 'Errore eliminazione normalizzato'))
    }
  }

  // ─── Save consolidato ───────────────────────────────────────────────────
  // Ordine: quote → spec → parts → items. Spec prima delle parts perché il
  // backend può auto-riallineare X/Y delle piastre dopo un cambio di
  // geometria del castello; mandando le parts dirty dopo, le sovrascriviamo
  // (ma solo nei campi che l'utente ha effettivamente modificato).
  const handleSave = async (): Promise<boolean> => {
    if (!isDirty) return true
    setSaving(true)
    try {
      if (dirtyQuote && quote) {
        // NB: NON passiamo quote_type — l'immutabilità è garantita BE-side
        // dal check su `payload['quote_type'] != quote.quote_type`, ma
        // includerlo nel payload romperebbe il "closeout_only path" Sprint G
        // (PUT di sold_price/actual_cost su preventivi completati).
        await api.put(`/quotes/${id}`, dirtyQuote)
      }
      if (dirtySpec) {
        await api.put(`/dies/${id}/spec`, dirtySpec)
      }
      for (const [partId, patch] of dirtyParts) {
        await api.put(`/parts/${partId}`, patch)
      }
      for (const [itemId, patch] of dirtyItems) {
        await api.put(`/dies/${id}/normalized-items/${itemId}`, patch)
      }
      await load()  // reset dirty + fresh state
      toast.success('Modifiche salvate')
      return true
    } catch (e) {
      toast.error(getApiErrorDetail(e, 'Errore salvataggio'))
      return false
    } finally {
      setSaving(false)
    }
  }

  // Invia per revisione: prima salva eventuali pending, poi PATCH status.
  const performSubmit = async () => {
    setConfirmSubmit(false)
    if (isDirty) {
      const ok = await handleSave()
      if (!ok) return
    }
    setSaving(true)
    try {
      await api.patch(`/quotes/${id}/status`, { status: 'inviato' })
      toast.success('Preventivo inviato per revisione')
      await load()
    } catch (e) {
      toast.error(getApiErrorDetail(e, 'Errore invio'))
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadPdf = async () => {
    // Se ci sono modifiche pending, salva prima così il PDF è coerente
    // con quello che l'utente vede nell'editor (altrimenti il BE
    // riempirebbe il PDF con i valori vecchi dal DB).
    if (isDirty) {
      const ok = await handleSave()
      if (!ok) return
    }
    try {
      const res = await api.get(`/quotes/${id}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `preventivo_stampo_${quote?.quote_number || id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(getApiErrorDetail(e, 'Errore download PDF'))
    }
  }

  // Live preview L3/L4: replico la formula backend lato client per
  // mostrare i costi aggiornati subito quando l'utente cambia
  // difficoltà/feature/bbox, senza aspettare il PUT al backend.
  // L1 e L2 restano snapshot (dipendono da Part.total_cost e aggregati
  // che ricalcola il backend dopo save). Vedi `lib/dieCalc.ts`.
  // useMemo dichiarato sopra (prima dell'early return loading).
  // Sprint G — preview live L3 (mech+EDM) e L4. Snapshot DB come fallback
  // se la preview non è ancora pronta (es. settings non caricate).
  const previewMachining = preview?.cost_machining ?? spec.cost_machining
  const previewMachiningMech = preview?.cost_machining_mech ?? spec.cost_machining_mech
  const previewMachiningEdm = preview?.cost_machining_edm ?? spec.cost_machining_edm
  const previewAccessories = preview?.cost_accessories ?? spec.cost_accessories

  // Calcolo industrial usando override matita quando presenti, e i
  // preview lato client per L3/L4 (così cambia il prezzo finale in
  // tempo reale mentre l'utente edita).
  const effMaterial = spec.override_material ?? spec.cost_material
  const effNormalized = spec.override_normalized ?? spec.cost_normalized
  const effMachining = spec.override_machining ?? previewMachining
  const effAccessories = spec.override_accessories ?? previewAccessories
  const industrial = effMaterial + effNormalized + effMachining + effAccessories
  const margin = quote.global_margin_percent || 0
  const discount = quote.global_discount_percent || 0
  const finalPrice = industrial * (1 + margin / 100) * (1 - discount / 100)

  const renderOverrideCell = (
    key: 'material' | 'normalized' | 'machining' | 'accessories',
    calculated: number,
    override: number | null | undefined,
  ) => {
    if (editingOverride === key) {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={overrideValue}
            onChange={e => setOverrideValue(e.target.value)}
            className="h-7 w-24 text-right"
            autoFocus
          />
          <Button size="sm" variant="default" onClick={() => setOverride(key, parseFloat(overrideValue) || 0)}>OK</Button>
          <Button size="sm" variant="outline" onClick={() => { setEditingOverride(null); setOverrideValue('') }}>Annulla</Button>
        </div>
      )
    }
    if (override != null) {
      return (
        <div className="flex items-center gap-2 justify-end">
          <span className="font-medium text-orange-600">€ {override.toFixed(2)} <span className="text-xs text-muted-foreground">(manuale)</span></span>
          {editable && canWrite && (
            <button onClick={() => setOverride(key, null)} title="Rimuovi override" className="text-muted-foreground hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 justify-end">
        <span>€ {calculated.toFixed(2)}</span>
        {editable && canWrite && (
          <button onClick={() => { setEditingOverride(key); setOverrideValue(calculated.toFixed(2)) }} title="Override manuale" className="text-muted-foreground hover:text-blue-600">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{quote.quote_number}</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">
              Stampo {spec.die_subtype === 'passo' ? 'a Passo' : 'a Blocco'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{quote.status}</span>
            {isDirty && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />Modifiche non salvate
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{quote.customer_name || 'Cliente non specificato'}</p>
        </div>
        <div className="flex gap-2">
          {quote.status === 'bozza' && canSubmit && (
            <Button variant="outline" disabled={saving} onClick={() => setConfirmSubmit(true)}>
              <Send className="w-4 h-4 mr-1" /> Invia per revisione
            </Button>
          )}
          <QuoteStatusActions quote={quote} onChanged={setQuote} />
          {canPdf && (
            <Button variant="outline" onClick={handleDownloadPdf}>
              <FileText className="w-4 h-4 mr-1" /> PDF
            </Button>
          )}
          {editable && canWrite && (
            <Button disabled={saving || !isDirty} onClick={handleSave}>
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Salvataggio…' : 'Salva'}
            </Button>
          )}
        </div>
      </div>

      {/* Sprint E — banner warning soft per situazioni sospette nell'input */}
      {(() => {
        const castleX = (spec.bbox_x_mm || 0) + 2 * (spec.castle_offset_x_mm || 0)
          + (spec.die_subtype === 'passo'
              ? (spec.pitch_mm || spec.bbox_x_mm || 0) * ((spec.n_stations || 1) - 1)
              : (spec.block_strip_offset_mm || 0))
        const castleY = (spec.bbox_y_mm || 0) + 2 * (spec.castle_offset_y_mm || 0)
          + (spec.die_subtype === 'passo'
              ? (spec.strip_offset_y_mm || 0)
              : (spec.block_strip_offset_mm || 0))
        const areaCastDm2 = (castleX * castleY) / 10_000
        const nFeat = (spec.n_bends_simple || 0) + (spec.n_bends_medium || 0) + (spec.n_bends_complex || 0)
          + (spec.n_punches_simple || 0) + (spec.n_punches_medium || 0) + (spec.n_punches_complex || 0)
        const warnings: string[] = []
        if (areaCastDm2 > 200) warnings.push(`Castello molto grande: ${areaCastDm2.toFixed(0)} dm² (oltre soglia 200). Verifica le dimensioni.`)
        if (spec.difficulty === 'hard' && nFeat === 0) warnings.push('Difficoltà "alta" senza pieghe né punzoni: controlla i dati.')
        if (!warnings.length) return null
        return (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                {warnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Sprint H — tabs: 4 sezioni invece di 2 colonne single-page densi */}
      <div className="flex border-b mb-3">
        {([
          ['geometria',    'Geometria'],
          ['piastre',      `Piastre (${parts.length})`],
          ['normalizzati', `Normalizzati (${normalizedItems.length})`],
          ['costi',        'Costi'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-rose-600 text-rose-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {activeTab === 'geometria' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Dati stampo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Difficoltà</Label>
                  <select
                    disabled={!editable || !canWrite}
                    className="flex h-9 w-full rounded-md border px-2 text-sm"
                    value={spec.difficulty}
                    onChange={e => setSpecLocal({ difficulty: e.target.value as DieDifficulty })}
                  >
                    <option value="base">Base</option>
                    <option value="medium">Media</option>
                    <option value="hard">Alta</option>
                  </select>
                </div>
                <div>
                  <Label>Consegna (gg)</Label>
                  <Input
                    type="number"
                    disabled={!editable || !canWrite}
                    value={spec.delivery_days ?? ''}
                    onChange={e => setSpecLocal({ delivery_days: e.target.value ? parseInt(e.target.value, 10) : null })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Pezzo X (mm)</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.bbox_x_mm}
                    onChange={e => setSpecLocal({ bbox_x_mm: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Pezzo Y (mm)</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.bbox_y_mm}
                    onChange={e => setSpecLocal({ bbox_y_mm: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Spessore (mm)</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.sheet_thickness_mm}
                    onChange={e => setSpecLocal({ sheet_thickness_mm: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              {/* Sprint A — perimetro pezzo + complessità (driver EDM) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Perimetro pezzo (mm)</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.perimeter_pezzo_mm ?? ''}
                    placeholder={`~${Math.round(2 * ((spec.bbox_x_mm || 0) + (spec.bbox_y_mm || 0)) * (spec.complexity_factor || 1.2))}`}
                    onChange={e => setSpecLocal({ perimeter_pezzo_mm: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label>Complessità profilo</Label>
                  <select
                    disabled={!editable || !canWrite || !!spec.perimeter_pezzo_mm}
                    value={spec.complexity_factor ?? 1.2}
                    onChange={e => setSpecLocal({ complexity_factor: parseFloat(e.target.value) })}
                    className="w-full h-9 px-2 border rounded text-sm"
                  >
                    <option value="1.0">Rettangolare (1.0)</option>
                    <option value="1.2">Quasi rettangolare (1.2)</option>
                    <option value="1.3">Sagoma media (1.3)</option>
                    <option value="1.6">Sagoma complessa (1.6)</option>
                    <option value="1.9">Molto articolato (1.9)</option>
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground -mt-1">
                Driver per la stima ore EDM filo. Se vuoto: stimato come 2×(X+Y)×complessità.
              </p>
              <div className="grid grid-cols-6 gap-2">
                <div>
                  <Label>P semp</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_bends_simple}
                    onChange={e => setSpecLocal({ n_bends_simple: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>P media</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_bends_medium}
                    onChange={e => setSpecLocal({ n_bends_medium: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>P compl</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_bends_complex}
                    onChange={e => setSpecLocal({ n_bends_complex: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>Pz semp</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_punches_simple}
                    onChange={e => setSpecLocal({ n_punches_simple: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>Pz media</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_punches_medium}
                    onChange={e => setSpecLocal({ n_punches_medium: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>Pz compl</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_punches_complex}
                    onChange={e => setSpecLocal({ n_punches_complex: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">P = pieghe, Pz = punzoni</p>
            </CardContent>
          </Card>
        )}

        {/* Piastre */}
        {activeTab === 'piastre' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Piastre castello ({parts.length})</CardTitle></CardHeader>
            <CardContent>
              {parts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna piastra. Crea il preventivo con un template oppure aggiungi manualmente.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-1">Ruolo</th>
                      <th className="text-right py-1">X×Y×Z</th>
                      <th className="text-left py-1 pl-2">Materiale</th>
                      <th className="text-right py-1">Ore mecc.</th>
                      <th className="text-right py-1">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map(p => {
                      const ore = dieSettings ? estimateDiePlateHours(p, spec, dieSettings, brackets) : 0
                      return (
                      <tr key={p.id} className="border-b">
                        <td className="py-1">{p.plate_role ? (PLATE_ROLE_LABELS[p.plate_role] || p.plate_role) : '—'}</td>
                        <td className="text-right py-1 text-xs">{(p.raw_x_mm || 0).toFixed(0)}×{(p.raw_y_mm || 0).toFixed(0)}×
                          <input
                            type="number"
                            disabled={!editable || !canWrite}
                            className="w-14 text-right border-b border-border bg-transparent"
                            value={p.raw_z_mm || 0}
                            onChange={e => p.id && updatePartLocal(p.id, { raw_z_mm: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="pl-2 py-1">
                          <select
                            disabled={!editable || !canWrite}
                            className="text-xs h-6 w-full"
                            value={p.material_id || ''}
                            onChange={e => p.id && updatePartLocal(p.id, { material_id: e.target.value ? Number(e.target.value) : undefined })}
                          >
                            <option value="">—</option>
                            {buildCatalogOptions(
                              materials,
                              p.material_id,
                              p.material,
                              m => m.name,
                            ).map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="text-right py-1 text-xs text-foreground">{ore > 0 ? `${ore.toFixed(1)} h` : '—'}</td>
                        <td className="text-right py-1">€ {(p.total_cost || 0).toFixed(2)}</td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Normalizzati */}
        {activeTab === 'normalizzati' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Normalizzati ({normalizedItems.length})</CardTitle>
                {editable && canWrite && <Button size="sm" onClick={addNormalizedItem}>+ Aggiungi</Button>}
              </div>
            </CardHeader>
            <CardContent>
              {normalizedItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun normalizzato.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-1">Descrizione</th>
                      <th className="text-left py-1">Fornitore</th>
                      <th className="text-right py-1 w-16">Qty</th>
                      <th className="text-right py-1 w-20">€/u</th>
                      <th className="text-right py-1 w-20">Totale</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {normalizedItems.map(it => (
                      <tr key={it.id} className="border-b">
                        <td className="py-1">
                          <input
                            disabled={!editable || !canWrite}
                            className="w-full border-b border-border bg-transparent text-sm"
                            value={it.description}
                            onChange={e => updateItemLocal(it.id, { description: e.target.value })}
                          />
                        </td>
                        <td className="py-1">
                          <select
                            disabled={!editable || !canWrite}
                            className="text-xs h-6 w-full"
                            value={it.normalized_supplier_id || ''}
                            onChange={e => updateItemLocal(it.id, { normalized_supplier_id: e.target.value ? Number(e.target.value) : null })}
                          >
                            <option value="">—</option>
                            {buildCatalogOptions(
                              suppliers,
                              it.normalized_supplier_id,
                              it.supplier,
                              s => s.name,
                            ).map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="text-right py-1">
                          <input type="number" disabled={!editable || !canWrite}
                            className="w-12 text-right border-b border-border bg-transparent"
                            value={it.quantity}
                            onChange={e => updateItemLocal(it.id, { quantity: parseInt(e.target.value, 10) || 1 })}
                          />
                        </td>
                        <td className="text-right py-1">
                          <input type="number" disabled={!editable || !canWrite}
                            className="w-16 text-right border-b border-border bg-transparent"
                            value={it.unit_price}
                            onChange={e => updateItemLocal(it.id, { unit_price: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="text-right py-1">€ {(it.quantity * it.unit_price).toFixed(2)}</td>
                        <td className="text-right py-1">
                          {editable && canWrite && (
                            <button onClick={() => deleteNormalizedItem(it.id)} className="text-muted-foreground hover:text-red-600">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Sprint H — Tab Costi: breakdown + margine + (su completato) chiusura commessa */}
        {activeTab === 'costi' && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Riepilogo costi</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="py-2">L1 Materiale piastre</td>
                    <td className="py-2 text-right">{renderOverrideCell('material', spec.cost_material, spec.override_material)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">L2 Normalizzati + spedizione</td>
                    <td className="py-2 text-right">{renderOverrideCell('normalized', spec.cost_normalized, spec.override_normalized)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">L3 Lavorazioni stampo</td>
                    <td className="py-2 text-right">{renderOverrideCell('machining', previewMachining, spec.override_machining)}</td>
                  </tr>
                  {previewMachiningMech > 0 && (
                    <tr className="border-b text-xs text-muted-foreground">
                      <td className="py-1 pl-4">↳ di cui lavorazione meccanica piastre</td>
                      <td className="py-1 text-right">€ {previewMachiningMech.toFixed(2)}</td>
                    </tr>
                  )}
                  {previewMachiningEdm > 0 && (
                    <tr className="border-b text-xs text-muted-foreground">
                      <td className="py-1 pl-4">↳ di cui EDM filo (matrice + estrattore)</td>
                      <td className="py-1 text-right">€ {previewMachiningEdm.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr className="border-b">
                    <td className="py-2">L4 Accessori (design + montaggio + extras)</td>
                    <td className="py-2 text-right">{renderOverrideCell('accessories', previewAccessories, spec.override_accessories)}</td>
                  </tr>
                  <tr className="border-b font-semibold bg-muted">
                    <td className="py-2">L5 Costo industriale</td>
                    <td className="py-2 text-right">€ {industrial.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="py-2">L6 Margine ({margin}%)</td>
                    <td className="py-2 text-right">+ € {(industrial * margin / 100).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="py-2">L7 Sconto ({discount}%)</td>
                    <td className="py-2 text-right text-muted-foreground">- € {(industrial * (1 + margin / 100) * discount / 100).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 pt-3 border-t-2 border-gray-800">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">Prezzo finale</span>
                  <span className="text-2xl font-bold text-green-700">€ {finalPrice.toFixed(2)}</span>
                </div>
              </div>

              {/* Sprint G — calibrazione storica via find-similar stats */}
              {similarStats && (similarStats.n_with_sold_price > 0 || similarStats.n_with_actual_cost > 0) && (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-300 text-xs text-muted-foreground space-y-0.5">
                  {similarStats.n_with_sold_price > 0 && similarStats.avg_sold_to_quoted_ratio != null && (
                    <div>
                      <strong>{similarStats.n_with_sold_price}</strong> stampi simili venduti in media a <strong>{similarStats.avg_sold_to_quoted_ratio.toFixed(2)}×</strong> il preventivo
                      <span className="text-muted-foreground"> (suggerimento prezzo finale: € {(industrial * similarStats.avg_sold_to_quoted_ratio).toFixed(0)})</span>
                    </div>
                  )}
                  {similarStats.n_with_actual_cost > 0 && similarStats.avg_cost_to_quoted_ratio != null && (
                    <div>
                      <strong>{similarStats.n_with_actual_cost}</strong> stampi simili sono costati in media <strong>{similarStats.avg_cost_to_quoted_ratio.toFixed(2)}×</strong> il preventivo
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Margin/discount */}
          <Card>
            <CardHeader><CardTitle className="text-base">Margine & sconto</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <div>
                <Label>Margine (%)</Label>
                <Input type="number" disabled={!editable || !canWrite}
                  value={quote.global_margin_percent}
                  onChange={e => setQuoteLocal({ global_margin_percent: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Sconto (%)</Label>
                <Input type="number" disabled={!editable || !canWrite}
                  value={quote.global_discount_percent}
                  onChange={e => setQuoteLocal({ global_discount_percent: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Sprint G — chiusura commessa: venduto + consuntivo, solo su completo */}
          {quote.status === 'completo' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Chiusura commessa</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Compila quando lo stampo è stato venduto e/o consegnato.
                  Questi numeri alimentano la calibrazione automatica (find-similar
                  mostra i ratio agli stampi futuri simili).
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Prezzo venduto (€)</Label>
                  <Input type="number" disabled={!canWrite}
                    value={quote.sold_price ?? ''}
                    placeholder={`preventivato: € ${finalPrice.toFixed(0)}`}
                    onChange={e => setQuoteLocal({ sold_price: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label>Costo consuntivo (€)</Label>
                  <Input type="number" disabled={!canWrite}
                    value={quote.actual_cost ?? ''}
                    placeholder={`preventivato: € ${industrial.toFixed(0)}`}
                    onChange={e => setQuoteLocal({ actual_cost: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </>
        )}
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        title="Inviare per revisione?"
        description={
          isDirty
            ? "Le modifiche non salvate verranno salvate prima dell'invio. Dopo l'invio il preventivo non sarà più modificabile (salvo da admin)."
            : "Dopo l'invio il preventivo non sarà più modificabile (salvo da admin)."
        }
        confirmLabel="Invia per revisione"
        variant="destructive"
        onConfirm={performSubmit}
        onCancel={() => setConfirmSubmit(false)}
      />
    </div>
  )
}
