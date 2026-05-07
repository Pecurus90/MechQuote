import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { calcPartTotals, calcQuoteTotal } from '@/lib/quoteCalc'
import type { Material, Category, Customer, Part, Quote, Machine, Treatment, Supplier, PhaseTemplate } from '@/types'
import api from '@/lib/api'
import { Trash2, Copy, FileDown, ChevronLeft, Save, Plus } from 'lucide-react'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import { timeAgo } from '@/lib/timeAgo'
import { useAuth } from '@/lib/auth'
import { Send } from 'lucide-react'
import QuoteWizard from '@/components/quotes/QuoteWizard'
import PartCard from '@/components/quotes/PartCard'
import { validateQuote } from '@/lib/quoteValidation'
import type { PartIssue } from '@/lib/quoteValidation'
import { toast } from 'sonner'

export default function QuoteEditor() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { hasPermission, hasRole } = useAuth()
  const isNew = !id

  const [quote, setQuote] = useState<Quote | null>(null)
  const [machines, setMachines] = useState<Machine[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [templates, setTemplates] = useState<PhaseTemplate[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [selectedPartIdx, setSelectedPartIdx] = useState(0)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [validationIssues, setValidationIssues] = useState<PartIssue[] | null>(null)
  const [pendingPdfType, setPendingPdfType] = useState<'customer' | 'internal' | null>(null)

  useEffect(() => {
    Promise.all([
      api.get('/machines'),
      api.get('/materials'),
      api.get('/quote-categories'),
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/phase-templates'),
      api.get('/treatments'),
    ]).then(([m, mat, cat, cust, sup, tpl, tr]) => {
      setMachines(m.data)
      setMaterials(mat.data)
      setCategories(cat.data)
      setCustomers(cust.data)
      setSuppliers(sup.data)
      setTemplates(tpl.data)
      setTreatments(tr.data.filter((t: Treatment) => t.active))
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
    }).catch((e) => {
      const msg = e?.response?.data?.detail || e?.message || 'Errore sconosciuto'
      toast.error(`Impossibile caricare il preventivo: ${msg}`)
      setLoading(false)
    })
  }, [id])

  const updatePart = (idx: number, updates: Partial<Part>) => {
    setQuote(q => {
      if (!q) return q
      const nParts = q.parts.length || 1
      const parts = q.parts.map((p, i) =>
        i === idx ? calcPartTotals({ ...p, ...updates }, q.global_margin_percent, nParts) : p
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
        raw_diameter_mm: part.raw_diameter_mm,
        finished_weight_kg: part.finished_weight_kg,
        material_cost: part.material_cost,
        material_delivery_cost: part.material_delivery_cost,
        margin_percent: part.margin_percent,
        minimum_price: part.minimum_price,
        total_cost: part.total_cost,
        unit_price: part.unit_price,
        total_price: part.total_price,
      })
    } catch (e) {toast.error('Errore nel salvataggio della parte') }
  }

  const reloadPart = async (idx: number) => {
    if (!quote) return
    const part = quote.parts[idx]
    if (!part?.id) return
    try {
      const res = await api.get(`/parts/${part.id}`)
      const fresh = { ...res.data, phases: res.data.phases || [] }
      setQuote(q => q ? { ...q, parts: q.parts.map((p, i) => i === idx ? fresh : p) } : q)
    } catch { toast.error('Errore nel caricamento della parte') }
  }

  const duplicatePart = async (idx: number) => {
    if (!quote) return
    const part = quote.parts[idx]
    if (!part.id) return
    try {
      const res = await api.post(`/parts/${part.id}/duplicate`)
      setQuote(q => q ? { ...q, parts: [...q.parts, { ...res.data, phases: res.data.phases || [] }] } : q)
      toast.success('Parte duplicata')
    } catch (e) {toast.error('Errore nella duplicazione') }
  }

  const deletePart = async (idx: number) => {
    if (!quote) return
    const part = quote.parts[idx]
    if (part.id) {
      try { await api.delete(`/parts/${part.id}`) } catch (e) {toast.error('Errore nell\'eliminazione della parte') }
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
    } catch (e) {toast.error('Errore nell\'aggiunta della parte') }
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
      toast.success('Preventivo salvato')
    } catch (e) {toast.error('Errore nel salvataggio') }
    finally { setSaving(false) }
  }

  const saveQuoteAndRecalculate = async () => {
    if (!quote?.id) return
    await saveQuote()
    try {
      const res = await api.post(`/quotes/${quote.id}/recalculate`)
      applyQuoteData(res.data)
    } catch (e) {toast.error('Errore nel ricalcolo') }
  }

  const submitForReview = async () => {
    if (!quote?.id) return
    if (!confirm('Inviare il preventivo per revisione? Non potrai più modificarlo come bozza.')) return
    setSaving(true)
    try {
      // Salva pending edits prima dell'invio
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
      })
      const res = await api.patch(`/quotes/${quote.id}/status`, { status: 'inviato' })
      applyQuoteData(res.data)
      toast.success('Preventivo inviato per revisione')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Errore nell\'invio')
    } finally { setSaving(false) }
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
      toast.success('PDF generato')
    } catch (e) {toast.error('Errore nella generazione del PDF') }
  }

  const handlePdfClick = (type: 'customer' | 'internal') => {
    if (!quote) return
    const issues = validateQuote(quote)
    if (issues.length > 0) {
      setValidationIssues(issues)
      setPendingPdfType(type)
    } else {
      downloadPdf(type)
    }
  }

  if (isNew) {
    return (
      <QuoteWizard
        categories={categories}
        customers={customers}
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
  const partsWithIssues = new Set(validateQuote(quote).map(i => i.partIdx))
  const isLocked = quote.status !== 'bozza' && !hasRole('admin')

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
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[quote.status] ?? STATUS_COLORS.bozza}`}>
          {STATUS_LABELS[quote.status] ?? quote.status}
        </span>
        {quote.status === 'inviato' && quote.submitted_by && (
          <span className="text-xs text-gray-500">
            Inviato da <span className="font-medium text-gray-700">{quote.submitted_by.full_name || quote.submitted_by.username}</span>
            {quote.submitted_at && <> · {timeAgo(quote.submitted_at)}</>}
          </span>
        )}
        {quote.status === 'completato' && quote.completed_by && (
          <span
            className="text-xs text-gray-500"
            title={quote.submitted_by ? `Inviato da ${quote.submitted_by.full_name || quote.submitted_by.username}` : undefined}
          >
            Completato da <span className="font-medium text-gray-700">{quote.completed_by.full_name || quote.completed_by.username}</span>
            {quote.completed_at && <> · {timeAgo(quote.completed_at)}</>}
          </span>
        )}
        {quote.status === 'bozza' && hasPermission('quotes.send') && (
          <Button size="sm" variant="outline" onClick={submitForReview} disabled={saving}>
            <Send className="w-3.5 h-3.5 mr-1" /> Invia per revisione
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => handlePdfClick('internal')}>
          <FileDown className="w-3.5 h-3.5 mr-1" /> PDF
        </Button>
        {!isLocked && (
          <Button size="sm" onClick={saveQuote} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Salvo...' : 'Salva'}
          </Button>
        )}
      </div>

      {isLocked && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span className="font-medium">🔒 Preventivo non più modificabile</span>
          <span className="text-amber-700">·</span>
          <span>{quote.status === 'inviato' ? 'È in attesa di revisione.' : 'È stato completato.'} Solo un admin può apportare modifiche.</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Parts sidebar */}
        <div className="w-56 bg-white border-r flex flex-col shrink-0">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Parti ({quote.parts.length})
            </span>
            {quote.quote_type !== 'single' && !isLocked && (
              <button onClick={addPart} className="p-0.5 hover:text-blue-600 text-gray-400" title="Aggiungi parte">
                <Plus className="w-4 h-4" />
              </button>
            )}
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
                    {partsWithIssues.has(idx) && (
                      <span className="text-amber-500 text-xs" title="Dati mancanti">⚠</span>
                    )}
                    {quote.quote_type !== 'single' && !isLocked && (
                      <button onClick={e => { e.stopPropagation(); duplicatePart(idx) }}
                        className="p-0.5 hover:text-blue-600 text-gray-300" title="Duplica">
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                    {quote.quote_type !== 'single' && !isLocked && (
                      <button onClick={e => { e.stopPropagation(); deletePart(idx) }}
                        className="p-0.5 hover:text-red-500 text-gray-300" title="Elimina">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
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
          {/* Riepilogo commessa */}
          {selectedPartIdx === -1 && quote.parts.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Riepilogo Commessa</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-600">Codice</th>
                      <th className="text-left p-3 font-medium text-gray-600">Descrizione</th>
                      <th className="text-right p-3 font-medium text-gray-600">Qtà</th>
                      <th className="text-right p-3 font-medium text-gray-600">Costo/pz</th>
                      <th className="text-right p-3 font-medium text-gray-600">Prezzo/pz</th>
                      <th className="text-right p-3 font-medium text-gray-600">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.parts.map((part, idx) => (
                      <tr
                        key={part.id ?? idx}
                        onClick={() => setSelectedPartIdx(idx)}
                        className="border-b hover:bg-blue-50 cursor-pointer"
                      >
                        <td className="p-3 font-mono font-medium text-blue-700 whitespace-nowrap">
                          {partsWithIssues.has(idx) && <span className="text-amber-500 mr-1">⚠</span>}
                          {part.part_code}
                        </td>
                        <td className="p-3 text-gray-600 truncate max-w-48">{part.description || '—'}</td>
                        <td className="p-3 text-right">{part.quantity}</td>
                        <td className="p-3 text-right text-gray-500">{(part.total_cost ?? 0).toFixed(2)} €</td>
                        <td className="p-3 text-right text-gray-500">{(part.unit_price ?? 0).toFixed(2)} €</td>
                        <td className="p-3 text-right font-semibold">{(part.total_price ?? 0).toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-gray-50">
                    <tr>
                      <td colSpan={5} className="p-3 text-right text-sm text-gray-500">Subtotale</td>
                      <td className="p-3 text-right font-medium">{partsSubtotal.toFixed(2)} €</td>
                    </tr>
                    {quote.transport_cost > 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 pb-1 text-right text-sm text-gray-500">Trasporto</td>
                        <td className="px-3 pb-1 text-right text-sm">{quote.transport_cost.toFixed(2)} €</td>
                      </tr>
                    )}
                    {quote.packaging_cost > 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 pb-1 text-right text-sm text-gray-500">Imballaggio</td>
                        <td className="px-3 pb-1 text-right text-sm">{quote.packaging_cost.toFixed(2)} €</td>
                      </tr>
                    )}
                    {quote.global_discount_percent > 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 pb-1 text-right text-sm text-gray-500">Sconto {quote.global_discount_percent}%</td>
                        <td className="px-3 pb-1 text-right text-sm text-red-500">
                          -{((partsSubtotal + quote.transport_cost + quote.packaging_cost) * quote.global_discount_percent / 100).toFixed(2)} €
                        </td>
                      </tr>
                    )}
                    <tr className="border-t">
                      <td colSpan={5} className="p-3 text-right font-bold text-gray-800">Totale commessa</td>
                      <td className="p-3 text-right font-bold text-blue-700 text-base">{total.toFixed(2)} €</td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Quote details panel */}
          {selectedPartIdx === -1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Dati Preventivo</CardTitle>
              </CardHeader>
              <CardContent>
                <fieldset disabled={isLocked} className="border-0 p-0 m-0 disabled:opacity-90">
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
                </fieldset>
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
              treatments={treatments}
              nParts={quote.parts.length || 1}
              globalMarginPercent={quote.global_margin_percent}
              readOnly={isLocked}
              onUpdate={updates => updatePart(selectedPartIdx, updates)}
              onSave={() => savePart(selectedPartIdx)}
              onPhasesChange={phases => updatePart(selectedPartIdx, { phases })}
              onReload={() => reloadPart(selectedPartIdx)}
            />
          )}
        </div>
      </div>

      {/* Bottom total bar */}
      <div className="bg-white border-t px-6 py-3">
        <fieldset disabled={isLocked} className="border-0 p-0 m-0 disabled:opacity-90">
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
        </fieldset>
      </div>

      {/* Validation modal */}
      {validationIssues && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <span className="text-amber-500 text-lg">⚠</span>
              <h2 className="font-semibold text-gray-800">Preventivo incompleto</h2>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
              {validationIssues.map(({ partIdx, partCode, issues }) => (
                <div key={partIdx}>
                  <button
                    onClick={() => { setSelectedPartIdx(partIdx); setValidationIssues(null) }}
                    className="font-mono font-semibold text-blue-600 hover:underline text-sm"
                  >
                    {partCode}
                  </button>
                  <ul className="mt-1 space-y-0.5">
                    {issues.map(issue => (
                      <li key={issue} className="text-sm text-gray-600 flex items-start gap-1.5">
                        <span className="text-gray-400 mt-0.5">•</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-gray-400 pt-1">Clicca sul codice parte per navigare direttamente alla sezione.</p>
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setValidationIssues(null); setPendingPdfType(null) }}>
                Annulla
              </Button>
              <Button size="sm" onClick={() => {
                if (pendingPdfType) downloadPdf(pendingPdfType)
                setValidationIssues(null)
                setPendingPdfType(null)
              }}>
                Genera comunque →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
