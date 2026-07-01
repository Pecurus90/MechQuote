// Wizard creazione preventivo manuale — pattern IDENTICO a
// NewDieQuotePage Step 1: composizione codice +
// 2 card-button per il tipo che fanno direttamente il submit.
//
// Logica funzionale invariata: combobox cliente con autocomplete +
// formula {cli3}-{aa}{cat}_{prog3} + POST /api/quotes. I parametri
// (data, margine, qty default) restano a valori di default del
// backend e si rifiniscono nell'editor del preventivo.
import { useState, useRef, useEffect, useMemo } from 'react'
import { FileText, Layers } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Category, Customer } from '@/types'
import api from '@/lib/api'
import { toast } from 'sonner'

interface Props {
  categories: Category[]
  customers: Customer[]
  onCreated: (quoteId: number) => void
}

type QuoteType = 'single' | 'commessa'


export default function QuoteWizard({ categories, customers, onCreated }: Props) {
  const currentYear = new Date().getFullYear().toString().slice(-2)
  const [customerId, setCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  const [customerCode, setCustomerCode] = useState<string>('')
  const [customerReference, setCustomerReference] = useState<string>('')
  const [year, setYear] = useState<string>(currentYear)
  const [categoryCode, setCategoryCode] = useState<string>(categories[0]?.code || 'A')
  const [progressive, setProgressive] = useState<string>('')
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

  const selectCustomer = (c: Customer) => {
    setCustomerId(String(c.id))
    setCustomerName(c.name)
    setCustomerCode(String(c.customer_number).padStart(3, '0'))
    setCustomerSearch('')
    setCustomerOpen(false)
  }

  const quoteNumber = customerCode && progressive
    ? `${customerCode}-${year}${categoryCode}_${progressive.padStart(3, '0')}`
    : ''

  const canProceed = !!(customerCode && progressive && categoryCode && year)

  const proceedTo = async (type: QuoteType) => {
    if (!canProceed) {
      toast.error('Compila cliente, categoria e progressivo prima di scegliere il tipo')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/quotes', {
        quote_number: quoteNumber,
        quote_type: type,
        num_components: type === 'commessa' ? 2 : undefined,
        customer_id: customerId ? Number(customerId) : undefined,
        customer_name: customerName || undefined,
        customer_reference: customerReference || undefined,
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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 text-primary flex items-center justify-center">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Nuovo Preventivo Manuale</h1>
          <p className="text-xs text-muted-foreground">Componi il codice e scegli il tipo</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Cliente & codice preventivo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Cliente</label>
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
                <div className="absolute z-50 mt-1 w-full bg-card border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-primary/10 flex items-center gap-3 border-b last:border-0"
                      onMouseDown={e => { e.preventDefault(); selectCustomer(c) }}
                    >
                      <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">
                        {String(c.customer_number).padStart(3, '0')}
                      </span>
                      <span className="text-sm">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {customerId && (
                <p className="mt-1 text-xs text-primary font-medium">
                  ✓ {customerCode} — {customerName}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Codice preventivo</label>
            <div className="flex items-center gap-1.5">
              <Input
                className="w-16 text-center font-mono h-9"
                maxLength={3}
                value={customerCode}
                onChange={e => setCustomerCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
              <span className="text-muted-foreground">-</span>
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
              <span className="text-muted-foreground">_</span>
              <Input
                className="w-20 text-center font-mono h-9"
                maxLength={3}
                value={progressive}
                onChange={e => setProgressive(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="001"
              />
            </div>
            {quoteNumber && (
              <p className="mt-2.5 text-sm font-mono font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg inline-block">
                {quoteNumber}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Riferimento cliente (opzionale)</label>
            <Input value={customerReference} onChange={e => setCustomerReference(e.target.value)} placeholder="es. RDA-2026-001" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tipo preventivo</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              disabled={!canProceed || saving}
              onClick={() => proceedTo('single')}
              className={`relative p-6 rounded-xl border-2 text-left transition-all ${
                canProceed && !saving
                  ? 'border-blue-200 hover:border-blue-500 hover:shadow-md cursor-pointer bg-card'
                  : 'border-border opacity-50 cursor-not-allowed bg-muted'
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg">Preventivo singolo</h3>
              <p className="text-sm text-muted-foreground mt-1">Un solo codice articolo: una parte, una quantità, una sequenza di fasi.</p>
            </button>

            <button
              type="button"
              disabled={!canProceed || saving}
              onClick={() => proceedTo('commessa')}
              className={`relative p-6 rounded-xl border-2 text-left transition-all ${
                canProceed && !saving
                  ? 'border-blue-200 hover:border-blue-500 hover:shadow-md cursor-pointer bg-card'
                  : 'border-border opacity-50 cursor-not-allowed bg-muted'
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg">Commessa multi-parti</h3>
              <p className="text-sm text-muted-foreground mt-1">Più componenti del preventivo: il sistema crea N parti pre-codificate (default 2, modificabili nell'editor).</p>
            </button>
          </div>
          {!canProceed && (
            <p className="text-xs text-amber-600 mt-3">Compila cliente, categoria e progressivo per sbloccare la scelta.</p>
          )}
          {saving && (
            <p className="text-xs text-muted-foreground mt-3">Creazione preventivo…</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
