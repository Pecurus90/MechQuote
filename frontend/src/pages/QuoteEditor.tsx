import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { calcPartTotals, calcQuoteTotal } from '@/lib/quoteCalc'
import { parseDecimal } from '@/lib/decimalInput'
import type { Material, Category, Customer, Part, Quote, Machine, Treatment, Supplier, CompanySettings } from '@/types'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth'
import QuoteWizard from '@/components/quotes/QuoteWizard'
import PartCard from '@/components/quotes/PartCard'
import PartsSidebar from '@/components/quotes/PartsSidebar'
import QuoteBottomBar from '@/components/quotes/QuoteBottomBar'
import QuoteValidationModal from '@/components/quotes/QuoteValidationModal'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import QuoteTopBar from '@/pages/QuoteEditor/QuoteTopBar'
import DieSpecPanel from '@/components/quotes/DieSpecPanel'
import DieCostSummary from '@/components/quotes/DieCostSummary'
import DieIsometricView from '@/components/quotes/DieIsometricView'
import SimilarDiesPanel from '@/components/quotes/SimilarDiesPanel'
import NormalizedItemsEditor from '@/components/quotes/NormalizedItemsEditor'
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
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const [selectedPartIdx, setSelectedPartIdx] = useState(0)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [validationIssues, setValidationIssues] = useState<PartIssue[] | null>(null)
  const [pendingPdfType, setPendingPdfType] = useState<boolean>(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmDeletePartIdx, setConfirmDeletePartIdx] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      api.get('/machines'),
      api.get('/materials'),
      api.get('/quote-categories'),
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/treatments'),
      api.get('/company-settings'),
    ]).then(([m, mat, cat, cust, sup, tr, cs]) => {
      setMachines(m.data)
      setMaterials(mat.data)
      setCategories(cat.data)
      setCustomers(cust.data)
      setSuppliers(sup.data)
      setTreatments(tr.data)
      setCompanySettings(cs.data)
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

  const reloadQuote = async () => {
    if (!quote?.id) return
    try {
      const res = await api.get(`/quotes/${quote.id}`)
      applyQuoteData(res.data)
    } catch { toast.error('Errore nel ricaricamento del preventivo') }
  }

  const savePart = async (idx: number, override?: Partial<Part>) => {
    if (!quote) return
    // `override` consente al chiamante di passare valori freschi senza
    // aspettare il re-render: utile per i toggle (checkbox) dove
    // `quote` in closure è ancora il valore vecchio.
    const part = { ...quote.parts[idx], ...(override ?? {}) }
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
        customer_supplied_material: part.customer_supplied_material ?? false,
        material_from_stock: part.material_from_stock ?? false,
        margin_percent: part.margin_percent,
        minimum_price: part.minimum_price,
        total_cost: part.total_cost,
        unit_price: part.unit_price,
        total_price: part.total_price,
      })
      // Le aggregazioni commessa (trattamenti batch, spedizioni condivise)
      // possono modificare ANCHE le altre parti: ricarico l'intero quote
      // per riflettere lo stato del backend coerentemente.
      await reloadQuote()
    } catch (e) {toast.error('Errore nel salvataggio della parte') }
  }

  // reloadPart legacy: ricarica l'intero quote (le aggregazioni rendono
  // la singola parte non più isolabile). Nome lasciato per compatibilità
  // con i chiamanti (PartCard.onReload).
  const reloadPart = async (_idx: number) => {
    await reloadQuote()
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
    // Sposta la selezione PRIMA del reload: applyQuoteData ri-mappa
    // selectedPartIdx per ID, ma la parte cancellata non c'è più → niente
    // remap. Spostiamo manualmente sull'indice precedente prima del fetch.
    setSelectedPartIdx(Math.max(0, idx - 1))
    if (part.id) {
      try {
        await api.delete(`/parts/${part.id}`)
        // reloadQuote (non setQuote locale): il backend ricalcola il
        // preventivo dopo il delete (recalculate_quote in parts.py),
        // così le siblings con stesso supplier materiale o stesso
        // trattamento batch vedono le quote ridistribuite correttamente.
        await reloadQuote()
      } catch (e) {
        toast.error('Errore nell\'eliminazione della parte')
      }
    } else {
      setQuote(q => q ? { ...q, parts: q.parts.filter((_, i) => i !== idx) } : q)
    }
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
    // Salva l'ID della parte attualmente selezionata PRIMA del setQuote.
    // Se il backend restituisce le parti in ordine diverso (race su refresh
    // dopo POST/PUT phase, autocalc EDM, trattamenti batch…), `selectedPartIdx`
    // punterebbe a una parte diversa → l'utente vede "saltare" l'articolo.
    // Il fix backend (order_by="Part.id" su Quote.parts) lo previene a monte;
    // questo è una safety net frontend per resilienza ai re-load.
    const currentSelectedId = selectedPartIdx >= 0 ? quote?.parts?.[selectedPartIdx]?.id : null
    const newParts = (q.parts || []).map((p: Part) => ({ ...p, phases: p.phases || [] }))
    setQuote({
      ...q,
      transport_cost: q.transport_cost ?? 0,
      packaging_cost: q.packaging_cost ?? 0,
      global_discount_percent: q.global_discount_percent ?? 0,
      validity_days: q.validity_days ?? 30,
      parts: newParts,
    })
    if (currentSelectedId != null) {
      const newIdx = newParts.findIndex(p => p.id === currentSelectedId)
      if (newIdx !== -1 && newIdx !== selectedPartIdx) {
        setSelectedPartIdx(newIdx)
      }
    }
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

  const submitForReview = () => {
    if (!quote?.id) return
    setConfirmSubmit(true)
  }
  const doSubmitForReview = async () => {
    setConfirmSubmit(false)
    if (!quote?.id) return
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

  const downloadPdf = async () => {
    if (!quote?.id) return
    try {
      const res = await api.get(`/quotes/${quote.id}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `preventivo_${quote.quote_number}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast.success('PDF generato')
    } catch (e) {toast.error('Errore nella generazione del PDF') }
  }

  const handlePdfClick = () => {
    if (!quote) return
    const issues = validateQuote(quote)
    if (issues.length > 0) {
      setValidationIssues(issues)
      setPendingPdfType(true)
    } else {
      downloadPdf()
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
  const isDie = quote.quote_type === 'die'

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      <QuoteTopBar
        quote={quote}
        isLocked={isLocked}
        saving={saving}
        canSubmit={hasPermission('quotes.send')}
        canCloneDie={isDie && hasPermission('dies.create')}
        onSave={saveQuote}
        onSubmitForReview={submitForReview}
        onPdfClick={handlePdfClick}
        onCloneDie={async () => {
          if (!quote.id) return
          if (!confirm('Duplicare questo preventivo come nuova revisione?')) return
          setSaving(true)
          try {
            const res = await api.post(`/dies/${quote.id}/clone`)
            toast.success(`Revisione creata: ${res.data.quote_number}`)
            navigate(`/quotes/${res.data.id}`)
          } catch (e) {
            const err = e as { response?: { data?: { detail?: string } } }
            toast.error(err?.response?.data?.detail || 'Errore nella duplicazione')
          } finally {
            setSaving(false)
          }
        }}
      />

      {isLocked && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span className="font-medium">🔒 Preventivo non più modificabile</span>
          <span className="text-amber-700">·</span>
          <span>{quote.status === 'inviato' ? 'È in attesa di lettura.' : 'È stato completato.'} Solo un admin può apportare modifiche.</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <PartsSidebar
          quote={quote}
          selectedPartIdx={selectedPartIdx}
          isLocked={isLocked}
          partsWithIssues={partsWithIssues}
          onSelect={setSelectedPartIdx}
          onAdd={addPart}
          onDuplicate={duplicatePart}
          onRequestDelete={setConfirmDeletePartIdx}
        />

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ─── Branch Preventivatore Stampi ─── */}
          {isDie && selectedPartIdx === -1 && quote.die_spec && (
            <>
              <DieCostSummary quote={quote} spec={quote.die_spec} />
              {!quote.die_spec.quick_mode && quote.parts.length > 0 && (
                <DieIsometricView plates={quote.parts} />
              )}
              <DieSpecPanel
                spec={quote.die_spec}
                readOnly={isLocked}
                onChange={next => setQuote(q => q ? { ...q, die_spec: next } : q)}
                onSaved={reloadQuote}
              />
              {quote.id && <SimilarDiesPanel quoteId={quote.id} />}
            </>
          )}
          {isDie && selectedPartIdx >= 0 && selectedPart && (
            <>
              <PartCard
                part={selectedPart}
                machines={machines}
                materials={materials}
                suppliers={suppliers}
                treatments={treatments}
                nParts={quote.parts.length || 1}
                globalMarginPercent={quote.global_margin_percent}
                siblings={quote.parts.filter((_, i) => i !== selectedPartIdx)}
                companySettings={companySettings}
                readOnly={isLocked}
                onUpdate={updates => updatePart(selectedPartIdx, updates)}
                onSave={(override) => savePart(selectedPartIdx, override)}
                onPhasesChange={phases => updatePart(selectedPartIdx, { phases })}
                onReload={() => reloadPart(selectedPartIdx)}
              />
              {selectedPart.id && (
                <NormalizedItemsEditor
                  partId={selectedPart.id}
                  items={selectedPart.normalized_items || []}
                  readOnly={isLocked}
                  onChanged={reloadQuote}
                />
              )}
            </>
          )}

          {/* ─── Branch standard (manuale + 2D) ─── */}
          {!isDie && selectedPartIdx === -1 && quote.parts.length > 1 && (
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

          {/* Quote details panel (solo branch standard) */}
          {!isDie && selectedPartIdx === -1 && (
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
                    <Input onFocus={e => e.currentTarget.select()} type="number" min={0} max={500} step={1} className="mt-1 h-9 text-sm"
                      value={quote.global_margin_percent}
                      onChange={e => setQuote(q => q ? { ...q, global_margin_percent: parseDecimal(e.target.value) || 0 } : q)}
                      onBlur={saveQuoteAndRecalculate} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Validità (giorni)</label>
                    <Input onFocus={e => e.currentTarget.select()} type="number" min={1} className="mt-1 h-9 text-sm"
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

          {!isDie && selectedPartIdx >= 0 && !selectedPart && (
            <div className="text-center text-gray-400 pt-16">Seleziona una parte dalla lista</div>
          )}

          {!isDie && selectedPartIdx >= 0 && selectedPart && (
            <PartCard
              part={selectedPart}
              machines={machines}
              materials={materials}
              suppliers={suppliers}
              treatments={treatments}
              nParts={quote.parts.length || 1}
              globalMarginPercent={quote.global_margin_percent}
              siblings={quote.parts.filter((_, i) => i !== selectedPartIdx)}
              companySettings={companySettings}
              readOnly={isLocked}
              onUpdate={updates => updatePart(selectedPartIdx, updates)}
              onSave={(override) => savePart(selectedPartIdx, override)}
              onPhasesChange={phases => updatePart(selectedPartIdx, { phases })}
              onReload={() => reloadPart(selectedPartIdx)}
            />
          )}
        </div>
      </div>

      <QuoteBottomBar
        quote={quote}
        isLocked={isLocked}
        partsSubtotal={partsSubtotal}
        total={total}
        hasExtras={hasExtras}
        onChange={updates => setQuote(q => q ? { ...q, ...updates } : q)}
        onBlur={saveQuote}
      />

      {validationIssues && (
        <QuoteValidationModal
          issues={validationIssues}
          onSelectPart={idx => { setSelectedPartIdx(idx); setValidationIssues(null) }}
          onClose={() => { setValidationIssues(null); setPendingPdfType(false) }}
          onProceed={() => {
            if (pendingPdfType) downloadPdf()
            setValidationIssues(null)
            setPendingPdfType(false)
          }}
        />
      )}
      <ConfirmDialog
        open={confirmSubmit}
        variant="default"
        title="Inviare il preventivo per revisione?"
        description="Non potrai più modificarlo come bozza."
        confirmLabel="Invia"
        onConfirm={doSubmitForReview}
        onCancel={() => setConfirmSubmit(false)}
      />
      <ConfirmDialog
        open={confirmDeletePartIdx !== null}
        title="Eliminare la parte?"
        description={
          confirmDeletePartIdx !== null && quote?.parts[confirmDeletePartIdx]
            ? `"${quote.parts[confirmDeletePartIdx].part_code}" verrà rimossa dal preventivo. Le quote di spedizione e trattamento delle altre parti saranno ricalcolate.`
            : undefined
        }
        confirmLabel="Elimina"
        onConfirm={async () => {
          if (confirmDeletePartIdx !== null) {
            await deletePart(confirmDeletePartIdx)
          }
          setConfirmDeletePartIdx(null)
        }}
        onCancel={() => setConfirmDeletePartIdx(null)}
      />
    </div>
  )
}
