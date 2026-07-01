import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import type { QuoteListItem as Quote, QuoteMaterialDetail } from '@/types'
import api from '@/lib/api'
import { FileText, FileDown, Plus, Trash2, Search, X, CheckCircle2, ChevronRight, ChevronDown } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import {
  MATERIAL_STATUS_LABELS, MATERIAL_STATUS_COLORS,
  PART_STATE_LABELS, PART_STATE_COLORS,
} from '@/lib/materialStatus'
import { useAuth } from '@/lib/auth'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'

interface Props {
  phase: 'active' | 'completed'
  title: string
  subtitle: string
  icon: LucideIcon
  /** Azioni rapide (Conferma con mini-dialog + PDF) — solo "Preventivi in corso". */
  showQuickActions?: boolean
}

// Stati sotto-filtrabili per fase (spec 18).
const ACTIVE_STATUSES = ['bozza', 'inviato', 'letto', 'confermato'] as const

export default function QuotesListView({ phase, title, subtitle, icon, showQuickActions = false }: Props) {
  const navigate = useNavigate()
  const { user, hasRole, hasPermission } = useAuth()
  const isAdmin = hasRole('admin')
  const canDelete = (q: Quote) => isAdmin || (q.created_by_user_id != null && q.created_by_user_id === user?.id)
  const canConfirm = hasPermission('quotes.confirm')
  const canPdf = hasPermission('quotes.pdf')

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [years, setYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [searchParams] = useSearchParams()
  const initialStatus = searchParams.get('status')
  const [statusFilter, setStatusFilter] = useState<string>(
    phase === 'active' && (ACTIVE_STATUSES as readonly string[]).includes(initialStatus ?? '')
      ? (initialStatus as string) : 'all'
  )
  const [typeFilter, setTypeFilter] = useState<'all' | 'single' | 'commessa' | 'die'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmQuoteId, setConfirmQuoteId] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailCache, setDetailCache] = useState<Record<number, QuoteMaterialDetail | 'loading'>>({})

  useEffect(() => {
    api.get('/quotes/years').then(res => setYears(res.data))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setSearchQuery(searchInput.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    loadQuotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, searchQuery, typeFilter, statusFilter, page])

  const loadQuotes = () => {
    setLoading(true)
    const params: Record<string, string | number> = { page, page_size: pageSize, phase }
    if (selectedYear) params.year = selectedYear
    if (searchQuery) params.q = searchQuery
    if (typeFilter !== 'all') params.quote_type = typeFilter
    if (statusFilter !== 'all') params.status = statusFilter
    api.get('/quotes/archive', { params }).then(res => {
      setQuotes(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const toggleExpand = (id: number) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (detailCache[id] === undefined) {
      setDetailCache(c => ({ ...c, [id]: 'loading' }))
      api.get(`/quotes/${id}/material-detail`)
        .then(r => setDetailCache(c => ({ ...c, [id]: r.data })))
        .catch(() => {
          setDetailCache(c => { const n = { ...c }; delete n[id]; return n })
          toast.error('Errore nel caricamento del dettaglio materiale')
        })
    }
  }

  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      await api.delete(`/quotes/${id}`)
      setConfirmDeleteId(null)
      toast.success('Preventivo eliminato')
      loadQuotes()
    } catch { toast.error('Errore nell\'eliminazione') }
    finally { setDeleting(false) }
  }

  const doConfirm = async (id: number) => {
    setConfirming(true)
    try {
      await api.post(`/quotes/${id}/confirm`)
      setConfirmQuoteId(null)
      toast.success('Preventivo confermato')
      loadQuotes()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nella conferma')
    } finally { setConfirming(false) }
  }

  const downloadPdf = async (q: Quote) => {
    try {
      const res = await api.get(`/quotes/${q.id}/pdf`, { responseType: 'blob' })
      const prefix = q.quote_type === 'die' ? 'preventivo_stampo' : 'preventivo'
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${prefix}_${q.quote_number}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch { toast.error('Errore nella generazione del PDF') }
  }

  const quoteTotal = (q: Quote) => {
    if (q.quote_type === 'die' && q.die_spec) {
      const ind = q.die_spec.cost_industrial || 0
      const margin = q.global_margin_percent || 0
      const discount = q.global_discount_percent || 0
      return ind * (1 + margin / 100) * (1 - discount / 100)
    }
    return q.parts?.reduce((s, p) => s + (p.total_price || 0), 0) ?? 0
  }

  const confirmingQuote = quotes.find(q => q.id === confirmDeleteId)
  const quoteToConfirm = quotes.find(q => q.id === confirmQuoteId)
  const colSpan = 8

  return (
    <PageContainer width="xl">
      <SettingsPageHeader
        icon={icon}
        color="blue"
        title={title}
        subtitle={subtitle}
        action={
          <PrimaryCtaButton color="blue" onClick={() => navigate('/quotes/new')}>
            <Plus className="w-4 h-4" /> Nuovo Preventivo
          </PrimaryCtaButton>
        }
      />

      <div className="flex gap-4 items-end flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label className="text-sm font-medium text-gray-600 mb-1 block">Cerca</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              className="h-9 pl-8 pr-8 text-sm"
              placeholder="Codice preventivo o cliente"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" title="Cancella">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1 block">Anno</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={selectedYear || ''}
            onChange={e => { setPage(1); setSelectedYear(e.target.value ? Number(e.target.value) : null) }}
          >
            <option value="">Tutti gli anni</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {phase === 'active' && (
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Stato</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={e => { setPage(1); setStatusFilter(e.target.value) }}
            >
              <option value="all">Tutti</option>
              <option value="bozza">Bozza</option>
              <option value="inviato">Inviato</option>
              <option value="letto">Letto</option>
              <option value="confermato">Confermato</option>
            </select>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1 block">Tipo</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={typeFilter}
            onChange={e => { setPage(1); setTypeFilter(e.target.value as typeof typeFilter) }}
          >
            <option value="all">Tutti</option>
            <option value="single">Singolo</option>
            <option value="commessa">Commessa</option>
            <option value="die">Stampi</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center p-8 text-gray-400">Caricamento...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-8 p-3"></th>
                  <th className="text-left p-3 font-medium text-gray-600">N. Preventivo</th>
                  <th className="text-left p-3 font-medium text-gray-600">Cliente</th>
                  <th className="text-left p-3 font-medium text-gray-600">Data</th>
                  <th className="text-left p-3 font-medium text-gray-600">Stato</th>
                  <th className="text-left p-3 font-medium text-gray-600">Materiale</th>
                  <th className="text-right p-3 font-medium text-gray-600">Totale</th>
                  <th className="text-center p-3 font-medium text-gray-600">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {quotes.length === 0 ? (
                  <tr><td colSpan={colSpan} className="p-6 text-center text-gray-400">Nessun preventivo trovato.</td></tr>
                ) : (
                  quotes.map(q => (
                    <Fragment key={q.id}>
                    <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/quotes/${q.id}`)}>
                      <td className="p-3 text-center">
                        <button
                          onClick={e => { e.stopPropagation(); toggleExpand(q.id) }}
                          className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"
                          title="Mostra articoli e stato materiale"
                        >
                          {expandedId === q.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="p-3 font-mono font-medium text-blue-700">
                        {q.quote_number}
                        {q.quote_type === 'die' && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-sans">Stampo</span>}
                        {q.quote_type === 'commessa' && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-sans">Commessa</span>}
                      </td>
                      <td className="p-3">{q.customer_name || '-'}</td>
                      <td className="p-3 text-gray-500">{q.quote_date?.split('T')[0]}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[q.status] || STATUS_COLORS.bozza}`}>
                          {STATUS_LABELS[q.status] || q.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {q.material_status
                          ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${MATERIAL_STATUS_COLORS[q.material_status] || 'bg-gray-100 text-gray-500'}`}>{MATERIAL_STATUS_LABELS[q.material_status] || q.material_status}</span>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="p-3 text-right font-medium">{quoteTotal(q).toFixed(2)} €</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); navigate(`/quotes/${q.id}`) }}>
                            <FileText className="w-3.5 h-3.5 mr-1" /> Apri
                          </Button>
                          {showQuickActions && canConfirm && (q.status === 'inviato' || q.status === 'letto') && (
                            <Button
                              variant="outline" size="sm"
                              className="text-violet-700 border-violet-200 hover:bg-violet-50"
                              onClick={e => { e.stopPropagation(); setConfirmQuoteId(q.id) }}
                              title="Conferma preventivo"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Conferma
                            </Button>
                          )}
                          {showQuickActions && canPdf && (
                            <Button
                              variant="outline" size="sm"
                              onClick={e => { e.stopPropagation(); downloadPdf(q) }}
                              title="Genera PDF"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canDelete(q) && (
                            <Button
                              variant="outline" size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
                              onClick={e => { e.stopPropagation(); setConfirmDeleteId(q.id) }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === q.id && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={colSpan} className="px-6 py-3">
                          {detailCache[q.id] === 'loading' || detailCache[q.id] === undefined ? (
                            <div className="text-sm text-gray-400 py-2">Caricamento articoli...</div>
                          ) : (detailCache[q.id] as QuoteMaterialDetail).articles.length === 0 ? (
                            <div className="text-sm text-gray-400 py-2">Nessun articolo in questo preventivo.</div>
                          ) : (
                            <table className="w-full text-xs bg-white rounded border">
                              <thead className="bg-gray-100 text-gray-500">
                                <tr>
                                  <th className="text-left p-2 font-medium">Codice</th>
                                  <th className="text-left p-2 font-medium">Materiale</th>
                                  <th className="text-left p-2 font-medium">Tipo</th>
                                  <th className="text-left p-2 font-medium">Misure</th>
                                  <th className="text-left p-2 font-medium">Trattamenti termici</th>
                                  <th className="text-left p-2 font-medium">Fornitore</th>
                                  <th className="text-left p-2 font-medium">Stato</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(detailCache[q.id] as QuoteMaterialDetail).articles.map(a => (
                                  <tr key={a.part_id} className="border-t">
                                    <td className="p-2 font-mono">{a.part_code}{a.revision ? ` / ${a.revision}` : ''}</td>
                                    <td className="p-2">{a.material_name || '—'}</td>
                                    <td className="p-2 text-gray-500">{a.family ? a.family.replace(/_/g, ' ') : '—'}</td>
                                    <td className="p-2 text-gray-600">{a.dimensions}</td>
                                    <td className="p-2 text-gray-600">{a.treatments.length ? a.treatments.join(', ') : '—'}</td>
                                    <td className="p-2">{a.supplier_name || '—'}</td>
                                    <td className="p-2">
                                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${PART_STATE_COLORS[a.state] || 'bg-gray-100 text-gray-500'}`}>
                                        {PART_STATE_LABELS[a.state] || a.state}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center gap-2">
        {page > 1 && <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)}>← Precedente</Button>}
        <span className="flex items-center px-4 text-sm text-gray-500">Pagina {page}</span>
        {quotes.length >= pageSize && <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Successiva →</Button>}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null && !!confirmingQuote}
        title="Elimina preventivo"
        description={
          confirmingQuote
            ? `Eliminare il preventivo ${confirmingQuote.quote_number}` +
              (confirmingQuote.customer_name ? ` (${confirmingQuote.customer_name})` : '') +
              `? Verranno cancellate anche tutte le parti e fasi associate. Azione non reversibile.`
            : undefined
        }
        confirmLabel={deleting ? 'Eliminazione...' : 'Elimina definitivamente'}
        onConfirm={() => { if (confirmDeleteId !== null) handleDelete(confirmDeleteId) }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <ConfirmDialog
        open={confirmQuoteId !== null && !!quoteToConfirm}
        variant="default"
        title="Conferma preventivo"
        description={
          quoteToConfirm
            ? `Confermare il preventivo ${quoteToConfirm.quote_number}${quoteToConfirm.customer_name ? ` (${quoteToConfirm.customer_name})` : ''}? Da qui non sarà più modificabile e si potrà ordinare il materiale.`
            : undefined
        }
        confirmLabel={confirming ? 'Conferma...' : 'Conferma preventivo'}
        onConfirm={() => { if (confirmQuoteId !== null) doConfirm(confirmQuoteId) }}
        onCancel={() => setConfirmQuoteId(null)}
      />
    </PageContainer>
  )
}
