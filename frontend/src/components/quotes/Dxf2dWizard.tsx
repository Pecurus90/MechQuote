import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, Drill, AlertTriangle, Box } from 'lucide-react'
import api from '@/lib/api'
import { buildCatalogOptions } from '@/lib/catalogSelect'
import { parseDecimal } from '@/lib/decimalInput'
import { toast } from 'sonner'
import type {
  Category, Customer, Material, CuttingCycle, DrillingTime,
  EdmConfig, Machine, Operation, Phase,
} from '@/types'
import type { DxfPickerState } from '@/components/quotes/Dxf/DxfProfilePicker'

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
  // grezzo (precompilato dal bbox DXF + offset per asse, editabile prima del submit)
  raw_x_mm: number
  raw_y_mm: number
  offset_x_mm: number
  offset_y_mm: number
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
  raw_x_mm: 0,
  raw_y_mm: 0,
  offset_x_mm: 0,
  offset_y_mm: 0,
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

// Cerca un'Operation per nome con fallback fuzzy: match esatto se presente,
// altrimenti case-insensitive includes su una keyword. Evita che il preset
// si rompa silenziosamente quando l'utente rinomina la lavorazione in
// Impostazioni → Lavorazioni.
function findOperation(ops: Operation[], exact: string, keyword: string): Operation | undefined {
  return ops.find(o => o.name === exact)
    ?? ops.find(o => o.name.toLowerCase().includes(keyword.toLowerCase()))
}

interface Props {
  /** Stato DXF corrente (dropzone + selezione profili). Quando cambia il
   *  selectedBbox il form ricalcola raw_x/raw_y come bbox + 2×offset. */
  dxf: DxfPickerState
  // Dati di riferimento caricati dalla page shell.
  categories: Category[]
  customers: Customer[]
  materials: Material[]
  cycles: CuttingCycle[]
  drillingRows: DrillingTime[]
  edmConfig: EdmConfig | null
  machines: Machine[]
  operations: Operation[]
  /** Espone al parent (page shell) il grezzo corrente del form: la page lo
   *  passa al `DxfProfilePicker` per disegnare il rect overlay verde/rosso
   *  in tempo reale quando l'utente modifica offset o X/Y. */
  onRawStockChange?: (raw: { x: number; y: number }) => void
}

/** Form di creazione preventivo 2D: cliente + codice + pezzo + EDM + grezzo.
 *
 *  Estratto da NewQuote2DPage per coesione: la page resta come shell
 *  (loading dati di riferimento + layout 2-col + picker DXF). Tutta la
 *  logica form (state, validate, submit) vive qui.
 */
export default function Dxf2dWizard({
  dxf, categories, customers, materials, cycles, drillingRows,
  edmConfig, machines, operations, onRawStockChange,
}: Props) {
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(initialForm(categories))
  const [submitting, setSubmitting] = useState(false)

  // Customer search dropdown
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

  // Quando arrivano le categorie dopo il primo render, allinea category_code di default.
  useEffect(() => {
    if (categories.length > 0 && !form.category_code) {
      setForm(f => ({ ...f, category_code: categories[0].code }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) setCustomerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  // Arrotondamento a 1 decimale: niente Math.ceil — il ceil generava un gap
  // (rect più largo del bbox di max 1mm) quando bbox.w/h non era intero.
  const round1 = (n: number) => Math.round(n * 10) / 10

  // Ogni cambio di selezione profili (bbox unione cambia) → ricalcola
  // raw_x/y dal bbox + 2×offset per asse. Anche al primo mount (quando arriva
  // un DXF). description si precompila col filename solo se vuota.
  // selectedBbox è null finché c'è una selezione → fallback bbox_global.
  const baseBboxW = dxf.selectedBbox?.w ?? dxf.analysis.bbox_global.w
  const baseBboxH = dxf.selectedBbox?.h ?? dxf.analysis.bbox_global.h
  const dxfFileName = dxf.file.name
  useEffect(() => {
    setForm(f => ({
      ...f,
      raw_x_mm: round1(baseBboxW + 2 * f.offset_x_mm),
      raw_y_mm: round1(baseBboxH + 2 * f.offset_y_mm),
      description: f.description ? f.description : dxfFileName.replace(/\.dxf$/i, ''),
    }))
  }, [baseBboxW, baseBboxH, dxfFileName])

  // Espone il grezzo corrente al parent — serve al viewer per disegnare il
  // rect overlay (verde se ok, rosso se < bbox profili) in sincrono col form.
  useEffect(() => {
    onRawStockChange?.({ x: form.raw_x_mm, y: form.raw_y_mm })
  }, [form.raw_x_mm, form.raw_y_mm, onRawStockChange])

  // Cambio offset (X o Y separatamente): ricalcola la dimensione corrispondente
  // dal bbox dei profili selezionati.
  const setOffset = (updates: { x?: number; y?: number }) => {
    setForm(f => {
      const newX = updates.x ?? f.offset_x_mm
      const newY = updates.y ?? f.offset_y_mm
      return {
        ...f,
        offset_x_mm: newX,
        offset_y_mm: newY,
        raw_x_mm: round1(baseBboxW + 2 * newX),
        raw_y_mm: round1(baseBboxH + 2 * newY),
      }
    })
  }

  // ─── derived dal DXF ───────────────────────────────────────────────────

  const analysis = dxf.analysis
  const selectedProfiles = dxf.selectedProfiles
  const selectedLengthMm = dxf.selectedLengthMm

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
    if (selectedProfiles.length === 0) errs.push('Seleziona almeno un profilo')
    if (!form.customer_code) errs.push('Codice cliente')
    if (!form.progressive) errs.push('Progressivo')
    if (!form.material_id) errs.push('Materiale')
    if (!form.cut_height_mm || form.cut_height_mm <= 0) errs.push('Altezza pezzo')
    if (!form.raw_x_mm || form.raw_x_mm <= 0) errs.push('Grezzo X')
    if (!form.raw_y_mm || form.raw_y_mm <= 0) errs.push('Grezzo Y')
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
    // Senza una macchina wire_edm attiva l'autocalc EDM non parte e la fase
    // resta a 0 ore: il preventivo finirebbe con costo EDM = 0 € (silent).
    const wireEdmMachine = machines.find(m => m.machine_type === 'wire_edm')
    if (!wireEdmMachine) {
      errs.push("Nessuna macchina di tipo 'wire_edm' configurata (Impostazioni → Macchine)")
    }
    // Materiale senza density/cost → material_cost = 0 €. Prevenibile solo
    // con materiali completi; il fix vero è in Impostazioni → Materiali.
    if (form.material_id) {
      const mat = materials.find(m => m.id === Number(form.material_id))
      if (mat) {
        const missing: string[] = []
        if (!mat.density_kg_dm3 || mat.density_kg_dm3 <= 0) missing.push('densità')
        if (!mat.cost_per_kg || mat.cost_per_kg <= 0) missing.push('costo/kg')
        if (missing.length) errs.push(`Materiale "${mat.name}" senza ${missing.join(' e ')} (Impostazioni → Materiali)`)
      }
    }
    return errs
  }

  const submit = async () => {
    const errs = validate()
    if (errs.length > 0) { toast.error(`Mancano: ${errs.join(', ')}`); return }

    setSubmitting(true)
    try {
      // 1. Crea preventivo (auto-crea 1 part)
      const quoteRes = await api.post('/quotes', {
        quote_number: quoteNumber,
        quote_type: 'single',
        default_quantity: form.default_quantity,
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        customer_name: form.customer_name,
        global_margin_percent: form.global_margin_percent,
        quote_date: form.quote_date,
      })
      const quoteId = quoteRes.data?.id
      const partId = quoteRes.data?.parts?.[0]?.id
      if (typeof quoteId !== 'number') {
        throw new Error(`Risposta /quotes priva di id valido: ${JSON.stringify(quoteRes.data)}`)
      }
      if (typeof partId !== 'number') {
        throw new Error('Part non trovata dopo creazione preventivo')
      }

      // 2. Aggiorna la part con dati pezzo (materiale, dimensioni grezzo + altezza)
      // quote_mode='dxf' marca la Part come nata dal wizard DXF: il KPI split
      // CNC/EDM in dashboard.py filtra su ('dxf','mixed') per la voce EDM.
      await api.put(`/parts/${partId}`, {
        description: form.description,
        material_id: Number(form.material_id),
        raw_x_mm: form.raw_x_mm,
        raw_y_mm: form.raw_y_mm,
        raw_z_mm: form.cut_height_mm,
        quote_mode: 'dxf',
      })

      // 3. Upload DXF
      const fd = new FormData()
      fd.append('file', dxf.file)
      await api.post(`/parts/${partId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })

      // 4. Fase Wire EDM. wireEdmMachine: validato in validate() — qui find è
      //    garantito tornare qualcosa.
      const wireEdmMachine = machines.find(m => m.machine_type === 'wire_edm')
      const edmOperation = findOperation(operations, 'EDM a filo', 'edm')
      const edmRes = await api.post<Phase>(`/parts/${partId}/phases`, {
        sequence_number: 10,
        phase_type: '',  // legacy column NOT NULL — autocalc EDM si attiva da machine_type='wire_edm'
        operation_id: edmOperation?.id,
        description: `Taglio EDM filo (${selectedProfiles.length} profili)`,
        machine_id: wireEdmMachine?.id,
        cut_length_mm: Math.round(selectedLengthMm * 100) / 100,
        cut_height_mm: form.cut_height_mm,
        cutting_cycle_id: Number(form.cutting_cycle_id),
        n_pierce: form.n_holes,
        dxf_profile_ids: dxf.selectedIds,
        setup_hours: wireEdmMachine?.setup_minimum_hours ?? 0,
        cycle_hours_per_part: 0,  // sarà ricalcolato dal backend (autocalc EDM)
        fixed_cost: 0,
        variable_cost_per_part: 0,
      })

      // Warning se l'autocalc EDM non si è attivato (cycle_hours_per_part = 0):
      // di solito significa che manca la riga EdmCutSpeed per (famiglia, spessore)
      // o la famiglia del materiale non è popolata. Il preventivo è creato ma
      // la fase EDM ha costo 0 € — l'utente deve correggere a mano.
      const edmCycleHours = edmRes.data?.cycle_hours_per_part ?? 0
      if (edmCycleHours <= 0) {
        toast.warning('Autocalc EDM non attivato: la fase ha 0 ore. Verifica EdmCutSpeed per la famiglia/spessore o aggiusta manualmente nel preventivo.')
      }

      // 5. Fase Foratura aggiuntiva SOLO in modalità foratrice_edm
      if (form.drilling_mode === 'foratrice_edm') {
        if (drillTotalSeconds != null && form.n_holes > 0 && edmConfig?.default_drilling_machine_id) {
          const drillingMachine = machines.find(m => m.id === edmConfig.default_drilling_machine_id)
          const drillingOperation = findOperation(operations, 'Foratura', 'foratura')
          await api.post(`/parts/${partId}/phases`, {
            sequence_number: 5,
            phase_type: '',  // legacy column NOT NULL
            operation_id: drillingOperation?.id,
            description: `Foratura ${form.n_holes} fori Ø${form.electrode_diameter_mm} mm`,
            machine_id: edmConfig.default_drilling_machine_id,
            setup_hours: drillingMachine?.setup_minimum_hours ?? 0,
            cycle_hours_per_part: Math.round((drillTotalSeconds / 3600) * 10000) / 10000,
            fixed_cost: 0,
            variable_cost_per_part: 0,
          })
        } else if (drillTotalSeconds == null) {
          toast.warning('Nessuna velocità foratura in tabella per questa combinazione: aggiungi la fase manualmente nel preventivo')
        }
      }

      toast.success('Preventivo creato')
      navigate(`/quotes/${quoteId}`)
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Dxf2dWizard.submit]', e)
      const err = e as { message?: string; response?: { status?: number; data?: { detail?: string } } }
      const detail = err?.response?.data?.detail
      const status = err?.response?.status
      toast.error(detail || err?.message || `Errore nella creazione del preventivo${status ? ` (HTTP ${status})` : ''}`)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── render ────────────────────────────────────────────────────────────

  return (
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
                  onKeyDown={e => { if (e.key === 'Escape') setCustomerOpen(false) }}
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
                  {buildCatalogOptions(
                    materials,
                    form.material_id ? Number(form.material_id) : null,
                    null,
                    m => m.name,
                  ).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
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

        {/* Grezzo — precompilato dal bbox DXF + offset, editabile */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Box className="w-4 h-4" /> Grezzo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              {(() => {
                const base = dxf.selectedBbox ?? analysis.bbox_global
                const label = dxf.selectedBbox ? 'Bbox profili selezionati' : 'Bbox DXF'
                return `${label}: ${base.w.toFixed(1)} × ${base.h.toFixed(1)} mm.`
              })()}
              {' '}Offset per lato e per asse (X e Y aumentano di 2×offset rispettivo).
            </p>
            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Offset X (mm)</label>
                <Input onFocus={e => e.currentTarget.select()} type="number" step="0.5" min="0" className="mt-1 h-9 text-sm"
                  value={form.offset_x_mm || ''}
                  onChange={e => setOffset({ x: parseDecimal(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Offset Y (mm)</label>
                <Input onFocus={e => e.currentTarget.select()} type="number" step="0.5" min="0" className="mt-1 h-9 text-sm"
                  value={form.offset_y_mm || ''}
                  onChange={e => setOffset({ y: parseDecimal(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Grezzo X (mm)</label>
                <Input onFocus={e => e.currentTarget.select()} type="number" step="0.5" min="0" className="mt-1 h-9 text-sm"
                  value={form.raw_x_mm || ''}
                  onChange={e => set('raw_x_mm', parseDecimal(e.target.value) || 0)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Grezzo Y (mm)</label>
                <Input onFocus={e => e.currentTarget.select()} type="number" step="0.5" min="0" className="mt-1 h-9 text-sm"
                  value={form.raw_y_mm || ''}
                  onChange={e => set('raw_y_mm', parseDecimal(e.target.value) || 0)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Grezzo Z (mm)</label>
                <div className="mt-1 h-9 px-2 flex items-center text-sm rounded-md border bg-muted/40">
                  {form.cut_height_mm ? `${form.cut_height_mm} mm` : <span className="text-muted-foreground text-xs">= altezza pezzo</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button size="lg" className="w-full" onClick={submit} disabled={submitting}>
          {submitting ? 'Creazione in corso...' : 'Crea Preventivo →'}
        </Button>

    </div>
  )
}
