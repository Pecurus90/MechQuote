// Wizard nuovo preventivo stampo a 2 step:
//   Step 1 — composizione codice (cliente + anno + categoria + progressivo,
//            stessa formula di QuoteWizard standard/2D) + scelta tipologia
//            (blocco vs passo).
//   Step 2 — geometria pezzo (DXF upload o manuale), template (filtrato
//            per subtype), parametri striscia/castello, difficoltà, feature,
//            con due render SVG live (top-view + side-view) nella colonna dx.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Hammer, Square, Layers, ArrowLeft, Upload, FileText, X } from 'lucide-react'

import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  Customer, Category, DieTemplate, DieSettings, DieSubtype, DieDifficulty,
  DxfAnalysis,
} from '@/types'
import DieTopView from '@/components/quotes/die/DieTopView'
import DieSideView from '@/components/quotes/die/DieSideView'
import { computeDieGeometry } from '@/lib/dieCalc'

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <label className={`text-xs font-medium text-gray-600 block mb-1 ${className}`}>{children}</label>
}

/** Toggle "pill" ad alta visibilità per scelte multi-opzione (modalità,
 *  difficoltà, tipologia). I Button variant=default/outline standard non
 *  segnalano abbastanza la selezione attiva: questo segmented riempie di
 *  rosa il bottone attivo + bordo spesso, hover state preview rosa chiaro. */
function SegmentedButton({
  selected, onClick, children, disabled = false,
}: { selected: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
        disabled
          ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
          : selected
            ? 'border-rose-600 bg-rose-600 text-white shadow-sm'
            : 'border-gray-200 bg-white text-gray-700 hover:border-rose-300 hover:text-rose-700 hover:bg-rose-50/50'
      }`}
    >
      {children}
    </button>
  )
}

type Step = 'code' | 'settings'

export default function NewDieQuotePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('code')

  // ─── State condiviso fra step ────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [templates, setTemplates] = useState<DieTemplate[]>([])
  const [dieSettings, setDieSettings] = useState<DieSettings | null>(null)

  // Step 1
  const currentYear = new Date().getFullYear().toString().slice(-2)
  const [customerId, setCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  const [customerCode, setCustomerCode] = useState<string>('')
  const [customerReference, setCustomerReference] = useState<string>('')
  const [year, setYear] = useState<string>(currentYear)
  const [categoryCode, setCategoryCode] = useState<string>('')
  const [progressive, setProgressive] = useState<string>('')
  const [subtype, setSubtype] = useState<DieSubtype | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

  // Step 2 — geometria
  const [bboxX, setBboxX] = useState<string>('')
  const [bboxY, setBboxY] = useState<string>('')
  const [sheetThickness, setSheetThickness] = useState<string>('')
  const [dxfAnalysis, setDxfAnalysis] = useState<DxfAnalysis | null>(null)
  const [dxfFileName, setDxfFileName] = useState<string>('')
  const [manualGeometry, setManualGeometry] = useState(false)  // toggle anche se DXF caricato

  // Step 2 — template & parametri
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [nStations, setNStations] = useState<string>('3')
  const [pitchMm, setPitchMm] = useState<string>('')
  const [stripOffsetY, setStripOffsetY] = useState<string>('10')
  const [blockOffset, setBlockOffset] = useState<string>('50')
  const [castleOffsetX, setCastleOffsetX] = useState<string>('')
  const [castleOffsetY, setCastleOffsetY] = useState<string>('')

  // Step 2 — feature
  const [difficulty, setDifficulty] = useState<DieDifficulty>('base')
  const [nBendsS, setNBendsS] = useState('0')
  const [nBendsM, setNBendsM] = useState('0')
  const [nBendsC, setNBendsC] = useState('0')
  const [nPunchesS, setNPunchesS] = useState('0')
  const [nPunchesM, setNPunchesM] = useState('0')
  const [nPunchesC, setNPunchesC] = useState('0')
  // Consegna / extras / note: gestiti post-creazione nell'editor (UX più
  // pulita allo Step 2, valori opzionali che possono restare a default).

  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  // ─── Load anagrafiche ─────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/customers'),
      api.get('/quote-categories'),
      api.get('/die-settings/templates'),
      api.get('/die-settings'),
    ]).then(([c, cat, t, s]) => {
      setCustomers(c.data)
      setCategories(cat.data)
      setTemplates(t.data)
      setDieSettings(s.data)
      if (cat.data.length > 0 && !categoryCode) setCategoryCode(cat.data[0].code)
      // Default offset castello da DieSettings
      if (s.data) {
        setCastleOffsetX(String(s.data.default_castle_offset_x_mm ?? 80))
        setCastleOffsetY(String(s.data.default_castle_offset_y_mm ?? 80))
      }
    }).catch(() => toast.error('Errore caricamento dati'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Click-outside del combobox cliente
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node))
        setCustomerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return [] as Customer[]
    return customers.filter(c =>
      String(c.customer_number).includes(q) || c.name.toLowerCase().includes(q)
    ).slice(0, 10)
  }, [customers, customerSearch])

  const selectCustomer = (c: Customer) => {
    setCustomerId(String(c.id))
    setCustomerName(c.name)
    setCustomerCode(String(c.customer_number).padStart(3, '0'))
    setCustomerSearch('')
    setCustomerOpen(false)
  }

  // Composizione codice (identica a QuoteWizard.tsx:66)
  const quoteNumber = customerCode && progressive
    ? `${customerCode}-${year}${categoryCode}_${progressive.padStart(3, '0')}`
    : ''

  const filteredTemplates = useMemo(
    () => templates.filter(t => !subtype || t.die_subtype === subtype),
    [templates, subtype],
  )

  const selectedTemplate = useMemo(
    () => templates.find(t => t.id === templateId) || null,
    [templates, templateId],
  )

  const geom = useMemo(() => computeDieGeometry({
    subtype: subtype || 'blocco',
    bboxX: parseFloat(bboxX) || 0,
    bboxY: parseFloat(bboxY) || 0,
    nStations: parseInt(nStations, 10) || 1,
    pitchMm: parseFloat(pitchMm) || 0,
    stripOffsetY: parseFloat(stripOffsetY) || 0,
    blockOffset: parseFloat(blockOffset) || 0,
    castleOffsetX: parseFloat(castleOffsetX) || 0,
    castleOffsetY: parseFloat(castleOffsetY) || 0,
  }), [subtype, bboxX, bboxY, nStations, pitchMm, stripOffsetY, blockOffset, castleOffsetX, castleOffsetY])

  // Auto-fill del passo: appena bboxX viene compilato (DXF o manuale), se il
  // pitch è ancora vuoto e siamo in modalità passo, pre-popola con bboxX
  // (caso minimo: pezzi adiacenti senza gap, ridimensionabile dall'utente).
  useEffect(() => {
    if (subtype !== 'passo') return
    if (pitchMm !== '') return
    const bx = parseFloat(bboxX)
    if (bx > 0) setPitchMm(String(bx))
  }, [subtype, bboxX, pitchMm])

  // Quando l'utente seleziona un template, pre-compila feature (overwrite con preferenze del template).
  useEffect(() => {
    if (!selectedTemplate) return
    setDifficulty(selectedTemplate.default_difficulty)
    if (selectedTemplate.suggested_stations) setNStations(String(selectedTemplate.suggested_stations))
    setNBendsS(String(selectedTemplate.suggested_n_bends_simple))
    setNBendsM(String(selectedTemplate.suggested_n_bends_medium))
    setNBendsC(String(selectedTemplate.suggested_n_bends_complex))
    setNPunchesS(String(selectedTemplate.suggested_n_punches_simple))
    setNPunchesM(String(selectedTemplate.suggested_n_punches_medium))
    setNPunchesC(String(selectedTemplate.suggested_n_punches_complex))
  }, [selectedTemplate])

  // ─── Step 1 → Step 2 transition ──────────────────────────────────────────
  const canProceed = !!(customerCode && progressive && categoryCode && year)
  const proceedTo = (s: DieSubtype) => {
    if (!canProceed) {
      toast.error('Compila cliente, categoria e progressivo prima di scegliere il tipo')
      return
    }
    setSubtype(s)
    setStep('settings')
  }

  // ─── DXF upload ───────────────────────────────────────────────────────────
  const handleDxfUpload = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/dxf/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const analysis: DxfAnalysis = res.data
      setDxfAnalysis(analysis)
      setDxfFileName(file.name)
      // Auto-popola bbox X/Y dal bbox globale del DXF
      setBboxX(analysis.bbox_global.w.toFixed(1))
      setBboxY(analysis.bbox_global.h.toFixed(1))
      setManualGeometry(false)
      toast.success(`DXF caricato: ${analysis.profiles.length} profili, bbox ${analysis.bbox_global.w.toFixed(0)}×${analysis.bbox_global.h.toFixed(0)} mm`)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore parsing DXF')
    } finally {
      setUploading(false)
    }
  }

  const clearDxf = () => {
    setDxfAnalysis(null)
    setDxfFileName('')
    setManualGeometry(true)
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!quoteNumber) {
      toast.error('Codice preventivo incompleto')
      return
    }
    if (!subtype) {
      toast.error('Tipologia stampo non selezionata')
      return
    }
    const bx = parseFloat(bboxX) || 0
    const by = parseFloat(bboxY) || 0
    if (bx <= 0 || by <= 0) {
      toast.error('Dimensioni pezzo (X, Y) obbligatorie')
      return
    }
    if (subtype === 'passo') {
      const p = parseFloat(pitchMm) || 0
      if (p <= 0) {
        toast.error('Passo obbligatorio per stampi progressivi')
        return
      }
    }
    setSaving(true)
    try {
      const payload = {
        quote_number: quoteNumber,
        customer_id: customerId ? Number(customerId) : undefined,
        customer_name: customerName || undefined,
        customer_reference: customerReference || undefined,
        template_id: templateId ?? undefined,
        spec: {
          die_subtype: subtype,
          bbox_x_mm: bx,
          bbox_y_mm: by,
          sheet_thickness_mm: parseFloat(sheetThickness) || 0,
          n_stations: subtype === 'passo' ? (parseInt(nStations, 10) || 1) : undefined,
          pitch_mm: subtype === 'passo' && pitchMm ? parseFloat(pitchMm) : undefined,
          strip_offset_y_mm: subtype === 'passo' ? (parseFloat(stripOffsetY) || 0) : 0,
          block_strip_offset_mm: subtype === 'blocco' ? (parseFloat(blockOffset) || 0) : 0,
          castle_offset_x_mm: parseFloat(castleOffsetX) || 0,
          castle_offset_y_mm: parseFloat(castleOffsetY) || 0,
          difficulty,
          n_bends_simple: parseInt(nBendsS, 10) || 0,
          n_bends_medium: parseInt(nBendsM, 10) || 0,
          n_bends_complex: parseInt(nBendsC, 10) || 0,
          n_punches_simple: parseInt(nPunchesS, 10) || 0,
          n_punches_medium: parseInt(nPunchesM, 10) || 0,
          n_punches_complex: parseInt(nPunchesC, 10) || 0,
        },
      }
      const res = await api.post('/dies', payload)
      toast.success('Preventivo stampo creato')
      navigate(`/quotes/${res.data.id}`)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore creazione preventivo')
    } finally {
      setSaving(false)
    }
  }

  // ─── STEP 1: composizione codice + scelta tipologia ──────────────────────
  if (step === 'code') {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
            <Hammer className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Nuovo Preventivo Stampo</h1>
            <p className="text-xs text-gray-500">Componi il codice e scegli la tipologia</p>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Cliente & codice preventivo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <div ref={customerRef} className="relative">
                <Input
                  className="h-9"
                  placeholder="Cerca per nome o codice cliente…"
                  value={customerSearch || customerName}
                  onFocus={() => setCustomerOpen(true)}
                  onChange={e => {
                    setCustomerSearch(e.target.value)
                    setCustomerOpen(true)
                    setCustomerId('')
                    setCustomerName(e.target.value)
                  }}
                />
                {customerOpen && filteredCustomers.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-rose-50 flex items-center gap-3 border-b last:border-0"
                        onMouseDown={e => { e.preventDefault(); selectCustomer(c) }}
                      >
                        <span className="font-mono text-xs text-gray-400 w-10 shrink-0">
                          {String(c.customer_number).padStart(3, '0')}
                        </span>
                        <span className="text-sm">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {customerId && (
                  <p className="mt-1 text-xs text-rose-700 font-medium">
                    ✓ {customerCode} — {customerName}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label>Codice preventivo</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  className="w-16 text-center font-mono h-9"
                  maxLength={3}
                  value={customerCode}
                  onChange={e => setCustomerCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                />
                <span className="text-gray-400">-</span>
                <Input
                  className="w-12 text-center font-mono h-9"
                  maxLength={2}
                  value={year}
                  onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 2))}
                />
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm font-mono w-40"
                  value={categoryCode}
                  onChange={e => setCategoryCode(e.target.value)}
                >
                  {categories.map(c => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
                <span className="text-gray-400">_</span>
                <Input
                  className="w-20 text-center font-mono h-9"
                  maxLength={3}
                  value={progressive}
                  onChange={e => setProgressive(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="001"
                />
              </div>
              {quoteNumber && (
                <p className="mt-2.5 text-sm font-mono font-semibold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg inline-block">
                  {quoteNumber}
                </p>
              )}
            </div>

            <div>
              <Label>Riferimento cliente (opzionale)</Label>
              <Input value={customerReference} onChange={e => setCustomerReference(e.target.value)} placeholder="es. RDA-2026-001" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tipologia stampo</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                disabled={!canProceed}
                onClick={() => proceedTo('blocco')}
                className={`relative p-6 rounded-xl border-2 text-left transition-all ${
                  canProceed
                    ? 'border-rose-200 hover:border-rose-500 hover:shadow-md cursor-pointer bg-white'
                    : 'border-gray-200 opacity-50 cursor-not-allowed bg-gray-50'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
                  <Square className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg">Stampo a Blocco</h3>
                <p className="text-sm text-gray-500 mt-1">Tranciatura/piega a stazione singola: il pezzo entra in un'unica posizione e tutte le operazioni avvengono nello stesso punto.</p>
              </button>

              <button
                type="button"
                disabled={!canProceed}
                onClick={() => proceedTo('passo')}
                className={`relative p-6 rounded-xl border-2 text-left transition-all ${
                  canProceed
                    ? 'border-rose-200 hover:border-rose-500 hover:shadow-md cursor-pointer bg-white'
                    : 'border-gray-200 opacity-50 cursor-not-allowed bg-gray-50'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg">Stampo a Passo (Progressivo)</h3>
                <p className="text-sm text-gray-500 mt-1">Striscia che avanza di un passo a ogni colpo: tranciatura/piega in N stazioni successive, pezzo finito all'ultima.</p>
              </button>
            </div>
            {!canProceed && (
              <p className="text-xs text-amber-600 mt-3">Compila cliente, categoria e progressivo per sbloccare la scelta.</p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── STEP 2: settings + render live ──────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('code')} className="text-gray-500 hover:text-rose-700 flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Cambia codice / tipo
          </button>
          <div className="text-sm font-mono font-semibold text-rose-700 bg-rose-50 px-3 py-1 rounded">{quoteNumber}</div>
          <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">
            {subtype === 'passo' ? 'A Passo (Progressivo)' : 'A Blocco'}
          </span>
        </div>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Creazione…' : 'Crea preventivo'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Colonna SX (form) — 3/5 */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Geometria pezzo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!dxfAnalysis && !manualGeometry && (
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-700 mb-2">Carica DXF del pezzo</p>
                  <p className="text-xs text-gray-500 mb-3">Il bbox X×Y viene estratto automaticamente; il profilo è renderizzato nel preview.</p>
                  <input
                    type="file"
                    accept=".dxf"
                    id="dxf-upload"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleDxfUpload(f)
                    }}
                  />
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('dxf-upload')?.click()}
                      disabled={uploading}
                    >
                      {uploading ? 'Analisi…' : 'Scegli file DXF'}
                    </Button>
                    <Button variant="outline" onClick={() => setManualGeometry(true)}>
                      Inserisci manualmente
                    </Button>
                  </div>
                </div>
              )}
              {dxfAnalysis && (
                <div className="flex items-center justify-between rounded-md bg-blue-50 border border-blue-200 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-blue-700" />
                    <span className="font-medium text-blue-900">{dxfFileName}</span>
                    <span className="text-blue-600 text-xs">
                      {dxfAnalysis.profiles.length} profili · {dxfAnalysis.bbox_global.w.toFixed(0)}×{dxfAnalysis.bbox_global.h.toFixed(0)} mm
                    </span>
                  </div>
                  <button onClick={clearDxf} className="text-blue-700 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Pezzo X (mm) *</Label>
                  <Input type="number" value={bboxX}
                    onChange={e => setBboxX(e.target.value)}
                    readOnly={!!dxfAnalysis && !manualGeometry} />
                </div>
                <div>
                  <Label>Pezzo Y (mm) *</Label>
                  <Input type="number" value={bboxY}
                    onChange={e => setBboxY(e.target.value)}
                    readOnly={!!dxfAnalysis && !manualGeometry} />
                </div>
                <div>
                  <Label>Spessore lamiera (mm)</Label>
                  <Input type="number" value={sheetThickness}
                    onChange={e => setSheetThickness(e.target.value)} placeholder="2" />
                </div>
              </div>
              {dxfAnalysis && (
                <div>
                  <button
                    onClick={() => setManualGeometry(m => !m)}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    {manualGeometry ? '🔒 Blocca X/Y dal DXF' : '✏️ Modifica X/Y manualmente'}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Template stampo</CardTitle></CardHeader>
            <CardContent>
              <select
                className="flex h-9 w-full rounded-md border px-2 text-sm"
                value={templateId || ''}
                onChange={e => setTemplateId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Senza template (piastre da aggiungere dopo) —</option>
                {filteredTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.plates.length} piastre)</option>
                ))}
              </select>
              {filteredTemplates.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Nessun template di tipo "{subtype === 'passo' ? 'passo' : 'blocco'}". Crea un template da Impostazioni → Stampi.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Striscia & castello</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {subtype === 'passo' ? (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>N. passi *</Label>
                    <Input type="number" value={nStations}
                      onChange={e => setNStations(e.target.value)} placeholder="3" />
                  </div>
                  <div>
                    <Label>Passo (mm) *</Label>
                    <Input type="number" value={pitchMm}
                      onChange={e => setPitchMm(e.target.value)}
                      placeholder="distanza tra ripetizioni" />
                  </div>
                  <div>
                    <Label>Offset Y striscia (mm)</Label>
                    <Input type="number" value={stripOffsetY}
                      onChange={e => setStripOffsetY(e.target.value)} />
                  </div>
                </div>
              ) : (
                <div>
                  <Label>Offset striscia blocco (mm)</Label>
                  <Input type="number" value={blockOffset}
                    onChange={e => setBlockOffset(e.target.value)} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Offset castello X (mm)</Label>
                  <Input type="number" value={castleOffsetX}
                    onChange={e => setCastleOffsetX(e.target.value)} />
                </div>
                <div>
                  <Label>Offset castello Y (mm)</Label>
                  <Input type="number" value={castleOffsetY}
                    onChange={e => setCastleOffsetY(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Difficoltà & feature</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                {(['base', 'medium', 'hard'] as DieDifficulty[]).map(d => (
                  <SegmentedButton key={d} selected={difficulty === d} onClick={() => setDifficulty(d)}>
                    {d === 'base' ? 'Base' : d === 'medium' ? 'Media' : 'Alta'}
                  </SegmentedButton>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Pieghe sempl</Label><Input type="number" value={nBendsS} onChange={e => setNBendsS(e.target.value)} /></div>
                <div><Label>Pieghe medie</Label><Input type="number" value={nBendsM} onChange={e => setNBendsM(e.target.value)} /></div>
                <div><Label>Pieghe compl</Label><Input type="number" value={nBendsC} onChange={e => setNBendsC(e.target.value)} /></div>
                <div><Label>Punzoni sempl</Label><Input type="number" value={nPunchesS} onChange={e => setNPunchesS(e.target.value)} /></div>
                <div><Label>Punzoni medi</Label><Input type="number" value={nPunchesM} onChange={e => setNPunchesM(e.target.value)} /></div>
                <div><Label>Punzoni compl</Label><Input type="number" value={nPunchesC} onChange={e => setNPunchesC(e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Colonna DX (render live) — 2/5, sticky */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Vista dall'alto</CardTitle></CardHeader>
              <CardContent>
                <DieTopView
                  subtype={subtype || 'blocco'}
                  bboxX={parseFloat(bboxX) || 0}
                  bboxY={parseFloat(bboxY) || 0}
                  nStations={parseInt(nStations, 10) || 1}
                  pitchMm={parseFloat(pitchMm) || 0}
                  stripOffsetY={parseFloat(stripOffsetY) || 0}
                  blockOffset={parseFloat(blockOffset) || 0}
                  castleOffsetX={parseFloat(castleOffsetX) || 0}
                  castleOffsetY={parseFloat(castleOffsetY) || 0}
                  dxfAnalysis={dxfAnalysis}
                />
                <div className="mt-3 text-xs text-gray-600 grid grid-cols-2 gap-y-1">
                  <span>Castello:</span>
                  <span className="font-mono text-right">{Math.round(geom.castleX)} × {Math.round(geom.castleY)} mm</span>
                  <span>Striscia:</span>
                  <span className="font-mono text-right">{Math.round(geom.stripX)} × {Math.round(geom.stripY)} mm</span>
                  <span>Area castello:</span>
                  <span className="font-mono text-right">{geom.castleAreaDm2.toFixed(2)} dm²</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spaccato verticale</CardTitle>
              </CardHeader>
              <CardContent>
                <DieSideView
                  plates={selectedTemplate?.plates || []}
                  castleX={geom.castleX}
                />
                {selectedTemplate && (
                  <p className="mt-2 text-xs text-gray-500">
                    Template <strong>{selectedTemplate.name}</strong> — {selectedTemplate.plates.length} piastre,
                    spessore totale {selectedTemplate.plates.reduce((s, p) => s + p.default_thickness_mm, 0)} mm
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
