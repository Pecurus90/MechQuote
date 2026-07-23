// Container unico del wizard 2D-DXF: carica dati di riferimento, gestisce
// lo stato DXF (upload/analisi/selezione profili) e lo stato form, ed esegue
// il submit multi-step. La grafica sta in Dxf2dWizardView (design handoff);
// il viewer è DxfProfileCanvas (interattivo: zoom/pan/hover) nello slot `viewer`.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Scan, Upload } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { buildCatalogOptions } from '@/lib/catalogSelect'
import { parseDecimal } from '@/lib/decimalInput'
import { useUnsavedGuard } from '@/lib/useUnsavedGuard'
import { checkUploadFile } from '@/lib/uploadValidation'
import type {
  Category, Customer, Material, CuttingCycle, DrillingTime,
  EdmConfig, Machine, Operation, Phase, DxfAnalysis, DxfBbox,
} from '@/types'
import DxfProfileCanvas from '@/components/quotes/Dxf/DxfProfileCanvas'
import DxfUnitToggle from '@/components/quotes/Dxf/DxfUnitToggle'
import { useDxfUnit } from '@/lib/dxfUnits'
import { Dxf2dWizardView, type Dxf2dValue, type DxfProfileRow, type SelectOption } from '@/pages/quotes/Dxf2dWizardView'

type DrillingMode = 'foratrice_edm' | 'piastra_preforata'

interface FormState {
  customer_id: string
  customer_name: string
  customer_code: string
  year: string
  category_code: string
  progressive: string
  default_quantity: number
  quote_date: string
  description: string
  material_id: string
  cut_height_mm: number
  raw_x_mm: number
  raw_y_mm: number
  offset_x_mm: number
  offset_y_mm: number
  cutting_cycle_id: string
  drilling_mode: DrillingMode
  electrode_diameter_mm: number
  n_holes: number
}

const initialForm = (categories: Category[]): FormState => ({
  customer_id: '', customer_name: '', customer_code: '',
  year: new Date().getFullYear().toString().slice(-2),
  category_code: categories[0]?.code || 'A',
  progressive: '', default_quantity: 1,
  quote_date: new Date().toISOString().split('T')[0],
  description: '', material_id: '', cut_height_mm: 0,
  raw_x_mm: 0, raw_y_mm: 0, offset_x_mm: 0, offset_y_mm: 0,
  cutting_cycle_id: '', drilling_mode: 'foratrice_edm',
  electrode_diameter_mm: 0, n_holes: 0,
})

function lookupDrillingSecondsPerHole(
  rows: DrillingTime[], materialFamily: string, electrodeDiameter: number, partHeight: number,
): number | null {
  const row = rows.find(r => r.material_family === materialFamily && r.electrode_diameter_mm === electrodeDiameter)
  if (!row || !row.speed_mm_per_sec) return null
  return partHeight / row.speed_mm_per_sec
}
function findOperation(ops: Operation[], exact: string, keyword: string): Operation | undefined {
  return ops.find(o => o.name === exact) ?? ops.find(o => o.name.toLowerCase().includes(keyword.toLowerCase()))
}
const round1 = (n: number) => Math.round(n * 10) / 10
const num = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 })

export default function NewQuote2DPage() {
  const navigate = useNavigate()

  // ─── dati di riferimento ────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [cycles, setCycles] = useState<CuttingCycle[]>([])
  const [drillingRows, setDrillingRows] = useState<DrillingTime[]>([])
  const [edmConfig, setEdmConfig] = useState<EdmConfig | null>(null)
  const [machines, setMachines] = useState<Machine[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  const [loadingRefs, setLoadingRefs] = useState(true)

  // ─── stato DXF (ex DxfProfilePicker) ────────────────────────────────────
  const [dxfFile, setDxfFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<DxfAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  // Override unità mm/pollici (fonte unica in lib/dxfUnits): alcuni CAD
  // dichiarano l'unità sbagliata (es. $INSUNITS=pollici ma disegno in mm).
  // unitScale riporta ai mm reali le misure che finiscono nel preventivo.
  const { unit, setUnit, overridable, unitScale } = useDxfUnit(analysis)

  // ─── stato form ─────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormState>(initialForm([]))
  const [submitting, setSubmitting] = useState(false)
  const loadedRef = useRef(false)

  // AUD-28: una volta caricato il DXF c'è lavoro reale (profili + campi) →
  // avvisa se si tenta di ricaricare/chiudere la tab. Disattivo mentre salvo.
  useUnsavedGuard(!!dxfFile && !submitting)

  useEffect(() => {
    Promise.all([
      api.get('/quote-categories'), api.get('/customers'), api.get('/materials?active=true'),
      api.get('/cutting-cycles'), api.get('/drilling-times'), api.get('/edm-config'),
      api.get('/machines'), api.get('/operations'),
    ]).then(([cat, cus, mat, cyc, dr, cfg, mc, ops]) => {
      setCategories(cat.data); setCustomers(cus.data); setMaterials(mat.data)
      setCycles(cyc.data); setDrillingRows(dr.data); setEdmConfig(cfg.data)
      setMachines(mc.data); setOperations(ops.data)
      if (!loadedRef.current) { setForm(f => ({ ...f, category_code: f.category_code || cat.data[0]?.code || 'A' })); loadedRef.current = true }
    }).catch(() => toast.error('Errore nel caricamento dei dati di riferimento'))
      .finally(() => setLoadingRefs(false))
  }, [])

  // ─── derived DXF ─────────────────────────────────────────────────────────
  const selectedProfiles = useMemo(
    () => analysis?.profiles.filter(p => selectedIds.has(p.id)) ?? [],
    [analysis, selectedIds])
  const selectedLengthMm = useMemo(() => selectedProfiles.reduce((s, p) => s + p.length_mm, 0) * unitScale, [selectedProfiles, unitScale])
  const selectedClosedCount = useMemo(() => selectedProfiles.filter(p => p.closed).length, [selectedProfiles])
  const selectedBbox = useMemo<DxfBbox | null>(() => {
    if (selectedProfiles.length === 0) return null
    const x0 = Math.min(...selectedProfiles.map(p => p.bbox.x))
    const y0 = Math.min(...selectedProfiles.map(p => p.bbox.y))
    const x1 = Math.max(...selectedProfiles.map(p => p.bbox.x + p.bbox.w))
    const y1 = Math.max(...selectedProfiles.map(p => p.bbox.y + p.bbox.h))
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }, [selectedProfiles])

  const baseBboxW = (analysis ? (selectedBbox?.w ?? analysis.bbox_global.w) : 0) * unitScale
  const baseBboxH = (analysis ? (selectedBbox?.h ?? analysis.bbox_global.h) : 0) * unitScale
  const dxfFileName = dxfFile?.name.replace(/\.dxf$/i, '') ?? ''

  // Ricalcola grezzo da bbox+offset quando cambia la selezione / il file.
  useEffect(() => {
    if (!analysis) return
    setForm(f => ({
      ...f,
      raw_x_mm: round1(baseBboxW + 2 * f.offset_x_mm),
      raw_y_mm: round1(baseBboxH + 2 * f.offset_y_mm),
      description: f.description ? f.description : dxfFileName,
    }))
  }, [analysis, baseBboxW, baseBboxH, dxfFileName])

  // ─── DXF actions ─────────────────────────────────────────────────────────
  const toggleProfile = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allSelected = !!analysis && selectedIds.size === analysis.profiles.length && analysis.profiles.length > 0
  const toggleAll = () => {
    if (!analysis) return
    setSelectedIds(allSelected ? new Set() : new Set(analysis.profiles.map(p => p.id)))
  }
  const changeFile = () => { setDxfFile(null); setAnalysis(null); setSelectedIds(new Set()) }

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dxf')) { toast.error('Solo file .dxf supportati'); return }
    const fileErr = checkUploadFile(file, { maxMB: 50 })  // AUD-32: evita l'invio di file oversize
    if (fileErr) { toast.error(fileErr); return }
    setDxfFile(file); setAnalyzing(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await api.post<DxfAnalysis>('/dxf/analyze', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setAnalysis(res.data)
      setSelectedIds(new Set(res.data.profiles.filter(p => p.closed).map(p => p.id)))
      if (res.data.units && res.data.units !== 'mm' && res.data.units !== 'unitless') {
        toast.warning(`Unità DXF rilevate: ${res.data.units}. Verifica le dimensioni.`)
      }
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || "Errore nell'analisi del DXF")
      setDxfFile(null)
    } finally { setAnalyzing(false) }
  }

  // ─── derived form ────────────────────────────────────────────────────────
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))
  const setOffset = (axis: 'x' | 'y', v: number) => setForm(f => {
    const nx = axis === 'x' ? v : f.offset_x_mm
    const ny = axis === 'y' ? v : f.offset_y_mm
    return { ...f, offset_x_mm: nx, offset_y_mm: ny, raw_x_mm: round1(baseBboxW + 2 * nx), raw_y_mm: round1(baseBboxH + 2 * ny) }
  })

  const partFamily = useMemo(() => materials.find(m => m.id === Number(form.material_id))?.family ?? null, [materials, form.material_id])
  const availableElectrodeDiameters = useMemo(() => {
    if (!partFamily) return [] as number[]
    const s = new Set<number>()
    for (const r of drillingRows) if (r.material_family === partFamily) s.add(r.electrode_diameter_mm)
    return Array.from(s).sort((a, b) => a - b)
  }, [drillingRows, partFamily])
  const drillSecondsPerHole = useMemo(() => {
    if (form.drilling_mode !== 'foratrice_edm') return null
    if (!partFamily || !form.cut_height_mm || !form.electrode_diameter_mm) return null
    return lookupDrillingSecondsPerHole(drillingRows, partFamily, form.electrode_diameter_mm, form.cut_height_mm)
  }, [form.drilling_mode, partFamily, form.cut_height_mm, form.electrode_diameter_mm, drillingRows])
  const drillTotalSeconds = drillSecondsPerHole != null && form.n_holes > 0 ? drillSecondsPerHole * form.n_holes : null

  const quoteNumber = form.customer_code && form.progressive
    ? `${form.customer_code}-${form.year}${form.category_code}_${form.progressive.padStart(3, '0')}` : ''

  // ─── validate + submit (invariati dalla logica esistente) ────────────────
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
      if (!form.electrode_diameter_mm || form.electrode_diameter_mm <= 0) errs.push('Ø elettrodo (modalità Foratrice EDM)')
      if (!edmConfig?.default_drilling_machine_id) errs.push('Foratrice EDM di default (Impostazioni → Wire EDM)')
    }
    if (!machines.find(m => m.machine_type === 'wire_edm')) errs.push("Nessuna macchina 'wire_edm' configurata")
    if (form.material_id) {
      const mat = materials.find(m => m.id === Number(form.material_id))
      if (mat) {
        const missing: string[] = []
        if (!mat.density_kg_dm3 || mat.density_kg_dm3 <= 0) missing.push('densità')
        if (!mat.cost_per_kg || mat.cost_per_kg <= 0) missing.push('costo/kg')
        if (missing.length) errs.push(`Materiale "${mat.name}" senza ${missing.join(' e ')}`)
      }
    }
    return errs
  }

  const submit = async () => {
    const errs = validate()
    if (errs.length > 0) { toast.error(`Mancano: ${errs.join(', ')}`); return }
    // Recupera customer_id per match del codice cliente (no autocomplete nel View).
    let customerId = form.customer_id
    if (!customerId && form.customer_code) {
      const match = customers.find(c => String(c.customer_number).padStart(3, '0') === form.customer_code)
      if (match) customerId = String(match.id)
    }
    setSubmitting(true)
    // Traccia il preventivo creato: se uno step successivo (parte/file/fasi)
    // fallisce, lo eliminiamo per non lasciare un orfano incompleto e liberare
    // il numero per un nuovo tentativo (audit M7 — submit non atomico).
    let createdQuoteId: number | null = null
    try {
      const quoteRes = await api.post('/quotes', {
        quote_number: quoteNumber, quote_type: 'single',
        default_quantity: form.default_quantity,
        customer_id: customerId ? Number(customerId) : undefined,
        customer_name: form.customer_name || undefined,
        quote_date: form.quote_date,
      })
      const quoteId = quoteRes.data?.id
      const partId = quoteRes.data?.parts?.[0]?.id
      if (typeof quoteId !== 'number') throw new Error(`Risposta /quotes priva di id: ${JSON.stringify(quoteRes.data)}`)
      createdQuoteId = quoteId
      if (typeof partId !== 'number') throw new Error('Part non trovata dopo creazione preventivo')

      await api.put(`/parts/${partId}`, {
        description: form.description, material_id: Number(form.material_id),
        raw_x_mm: form.raw_x_mm, raw_y_mm: form.raw_y_mm, raw_z_mm: form.cut_height_mm, quote_mode: 'dxf',
      })
      const fd = new FormData(); fd.append('file', dxfFile as File)
      await api.post(`/parts/${partId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })

      const wireEdmMachine = machines.find(m => m.machine_type === 'wire_edm')
      const edmOperation = findOperation(operations, 'EDM a filo', 'edm')
      const edmRes = await api.post<Phase>(`/parts/${partId}/phases`, {
        sequence_number: 10, phase_type: '', operation_id: edmOperation?.id,
        description: `Taglio EDM filo (${selectedProfiles.length} profili)`,
        machine_id: wireEdmMachine?.id, cut_length_mm: Math.round(selectedLengthMm * 100) / 100,
        cut_height_mm: form.cut_height_mm, cutting_cycle_id: Number(form.cutting_cycle_id),
        n_pierce: form.n_holes, dxf_profile_ids: Array.from(selectedIds),
        setup_hours: wireEdmMachine?.setup_minimum_hours ?? 0,
        cycle_hours_per_part: 0, fixed_cost: 0, variable_cost_per_part: 0,
      })
      if ((edmRes.data?.cycle_hours_per_part ?? 0) <= 0) {
        toast.warning('Autocalc EDM non attivato: la fase ha 0 ore. Verifica EdmCutSpeed o aggiusta manualmente.')
      }
      if (form.drilling_mode === 'foratrice_edm') {
        if (drillTotalSeconds != null && form.n_holes > 0 && edmConfig?.default_drilling_machine_id) {
          const drillingMachine = machines.find(m => m.id === edmConfig.default_drilling_machine_id)
          const drillingOperation = findOperation(operations, 'Foratura', 'foratura')
          await api.post(`/parts/${partId}/phases`, {
            sequence_number: 5, phase_type: '', operation_id: drillingOperation?.id,
            description: `Foratura ${form.n_holes} fori Ø${form.electrode_diameter_mm} mm`,
            machine_id: edmConfig.default_drilling_machine_id,
            setup_hours: drillingMachine?.setup_minimum_hours ?? 0,
            cycle_hours_per_part: Math.round((drillTotalSeconds / 3600) * 10000) / 10000,
            fixed_cost: 0, variable_cost_per_part: 0,
          })
        } else if (drillTotalSeconds == null) {
          toast.warning('Nessuna velocità foratura in tabella: aggiungi la fase manualmente')
        }
      }
      toast.success('Preventivo creato')
      navigate(`/quotes/${quoteId}`)
    } catch (e) {
      // Rollback dell'orfano: il preventivo era già creato ma il resto è fallito.
      // Best-effort: se anche la delete fallisce, avvisiamo di controllare a mano.
      let rolledBack = true
      if (createdQuoteId != null) {
        try { await api.delete(`/quotes/${createdQuoteId}`) } catch { rolledBack = false }
      }
      const err = e as { message?: string; response?: { status?: number; data?: { detail?: string } } }
      const base = err?.response?.data?.detail || err?.message || 'Errore nella creazione del preventivo'
      toast.error(
        createdQuoteId != null && !rolledBack
          ? `${base}. Attenzione: un preventivo parziale potrebbe essere rimasto — controlla l'archivio.`
          : base,
      )
    } finally { setSubmitting(false) }
  }

  // ─── props presentazionali ───────────────────────────────────────────────
  const onFieldChange = (field: keyof Dxf2dValue, val: string) => {
    switch (field) {
      case 'customerName': setForm(f => ({ ...f, customer_id: '', customer_name: val })); break
      case 'customerCode': set('customer_code', val.replace(/\D/g, '').slice(0, 3)); break
      case 'year': set('year', val.replace(/\D/g, '').slice(0, 2)); break
      case 'categoryCode': set('category_code', val.toUpperCase().slice(0, 2)); break
      case 'progressive': set('progressive', val.replace(/\D/g, '').slice(0, 3)); break
      case 'quantity': set('default_quantity', Math.max(1, parseInt(val, 10) || 1)); break
      case 'date': set('quote_date', val); break
      case 'description': set('description', val); break
      case 'materialId': set('material_id', val); break
      case 'pieceHeight': set('cut_height_mm', parseDecimal(val) || 0); break
      case 'cuttingCycleId': set('cutting_cycle_id', val); break
      case 'foriMode': set('drilling_mode', val as DrillingMode); break
      case 'electrodeDiameter': set('electrode_diameter_mm', parseDecimal(val) || 0); break
      case 'nPreholes':
      case 'nInfilaggi': set('n_holes', parseInt(val, 10) || 0); break
      case 'offsetX': setOffset('x', parseDecimal(val) || 0); break
      case 'offsetY': setOffset('y', parseDecimal(val) || 0); break
      case 'rawX': set('raw_x_mm', parseDecimal(val) || 0); break
      case 'rawY': set('raw_y_mm', parseDecimal(val) || 0); break
      case 'rawZ': break
    }
  }

  const custFiltered = useMemo(() => {
    const q = form.customer_name.trim().toLowerCase().replace(/\./g, '')
    if (!q) return [] as Customer[]
    return customers.filter(c => String(c.customer_number).includes(q) || c.name.toLowerCase().replace(/\./g, '').includes(q)).slice(0, 10)
  }, [customers, form.customer_name])
  const selectCust = (id: number) => {
    const c = customers.find(x => x.id === id); if (!c) return
    setForm(f => ({ ...f, customer_id: String(c.id), customer_name: c.name, customer_code: String(c.customer_number).padStart(3, '0') }))
  }

  const value: Dxf2dValue = {
    customerName: form.customer_name, customerCode: form.customer_code, year: form.year,
    categoryCode: form.category_code, progressive: form.progressive,
    quantity: String(form.default_quantity),
    date: form.quote_date, description: form.description, materialId: form.material_id,
    pieceHeight: form.cut_height_mm ? String(form.cut_height_mm) : '',
    cuttingCycleId: form.cutting_cycle_id, foriMode: form.drilling_mode,
    electrodeDiameter: form.electrode_diameter_mm ? String(form.electrode_diameter_mm) : '',
    nPreholes: form.n_holes ? String(form.n_holes) : '', nInfilaggi: form.n_holes ? String(form.n_holes) : '',
    offsetX: form.offset_x_mm ? String(form.offset_x_mm) : '', offsetY: form.offset_y_mm ? String(form.offset_y_mm) : '',
    rawX: form.raw_x_mm ? String(form.raw_x_mm) : '', rawY: form.raw_y_mm ? String(form.raw_y_mm) : '',
    rawZ: form.cut_height_mm ? String(form.cut_height_mm) : '',
  }

  const profileRows: DxfProfileRow[] = (analysis?.profiles ?? []).map(p => ({
    id: p.id, closed: p.closed, selected: selectedIds.has(p.id),
    lengthLabel: `${num(p.length_mm)} mm`,
    bboxLabel: p.closed ? `${Math.round(p.bbox.w)}×${Math.round(p.bbox.h)}` : '—',
  }))
  const materialOpts: SelectOption[] = buildCatalogOptions(materials, form.material_id ? Number(form.material_id) : null, null, m => m.name)
    .map(o => ({ value: String(o.value), label: o.label }))
  const cycleOpts: SelectOption[] = cycles.map(c => ({ value: String(c.id), label: `${c.name} (${c.passes.length} passate)` }))
  const electrodeOpts: SelectOption[] = availableElectrodeDiameters.map(d => ({ value: String(d), label: `Ø ${d} mm` }))
  const drillEstimate = drillTotalSeconds != null
    ? `≈ ${drillTotalSeconds < 60 ? `${drillTotalSeconds.toFixed(0)} s` : `${num(drillTotalSeconds / 60)} min`}`
    : undefined

  if (loadingRefs) return <div className="p-8 text-center text-muted-foreground">Caricamento...</div>

  // Stato senza DXF: dropzone.
  if (!analysis) {
    return (
      <div className="mx-auto max-w-[1280px] p-6">
        <div className="rounded-2xl border border-border bg-card px-8 pb-9 pt-[30px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="mb-6 flex items-start gap-3.5">
            <button type="button" onClick={() => navigate('/quotes/new')}
              className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground transition-colors hover:text-foreground">
              <ChevronLeft className="h-[19px] w-[19px]" />
            </button>
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] bg-confirmed/[0.13] text-confirmed">
              <Scan className="h-[23px] w-[23px]" />
            </div>
            <div>
              <h2 className="mb-[3px] text-[22px] font-bold tracking-tight text-foreground">Nuovo Preventivo 2D</h2>
              <p className="text-[13.5px] text-muted-foreground">Carica un DXF: profili, taglio EDM e grezzo calcolati dal disegno</p>
            </div>
          </div>
          <label htmlFor="dxf-input" onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            className="block cursor-pointer rounded-xl border-2 border-dashed border-border p-12 text-center transition-colors hover:border-confirmed/50 hover:bg-muted/40">
            <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Trascina qui un file DXF o clicca per selezionarlo</p>
            <p className="mt-1 text-xs text-muted-foreground">Solo formato .dxf · max 50 MB</p>
            {analyzing && <p className="mt-2 animate-pulse text-xs text-confirmed">Analisi in corso…</p>}
            <input id="dxf-input" type="file" accept=".dxf" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <Dxf2dWizardView
        viewer={
          <div className="p-2">
            {overridable && <DxfUnitToggle unit={unit} onChange={setUnit} className="mb-2" />}
            <DxfProfileCanvas analysis={analysis} selectedIds={selectedIds} onToggle={toggleProfile} height={320} rawX={form.raw_x_mm} rawY={form.raw_y_mm} unitScale={unitScale} />
          </div>
        }
        fileName={dxfFile?.name ?? '—'}
        fileMeta={`${analysis.profiles.length} profili${dxfFile ? ` · ${(dxfFile.size / 1e6).toFixed(1)} MB` : ''}`}
        onChangeFile={changeFile}
        profiles={profileRows}
        allSelected={allSelected}
        onToggleProfile={toggleProfile}
        onToggleAll={toggleAll}
        selectedCount={selectedProfiles.length}
        cutLengthLabel={`${num(selectedLengthMm)} mm`}
        closedCount={selectedClosedCount}
        warnings={analysis.warnings}
        materials={materialOpts}
        cuttingCycles={cycleOpts}
        electrodeDiameters={electrodeOpts}
        drillTimeEstimate={drillEstimate}
        previewNumber={quoteNumber}
        value={value}
        onChange={onFieldChange}
        customers={custFiltered.map(c => ({ id: c.id, name: c.name }))}
        onSelectCustomer={selectCust}
        onBack={() => navigate('/quotes/new')}
        saving={submitting}
        onCreate={submit}
      />
    </div>
  )
}
