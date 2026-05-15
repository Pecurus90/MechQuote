import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Hammer, FileStack, Zap } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import type { Category, Customer, DieSubtype, DieDifficulty, DieTemplate, Material } from '@/types'

/** Wizard creazione preventivo Stampo (MVP1).
 *  Form minimal: cliente + codice + tipo (passo/blocco). Le 5 piastre con
 *  ruoli standard sono auto-create dal backend. Geometria, difficoltà,
 *  feature e materiali si compilano nell'editor dopo la creazione.
 */
export default function NewDieQuotePage() {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear().toString().slice(-2)

  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [templates, setTemplates] = useState<DieTemplate[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    customer_id: '',
    customer_name: '',
    customer_code: '',
    year: currentYear,
    category_code: 'A',
    progressive: '',
    die_subtype: 'passo' as DieSubtype,
    template_id: '' as string,   // '' = nessun template (default 5 ruoli)
    quote_date: new Date().toISOString().split('T')[0],
    // Modalità Rapida (default: Dettagliata)
    quick_mode: false,
    bbox_x_mm: 0,
    bbox_y_mm: 0,
    sheet_thickness_mm: 0,
    main_material_id: '' as string,
    difficulty: 'base' as DieDifficulty,
    n_bends_total: 0,
    n_punches_total: 0,
  })

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      api.get('/quote-categories'),
      api.get('/customers'),
      api.get('/die-templates'),
      api.get('/materials'),
    ]).then(([cat, cus, tpl, mat]) => {
      setCategories(cat.data)
      setCustomers(cus.data)
      setTemplates(tpl.data)
      setMaterials(mat.data)
      // Default category 'C' = Blocco stampi se presente, altrimenti prima.
      const block = (cat.data as Category[]).find(c => c.code === 'C')
      setForm(f => ({ ...f, category_code: block?.code ?? cat.data[0]?.code ?? 'A' }))
    }).catch(() => toast.error('Errore nel caricamento dei dati'))
      .finally(() => setLoadingRefs(false))
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) setCustomerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const normalize = (s: string) => s.toLowerCase().replace(/\./g, '')
  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c => {
        const q = normalize(customerSearch)
        return String(c.customer_number).includes(q) || normalize(c.name).includes(q)
      }).slice(0, 10)
    : []

  const selectCustomer = (c: Customer) => {
    setForm(f => ({
      ...f,
      customer_id: String(c.id),
      customer_name: c.name,
      customer_code: String(c.customer_number).padStart(3, '0'),
    }))
    setCustomerSearch('')
    setCustomerOpen(false)
  }

  const quoteNumber = form.customer_code && form.progressive
    ? `${form.customer_code}-${form.year}${form.category_code}_${form.progressive.padStart(3, '0')}`
    : ''

  const submit = async () => {
    const missing: string[] = []
    if (!form.customer_code) missing.push('Codice cliente')
    if (!form.progressive) missing.push('Progressivo')
    if (missing.length > 0) {
      toast.error(`Campi mancanti: ${missing.join(', ')}`)
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/dies', {
        quote_number: quoteNumber,
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        customer_name: form.customer_name,
        quote_date: form.quote_date,
        die_subtype: form.die_subtype,
        template_id: !form.quick_mode && form.template_id ? Number(form.template_id) : undefined,
        quick_mode: form.quick_mode,
        bbox_x_mm: form.quick_mode ? form.bbox_x_mm : undefined,
        bbox_y_mm: form.quick_mode ? form.bbox_y_mm : undefined,
        sheet_thickness_mm: form.quick_mode ? form.sheet_thickness_mm : undefined,
        difficulty: form.quick_mode ? form.difficulty : undefined,
        main_material_id: form.quick_mode && form.main_material_id ? Number(form.main_material_id) : undefined,
        n_bends_total: form.quick_mode ? form.n_bends_total : undefined,
        n_punches_total: form.quick_mode ? form.n_punches_total : undefined,
      })
      toast.success('Preventivo stampo creato — 5 piastre vuote pronte da compilare')
      navigate(`/quotes/${res.data.id}`)
    } catch (e) {
      if (import.meta.env.DEV) console.error('[NewDieQuotePage.submit]', e)
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nella creazione del preventivo')
    } finally {
      setSaving(false)
    }
  }

  if (loadingRefs) return <div className="p-8 text-center">Caricamento...</div>

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Hammer className="w-5 h-5 text-rose-600" /> Nuovo Preventivo Stampo
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {form.quick_mode
            ? 'Modalità Rapida: stima ±20% in 2 minuti dal peso castello × €/kg medio.'
            : 'Modalità Dettagliata: piastra per piastra, 7 livelli di calcolo.'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">

          {/* Modalità (Rapida vs Dettagliata) */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-5 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-700">Modalità preventivo</h2>
            </div>
            <div className="p-5 flex gap-2">
              <button
                onClick={() => set('quick_mode', false)}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                  !form.quick_mode ? 'border-rose-600 bg-rose-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <p className="font-medium text-sm flex items-center gap-2">
                  <Hammer className="w-4 h-4" /> Dettagliata
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Piastra per piastra, 7 livelli. Precisione massima.</p>
              </button>
              <button
                onClick={() => set('quick_mode', true)}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                  form.quick_mode ? 'border-rose-600 bg-rose-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <p className="font-medium text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Rapida (±20%)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Stima al volo da peso × €/kg medio.</p>
              </button>
            </div>
          </div>

          {/* Cliente + Codice */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-5 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-700">Cliente e Codice Preventivo</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-2">Cliente</label>
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
                    <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {filteredCustomers.map(c => (
                        <button key={c.id} type="button"
                          className="w-full text-left px-3 py-2 hover:bg-rose-50 flex items-center gap-3 border-b last:border-0"
                          onMouseDown={e => { e.preventDefault(); selectCustomer(c) }}>
                          <span className="font-mono text-xs text-gray-400 w-10 shrink-0">
                            {String(c.customer_number).padStart(3, '0')}
                          </span>
                          <span className="text-sm text-gray-800 truncate">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-2">Codice Preventivo</label>
                <div className="flex items-center gap-1.5">
                  <Input className="w-16 text-center font-mono h-9 text-sm" maxLength={3}
                    value={form.customer_code}
                    onChange={e => set('customer_code', e.target.value.replace(/\D/g, '').slice(0, 3))} />
                  <span className="text-gray-400">-</span>
                  <Input className="w-12 text-center font-mono h-9 text-sm" maxLength={2}
                    value={form.year}
                    onChange={e => set('year', e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  <select className="h-9 rounded-md border border-input bg-background px-2 text-sm font-mono w-32"
                    value={form.category_code}
                    onChange={e => set('category_code', e.target.value)}>
                    {categories.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                  </select>
                  <span className="text-gray-400">_</span>
                  <Input className="w-20 text-center font-mono h-9 text-sm"
                    value={form.progressive}
                    onChange={e => set('progressive', e.target.value.replace(/\D/g, '').slice(0, 3))} />
                </div>
                {quoteNumber && (
                  <p className="mt-2 text-sm font-mono font-semibold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg inline-block">
                    {quoteNumber}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Tipo + Data + Template */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-5 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-700">Tipo di Stampo</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => set('die_subtype', 'passo')}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                    form.die_subtype === 'passo' ? 'border-rose-600 bg-rose-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <p className="font-medium text-sm">Stampo a passo (progressivo)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Striscia con N stazioni in sequenza.</p>
                </button>
                <button
                  onClick={() => set('die_subtype', 'blocco')}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                    form.die_subtype === 'blocco' ? 'border-rose-600 bg-rose-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <p className="font-medium text-sm">Stampo a blocco</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Singolo set di operazioni.</p>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 items-end">
                {!form.quick_mode && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                      <FileStack className="w-3.5 h-3.5" /> Template di partenza (opzionale)
                    </label>
                    <select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={form.template_id}
                      onChange={e => set('template_id', e.target.value)}>
                      <option value="">— Nessuno (5 piastre vuote standard) —</option>
                      {templates
                        .filter(t => t.die_subtype === form.die_subtype)
                        .map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.plates.length} piastre)
                          </option>
                        ))}
                    </select>
                    {form.template_id && (
                      <p className="text-[10px] text-rose-600 mt-1">
                        Le piastre + i suggerimenti feature del template verranno applicati.
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-600">Data</label>
                  <Input type="date" className="mt-1 h-9 text-sm w-48"
                    value={form.quote_date}
                    onChange={e => set('quote_date', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Inputs Rapida (visibili solo in modalità Rapida) */}
          {form.quick_mode && (
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="px-5 py-3 border-b">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-rose-600" /> Stima rapida
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Compila i dati minimi: il sistema stima il peso del castello e applica €/kg medio.
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Bbox pezzo X (mm)</label>
                    <Input type="number" min={0} step={1} className="mt-1 h-9 text-sm"
                      value={form.bbox_x_mm || ''}
                      onChange={e => set('bbox_x_mm', parseDecimal(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Bbox pezzo Y (mm)</label>
                    <Input type="number" min={0} step={1} className="mt-1 h-9 text-sm"
                      value={form.bbox_y_mm || ''}
                      onChange={e => set('bbox_y_mm', parseDecimal(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Spessore lamiera (mm)</label>
                    <Input type="number" min={0} step={0.1} className="mt-1 h-9 text-sm"
                      value={form.sheet_thickness_mm || ''}
                      onChange={e => set('sheet_thickness_mm', parseDecimal(e.target.value) || 0)} />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Materiale principale</label>
                  <select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={form.main_material_id}
                    onChange={e => set('main_material_id', e.target.value)}>
                    <option value="">— scegli (default acciaio densità 7.85) —</option>
                    {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Difficoltà</label>
                  <div className="flex gap-2 mt-1">
                    {(['base', 'medium', 'hard'] as DieDifficulty[]).map(d => (
                      <button key={d} type="button"
                        onClick={() => set('difficulty', d)}
                        className={`px-4 py-1.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                          form.difficulty === d ? 'border-rose-600 bg-rose-50' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        {d === 'base' ? 'Base' : d === 'medium' ? 'Medio' : 'Difficile'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">N° pieghe totali</label>
                    <Input type="number" min={0} step={1} className="mt-1 h-9 text-sm"
                      value={form.n_bends_total || ''}
                      onChange={e => set('n_bends_total', parseInt(e.target.value, 10) || 0)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">N° punzoni totali</label>
                    <Input type="number" min={0} step={1} className="mt-1 h-9 text-sm"
                      value={form.n_punches_total || ''}
                      onChange={e => set('n_punches_total', parseInt(e.target.value, 10) || 0)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pb-4">
            <Button size="lg" onClick={submit} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
              {saving ? 'Creazione...' : 'Crea Preventivo Stampo →'}
            </Button>
          </div>

        </div>
      </div>
    </div>
  )
}
