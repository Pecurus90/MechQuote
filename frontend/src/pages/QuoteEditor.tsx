import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { calcPartTotals, calcQuoteTotal } from '@/lib/quoteCalc'
import type { Material, Category, Customer, Part, Quote, Machine } from '@/types'
import api from '@/lib/api'
import { Trash2, Copy, FileDown, Mail, ChevronLeft, Save, Plus } from 'lucide-react'
import { STATUS_LABELS } from '@/lib/constants'
import QuoteWizard from '@/components/quotes/QuoteWizard'
import EmailDialog from '@/components/quotes/EmailDialog'
import PartCard from '@/components/quotes/PartCard'

export default function QuoteEditor() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isNew = !id

  const [quote, setQuote] = useState<Quote | null>(null)
  const [machines, setMachines] = useState<Machine[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [templates, setTemplates] = useState<{ id: number; name: string; phase_type: string; default_machine_id: number | null; default_supplier_id: number | null; setup_hours: number; cycle_hours_per_part: number; fixed_cost: number; variable_cost_per_part: number; customer_visible: boolean }[]>([])
  const [selectedPartIdx, setSelectedPartIdx] = useState(0)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [emailDialog, setEmailDialog] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/machines'),
      api.get('/materials'),
      api.get('/quote-categories'),
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/phase-templates'),
    ]).then(([m, mat, cat, cust, sup, tpl]) => {
      setMachines(m.data)
      setMaterials(mat.data)
      setCategories(cat.data)
      setCustomers(cust.data)
      setSuppliers(sup.data)
      setTemplates(tpl.data)
    })
  }, [])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.get(`/quotes/${id}`).then(res => {
      const q = res.data
      setQuote({
        ...q,
        transport_cost: q.transport_cost ?? 0,
        packaging_cost: q.packaging_cost ?? 0,
        global_discount_percent: q.global_discount_percent ?? 0,
        validity_days: q.validity_days ?? 30,
        parts: (q.parts || []).map((p: Part) => ({ ...p, phases: p.phases || [] })),
      })
      setLoading(false)
    }).catch(() => navigate('/', { replace: true }))
  }, [id])

  const updatePart = (idx: number, updates: Partial<Part>) => {
    setQuote(q => {
      if (!q) return q
      const parts = q.parts.map((p, i) =>
        i === idx ? calcPartTotals({ ...p, ...updates }, q.global_margin_percent) : p
      )
      return { ...q, parts }
    })
  }

  const savePart = async (idx: number) => {
    if (!quote) return
    const part = quote.parts[idx]
    if (!part?.id) return
    try {
      await api.put(`/parts/${part.id}`, {
        part_code: part.part_code,
        description: part.description,
        quantity: part.quantity,
        quote_mode: part.quote_mode,
        material_id: part.material_id,
        raw_x_mm: part.raw_x_mm,
        raw_y_mm: part.raw_y_mm,
        raw_z_mm: part.raw_z_mm,
        material_cost: part.material_cost,
        margin_percent: part.margin_percent,
        minimum_price: part.minimum_price,
        total_cost: part.total_cost,
        unit_price: part.unit_price,
        total_price: part.total_price,
      })
    } catch (e) { console.error(e) }
  }

  const duplicatePart = async (idx: number) => {
    if (!quote) return
    const part = quote.parts[idx]
    if (!part.id) return
    try {
      const res = await api.post(`/parts/${part.id}/duplicate`)
      setQuote(q => q ? { ...q, parts: [...q.parts, { ...res.data, phases: res.data.phases || [] }] } : q)
    } catch (e) { console.error(e) }
  }

  const deletePart = async (idx: number) => {
    if (!quote) return
    const part = quote.parts[idx]
    if (part.id) {
      try { await api.delete(`/parts/${part.id}`) } catch (e) { console.error(e) }
    }
    setQuote(q => q ? { ...q, parts: q.parts.filter((_, i) => i !== idx) } : q)
    setSelectedPartIdx(Math.max(0, idx - 1))
  }

  const addPart = async () => {
    if (!quote?.id) return
    try {
      const partCode = `${quote.quote_number}_${String(quote.parts.length + 1).padStart(2, '0')}`
      const res = await api.post(`/quotes/${quote.id}/parts`, { part_code: partCode })
      const newPart = { ...res.data, phases: res.data.phases || [] }
      setQuote(q => q ? { ...q, parts: [...q.parts, newPart] } : q)
      setSelectedPartIdx(quote.parts.length)
    } catch (e) { console.error(e) }
  }

  const applyQuoteData = (q: Quote & { transport_cost?: number; packaging_cost?: number; global_discount_percent?: number; validity_days?: number }) => {
    setQuote({
      ...q,
      transport_cost: q.transport_cost ?? 0,
      packaging_cost: q.packaging_cost ?? 0,
      global_discount_percent: q.global_discount_percent ?? 0,
      validity_days: q.validity_days ?? 30,
      parts: (q.parts || []).map((p: Part) => ({ ...p, phases: p.phases || [] })),
    })
  }

  const saveQuote = async () => {
    if (!quote?.id) return
    setSaving(true)
    try {
      await api.put(`/quotes/${quote.id}`, {
        customer_name: quote.customer_name,
        customer_id: quote.customer_id,
        customer_reference: quote.customer_reference,
        global_margin_percent: quote.global_margin_percent,
        global_discount_percent: quote.global_discount_percent,
        transport_cost: quote.transport_cost,
        packaging_cost: quote.packaging_cost,
        validity_days: quote.validity_days,
        delivery_text: quote.delivery_text,
        quote_date: quote.quote_date,
        notes_customer: quote.notes_customer,
        notes_internal: quote.notes_internal,
        status: quote.status,
      })
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const saveQuoteAndRecalculate = async () => {
    if (!quote?.id) return
    await saveQuote()
    try {
      const res = await api.post(`/quotes/${quote.id}/recalculate`)
      applyQuoteData(res.data)
    } catch (e) { console.error(e) }
  }

  const downloadPdf = async (type: 'customer' | 'internal') => {
    if (!quote?.id) return
    try {
      const res = await api.get(`/quotes/${quote.id}/pdf/${type}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `preventivo_${quote.quote_number}_${type}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) { console.error(e) }
  }

  const sendEmail = async (email: string) => {
    if (!quote?.id) return
    await api.post(`/quotes/${quote.id}/send-email`, { email })
    alert('Email inviata con successo!')
    setEmailDialog(false)
  }

  if (isNew) {
    return (
      <QuoteWizard
        categories={categories}
        customers={customers}
        materials={materials}
        onCreated={newId => navigate(`/quotes/${newId}`, { replace: true })}
      />
    )
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Caricamento...</div>
  if (!quote) return null

  const selectedPart = quote.parts[selectedPartIdx] ?? null
  const total = calcQuoteTotal(quote)
  const partsSubtotal = quote.parts.reduce((s, p) => s + (p.total_price || 0), 0)
  const hasExtras = quote.transport_cost > 0 || quote.packaging_cost > 0 || quote.global_discount_percent > 0

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-700 mr-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-mono font-bold text-lg text-blue-700">{quote.quote_number}</span>
        <span className="text-gray-300">|</span>
        <span className="text-sm text-gray-500">{quote.customer_name || 'Nessun cliente'}</span>
        <div className="flex-1" />
        <select
          className="h-8 rounded border border-input bg-background px-2 text-xs"
          value={quote.status}
          onChange={e => setQuote(q => q ? { ...q, status: e.target.value } : q)}
          onBlur={saveQuote}
        >
          {(['draft', 'sent', 'accepted', 'rejected', 'archived'] as const).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={() => downloadPdf('customer')}>
          <FileDown className="w-3.5 h-3.5 mr-1" /> PDF Cliente
        </Button>
        <Button size="sm" variant="outline" onClick={() => downloadPdf('internal')}>
          <FileDown className="w-3.5 h-3.5 mr-1" /> PDF Interno
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEmailDialog(true)}>
          <Mail className="w-3.5 h-3.5 mr-1" /> Email
        </Button>
        <Button size="sm" onClick={saveQuote} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Salvo...' : 'Salva'}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Parts sidebar */}
        <div className="w-56 bg-white border-r flex flex-col shrink-0">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Parti ({quote.parts.length})
            </span>
            <button onClick={addPart} className="p-0.5 hover:text-blue-600 text-gray-400" title="Aggiungi parte">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div
            onClick={() => setSelectedPartIdx(-1)}
            className={`px-3 py-2 cursor-pointer border-b text-xs text-gray-500 hover:bg-gray-50 ${
              selectedPartIdx === -1 ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
            }`}
          >
            ⚙ Dati preventivo
          </div>
          <div className="flex-1 overflow-y-auto">
            {quote.parts.map((part, idx) => (
              <div
                key={part.id ?? idx}
                onClick={() => setSelectedPartIdx(idx)}
                className={`px-3 py-2.5 cursor-pointer border-b hover:bg-gray-50 ${
                  selectedPartIdx === idx ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-mono font-medium text-gray-800 truncate">{part.part_code}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={e => { e.stopPropagation(); duplicatePart(idx) }}
                      className="p-0.5 hover:text-blue-600 text-gray-300" title="Duplica">
                      <Copy className="w-3 h-3" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); deletePart(idx) }}
                      className="p-0.5 hover:text-red-500 text-gray-300" title="Elimina">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-400 truncate">{part.description || 'Nessuna descrizione'}</div>
                <div className="text-xs font-semibold text-blue-600 mt-0.5">{part.total_price.toFixed(2)} €</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Quote details panel */}
          {selectedPartIdx === -1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Dati Preventivo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Riferimento cliente</label>
                    <Input className="mt-1 h-9 text-sm" value={quote.customer_reference || ''}
                      onChange={e => setQuote(q => q ? { ...q, customer_reference: e.target.value } : q)}
                      onBlur={saveQuote} placeholder="Rif. ordine cliente" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Margine globale (%)</label>
                    <Input type="number" min={0} max={500} step={1} className="mt-1 h-9 text-sm"
                      value={quote.global_margin_percent}
                      onChange={e => setQuote(q => q ? { ...q, global_margin_percent: parseFloat(e.target.value) || 0 } : q)}
                      onBlur={saveQuoteAndRecalculate} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Validità (giorni)</label>
                    <Input type="number" min={1} className="mt-1 h-9 text-sm"
                      value={quote.validity_days}
                      onChange={e => setQuote(q => q ? { ...q, validity_days: parseInt(e.target.value) || 30 } : q)}
                      onBlur={saveQuote} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600">Condizioni di consegna</label>
                    <Input className="mt-1 h-9 text-sm" value={quote.delivery_text || ''}
                      onChange={e => setQuote(q => q ? { ...q, delivery_text: e.target.value } : q)}
                      onBlur={saveQuote} placeholder="es. 30 giorni lavorativi" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600">Note per il cliente</label>
                    <textarea
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-20 resize-none"
                      value={quote.notes_customer || ''}
                      onChange={e => setQuote(q => q ? { ...q, notes_customer: e.target.value } : q)}
                      onBlur={saveQuote} placeholder="Note visibili al cliente nel PDF"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600">Note interne</label>
                    <textarea
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-20 resize-none"
                      value={quote.notes_internal || ''}
                      onChange={e => setQuote(q => q ? { ...q, notes_internal: e.target.value } : q)}
                      onBlur={saveQuote} placeholder="Note interne (non visibili nel PDF cliente)"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedPartIdx >= 0 && !selectedPart && (
            <div className="text-center text-gray-400 pt-16">Seleziona una parte dalla lista</div>
          )}

          {selectedPartIdx >= 0 && selectedPart && (
            <PartCard
              part={selectedPart}
              machines={machines}
              materials={materials}
              suppliers={suppliers}
              templates={templates}
              globalMarginPercent={quote.global_margin_percent}
              onUpdate={updates => updatePart(selectedPartIdx, updates)}
              onSave={() => savePart(selectedPartIdx)}
              onPhasesChange={phases => updatePart(selectedPartIdx, { phases })}
            />
          )}
        </div>
      </div>

      {/* Bottom total bar */}
      <div className="bg-white border-t px-6 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-gray-500">{quote.parts.length} parti</span>
          <span className="text-sm text-gray-400">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 whitespace-nowrap">Trasporto</span>
            <Input type="number" min={0} step={1} className="h-7 w-20 text-xs"
              value={quote.transport_cost}
              onChange={e => setQuote(q => q ? { ...q, transport_cost: parseFloat(e.target.value) || 0 } : q)}
              onBlur={saveQuote} />
            <span className="text-xs text-gray-400">€</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 whitespace-nowrap">Imballag.</span>
            <Input type="number" min={0} step={1} className="h-7 w-20 text-xs"
              value={quote.packaging_cost}
              onChange={e => setQuote(q => q ? { ...q, packaging_cost: parseFloat(e.target.value) || 0 } : q)}
              onBlur={saveQuote} />
            <span className="text-xs text-gray-400">€</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 whitespace-nowrap">Sconto</span>
            <Input type="number" min={0} max={100} step={0.5} className="h-7 w-16 text-xs"
              value={quote.global_discount_percent}
              onChange={e => setQuote(q => q ? { ...q, global_discount_percent: parseFloat(e.target.value) || 0 } : q)}
              onBlur={saveQuote} />
            <span className="text-xs text-gray-400">%</span>
          </div>
          <div className="flex-1" />
          <div className="text-right">
            {hasExtras && (
              <span className="text-xs text-gray-400 block">Subtotale: {partsSubtotal.toFixed(2)} €</span>
            )}
            <span className="text-xs text-gray-400 uppercase tracking-wide block">Totale Preventivo</span>
            <span className="text-2xl font-bold text-blue-700">{total.toFixed(2)} €</span>
          </div>
        </div>
      </div>

      <EmailDialog
        open={emailDialog}
        onClose={() => setEmailDialog(false)}
        onSend={async email => {
          await sendEmail(email)
        }}
      />
    </div>
  )
}
