import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Send, CheckCheck, Undo2, RotateCcw, FileDown, Save, Hourglass, XCircle } from 'lucide-react'
import { calcPartTotals, calcQuoteTotal } from '@/lib/quoteCalc'
import { parseDecimal } from '@/lib/decimalInput'
import type { Material, Category, Customer, Part, Quote, Machine, Treatment, Supplier, CompanySettings } from '@/types'
import api, { getApiErrorDetail } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import QuoteWizard from '@/components/quotes/QuoteWizard'
import PartCard from '@/components/quotes/PartCard'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import DieQuoteEditor from '@/pages/DieQuoteEditor'
import { validateQuote } from '@/lib/quoteValidation'
import type { PartIssue } from '@/lib/quoteValidation'
import { toast } from 'sonner'
// Guscio editor (design handoff)
import { QuoteEditorTopBar, type EditorAction } from '@/components/quotes/QuoteEditorTopBar'
import { PartsSidebar } from '@/components/quotes/PartsSidebar'
import { QuoteDataPanel, type QuoteDataValue } from '@/components/quotes/QuoteDataPanel'
import { CommessaSummaryTable, type CommessaRow } from '@/components/quotes/CommessaSummaryTable'
import { CloseoutPanel } from '@/components/quotes/CloseoutPanel'
import { QuoteBottomBar } from '@/components/quotes/QuoteBottomBar'
import { QuoteValidationModal, type ValidationPart } from '@/components/quotes/QuoteValidationModal'
import type { QuoteType } from '@/components/quotes/TypeBadge'
import type { QuoteStatus } from '@/components/dashboard/StatusBadges'

const eur0 = (v: number) => '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })

export default function QuoteEditor() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
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
  const [confirmUnconfirm, setConfirmUnconfirm] = useState(false)
  const [confirmDeletePartIdx, setConfirmDeletePartIdx] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      api.get('/machines?active=true'),
      api.get('/materials?active=true'),
      api.get('/quote-categories'),
      api.get('/customers'),
      api.get('/suppliers?active=true'),
      api.get('/treatments?active=true'),
      api.get('/company-settings'),
    ]).then(([m, mat, cat, cust, sup, tr, cs]) => {
      setMachines(m.data); setMaterials(mat.data); setCategories(cat.data)
      setCustomers(cust.data); setSuppliers(sup.data); setTreatments(tr.data); setCompanySettings(cs.data)
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
      const merged = q.parts.map((p, i) => i === idx ? { ...p, ...updates } : p)
      const nFromStock = merged.filter(p => p.material_from_stock && !p.customer_supplied_material).length
      const parts = merged.map((p, i) =>
        i === idx ? calcPartTotals(p, q.global_margin_percent, nParts, companySettings, nFromStock) : p
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
    const part = { ...quote.parts[idx], ...(override ?? {}) }
    if (!part?.id) return
    try {
      await api.put(`/parts/${part.id}`, {
        part_code: part.part_code, description: part.description, quantity: part.quantity,
        quote_mode: part.quote_mode, material_id: part.material_id,
        raw_x_mm: part.raw_x_mm, raw_y_mm: part.raw_y_mm, raw_z_mm: part.raw_z_mm,
        raw_diameter_mm: part.raw_diameter_mm, finished_weight_kg: part.finished_weight_kg,
        material_cost: part.material_cost, material_delivery_cost: part.material_delivery_cost,
        customer_supplied_material: part.customer_supplied_material ?? false,
        material_from_stock: part.material_from_stock ?? false,
        margin_percent: part.margin_percent, minimum_price: part.minimum_price,
        total_cost: part.total_cost, unit_price: part.unit_price, total_price: part.total_price,
      })
      await reloadQuote()
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nel salvataggio della parte')) }
  }

  const reloadPart = async (_idx: number) => { await reloadQuote() }

  const duplicatePart = async (idx: number) => {
    if (!quote) return
    const part = quote.parts[idx]
    if (!part.id) return
    try {
      const res = await api.post(`/parts/${part.id}/duplicate`)
      setQuote(q => q ? { ...q, parts: [...q.parts, { ...res.data, phases: res.data.phases || [] }] } : q)
      toast.success('Parte duplicata')
    } catch { toast.error('Errore nella duplicazione') }
  }

  const deletePart = async (idx: number) => {
    if (!quote) return
    const part = quote.parts[idx]
    setSelectedPartIdx(Math.max(0, idx - 1))
    if (part.id) {
      try {
        await api.delete(`/parts/${part.id}`)
        await reloadQuote()
      } catch { toast.error("Errore nell'eliminazione della parte") }
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
    } catch { toast.error("Errore nell'aggiunta della parte") }
  }

  const applyQuoteData = (q: Quote & { transport_cost?: number; packaging_cost?: number; global_discount_percent?: number; validity_days?: number }) => {
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
      if (newIdx !== -1 && newIdx !== selectedPartIdx) setSelectedPartIdx(newIdx)
    }
  }

  const saveQuote = async () => {
    if (!quote?.id) return
    setSaving(true)
    try {
      const payload = quote.status === 'completo'
        ? { sold_price: quote.sold_price ?? null, actual_cost: quote.actual_cost ?? null }
        : {
            customer_name: quote.customer_name, customer_id: quote.customer_id,
            customer_reference: quote.customer_reference,
            global_margin_percent: quote.global_margin_percent,
            global_discount_percent: quote.global_discount_percent,
            transport_cost: quote.transport_cost, packaging_cost: quote.packaging_cost,
            validity_days: quote.validity_days, delivery_text: quote.delivery_text,
            quote_date: quote.quote_date, notes_customer: quote.notes_customer,
            notes_internal: quote.notes_internal, status: quote.status,
          }
      await api.put(`/quotes/${quote.id}`, payload)
      toast.success('Preventivo salvato')
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nel salvataggio')) }
    finally { setSaving(false) }
  }

  const saveQuoteAndRecalculate = async () => {
    if (!quote?.id) return
    await saveQuote()
    try {
      const res = await api.post(`/quotes/${quote.id}/recalculate`)
      applyQuoteData(res.data)
    } catch { toast.error('Errore nel ricalcolo') }
  }

  const submitForReview = () => { if (quote?.id) setConfirmSubmit(true) }
  const doSubmitForReview = async () => {
    setConfirmSubmit(false)
    if (!quote?.id) return
    setSaving(true)
    try {
      await api.put(`/quotes/${quote.id}`, {
        customer_name: quote.customer_name, customer_id: quote.customer_id,
        customer_reference: quote.customer_reference,
        global_margin_percent: quote.global_margin_percent,
        global_discount_percent: quote.global_discount_percent,
        transport_cost: quote.transport_cost, packaging_cost: quote.packaging_cost,
        validity_days: quote.validity_days, delivery_text: quote.delivery_text,
        quote_date: quote.quote_date, notes_customer: quote.notes_customer,
        notes_internal: quote.notes_internal,
      })
      const res = await api.patch(`/quotes/${quote.id}/status`, { status: 'inviato' })
      applyQuoteData(res.data)
      toast.success('Preventivo inviato per revisione')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? "Errore nell'invio")
    } finally { setSaving(false) }
  }

  // Workflow: conferma / rimanda in bozza / annulla conferma (ex QuoteStatusActions).
  const doStatus = async (
    path: 'confirm' | 'reopen' | 'unconfirm' | 'await-client' | 'mark-not-ordered' | 'restore',
    okMsg: string,
  ) => {
    if (!quote?.id) return
    setSaving(true)
    try {
      const res = await api.post(`/quotes/${quote.id}/${path}`)
      applyQuoteData(res.data)
      toast.success(okMsg)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Operazione non riuscita')
    } finally { setSaving(false) }
  }

  const downloadPdf = async () => {
    if (!quote?.id) return
    try {
      const res = await api.get(`/quotes/${quote.id}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url; a.download = `preventivo_${quote.quote_number}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      toast.success('PDF generato')
    } catch { toast.error('Errore nella generazione del PDF') }
  }

  const handlePdfClick = () => {
    if (!quote) return
    const issues = validateQuote(quote)
    if (issues.length > 0) { setValidationIssues(issues); setPendingPdfType(true) }
    else downloadPdf()
  }

  if (isNew) {
    return (
      <QuoteWizard categories={categories} customers={customers}
        onCreated={newId => navigate(`/quotes/${newId}`, { replace: true })} />
    )
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento...</div>
  if (!quote) return null
  if (quote.quote_type === 'die') return <DieQuoteEditor />

  const selectedPart = quote.parts[selectedPartIdx] ?? null
  const total = calcQuoteTotal(quote)
  const partsSubtotal = quote.parts.reduce((s, p) => s + (p.total_price || 0), 0)
  const hasExtras = quote.transport_cost > 0 || quote.packaging_cost > 0 || quote.global_discount_percent > 0
  const partsWithIssues = new Set(validateQuote(quote).map(i => i.partIdx))
  const isLocked = !['bozza', 'inviato', 'letto', 'in_attesa_cliente'].includes(quote.status) && !hasPermission('quotes.edit_locked')

  // ─── guscio: props ────────────────────────────────────────────────────────
  const st = quote.status
  const canConfirm = hasPermission('quotes.confirm')
  const inReview = st === 'inviato' || st === 'letto'          // pre-invio al cliente
  const preConfirm = inReview || st === 'in_attesa_cliente'    // esito ancora aperto
  const showUnconfirm = hasPermission('quotes.edit_locked') && (st === 'confermato' || st === 'completo')
  const actions: EditorAction[] = [
    { key: 'send', label: 'Invia per revisione', icon: Send, variant: 'primary', onClick: submitForReview, show: st === 'bozza' && hasPermission('quotes.send') },
    { key: 'await', label: 'In attesa cliente', icon: Hourglass, variant: 'secondary', onClick: () => doStatus('await-client', 'Offerta in attesa del cliente'), show: canConfirm && inReview },
    { key: 'confirm', label: 'Conferma ordine', icon: CheckCheck, variant: 'confirm', onClick: () => doStatus('confirm', 'Preventivo confermato'), show: canConfirm && preConfirm },
    { key: 'notordered', label: 'Non ordinato', icon: XCircle, variant: 'muted', onClick: () => doStatus('mark-not-ordered', 'Segnato come non ordinato'), show: canConfirm && preConfirm },
    { key: 'restore', label: 'Ripristina', icon: RotateCcw, variant: 'secondary', onClick: () => doStatus('restore', 'Preventivo ripristinato'), show: canConfirm && st === 'non_ordinato' },
    { key: 'reopen', label: 'Rimanda in bozza', icon: Undo2, variant: 'ghost', onClick: () => doStatus('reopen', 'Rimandato in bozza'), show: canConfirm && preConfirm },
    { key: 'unconfirm', label: 'Annulla conferma', icon: RotateCcw, variant: 'muted', onClick: () => setConfirmUnconfirm(true), show: showUnconfirm },
    { key: 'pdf', label: 'PDF', icon: FileDown, variant: 'secondary', onClick: handlePdfClick, show: true },
    { key: 'save', label: 'Salva', icon: Save, variant: 'primary', onClick: saveQuote, show: !isLocked },
  ]

  const fmtD = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : undefined
  const stepDates: Partial<Record<QuoteStatus, string>> = {
    bozza: fmtD(quote.quote_date), inviato: fmtD(quote.submitted_at), letto: fmtD(quote.read_at),
    in_attesa_cliente: fmtD(quote.awaiting_client_at),
    confermato: fmtD(quote.confirmed_at), completo: fmtD(quote.completed_at),
    non_ordinato: fmtD(quote.not_ordered_at),
  }

  const sidebarParts = quote.parts.map((p, idx) => ({
    id: p.id ?? idx, part_code: p.part_code, description: p.description || '—',
    total_price: p.total_price || 0, hasIssues: partsWithIssues.has(idx),
  }))
  const idxOf = (partId: number) => quote.parts.findIndex(p => p.id === partId)

  const quoteData: QuoteDataValue = {
    customerReference: quote.customer_reference || '',
    globalMarginPercent: String(quote.global_margin_percent ?? ''),
    validityDays: String(quote.validity_days ?? ''),
    deliveryText: quote.delivery_text || '',
    notesCustomer: quote.notes_customer || '',
    notesInternal: quote.notes_internal || '',
  }
  const onQuoteDataChange = (field: keyof QuoteDataValue, val: string) => setQuote(q => {
    if (!q) return q
    switch (field) {
      case 'customerReference': return { ...q, customer_reference: val }
      case 'globalMarginPercent': return { ...q, global_margin_percent: parseDecimal(val) || 0 }
      case 'validityDays': return { ...q, validity_days: parseInt(val, 10) || 30 }
      case 'deliveryText': return { ...q, delivery_text: val }
      case 'notesCustomer': return { ...q, notes_customer: val }
      case 'notesInternal': return { ...q, notes_internal: val }
      default: return q
    }
  })
  const onQuoteDataBlur = (field: keyof QuoteDataValue) => {
    if (field === 'globalMarginPercent') saveQuoteAndRecalculate(); else saveQuote()
  }

  const commessaRows: CommessaRow[] = quote.parts.map((p, idx) => ({
    id: p.id ?? idx, partCode: p.part_code, description: p.description || '—', quantity: p.quantity,
    costPerPart: p.total_cost ?? 0, unitPrice: p.unit_price ?? 0, totalPrice: p.total_price ?? 0,
    hasIssues: partsWithIssues.has(idx),
  }))
  const discountAmount = (partsSubtotal + quote.transport_cost + quote.packaging_cost) * (quote.global_discount_percent || 0) / 100

  const onBottomChange = (field: 'transport' | 'packaging' | 'discountPercent', val: string) => setQuote(q => {
    if (!q) return q
    const n = parseDecimal(val) || 0
    if (field === 'transport') return { ...q, transport_cost: n }
    if (field === 'packaging') return { ...q, packaging_cost: n }
    return { ...q, global_discount_percent: n }
  })

  const soldMargin = (quote.sold_price ?? 0) - (quote.actual_cost ?? 0)
  const soldMarginPct = quote.sold_price ? (soldMargin / quote.sold_price) * 100 : 0
  const closeoutMarginLabel = `${eur0(soldMargin)}${quote.sold_price ? ` · ${soldMarginPct.toFixed(1).replace('.', ',')}%` : ''}`

  const validationParts: ValidationPart[] = (validationIssues ?? []).map(pi => ({
    id: pi.partIdx,
    label: `${pi.partCode}${quote.parts[pi.partIdx]?.description ? ` · ${quote.parts[pi.partIdx].description}` : ''}`,
    issues: pi.issues,
  }))

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      <QuoteEditorTopBar
        quoteNumber={quote.quote_number}
        customerName={quote.customer_name || '—'}
        type={quote.quote_type as QuoteType}
        status={quote.status as QuoteStatus}
        stepDates={stepDates}
        actions={actions}
        locked={isLocked}
        lockedText={quote.status === 'confermato' ? 'Preventivo confermato — non più modificabile.' : 'Preventivo completo — non più modificabile.'}
        onBack={() => navigate('/quotes/active')}
      />

      <div className="flex flex-1 overflow-hidden">
        <PartsSidebar
          parts={sidebarParts}
          selected={selectedPartIdx === -1 ? 'quote' : (quote.parts[selectedPartIdx]?.id ?? 'quote')}
          canAddParts={quote.quote_type !== 'single'}
          locked={isLocked}
          onSelect={(sel) => setSelectedPartIdx(sel === 'quote' ? -1 : idxOf(sel))}
          onAdd={addPart}
          onDuplicate={(pid) => duplicatePart(idxOf(pid))}
          onDelete={(pid) => setConfirmDeletePartIdx(idxOf(pid))}
        />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[1200px] space-y-5">
          {selectedPartIdx === -1 && quote.parts.length > 1 && (
            <CommessaSummaryTable
              quoteNumber={quote.quote_number}
              rows={commessaRows}
              subtotal={partsSubtotal}
              transport={quote.transport_cost}
              packaging={quote.packaging_cost}
              discountPercent={quote.global_discount_percent || 0}
              discountAmount={discountAmount}
              total={total}
              onOpenPart={(pid) => setSelectedPartIdx(idxOf(pid))}
            />
          )}

          {selectedPartIdx === -1 && (
            <QuoteDataPanel value={quoteData} locked={isLocked} onChange={onQuoteDataChange} onBlur={onQuoteDataBlur} />
          )}

          {selectedPartIdx === -1 && quote.status === 'completo' && (
            <CloseoutPanel
              soldPrice={quote.sold_price != null ? String(quote.sold_price) : ''}
              actualCost={quote.actual_cost != null ? String(quote.actual_cost) : ''}
              marginLabel={closeoutMarginLabel}
              marginPositive={soldMargin >= 0}
              onChange={(field, val) => setQuote(q => q ? { ...q, [field === 'soldPrice' ? 'sold_price' : 'actual_cost']: val ? parseFloat(val.replace(',', '.')) : null } : q)}
              onBlur={saveQuote}
            />
          )}

          {selectedPartIdx >= 0 && !selectedPart && (
            <div className="pt-16 text-center text-muted-foreground">Seleziona una parte dalla lista</div>
          )}

          {selectedPartIdx >= 0 && selectedPart && (
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
      </div>

      <QuoteBottomBar
        nParts={quote.parts.length}
        transport={String(quote.transport_cost ?? '')}
        packaging={String(quote.packaging_cost ?? '')}
        discountPercent={String(quote.global_discount_percent ?? '')}
        subtotal={hasExtras ? partsSubtotal : undefined}
        total={total}
        locked={isLocked}
        onChange={onBottomChange}
        onBlur={saveQuote}
      />

      <QuoteValidationModal
        open={validationIssues !== null}
        parts={validationParts}
        onOpenPart={(idx) => { setSelectedPartIdx(idx); setValidationIssues(null); setPendingPdfType(false) }}
        onCancel={() => { setValidationIssues(null); setPendingPdfType(false) }}
        onGenerate={() => { if (pendingPdfType) downloadPdf(); setValidationIssues(null); setPendingPdfType(false) }}
      />

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
        open={confirmUnconfirm}
        title="Annulla conferma"
        description="Il preventivo torna a 'letto' e diventa di nuovo modificabile. Gli ordini materiale già emessi restano nello storico, ma le coppie preventivo–fornitore vengono azzerate: il materiale andrà riordinato. Procedere?"
        confirmLabel="Annulla conferma"
        onConfirm={() => { setConfirmUnconfirm(false); doStatus('unconfirm', 'Conferma annullata') }}
        onCancel={() => setConfirmUnconfirm(false)}
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
        onConfirm={async () => { if (confirmDeletePartIdx !== null) await deletePart(confirmDeletePartIdx); setConfirmDeletePartIdx(null) }}
        onCancel={() => setConfirmDeletePartIdx(null)}
      />
    </div>
  )
}
