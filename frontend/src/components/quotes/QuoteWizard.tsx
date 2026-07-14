// Container del wizard manuale: logica (autocomplete cliente + composizione
// codice {cli3}-{aa}{cat}_{prog3} + POST /quotes) invariata; la grafica è in
// ManualQuoteWizardView (design handoff).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category, Customer } from '@/types'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useUnsavedGuard } from '@/lib/useUnsavedGuard'
import { ManualQuoteWizardView, type ManualQuoteValue } from '@/pages/quotes/ManualQuoteWizardView'

interface Props {
  categories: Category[]
  customers: Customer[]
  onCreated: (quoteId: number) => void
}

export default function QuoteWizard({ categories, customers, onCreated }: Props) {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear().toString().slice(-2)
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerCode, setCustomerCode] = useState('')
  const [customerReference, setCustomerReference] = useState('')
  const [year, setYear] = useState(currentYear)
  const [categoryCode, setCategoryCode] = useState(categories[0]?.code || 'A')
  const [progressive, setProgressive] = useState('')
  const [saving, setSaving] = useState(false)

  // AUD-28: avvisa se si ricarica/chiude con campi compilati non ancora salvati.
  useUnsavedGuard(!saving && !!(customerName || customerCode || progressive || customerReference))

  const normalize = (s: string) => s.toLowerCase().replace(/\./g, '')
  const filtered = useMemo(() => {
    const q = normalize(customerName.trim())
    if (!q) return [] as Customer[]
    return customers
      .filter(c => String(c.customer_number).includes(q) || normalize(c.name).includes(q))
      .slice(0, 10)
  }, [customers, customerName])

  const quoteNumber = customerCode && progressive
    ? `${customerCode}-${year}${categoryCode}_${progressive.padStart(3, '0')}`
    : ''
  const canProceed = !!(customerCode && progressive && categoryCode && year)

  const onChange = (field: keyof ManualQuoteValue, val: string) => {
    switch (field) {
      case 'customerName': setCustomerName(val); setCustomerId(''); break
      case 'customerCode': setCustomerCode(val.replace(/\D/g, '').slice(0, 3)); break
      case 'year': setYear(val.replace(/\D/g, '').slice(0, 2)); break
      case 'categoryCode': setCategoryCode(val); break
      case 'progressive': setProgressive(val.replace(/\D/g, '').slice(0, 3)); break
      case 'customerReference': setCustomerReference(val); break
    }
  }

  const selectCustomer = (id: number) => {
    const c = customers.find(x => x.id === id)
    if (!c) return
    setCustomerId(String(c.id))
    setCustomerName(c.name)
    setCustomerCode(String(c.customer_number).padStart(3, '0'))
  }

  const proceedTo = async (type: 'single' | 'commessa') => {
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
      toast.error(err?.response?.data?.detail || 'Errore nella creazione del preventivo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <ManualQuoteWizardView
        customers={filtered.map(c => ({ id: c.id, name: c.name }))}
        categories={categories.map(c => ({ code: c.code, label: c.name }))}
        value={{ customerName, customerCode, year, categoryCode, progressive, customerReference }}
        previewNumber={quoteNumber}
        onChange={onChange}
        onSelectCustomer={selectCustomer}
        onBack={() => navigate('/quotes/new')}
        onCancel={() => navigate('/quotes/new')}
        canProceed={canProceed}
        saving={saving}
        onCreate={proceedTo}
      />
    </div>
  )
}
