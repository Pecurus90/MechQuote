import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Category, Customer } from '@/types'
import api from '@/lib/api'

interface Props {
  categories: Category[]
  customers: Customer[]
  onCreated: (quoteId: number) => void
}


export default function QuoteWizard({ categories, customers, onCreated }: Props) {
  const currentYear = new Date().getFullYear().toString().slice(-2)
  const [form, setForm] = useState({
    customer_id: '',
    customer_name: '',
    customer_code: '',
    year: currentYear,
    category_code: categories[0]?.code || 'A',
    progressive: '',
    quote_type: 'single' as 'single' | 'commessa',
    num_components: 2,
    global_margin_percent: 20,
    quote_date: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node))
        setCustomerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const normalize = (s: string) => s.toLowerCase().replace(/\./g, '')

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c => {
        const q = normalize(customerSearch)
        return String(c.customer_number).includes(q) || normalize(c.name).includes(q)
      }).slice(0, 10)
    : []

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const selectCustomer = (customerId: string) => {
    const cust = customers.find(c => c.id === Number(customerId))
    setForm(f => ({
      ...f,
      customer_id: customerId,
      customer_name: cust?.name || '',
      customer_code: cust ? String(cust.customer_number).padStart(3, '0') : f.customer_code,
    }))
  }

  const quoteNumber = form.customer_code && form.progressive
    ? `${form.customer_code}-${form.year}${form.category_code}_${form.progressive.padStart(3, '0')}`
    : ''

  const submit = async () => {
    if (!form.customer_code || !form.progressive) {
      setError('Inserisci codice cliente e progressivo')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await api.post('/quotes', {
        quote_number: quoteNumber,
        quote_type: form.quote_type,
        num_components: form.quote_type === 'commessa' ? form.num_components : undefined,
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        customer_name: form.customer_name,
        global_margin_percent: form.global_margin_percent,
        quote_date: form.quote_date,
      })
      onCreated(res.data.id)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail || 'Errore nella creazione del preventivo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-lg font-bold text-gray-900">Nuovo Preventivo Manuale</h1>
        <p className="text-xs text-gray-500 mt-0.5">Compila i dati per creare il preventivo</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">

          {/* Sezione 1: Cliente + Codice */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-5 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-700">Cliente e Codice Preventivo</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-5">
              {/* Cliente — ricerca autocomplete */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Cliente</label>
                <div ref={customerRef} className="relative">
                  <Input
                    className="h-9 text-sm"
                    placeholder="Cerca per nome o codice cliente..."
                    value={customerSearch || form.customer_name}
                    onFocus={() => setCustomerOpen(true)}
                    onChange={e => {
                      const v = e.target.value
                      setCustomerSearch(v)
                      setCustomerOpen(true)
                      // se l'utente digita liberamente, scollega l'anagrafica
                      setForm(f => ({ ...f, customer_id: '', customer_name: v, customer_code: f.customer_code }))
                    }}
                  />
                  {customerOpen && filteredCustomers.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-3 border-b last:border-0"
                          onMouseDown={e => {
                            e.preventDefault()
                            setCustomerSearch('')
                            setCustomerOpen(false)
                            selectCustomer(String(c.id))
                          }}
                        >
                          <span className="font-mono text-xs text-gray-400 w-10 shrink-0">
                            {String(c.customer_number).padStart(3, '0')}
                          </span>
                          <span className="text-sm text-gray-800 truncate">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.customer_id && (
                    <p className="mt-1 text-xs text-blue-600 font-medium">
                      ✓ {String(customers.find(c => c.id === Number(form.customer_id))?.customer_number).padStart(3, '0')} — {form.customer_name}
                    </p>
                  )}
                </div>
              </div>

              {/* Codice preventivo */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-2">Codice Preventivo</label>
                <div className="flex items-end gap-1.5 flex-wrap">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Cod. cliente</p>
                    <Input
                      className="w-16 text-center font-mono h-9 text-sm"
                      maxLength={3}
                      placeholder="240"
                      value={form.customer_code}
                      onChange={e => set('customer_code', e.target.value.replace(/\D/g, '').slice(0, 3))}
                    />
                  </div>
                  <span className="text-gray-400 pb-2">-</span>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Anno</p>
                    <Input
                      className="w-12 text-center font-mono h-9 text-sm"
                      maxLength={2}
                      value={form.year}
                      onChange={e => set('year', e.target.value.replace(/\D/g, '').slice(0, 2))}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Cat.</p>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-mono w-20"
                      value={form.category_code}
                      onChange={e => set('category_code', e.target.value)}
                    >
                      {categories.map(c => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-gray-400 pb-2">_</span>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Progressivo</p>
                    <Input
                      className="w-20 text-center font-mono h-9 text-sm"
                      placeholder="001"
                      value={form.progressive}
                      onChange={e => set('progressive', e.target.value.replace(/\D/g, '').slice(0, 3))}
                    />
                  </div>
                </div>
                {quoteNumber && (
                  <p className="mt-2.5 text-sm font-mono font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
                    {quoteNumber}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Sezione 2: Tipo · Data · Margine */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-5 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-700">Tipo, Data e Margine</h2>
            </div>
            <div className="p-5 flex items-start gap-6 flex-wrap">
              {/* Tipo */}
              <div className="flex gap-2">
                {([
                  { value: 'single', label: 'Pezzo singolo', sub: 'Un codice parte' },
                  { value: 'commessa', label: 'Commessa', sub: 'Più parti _01 _02...' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => set('quote_type', opt.value)}
                    className={`px-4 py-2.5 rounded-lg border-2 text-left transition-colors ${
                      form.quote_type === opt.value
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>

              {form.quote_type === 'commessa' && (
                <div>
                  <label className="text-xs font-medium text-gray-600">N° componenti</label>
                  <Input type="number" min={1} max={50} className="mt-1 h-9 w-24 text-sm"
                    value={form.num_components}
                    onChange={e => set('num_components', parseInt(e.target.value) || 1)} />
                </div>
              )}

              <div className="flex gap-4 items-end">
                <div>
                  <label className="text-xs font-medium text-gray-600">Data</label>
                  <Input type="date" className="mt-1 h-9 text-sm" value={form.quote_date}
                    onChange={e => set('quote_date', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Margine default (%)</label>
                  <Input type="number" min={0} max={200} step={1} className="mt-1 h-9 w-24 text-sm"
                    value={form.global_margin_percent}
                    onChange={e => set('global_margin_percent', parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>
          </div>

{error && <p className="text-sm text-red-600 px-1">{error}</p>}

          <div className="flex justify-end pb-4">
            <Button size="lg" onClick={submit} disabled={saving || !quoteNumber}>
              {saving ? 'Creazione...' : 'Crea Preventivo →'}
            </Button>
          </div>

        </div>
      </div>
    </div>
  )
}
