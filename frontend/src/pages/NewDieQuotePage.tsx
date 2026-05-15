import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Hammer } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Category, Customer, DieSubtype } from '@/types'

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
    quote_date: new Date().toISOString().split('T')[0],
  })

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      api.get('/quote-categories'),
      api.get('/customers'),
    ]).then(([cat, cus]) => {
      setCategories(cat.data)
      setCustomers(cus.data)
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
          Crea un preventivo stampo: scegli tipo e codice. Le piastre del castello (cappello,
          porta-punzoni, premilamiera, matrice, base) vengono create vuote e si compilano nell'editor.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">

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

          {/* Tipo + Data */}
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
              <div>
                <label className="text-xs font-medium text-gray-600">Data</label>
                <Input type="date" className="mt-1 h-9 text-sm w-48"
                  value={form.quote_date}
                  onChange={e => set('quote_date', e.target.value)} />
              </div>
            </div>
          </div>

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
