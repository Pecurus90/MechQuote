// Wizard creazione preventivo manuale.
//
// Pattern allineato a NewDieQuotePage Step 1 (codice composto + 2
// card-button per tipologia) e usa le primitive shared:
// PageContainer, SettingsPageHeader, PrimaryCtaButton.
//
// Logica funzionale invariata: combobox cliente con autocomplete +
// composizione codice {cli3}-{aa}{cat}_{prog3} + POST /api/quotes.
import { useState, useRef, useEffect, useMemo } from 'react'
import { FileText, Layers } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import PageContainer from '@/components/ui/page-container'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import type { Category, Customer } from '@/types'
import api from '@/lib/api'
import { parseDecimal } from '@/lib/decimalInput'
import { toast } from 'sonner'

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
    default_quantity: 1,
    global_margin_percent: 20,
    quote_date: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
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

  const filteredCustomers = useMemo(() => {
    const q = normalize(customerSearch.trim())
    if (!q) return [] as Customer[]
    return customers.filter(c =>
      String(c.customer_number).includes(q) || normalize(c.name).includes(q)
    ).slice(0, 10)
  }, [customers, customerSearch])

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
    const missing: string[] = []
    if (!form.customer_code) missing.push('Codice cliente')
    if (!form.progressive) missing.push('Numero progressivo')
    if (missing.length > 0) {
      toast.error(`Campi mancanti: ${missing.join(', ')}`)
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/quotes', {
        quote_number: quoteNumber,
        quote_type: form.quote_type,
        num_components: form.quote_type === 'commessa' ? form.num_components : undefined,
        default_quantity: form.default_quantity,
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        customer_name: form.customer_name,
        global_margin_percent: form.global_margin_percent,
        quote_date: form.quote_date,
      })
      onCreated(res.data.id)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      console.error('Creazione preventivo fallita:', err?.response?.data || e)
      toast.error(err?.response?.data?.detail || 'Errore nella creazione del preventivo')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = !!(form.customer_code && form.progressive && form.category_code && form.year)

  return (
    <PageContainer>
      <SettingsPageHeader
        icon={FileText}
        color="blue"
        title="Nuovo Preventivo Manuale"
        subtitle="Componi il codice e scegli il tipo di preventivo"
      />

      {/* Cliente & codice preventivo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Cliente & codice preventivo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Cliente</label>
            <div ref={customerRef} className="relative">
              <Input
                className="h-9"
                placeholder="Cerca per nome o codice cliente…"
                value={customerSearch || form.customer_name}
                onFocus={() => setCustomerOpen(true)}
                onChange={e => {
                  const v = e.target.value
                  setCustomerSearch(v)
                  setCustomerOpen(true)
                  // se l'utente digita liberamente, scollega l'anagrafica
                  setForm(f => ({ ...f, customer_id: '', customer_name: v }))
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
                <p className="mt-1 text-xs text-blue-700 font-medium">
                  ✓ {String(customers.find(c => c.id === Number(form.customer_id))?.customer_number).padStart(3, '0')} — {form.customer_name}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Codice preventivo</label>
            <div className="flex items-center gap-1.5">
              <Input
                className="w-16 text-center font-mono h-9"
                maxLength={3}
                value={form.customer_code}
                onChange={e => set('customer_code', e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
              <span className="text-gray-400">-</span>
              <Input
                className="w-12 text-center font-mono h-9"
                maxLength={2}
                value={form.year}
                onChange={e => set('year', e.target.value.replace(/\D/g, '').slice(0, 2))}
              />
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm font-mono w-40"
                value={form.category_code}
                onChange={e => set('category_code', e.target.value)}
              >
                {categories.map(c => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
              <span className="text-gray-400">_</span>
              <Input
                className="w-20 text-center font-mono h-9"
                maxLength={3}
                value={form.progressive}
                onChange={e => set('progressive', e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="001"
              />
            </div>
            {quoteNumber && (
              <p className="mt-2.5 text-sm font-mono font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
                {quoteNumber}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tipo preventivo — 2 card-button grandi, stile NewDieQuotePage */}
      <Card>
        <CardHeader><CardTitle className="text-base">Tipo preventivo</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => set('quote_type', 'single')}
              className={`relative p-6 rounded-xl border-2 text-left transition-all bg-white ${
                form.quote_type === 'single'
                  ? 'border-blue-600 shadow-md ring-2 ring-blue-100'
                  : 'border-blue-200 hover:border-blue-400 hover:shadow-md cursor-pointer'
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg">Preventivo singolo</h3>
              <p className="text-sm text-gray-500 mt-1">Un solo codice articolo: una parte, una quantità, una sequenza di fasi.</p>
            </button>

            <button
              type="button"
              onClick={() => set('quote_type', 'commessa')}
              className={`relative p-6 rounded-xl border-2 text-left transition-all bg-white ${
                form.quote_type === 'commessa'
                  ? 'border-blue-600 shadow-md ring-2 ring-blue-100'
                  : 'border-blue-200 hover:border-blue-400 hover:shadow-md cursor-pointer'
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg">Commessa multi-parti</h3>
              <p className="text-sm text-gray-500 mt-1">Più componenti del preventivo (es. assieme con N codici): le parti vengono pre-create dal sistema.</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Parametri */}
      <Card>
        <CardHeader><CardTitle className="text-base">Parametri</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {form.quote_type === 'commessa' && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">N° componenti</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  className="h-9"
                  value={form.num_components}
                  onFocus={e => e.currentTarget.select()}
                  onChange={e => set('num_components', parseInt(e.target.value, 10) || 1)}
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data</label>
              <Input
                type="date"
                className="h-9"
                value={form.quote_date}
                onChange={e => set('quote_date', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Margine default (%)</label>
              <Input
                type="number"
                min={0}
                max={200}
                step={1}
                className="h-9"
                value={form.global_margin_percent}
                onFocus={e => e.currentTarget.select()}
                onChange={e => set('global_margin_percent', parseDecimal(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                {form.quote_type === 'commessa' ? 'Qtà per componente' : 'Quantità pezzi'}
              </label>
              <Input
                type="number"
                min={1}
                className="h-9"
                value={form.default_quantity}
                onFocus={e => e.currentTarget.select()}
                onChange={e => set('default_quantity', parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA finale full-width, stile wizard stampi */}
      <button
        type="button"
        onClick={submit}
        disabled={saving || !canSubmit}
        className={`w-full py-4 rounded-xl border-2 text-base font-semibold transition-all shadow-md ${
          saving || !canSubmit
            ? 'bg-gray-200 border-gray-200 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700 hover:shadow-lg active:scale-[0.99]'
        }`}
      >
        {saving ? 'Creazione preventivo…' : 'Crea preventivo →'}
      </button>
      {!canSubmit && (
        <p className="text-xs text-amber-600 text-center -mt-3">
          Compila cliente, categoria e progressivo per sbloccare la creazione
        </p>
      )}
    </PageContainer>
  )
}
