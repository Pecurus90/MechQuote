import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileText, X, Zap, Drill, AlertTriangle } from 'lucide-react'
import api from '@/lib/api'
import { parseDecimal } from '@/lib/decimalInput'
import { toast } from 'sonner'
import type {
  DxfAnalysis, Category, Customer, Material, CuttingCycle, DrillingTime, EdmConfig,
} from '@/types'
import DxfViewer from '@/components/quotes/Dxf/DxfViewer'
import Dxf2dProfileList from '@/components/quotes/Dxf/Dxf2dProfileList'
import Dxf2dSelectionSummary from '@/components/quotes/Dxf/Dxf2dSelectionSummary'

type DrillingMode = 'foratrice_edm' | 'piastra_preforata'

interface FormState {
  // preventivo
  customer_id: string
  customer_name: string
  customer_code: string
  year: string
  category_code: string
  progressive: string
  default_quantity: number
  global_margin_percent: number
  quote_date: string
  // pezzo
  description: string
  material_id: string
  cut_height_mm: number
  // EDM
  cutting_cycle_id: string
  drilling_mode: DrillingMode
  electrode_diameter_mm: number  // usato in modalità foratrice_edm (selezionato da dropdown)
  n_holes: number                // numero pre-fori (foratrice) o infilaggi (piastra)
}

const initialForm = (categories: Category[]): FormState => ({
  customer_id: '',
  customer_name: '',
  customer_code: '',
  year: new Date().getFullYear().toString().slice(-2),
  category_code: categories[0]?.code || 'A',
  progressive: '',
  default_quantity: 1,
  global_margin_percent: 20,
  quote_date: new Date().toISOString().split('T')[0],
  description: '',
  material_id: '',
  cut_height_mm: 0,
  cutting_cycle_id: '',
  drilling_mode: 'foratrice_edm',
  electrode_diameter_mm: 0,
  n_holes: 0,
})

/** Tempo per foro = altezza_pezzo / mm_per_sec. Match esatto su (famiglia, Ø elettrodo). */
function lookupDrillingSecondsPerHole(
  rows: DrillingTime[], materialFamily: string, electrodeDiameter: number, partHeight: number,
): number | null {
  const row = rows.find(r =>
    r.material_family === materialFamily &&
    r.electrode_diameter_mm === electrodeDiameter,
  )
  if (!row || !row.speed_mm_per_sec) return null
  return partHeight / row.speed_mm_per_sec
}

export default function NewQuote2DPage() {
  const navigate = useNavigate()

  // Lookup data
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [cycles, setCycles] = useState<CuttingCycle[]>([])
  const [drillingRows, setDrillingRows] = useState<DrillingTime[]>([])
  const [edmConfig, setEdmConfig] = useState<EdmConfig | null>(null)
  const [loadingRefs, setLoadingRefs] = useState(true)

  // DXF state
  const [dxfFile, setDxfFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<DxfAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Form
  const [form, setForm] = useState<FormState>(initialForm([]))
  const [submitting, setSubmitting] = useState(false)

  // Customer search dropdown
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      api.get('/quote-categories'),
      api.get('/customers'),
      api.get('/materials'),
      api.get('/cutting-cycles'),
      api.get('/drilling-times'),
      api.get('/edm-config'),
    ]).then(([cat, cus, mat, cyc, dr, cfg]) => {
      setCategories(cat.data)
      setCustomers(cus.data)
      setMaterials(mat.data)
      setCycles(cyc.data.filter((c: CuttingCycle) => c.active))
      setDrillingRows(dr.data)
      setEdmConfig(cfg.data)
      setForm(initialForm(cat.data))
    }).catch(() => toast.error('Errore nel caricamento dei dati di riferimento'))
      .finally(() => setLoadingRefs(false))
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) setCustomerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const toggleProfile = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const selectAllProfiles = (selected: boolean) => {
    if (!analysis) return
    setSelectedIds(selected ? new Set(analysis.profiles.map(p => p.id)) : new Set())
  }

  // ─── DXF upload + analyze ──────────────────────────────────────────────

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      toast.error('Solo file .dxf supportati (DWG va convertito esternamente)')
      return
    }
    setDxfFile(file)
    setAnalyzing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post<DxfAnalysis>('/dxf/analyze', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAnalysis(res.data)
      // Pre-seleziona i profili chiusi (sono quelli da tagliare)
      setSelectedIds(new Set(res.data.profiles.filter(p => p.closed).map(p => p.id)))
      // Pre-popola descrizione con nome file (senza estensione)
      const baseName = file.name.replace(/\.dxf$/i, '')
      if (!form.description) set('description', baseName)
      // Warning unità
      if (res.data.units && res.data.units !== 'mm' && res.data.units !== 'unitless') {
        toast.warning(`Unità DXF rilevate: ${res.data.units}. Verifica le dimensioni.`)
      }
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'analisi del DXF')
      setDxfFile(null)
    } finally {
      setAnalyzing(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const clearDxf = () => {
    setDxfFile(null)
    setAnalysis(null)
    setSelectedIds(new Set())
  }

  // ─── derived ───────────────────────────────────────────────────────────

  const selectedProfiles = useMemo(
    () => analysis?.profiles.filter(p => selectedIds.has(p.id)) ?? [],
    [analysis, selectedIds],
  )
  const selectedLengthMm = useMemo(
    () => selectedProfiles.reduce((s, p) => s + p.length_mm, 0),
    [selectedProfiles],
  )
  const selectedClosedCount = useMemo(
    () => selectedProfiles.filter(p => p.closed).length,
    [selectedProfiles],
  )

  // Famiglia materiale del pezzo selezionato (per filtrare i Ø elettrodo disponibili)
  const partFamily = useMemo(
    () => materials.find(m => m.id === Number(form.material_id))?.family ?? null,
    [materials, form.material_id],
  )

  // Diametri elettrodo disponibili nella tabella drilling_times per la famiglia corrente.
  // Lista distinta + ordinata, da usare nel dropdown della modalità "Foratrice EDM".
  const availableElectrodeDiameters = useMemo(() => {
    if (!partFamily) return []
    const set = new Set<number>()
    for (const r of drillingRows) {
      if (r.material_family === partFamily) set.add(r.electrode_diameter_mm)
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [drillingRows, partFamily])

  // Tempo per foro in secondi (solo modalità foratrice_edm con Ø valido)
  const drillSecondsPerHole = useMemo(() => {
    if (form.drilling_mode !== 'foratrice_edm') return null
    if (!partFamily || !form.cut_height_mm || !form.electrode_diameter_mm) return null
    return lookupDrillingSecondsPerHole(
      drillingRows, partFamily, form.electrode_diameter_mm, form.cut_height_mm,
    )
  }, [form.drilling_mode, partFamily, form.cut_height_mm, form.electrode_diameter_mm, drillingRows])

  const drillTotalSeconds = drillSecondsPerHole != null && form.n_holes > 0
    ? drillSecondsPerHole * form.n_holes
    : null

  const quoteNumber = form.customer_code && form.progressive
    ? `${form.customer_code}-${form.year}${form.category_code}_${form.progressive.padStart(3, '0')}`
    : ''

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c => {
        const q = customerSearch.toLowerCase()
        return String(c.customer_number).includes(q) || c.name.toLowerCase().includes(q)
      }).slice(0, 10)
    : []

  const selectCustomer = (c: Customer) => {
    set('customer_id', String(c.id))
    set('customer_name', c.name)
    set('customer_code', String(c.customer_number).padStart(3, '0'))
    setCustomerSearch('')
    setCustomerOpen(false)
  }

  // ─── submit ────────────────────────────────────────────────────────────

  const validate = (): string[] => {
    const errs: string[] = []
    if (!analysis || !dxfFile) errs.push('Carica un DXF')
    if (selectedProfiles.length === 0) errs.push('Seleziona almeno un profilo')
    if (!form.customer_code) errs.push('Codice cliente')
    if (!form.progressive) errs.push('Progressivo')
    if (!form.material_id) errs.push('Materiale')
    if (!form.cut_height_mm || form.cut_height_mm <= 0) errs.push('Altezza pezzo')
    if (!form.cutting_cycle_id) errs.push('Ciclo di taglio')
    if (!form.n_holes || form.n_holes <= 0) errs.push('Numero fori/infilaggi')
    if (form.drilling_mode === 'foratrice_edm') {
      if (!form.electrode_diameter_mm || form.electrode_diameter_mm <= 0) {
        errs.push('Ø elettrodo (modalità Foratrice EDM)')
      }
      if (!edmConfig?.default_drilling_machine_id) {
        errs.push('Foratrice EDM di default (configura in Impostazioni → Wire EDM → Parametri globali)')
      }
    }
    return errs
  }

  const submit = async () => {
    const errs = validate()
    if (errs.length > 0) { toast.error(`Mancano: ${errs.join(',')}`); return }
    if (!analysis || !dxfFile) return

    setSubmitting(true)
    try {
      // 1. crea preventivo (auto-crea 1 part)
      const quoteRes = await api.post('/quotes', {
        quote_number: quoteNumber,
        quote_type: 'single',
        default_quantity: form.default_quantity,
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        customer_name: form.customer_name,
        global_margin_percent: form.global_margin_percent,
        quote_date: form.quote_date,
      })
      const quoteId = quoteRes.data.id as number
      const partId = quoteRes.data.parts?.[0]?.id as number | undefined
      if (!partId) throw new Error('Part non trovata dopo creazione preventivo')

      // 2. aggiorna part con dati pezzo (materiale, dimensioni grezzo da bbox + cut height)
      await api.put(`/parts/${partId}`, {
        description: form.description,
        material_id: Number(form.material_id),
        raw_x_mm: Math.ceil(analysis.bbox_global.w),
        raw_y_mm: Math.ceil(analysis.bbox_global.h),
        raw_z_mm: form.cut_height_mm,
      })

      // 3. upload DXF
      const fd = new FormData()
      fd.append('file', dxfFile)
      await api.post(`/parts/${partId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })

      // 4. fase Wire EDM (n_pierce = numero fori/infilaggi inserito dall'utente,
      //    sia in modalità foratrice_edm che piastra_preforata)
      await api.post(`/parts/${partId}/phases`, {
        sequence_number: 10,
        phase_type: 'wire_edm',
        description: `Taglio EDM filo (${selectedProfiles.length} profili)`,
        cut_length_mm: Math.round(selectedLengthMm * 100) / 100,
        cut_height_mm: form.cut_height_mm,
        cutting_cycle_id: Number(form.cutting_cycle_id),
        n_pierce: form.n_holes,
        dxf_profile_ids: Array.from(selectedIds),
        // setup/fixed/variable a 0: l'utente li affina nel QuoteEditor se serve
        setup_hours: 0,
        cycle_hours_per_part: 0,  // sarà ricalcolato dal backend
        fixed_cost: 0,
        variable_cost_per_part: 0,
        customer_visible: true,
        is_shared: false,
      })

      // 5. fase Foratura aggiuntiva SOLO in modalità foratrice_edm (con macchina dedicata da EdmConfig)
      if (form.drilling_mode === 'foratrice_edm') {
        if (drillTotalSeconds != null && form.n_holes > 0 && edmConfig?.default_drilling_machine_id) {
          await api.post(`/parts/${partId}/phases`, {
            sequence_number: 5,  // prima della EDM
            phase_type: 'drilling',
            description: `Foratura ${form.n_holes} fori Ø${form.electrode_diameter_mm} mm`,
            machine_id: edmConfig.default_drilling_machine_id,
            setup_hours: 0,
            cycle_hours_per_part: Math.round((drillTotalSeconds / 3600) * 10000) / 10000,
            fixed_cost: 0,
            variable_cost_per_part: 0,
            customer_visible: false,
            is_shared: false,
          })
        } else if (drillTotalSeconds == null) {
          toast.warning('Nessuna velocità foratura in tabella per questa combinazione: aggiungi la fase manualmente nel preventivo')
        }
      }

      toast.success('Preventivo creato')
      navigate(`/quotes/${quoteId}`)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nella creazione del preventivo')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── render ────────────────────────────────────────────────────────────

  if (loadingRefs) return <div className="p-8 text-center">Caricamento...</div>

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-lg font-bold">Nuovo Preventivo 2D</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Carica un DXF, seleziona i profili da tagliare e compila i dati. Il sistema calcola automaticamente
          il tempo Wire EDM dai parametri del materiale e dal ciclo scelto.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-4">

          {/* STEP 1: upload DXF */}
          {!analysis && (
            <Card>
              <CardContent className="p-0">
                <label
                  htmlFor="dxf-input"
                  onDragOver={e => e.preventDefault()}
                  onDrop={onDrop}
                  className="block border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
                >
                  <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium">Trascina qui un file DXF o clicca per selezionarlo</p>
                  <p className="text-xs text-muted-foreground mt-1">Solo formato .dxf · max 50 MB</p>
                  {analyzing && <p className="text-xs text-blue-600 mt-2 animate-pulse">Analisi in corso...</p>}
                  <input
                    id="dxf-input" type="file" accept=".dxf" className="hidden"
                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                </label>
              </CardContent>
            </Card>
          )}

          {/* STEP 2: viewer + form */}
          {analysis && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Pannello sinistro: viewer + lista profili */}
              <div className="space-y-3">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {dxfFile?.name}
                      </CardTitle>
                      <button onClick={clearDxf} className="text-xs text-muted-foreground hover:text-red-500 flex items-center gap-1">
                        <X className="w-3.5 h-3.5" /> Cambia file
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <DxfViewer analysis={analysis} selectedIds={selectedIds} onToggle={toggleProfile} height={420} />
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-0.5 bg-blue-600" /> chiuso selezionato
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-0.5 bg-slate-400" /> chiuso non selezionato
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-0.5 bg-amber-400" style={{ borderTop: '1px dashed #fbbf24' }} /> aperto
                      </span>
                    </div>
                    {analysis.warnings.length > 0 && (
                      <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200">
                        {analysis.warnings.map((w, i) => (
                          <p key={i} className="text-[11px] text-amber-800 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {w}
                          </p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Dxf2dProfileList profiles={analysis.profiles} selectedIds={selectedIds} onToggle={toggleProfile} onSelectAll={selectAllProfiles} />

                <Dxf2dSelectionSummary
                  selectedCount={selectedProfiles.length}
                  selectedLengthMm={selectedLengthMm}
                  selectedClosedCount={selectedClosedCount}
                />
              </div>

              {/* Pannello destro: form */}
              <div className="space-y-3">

                {/* Cliente + codice */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Cliente e Codice Preventivo</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Cliente</label>
                      <div ref={customerRef} className="relative">
                        <Input className="h-9 text-sm" placeholder="Cerca per nome o codice..."
                          value={customerSearch || form.customer_name}
                          onFocus={() => setCustomerOpen(true)}
                          onChange={e => {
                            setCustomerSearch(e.target.value)
                            setCustomerOpen(true)
                            setForm(f => ({ ...f, customer_id: '', customer_name: e.target.value }))
                          }} />
                        {customerOpen && filteredCustomers.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full bg-white border rounded shadow-lg max-h-56 overflow-y-auto">
                            {filteredCustomers.map(c => (
                              <button key={c.id} type="button"
                                className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center gap-2 text-xs"
                                onMouseDown={e => { e.preventDefault(); selectCustomer(c) }}>
                                <span className="font-mono text-muted-foreground w-10">{String(c.customer_number).padStart(3, '0')}</span>
                                <span className="truncate">{c.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Codice preventivo</label>
                      <div className="flex items-center gap-1 mt-1">
                        <Input className="w-14 text-center font-mono h-9 text-sm" maxLength={3}
                          value={form.customer_code}
                          onChange={e => set('customer_code', e.target.value.replace(/\D/g, '').slice(0, 3))} />
                        <span className="text-muted-foreground">-</span>
                        <Input className="w-12 text-center font-mono h-9 text-sm" maxLength={2}
                          value={form.year}
                          onChange={e => set('year', e.target.value.replace(/\D/g, '').slice(0, 2))} />
                        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm font-mono flex-1"
                          value={form.category_code}
                          onChange={e => set('category_code', e.target.value)}>
                          {categories.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                        </select>
                        <span className="text-muted-foreground">_</span>
                        <Input className="w-14 text-center font-mono h-9 text-sm"
                          value={form.progressive}
                          onChange={e => set('progressive', e.target.value.replace(/\D/g, '').slice(0, 3))} />
                      </div>
                      {quoteNumber && (
                        <p className="mt-2 text-sm font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded inline-block">
                          {quoteNumber}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Quantità</label>
                        <Input onFocus={e => e.currentTarget.select()} type="number" min={1} className="mt-1 h-9 text-sm"
                          value={form.default_quantity}
                          onChange={e => set('default_quantity', parseInt(e.target.value) || 1)} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Margine %</label>
                        <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={1} className="mt-1 h-9 text-sm"
                          value={form.global_margin_percent}
                          onChange={e => set('global_margin_percent', parseDecimal(e.target.value) || 0)} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Data</label>
                        <Input type="date" className="mt-1 h-9 text-sm"
                          value={form.quote_date}
                          onChange={e => set('quote_date', e.target.value)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Pezzo + EDM */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4" /> Dati pezzo & taglio EDM</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Descrizione pezzo</label>
                      <Input className="mt-1 h-9 text-sm" value={form.description}
                        onChange={e => set('description', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Materiale</label>
                        <select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={form.material_id}
                          onChange={e => set('material_id', e.target.value)}>
                          <option value="">— scegli —</option>
                          {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Altezza pezzo (mm)</label>
                        <Input onFocus={e => e.currentTarget.select()} type="number" step="0.5" min="0" className="mt-1 h-9 text-sm"
                          placeholder="es. 40"
                          value={form.cut_height_mm || ''}
                          onChange={e => set('cut_height_mm', parseDecimal(e.target.value) || 0)} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Ciclo di taglio</label>
                      <select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={form.cutting_cycle_id}
                        onChange={e => set('cutting_cycle_id', e.target.value)}>
                        <option value="">— scegli ciclo —</option>
                        {cycles.map(c => <option key={c.id} value={c.id}>{c.name} ({c.passes.length} passate)</option>)}
                      </select>
                      {cycles.length === 0 && (
                        <p className="text-[11px] text-amber-700 mt-1">Nessun ciclo configurato. Crealo in Impostazioni → Wire EDM.</p>
                      )}
                    </div>

                    {/* Modalità foratura */}
                    <div className="border-t pt-3">
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Drill className="w-3.5 h-3.5" /> Modalità fori di partenza
                      </label>
                      <div className="flex gap-2 mt-1.5">
                        <button type="button"
                          onClick={() => set('drilling_mode', 'foratrice_edm')}
                          className={`flex-1 px-3 py-2 rounded-lg border-2 text-left transition-colors ${
                            form.drilling_mode === 'foratrice_edm' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                          }`}>
                          <p className="text-xs font-medium">Foratrice EDM</p>
                          <p className="text-[10px] text-muted-foreground">La nostra foratrice fa i fori prima dell'EDM</p>
                        </button>
                        <button type="button"
                          onClick={() => set('drilling_mode', 'piastra_preforata')}
                          className={`flex-1 px-3 py-2 rounded-lg border-2 text-left transition-colors ${
                            form.drilling_mode === 'piastra_preforata' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                          }`}>
                          <p className="text-xs font-medium">Piastra pre-forata</p>
                          <p className="text-[10px] text-muted-foreground">Pezzo già forato (no fase Foratura)</p>
                        </button>
                      </div>

                      {form.drilling_mode === 'foratrice_edm' && (
                        <div className="mt-2 space-y-2">
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Ø elettrodo (mm)</label>
                              <select
                                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                value={form.electrode_diameter_mm || ''}
                                onChange={e => set('electrode_diameter_mm', e.target.value === '' ? 0 : parseDecimal(e.target.value))}
                                disabled={availableElectrodeDiameters.length === 0}
                              >
                                <option value="">— scegli Ø —</option>
                                {availableElectrodeDiameters.map(d => (
                                  <option key={d} value={d}>{d} mm</option>
                                ))}
                              </select>
                              {partFamily && availableElectrodeDiameters.length === 0 && (
                                <p className="text-[10px] text-amber-700 mt-0.5">
                                  Nessun Ø in tabella per famiglia "{partFamily}"
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">N° pre-fori</label>
                              <Input onFocus={e => e.currentTarget.select()} type="number" step="1" min="0" className="mt-1 h-9 text-sm"
                                value={form.n_holes || ''}
                                onChange={e => set('n_holes', e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Tempo stimato</label>
                              <div className="mt-1 h-9 px-2 flex items-center text-sm rounded-md border bg-muted/40">
                                {drillTotalSeconds != null
                                  ? `${form.n_holes} × ${drillSecondsPerHole!.toFixed(1)}s = ${drillTotalSeconds < 60 ? `${drillTotalSeconds.toFixed(0)}s` : `${(drillTotalSeconds / 60).toFixed(1)} min`}`
                                  : <span className="text-amber-700 text-xs">Compila famiglia, altezza, Ø, N° fori</span>}
                              </div>
                            </div>
                          </div>
                          {!edmConfig?.default_drilling_machine_id && (
                            <p className="text-[11px] text-amber-700 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Foratrice EDM non configurata: vai in Impostazioni → Wire EDM → Parametri globali
                            </p>
                          )}
                        </div>
                      )}

                      {form.drilling_mode === 'piastra_preforata' && (
                        <div className="mt-2 max-w-xs">
                          <label className="text-xs font-medium text-muted-foreground">N° infilaggi (fori già presenti nella piastra)</label>
                          <Input onFocus={e => e.currentTarget.select()} type="number" step="1" min="0" className="mt-1 h-9 text-sm"
                            value={form.n_holes || ''}
                            onChange={e => set('n_holes', e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)} />
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Usato per il pierce time del Wire EDM. Nessuna fase Foratura aggiunta al preventivo.
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Button size="lg" className="w-full" onClick={submit} disabled={submitting}>
                  {submitting ? 'Creazione in corso...' : 'Crea Preventivo →'}
                </Button>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
