import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Send, CheckCheck, Undo2, RotateCcw, Save, Hourglass, XCircle, Lock, History } from 'lucide-react'
import { calcPartTotals, calcQuoteTotal } from '@/lib/quoteCalc'
import { parseDecimal, parseDecimalOrNull } from '@/lib/decimalInput'
import type { Material, Category, Customer, Part, Quote, Machine, Treatment, Supplier, CompanySettings } from '@/types'
import api, { getApiErrorDetail } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import QuoteWizard from '@/components/quotes/QuoteWizard'
import PartCard from '@/components/quotes/PartCard'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { validateQuote } from '@/lib/quoteValidation'
import { toast } from 'sonner'
// Guscio editor (design handoff)
import { QuoteEditorTopBar, type EditorAction } from '@/components/quotes/QuoteEditorTopBar'
import { PartsSidebar } from '@/components/quotes/PartsSidebar'
import { ClonePartModal } from '@/components/quotes/ClonePartModal'
import { QuoteDataPanel, type QuoteDataValue } from '@/components/quotes/QuoteDataPanel'
import { CommessaSummaryTable, type CommessaRow } from '@/components/quotes/CommessaSummaryTable'
import { CloseoutPanel } from '@/components/quotes/CloseoutPanel'
import { QuoteBottomBar } from '@/components/quotes/QuoteBottomBar'
import type { QuoteType } from '@/components/quotes/TypeBadge'
import type { QuoteStatus } from '@/components/dashboard/StatusBadges'

const eur0 = (v: number) => '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })

export default function QuoteEditor() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { hasPermission, user } = useAuth()
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
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmUnconfirm, setConfirmUnconfirm] = useState(false)
  // AUD-7: gate di conferma unico per le azioni di workflow (conferma, attesa,
  // non ordinato, ripristina, rimanda). Porta con sé il testo-conseguenza.
  const [pendingStatus, setPendingStatus] = useState<{
    path: 'confirm' | 'reopen' | 'await-client' | 'revert-await' | 'mark-not-ordered' | 'restore'
    okMsg: string; title: string; description: string; confirmLabel: string
    variant?: 'default' | 'destructive'
  } | null>(null)
  const [confirmDeletePartIdx, setConfirmDeletePartIdx] = useState<number | null>(null)
  // Conferma prima di applicare uno sconto globale (>0): lo sconto tocca il
  // prezzo dell'intero preventivo, è un'azione deliberata.
  const [pendingDiscount, setPendingDiscount] = useState<number | null>(null)
  // Conferma prima di stampare lo stesso margine su tutte le parti (Blocco A):
  // sovrascrive i margini singoli.
  const [pendingApplyMargin, setPendingApplyMargin] = useState<number | null>(null)
  const [cloneSourceId, setCloneSourceId] = useState<number | null>(null)
  const [cloning, setCloning] = useState(false)
  // Rilevamento concorrenza: versione dell'aggregato vista dal server all'ultimo
  // sync (bump a ogni modifica). `staleConflict` = un'altra persona ha modificato.
  const serverVersion = useRef<string | undefined>(undefined)
  const [staleConflict, setStaleConflict] = useState(false)
  // Guardia "preventivo non tuo": chi apre un preventivo creato da un altro lo
  // vede in sola lettura finché non conferma di volerlo modificare (evita
  // modifiche accidentali al lavoro altrui). Vale per chiunque, non un ruolo.
  const [foreignEditConfirmed, setForeignEditConfirmed] = useState(false)
  const [askForeignEdit, setAskForeignEdit] = useState(false)

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
    }).catch(() => toast.error('Errore nel caricamento dei dati di catalogo (materiali, macchine, clienti…). Ricarica la pagina.'))
  }, [])

  // M5: i CompanySettings arrivano da una fetch async. Se l'utente tocca una
  // parte "a magazzino" mentre sono ancora null, l'anteprima usa il ramo
  // fallback (spedizione/taglio del fornitore) invece degli override stock,
  // divergendo dal backend. Appena disponibili, riallinea le parti a magazzino.
  useEffect(() => {
    if (!companySettings) return
    setQuote(q => {
      if (!q) return q
      const nFromStock = q.parts.filter(p => p.material_from_stock && !p.customer_supplied_material).length
      if (nFromStock === 0) return q   // nessuna parte a magazzino: niente da riallineare
      const nParts = q.parts.length || 1
      return { ...q, parts: q.parts.map(p => calcPartTotals(p, q.global_margin_percent, nParts, companySettings, nFromStock)) }
    })
  }, [companySettings])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setForeignEditConfirmed(false)   // ogni preventivo riparte in sola lettura se non è tuo
    api.get(`/quotes/${id}`).then(async res => {
      let q = res.data
      // M4: marcatura 'letto' esplicita all'apertura reale (non più side-effect
      // sulla GET). Solo chi conferma (amministrazione) su un 'inviato'. Se la
      // chiamata fallisce non blocchiamo l'apertura: si resta su 'inviato'.
      if (q.status === 'inviato' && hasPermission('quotes.confirm')) {
        try { q = (await api.post(`/quotes/${id}/read`)).data } catch { /* non bloccare l'apertura */ }
      }
      // M6: baseline della versione per il rilevamento concorrenza. Senza,
      // serverVersion restava undefined e il banner non scattava mai su
      // apri→modifica→Salva.
      serverVersion.current = q.updated_at
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
      // M5: ricalcola TUTTE le parti, non solo quella toccata. La spedizione
      // magazzino è distribuita su nFromStock (aggregato del preventivo): quando
      // cambia, le parti "a magazzino" sorelle vanno ricalcolate anche loro,
      // come fa il backend (recalculate_quote), altrimenti l'anteprima diverge.
      const parts = merged.map(p =>
        calcPartTotals(p, q.global_margin_percent, nParts, companySettings, nFromStock)
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

  // M6: re-sync leggero della versione dopo una NOSTRA scrittura che non passa
  // da un reload completo (es. salvataggio rapido di una fase). recalculate_quote
  // bumpa quote.updated_at: senza riallineare serverVersion il polling
  // scambierebbe la nostra modifica per una altrui (falso conflitto).
  const bumpVersion = useCallback(async () => {
    if (!id) return
    try {
      const res = await api.get(`/quotes/${id}/version`)
      serverVersion.current = res.data?.updated_at
      setStaleConflict(false)
    } catch { /* rete assente: il polling riproverà */ }
  }, [id])

  // Rilevamento concorrenza: polla la versione leggera dell'aggregato ogni 15s
  // e al focus della finestra. Se il server ha una updated_at diversa da quella
  // dell'ultimo sync, un'altra persona ha modificato il preventivo → banner
  // (avviso, non blocco: evita i falsi conflitti che frustrano).
  useEffect(() => {
    if (isNew || !id) return
    let alive = true
    const check = async () => {
      try {
        const res = await api.get(`/quotes/${id}/version`)
        if (!alive) return
        const v = res.data?.updated_at as string | undefined
        if (serverVersion.current && v && v !== serverVersion.current) setStaleConflict(true)
      } catch { /* rete assente: riprova al prossimo tick */ }
    }
    const timer = window.setInterval(check, 15000)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [isNew, id])

  const savePart = async (idx: number, override?: Partial<Part>) => {
    if (!quote) return
    const part = { ...quote.parts[idx], ...(override ?? {}) }
    if (!part?.id) return
    try {
      await api.put(`/parts/${part.id}`, {
        part_code: part.part_code, revision: part.revision, description: part.description, quantity: part.quantity,
        quote_mode: part.quote_mode, material_id: part.material_id,
        raw_x_mm: part.raw_x_mm, raw_y_mm: part.raw_y_mm, raw_z_mm: part.raw_z_mm,
        raw_diameter_mm: part.raw_diameter_mm, finished_weight_kg: part.finished_weight_kg,
        material_cost: part.material_cost, material_delivery_cost: part.material_delivery_cost,
        customer_supplied_material: part.customer_supplied_material ?? false,
        material_from_stock: part.material_from_stock ?? false,
        margin_percent: part.margin_percent, minimum_price: part.minimum_price,
        // total_cost/unit_price/total_price NON inviati: li ricalcola il backend
        // (recalculate_part) subito dopo il PUT. Inviarli era rumore fuorviante.
      })
      await reloadQuote()
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nel salvataggio della parte')); await reloadQuote() }
  }

  const reloadPart = async (_idx: number) => { await reloadQuote() }

  const clonePartOnto = async (targetIds: number[]) => {
    if (cloneSourceId == null) return
    setCloning(true)
    try {
      const res = await api.post(`/parts/${cloneSourceId}/clone-onto`, { target_ids: targetIds })
      const n = res.data?.cloned ?? targetIds.length
      toast.success(`Ricetta clonata su ${n} ${n === 1 ? 'articolo' : 'articoli'}`)
      setCloneSourceId(null)
      await reloadQuote()
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nella clonazione')) }
    finally { setCloning(false) }
  }

  const deletePart = async (idx: number) => {
    if (!quote) return
    const part = quote.parts[idx]
    if (part.id) {
      try {
        await api.delete(`/parts/${part.id}`)
        // F15: sposta la selezione SOLO se elimini proprio la parte
        // selezionata; eliminando una parte diversa, la selezione non deve
        // saltare (applyQuoteData la rimappa per id dopo il reload). Sposta
        // anche SOLO dopo un delete riuscito: se fallisce, la parte resta.
        if (idx === selectedPartIdx) setSelectedPartIdx(Math.max(0, idx - 1))
        await reloadQuote()
      } catch { toast.error("Errore nell'eliminazione della parte") }
    } else {
      // Ramo locale (parte mai salvata): nessun reload/rimap, gestisco lo
      // shift dell'indice a mano.
      if (idx === selectedPartIdx) setSelectedPartIdx(Math.max(0, idx - 1))
      else if (idx < selectedPartIdx) setSelectedPartIdx(selectedPartIdx - 1)
      setQuote(q => q ? { ...q, parts: q.parts.filter((_, i) => i !== idx) } : q)
    }
  }

  const addPart = async () => {
    if (!quote?.id) return
    try {
      const partCode = `${quote.quote_number}_${String(quote.parts.length + 1).padStart(2, '0')}`
      const targetIdx = quote.parts.length
      await api.post(`/quotes/${quote.id}/parts`, { part_code: partCode })
      await reloadQuote()   // riallinea anche la versione dell'aggregato
      setSelectedPartIdx(targetIdx)
    } catch { toast.error("Errore nell'aggiunta della parte") }
  }

  const applyQuoteData = (q: Quote & { transport_cost?: number; packaging_cost?: number; global_discount_percent?: number; validity_days?: number }) => {
    // Sync della versione: ogni volta che riceviamo il preventivo fresco dal
    // server (dopo un nostro salvataggio o un reload) allineiamo la versione
    // nota, così un conflitto rilevato è sempre una modifica ALTRUI.
    serverVersion.current = q.updated_at
    setStaleConflict(false)
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

  // `override`: valori appena editati da fondere sul quote PRIMA di comporre il
  // payload. Serve al commit-on-blur dei campi numerici (DecimalField): lo stato
  // React è ancora "vecchio" nello stesso tick, l'override porta il valore fresco.
  const saveQuote = async (override?: Partial<Quote>) => {
    if (!quote?.id) return
    const src = override ? { ...quote, ...override } : quote
    setSaving(true)
    try {
      // Campi quote-level (lo `status` non serve: il backend lo scarta).
      const quoteFields = {
        customer_name: src.customer_name, customer_id: src.customer_id,
        customer_reference: src.customer_reference,
        global_margin_percent: src.global_margin_percent,
        global_discount_percent: src.global_discount_percent,
        transport_cost: src.transport_cost, packaging_cost: src.packaging_cost,
        validity_days: src.validity_days, delivery_text: src.delivery_text,
        quote_date: src.quote_date, notes_customer: src.notes_customer,
        notes_internal: src.notes_internal,
      }
      const closeout = { sold_price: src.sold_price ?? null, actual_cost: src.actual_cost ?? null }
      // Su 'completo' un utente normale vede solo il consuntivo (pannelli
      // bloccati) → invia solo il closeout. Chi ha 'quotes.edit_locked' ha i
      // pannelli editabili: se non gli inviamo anche i campi quote-level, ogni
      // sua modifica (margine/sconto/note...) verrebbe scartata in silenzio.
      const payload = quote.status === 'completo'
        ? (hasPermission('quotes.edit_locked') ? { ...quoteFields, ...closeout } : closeout)
        : quoteFields
      const res = await api.put(`/quotes/${quote.id}`, payload)
      // M6: riallinea la versione al valore appena scritto, così il polling non
      // scambia il nostro stesso salvataggio per una modifica altrui.
      serverVersion.current = res.data?.updated_at ?? serverVersion.current
      toast.success('Preventivo salvato')
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nel salvataggio')) }
    finally { setSaving(false) }
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
    path: 'confirm' | 'reopen' | 'unconfirm' | 'await-client' | 'revert-await' | 'mark-not-ordered' | 'restore',
    okMsg: string,
  ) => {
    if (!quote?.id) return
    setSaving(true)
    try {
      const res = await api.post(`/quotes/${quote.id}/${path}`)
      applyQuoteData(res.data)
      toast.success(okMsg)
      // A3 — se la conferma NON completa (materiale ancora da ordinare) e chi
      // conferma non gestisce gli ordini, avvisa che il completamento dipende
      // da chi emette l'ordine materiale: evita il vicolo cieco silenzioso.
      if (path === 'confirm' && res.data?.status === 'confermato' && !hasPermission('orders.materials')) {
        toast.info('Il materiale va ancora ordinato: il preventivo si completerà quando chi gestisce gli ordini lo evade.')
      }
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Operazione non riuscita')
    } finally { setSaving(false) }
  }


  if (isNew) {
    return (
      <QuoteWizard categories={categories} customers={customers}
        onCreated={newId => navigate(`/quotes/${newId}`, { replace: true })} />
    )
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento...</div>
  if (!quote) return null

  const selectedPart = quote.parts[selectedPartIdx] ?? null
  const total = calcQuoteTotal(quote)
  const partsSubtotal = quote.parts.reduce((s, p) => s + (p.total_price || 0), 0)
  const hasExtras = quote.transport_cost > 0 || quote.packaging_cost > 0 || quote.global_discount_percent > 0
  // Conferma morbida: totale a zero/negativo o margine negativo sono quasi
  // sempre errori di battitura (sconto 100%, margine sbagliato). Non blocco,
  // ma chiedo conferma prima di bloccare il preventivo nello stato confermato.
  const confirmRiskReason =
    total <= 0 ? 'Il totale del preventivo è € 0 o negativo.'
    : (quote.global_margin_percent ?? 0) < 0 ? 'Il margine globale è negativo (vendita sottocosto).'
    : null
  // F16: avviso NON bloccante su invio/conferma quando una parte ha prezzo o
  // costo a zero (preventivo incompleto/rotto). Solo queste due condizioni: sono
  // i segnali più netti e non hanno falsi positivi (a differenza di "materiale
  // mancante", legittimo per conto-lavoro/magazzino). Il triangolino in sidebar
  // resta a coprire tutti i casi.
  const zeroPriceParts = quote.parts.filter(p => (p.total_cost ?? 0) === 0 || (p.unit_price ?? 0) === 0)
  const zeroPriceWarning = zeroPriceParts.length
    ? `Attenzione: ${zeroPriceParts.length === 1 ? 'la parte' : 'le parti'} `
      + `${zeroPriceParts.map(p => p.part_code).join(', ')} `
      + `${zeroPriceParts.length === 1 ? 'ha' : 'hanno'} prezzo o costo a zero. `
    : ''
  const askConfirm = () => setPendingStatus({
    path: 'confirm', okMsg: 'Preventivo confermato',
    title: 'Confermare il preventivo?',
    description: (confirmRiskReason ? `${confirmRiskReason} Di solito è un errore di battitura. ` : '')
      + zeroPriceWarning
      + 'Da qui il preventivo sarà bloccato in modifica. Procedere?',
    confirmLabel: 'Conferma',
    variant: (confirmRiskReason || zeroPriceParts.length) ? 'destructive' : 'default',
  })
  const partsWithIssues = new Set(validateQuote(quote).map(i => i.partIdx))
  const isLocked = !['bozza', 'in_revisione', 'inviato', 'letto', 'in_attesa_cliente'].includes(quote.status) && !hasPermission('quotes.edit_locked')
  // Guardia "non tuo": se il preventivo è di un altro utente resta in sola
  // lettura finché non confermi. `effectiveLocked` somma il blocco di workflow
  // (isLocked) e questa guardia → tutti i figli (parti, fasi, campi) la
  // rispettano già via la prop locked/readOnly, senza gattare ogni salvataggio.
  const isForeign = quote.created_by_user_id != null && !!user && quote.created_by_user_id !== user.id
  const creatorName = quote.created_by?.full_name || quote.created_by?.username || 'un altro utente'
  const editingBlocked = isForeign && !foreignEditConfirmed && !isLocked
  const effectiveLocked = isLocked || editingBlocked

  // ─── guscio: props ────────────────────────────────────────────────────────
  const st = quote.status
  const canConfirm = hasPermission('quotes.confirm')
  const inReview = st === 'inviato' || st === 'letto'          // pre-invio al cliente
  const preConfirm = inReview || st === 'in_attesa_cliente'    // esito ancora aperto
  const showUnconfirm = (hasPermission('quotes.edit_locked') || hasPermission('quotes.confirm')) && (st === 'confermato' || st === 'completo')
  const actions: EditorAction[] = [
    { key: 'send', label: 'Invia per revisione', icon: Send, variant: 'primary', onClick: submitForReview, show: (st === 'bozza' || st === 'in_revisione') && hasPermission('quotes.send') },
    { key: 'await', label: 'In attesa cliente', icon: Hourglass, variant: 'secondary', onClick: () => setPendingStatus({ path: 'await-client', okMsg: 'Offerta in attesa del cliente', title: 'Mettere in attesa del cliente?', description: "L'offerta risulterà in attesa della risposta del cliente.", confirmLabel: 'In attesa cliente' }), show: canConfirm && inReview },
    // B-4: uscita "morbida" dall'attesa cliente senza passare da bozza (torna a
    // letto/inviato), come già offre la lista (F19). Prima dall'editor l'unica
    // uscita era 'Rimanda in bozza', che azzerava submitted_at/read_at.
    { key: 'revert-await', label: 'Annulla attesa', icon: RotateCcw, variant: 'secondary', onClick: () => setPendingStatus({ path: 'revert-await', okMsg: 'Attesa cliente annullata', title: "Annullare l'attesa cliente?", description: 'Il preventivo torna in revisione, senza passare da bozza.', confirmLabel: 'Annulla attesa' }), show: canConfirm && st === 'in_attesa_cliente' },
    { key: 'confirm', label: 'Conferma ordine', icon: CheckCheck, variant: 'confirm', onClick: askConfirm, show: canConfirm && preConfirm },
    { key: 'notordered', label: 'Non ordinato', icon: XCircle, variant: 'muted', onClick: () => setPendingStatus({ path: 'mark-not-ordered', okMsg: 'Segnato come non ordinato', title: 'Segnare come non ordinato?', description: 'Il preventivo risulterà non ordinato (perso). Potrai ripristinarlo in seguito.', confirmLabel: 'Non ordinato', variant: 'destructive' }), show: canConfirm && preConfirm },
    { key: 'restore', label: 'Ripristina', icon: RotateCcw, variant: 'secondary', onClick: () => setPendingStatus({ path: 'restore', okMsg: 'Preventivo ripristinato', title: 'Ripristinare il preventivo?', description: 'Il preventivo torna in lavorazione.', confirmLabel: 'Ripristina' }), show: canConfirm && st === 'non_ordinato' },
    { key: 'reopen', label: 'Manda in revisione', icon: Undo2, variant: 'ghost', onClick: () => setPendingStatus({ path: 'reopen', okMsg: 'Mandato in revisione', title: 'Sei sicuro di mandare in revisione il preventivo?', description: 'Il preventivo tornerà modificabile (stato "in revisione") e il prezzo attuale verrà salvato per il confronto con le modifiche.', confirmLabel: 'Manda in revisione' }), show: canConfirm && preConfirm },
    { key: 'unconfirm', label: 'Annulla conferma', icon: RotateCcw, variant: 'muted', onClick: () => setConfirmUnconfirm(true), show: showUnconfirm },
    { key: 'save', label: 'Salva', icon: Save, variant: 'primary', onClick: saveQuote, show: !effectiveLocked },
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
    validityDays: String(quote.validity_days ?? ''),
    deliveryText: quote.delivery_text || '',
    notesCustomer: quote.notes_customer || '',
    notesInternal: quote.notes_internal || '',
  }
  const onQuoteDataChange = (field: keyof QuoteDataValue, val: string) => setQuote(q => {
    if (!q) return q
    switch (field) {
      case 'customerReference': return { ...q, customer_reference: val }
      case 'deliveryText': return { ...q, delivery_text: val }
      case 'notesCustomer': return { ...q, notes_customer: val }
      case 'notesInternal': return { ...q, notes_internal: val }
      default: return q
    }
  })
  const onQuoteDataBlur = () => saveQuote()
  // Validità: commit atomico al blur.
  const onQuoteDataCommit = (_field: 'validityDays', raw: string) => {
    const n = parseInt(raw, 10) || 30
    setQuote(q => q ? { ...q, validity_days: n } : q)
    saveQuote({ validity_days: n })
  }
  // Margine su tutte le parti (Blocco A): conferma → endpoint bulk → reload.
  const onApplyMarginToAll = (raw: string) => setPendingApplyMargin(parseDecimal(raw) || 0)
  const doApplyMargin = async (n: number) => {
    setPendingApplyMargin(null)
    if (!quote?.id) return
    try {
      await api.post(`/quotes/${quote.id}/apply-margin`, { margin_percent: n })
      await reloadQuote()
      toast.success(`Margine ${String(n).replace('.', ',')}% applicato a tutte le parti`)
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nell\'applicazione del margine')) }
  }

  const commessaRows: CommessaRow[] = quote.parts.map((p, idx) => ({
    id: p.id ?? idx, partCode: p.part_code, description: p.description || '—', quantity: p.quantity,
    costPerPart: p.total_cost ?? 0, unitPrice: p.unit_price ?? 0, totalPrice: p.total_price ?? 0,
    hasIssues: partsWithIssues.has(idx),
  }))
  const discountAmount = (partsSubtotal + quote.transport_cost + quote.packaging_cost) * (quote.global_discount_percent || 0) / 100

  const onBottomCommit = (field: 'transport' | 'packaging' | 'discountPercent', raw: string) => {
    const n = parseDecimal(raw) || 0
    // Sconto positivo e diverso dall'attuale → conferma prima di applicare.
    // Rimozione (→0) o valore invariato: applica diretto, senza popup.
    if (field === 'discountPercent' && n > 0 && n !== (quote.global_discount_percent ?? 0)) {
      setPendingDiscount(n)
      return
    }
    const patch: Partial<Quote> = field === 'transport' ? { transport_cost: n }
      : field === 'packaging' ? { packaging_cost: n }
      : { global_discount_percent: n }
    setQuote(q => q ? { ...q, ...patch } : q)
    saveQuote(patch)
  }
  const applyDiscount = (n: number) => {
    setPendingDiscount(null)
    setQuote(q => q ? { ...q, global_discount_percent: n } : q)
    saveQuote({ global_discount_percent: n })
  }

  const soldMargin = (quote.sold_price ?? 0) - (quote.actual_cost ?? 0)
  const soldMarginPct = quote.sold_price ? (soldMargin / quote.sold_price) * 100 : 0
  const closeoutMarginLabel = `${eur0(soldMargin)}${quote.sold_price ? ` · ${soldMarginPct.toFixed(1).replace('.', ',')}%` : ''}`

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
        isRevision={!!quote.revision_baseline_at}
        lockedText={quote.status === 'confermato' ? 'Preventivo confermato — non più modificabile.' : 'Preventivo completo — non più modificabile.'}
        onBack={() => navigate('/quotes/active')}
        busy={saving}
      />

      {/* TD-16: banner confronto prezzo per i preventivi in revisione. */}
      {quote.revision_baseline_total != null && (() => {
        const prev = quote.revision_baseline_total
        const now = quote.final_total ?? 0
        const delta = now - prev
        return (
          <div className="flex items-center gap-3 border-b border-state-revisione/30 bg-state-revisione/10 px-5 py-2.5 text-sm text-foreground">
            <History className="h-4 w-4 flex-none text-state-revisione" />
            <span className="flex-1">
              Revisione — prezzo precedente <b className="font-mono">{eur0(prev)}</b> → attuale{' '}
              <b className="font-mono">{eur0(now)}</b>
              {Math.abs(delta) >= 0.5 && (
                <span className={`ml-2 font-mono font-semibold ${delta > 0 ? 'text-success' : 'text-danger'}`}>
                  ({delta > 0 ? '+' : ''}{eur0(delta)})
                </span>
              )}
            </span>
          </div>
        )
      })()}

      {staleConflict && (
        <div className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-5 py-2.5 text-sm text-foreground">
          <RotateCcw className="h-4 w-4 flex-none text-warning" />
          <span className="flex-1">
            Questo preventivo è stato modificato da un'altra persona mentre lo avevi aperto.
            Ricarica per vedere le modifiche prima di salvare, o rischi di sovrascriverle.
          </span>
          <button
            type="button"
            onClick={reloadQuote}
            className="flex-none rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-white transition-[filter] hover:brightness-105"
          >
            Ricarica
          </button>
        </div>
      )}

      {editingBlocked && (
        <div className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-5 py-2.5 text-sm text-foreground">
          <Lock className="h-4 w-4 flex-none text-warning" />
          <span className="flex-1">
            Questo preventivo è stato creato da <b>{creatorName}</b>, non da te.
            È in sola lettura per evitare modifiche accidentali al lavoro altrui.
          </span>
          <button
            type="button"
            onClick={() => setAskForeignEdit(true)}
            className="flex-none rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-white transition-[filter] hover:brightness-105"
          >
            Modifica comunque
          </button>
        </div>
      )}
      {isForeign && foreignEditConfirmed && !isLocked && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 flex-none" />
          Stai modificando un preventivo di{' '}
          <b className="font-semibold text-foreground">{creatorName}</b> — non è tuo.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <PartsSidebar
          parts={sidebarParts}
          selected={selectedPartIdx === -1 ? 'quote' : (quote.parts[selectedPartIdx]?.id ?? 'quote')}
          canAddParts={quote.quote_type !== 'single'}
          locked={effectiveLocked}
          onSelect={(sel) => setSelectedPartIdx(sel === 'quote' ? -1 : idxOf(sel))}
          onAdd={addPart}
          onClone={(pid) => setCloneSourceId(pid)}
          onDelete={(pid) => setConfirmDeletePartIdx(idxOf(pid))}
        />

        <div className="flex-1 overflow-y-auto p-6 pb-24">
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
            <QuoteDataPanel
              value={quoteData}
              locked={effectiveLocked}
              onChange={onQuoteDataChange}
              onCommit={onQuoteDataCommit}
              onBlur={onQuoteDataBlur}
              marginDefault={String(quote.global_margin_percent ?? '')}
              partCount={quote.parts.length}
              onApplyMarginToAll={onApplyMarginToAll}
            />
          )}

          {selectedPartIdx === -1 && quote.status === 'completo' && (
            <CloseoutPanel
              soldPrice={quote.sold_price != null ? String(quote.sold_price) : ''}
              actualCost={quote.actual_cost != null ? String(quote.actual_cost) : ''}
              marginLabel={closeoutMarginLabel}
              marginPositive={soldMargin >= 0}
              onCommit={(field, raw) => {
                const key = field === 'soldPrice' ? 'sold_price' : 'actual_cost'
                const v = parseDecimalOrNull(raw)
                setQuote(q => q ? { ...q, [key]: v } : q)
                saveQuote({ [key]: v })
              }}
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
              readOnly={effectiveLocked}
              onUpdate={updates => updatePart(selectedPartIdx, updates)}
              onSave={(override) => savePart(selectedPartIdx, override)}
              onPhasesChange={phases => updatePart(selectedPartIdx, { phases })}
              onReload={() => reloadPart(selectedPartIdx)}
              onSaved={bumpVersion}
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
        taxable={partsSubtotal + quote.transport_cost + quote.packaging_cost}
        discountAmount={discountAmount}
        total={total}
        locked={effectiveLocked}
        onCommit={onBottomCommit}
      />

      <ConfirmDialog
        open={confirmSubmit}
        variant={zeroPriceParts.length ? 'destructive' : 'default'}
        title="Inviare il preventivo per revisione?"
        description={zeroPriceWarning + 'Non potrai più modificarlo come bozza.'}
        confirmLabel="Invia"
        onConfirm={doSubmitForReview}
        onCancel={() => setConfirmSubmit(false)}
      />
      <ConfirmDialog
        open={pendingStatus !== null}
        variant={pendingStatus?.variant ?? 'default'}
        title={pendingStatus?.title ?? ''}
        description={pendingStatus?.description}
        confirmLabel={pendingStatus?.confirmLabel ?? 'Conferma'}
        onConfirm={() => { const p = pendingStatus; setPendingStatus(null); if (p) doStatus(p.path, p.okMsg) }}
        onCancel={() => setPendingStatus(null)}
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
        open={pendingDiscount !== null}
        title="Applicare lo sconto?"
        description={
          pendingDiscount !== null
            ? `Stai applicando uno sconto del ${String(pendingDiscount).replace('.', ',')}% sull'intero preventivo (− ${eur0((partsSubtotal + quote.transport_cost + quote.packaging_cost) * pendingDiscount / 100)}). Confermi?`
            : undefined
        }
        confirmLabel="Applica sconto"
        onConfirm={() => { if (pendingDiscount !== null) applyDiscount(pendingDiscount) }}
        onCancel={() => setPendingDiscount(null)}
      />
      <ConfirmDialog
        open={pendingApplyMargin !== null}
        title="Applicare il margine a tutte le parti?"
        description={
          pendingApplyMargin !== null
            ? `Tutte le ${quote.parts.length} parti prenderanno il margine del ${String(pendingApplyMargin).replace('.', ',')}%. Gli eventuali margini impostati sulle singole parti verranno sovrascritti.`
            : undefined
        }
        confirmLabel="Applica a tutte"
        onConfirm={() => { if (pendingApplyMargin !== null) doApplyMargin(pendingApplyMargin) }}
        onCancel={() => setPendingApplyMargin(null)}
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
      <ConfirmDialog
        open={askForeignEdit}
        variant="default"
        title="Modificare un preventivo non tuo?"
        description={`Questo preventivo è stato creato da ${creatorName}. Continuando potrai modificarlo e le tue modifiche sovrascriveranno il suo lavoro. Vuoi procedere?`}
        confirmLabel="Sì, modifica"
        onConfirm={() => { setForeignEditConfirmed(true); setAskForeignEdit(false) }}
        onCancel={() => setAskForeignEdit(false)}
      />

      {cloneSourceId != null && quote && (() => {
        const src = quote.parts.find(p => p.id === cloneSourceId)
        if (!src) return null
        const targets = quote.parts
          .filter(p => p.id != null && p.id !== cloneSourceId)
          .map(p => ({ id: p.id as number, part_code: p.part_code, description: p.description || '' }))
        return (
          <ClonePartModal
            sourceCode={src.part_code}
            targets={targets}
            busy={cloning}
            onConfirm={clonePartOnto}
            onClose={() => setCloneSourceId(null)}
          />
        )
      })()}
    </div>
  )
}
