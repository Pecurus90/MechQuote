// Container liste preventivi: fetch + filtri + azioni + permessi + dettaglio
// materiale espandibile. La grafica è nella vista presentazionale
// (pages/quotes/QuotesListView, importata come QuotesListTable). Firma props
// invariata → QuotesActivePage / QuoteArchivePage non cambiano.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { toast } from 'sonner'
import PageContainer from '@/components/ui/page-container'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { PART_STATE_LABELS, PART_STATE_COLORS } from '@/lib/materialStatus'
import type { QuoteListItem as Quote, QuoteMaterialDetail } from '@/types'
import type { MaterialStatus } from '@/components/dashboard/StatusBadges'
import type { ArticleMaterialRow } from '@/components/quotes/QuoteArticleRows'
import {
  QuotesListView as QuotesListTable,
  type QuotesListRow, type ListFilters, type SelectOption,
} from '@/pages/quotes/QuotesListView'

interface Props {
  phase: 'active' | 'completed'
  title: string
  subtitle: string
  icon: LucideIcon
  /** Azioni rapide (Conferma + PDF) — solo "Preventivi in corso". */
  showQuickActions?: boolean
}

const ACTIVE_STATUSES = ['bozza', 'inviato', 'letto', 'in_attesa_cliente', 'confermato'] as const
const COMPLETED_STATUSES = ['completo', 'non_ordinato'] as const

export default function QuotesListView({ phase, title, subtitle, icon, showQuickActions = false }: Props) {
  const navigate = useNavigate()
  const { user, hasPermission } = useAuth()
  const canDeleteAny = hasPermission('quotes.delete')
  const canConfirmPerm = hasPermission('quotes.confirm')
  const canPdf = hasPermission('quotes.pdf')

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [years, setYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [searchParams] = useSearchParams()
  const initialStatus = searchParams.get('status')
  const validInitStatuses = (phase === 'active' ? ACTIVE_STATUSES : COMPLETED_STATUSES) as readonly string[]
  const [statusFilter, setStatusFilter] = useState<string>(
    validInitStatuses.includes(initialStatus ?? '') ? (initialStatus as string) : 'all'
  )
  const [typeFilter, setTypeFilter] = useState<ListFilters['type']>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmQuoteId, setConfirmQuoteId] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [notOrderedId, setNotOrderedId] = useState<number | null>(null)
  const [markingNotOrdered, setMarkingNotOrdered] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailCache, setDetailCache] = useState<Record<number, QuoteMaterialDetail | 'loading'>>({})

  useEffect(() => { api.get('/quotes/years').then(res => setYears(res.data)).catch(() => {}) }, [])

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
    api.get('/quotes/archive', { params }).then(res => { setQuotes(res.data); setLoading(false) }).catch(() => setLoading(false))
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
    try { await api.delete(`/quotes/${id}`); setConfirmDeleteId(null); toast.success('Preventivo eliminato'); loadQuotes() }
    catch { toast.error("Errore nell'eliminazione") }
    finally { setDeleting(false) }
  }

  const doConfirm = async (id: number) => {
    setConfirming(true)
    try { await api.post(`/quotes/${id}/confirm`); setConfirmQuoteId(null); toast.success('Preventivo confermato'); loadQuotes() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Errore nella conferma') }
    finally { setConfirming(false) }
  }

  const doMarkNotOrdered = async (id: number) => {
    setMarkingNotOrdered(true)
    try { await api.post(`/quotes/${id}/mark-not-ordered`); setNotOrderedId(null); toast.success('Segnato come non ordinato'); loadQuotes() }
    catch (e) { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err?.response?.data?.detail || 'Operazione non riuscita') }
    finally { setMarkingNotOrdered(false) }
  }

  const downloadPdf = async (q: Quote) => {
    try {
      const res = await api.get(`/quotes/${q.id}/pdf`, { responseType: 'blob' })
      const prefix = q.quote_type === 'die' ? 'preventivo_stampo' : 'preventivo'
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = `${prefix}_${q.quote_number}.pdf`
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
    } catch { toast.error('Errore nella generazione del PDF') }
  }

  const quoteTotal = (q: Quote): number => {
    if (q.quote_type === 'die' && q.die_spec) {
      const ind = q.die_spec.cost_industrial || 0
      const margin = q.global_margin_percent || 0
      const discount = q.global_discount_percent || 0
      return ind * (1 + margin / 100) * (1 - discount / 100)
    }
    return q.parts?.reduce((s, p) => s + (p.total_price || 0), 0) ?? 0
  }

  // ─── props presentazionali ───────────────────────────────────────────────
  const rows: QuotesListRow[] = quotes.map(q => ({
    ...q,
    total_price: quoteTotal(q),
    materialStatus: q.material_status ? (q.material_status as MaterialStatus) : undefined,
  }))

  const detail = expandedId != null ? detailCache[expandedId] : undefined
  const articleRows: ArticleMaterialRow[] = (detail && detail !== 'loading')
    ? detail.articles.map(a => ({
        partId: a.part_id,
        partCode: a.part_code,
        revision: a.revision,
        materialCode: a.material_name ?? '—',
        materialFamily: a.family ? a.family.replace(/_/g, ' ') : null,
        dimensions: a.dimensions,
        treatments: a.treatments,
        statusLabel: PART_STATE_LABELS[a.state] ?? a.state,
        statusClass: PART_STATE_COLORS[a.state] ?? 'bg-muted text-muted-foreground',
        supplierName: a.supplier_name,
      }))
    : []

  const filters: ListFilters = { search: searchInput, year: selectedYear ? String(selectedYear) : '', status: statusFilter, type: typeFilter }
  const onFilterChange = <K extends keyof ListFilters>(key: K, val: ListFilters[K]) => {
    if (key === 'search') { setSearchInput(val as string); return }
    setPage(1)
    if (key === 'year') setSelectedYear(val ? Number(val) : null)
    else if (key === 'status') setStatusFilter(val as string)
    else if (key === 'type') setTypeFilter(val as ListFilters['type'])
  }

  const yearOptions: SelectOption[] = [{ value: '', label: 'Tutti gli anni' }, ...years.map(y => ({ value: String(y), label: String(y) }))]
  const statusOptions: SelectOption[] = phase === 'active'
    ? [
        { value: 'all', label: 'Tutti' },
        { value: 'bozza', label: 'Bozza' },
        { value: 'inviato', label: 'Inviato' },
        { value: 'letto', label: 'Letto' },
        { value: 'in_attesa_cliente', label: 'Attesa cliente' },
        { value: 'confermato', label: 'Confermato' },
      ]
    : [
        { value: 'all', label: 'Tutti' },
        { value: 'completo', label: 'Completo' },
        { value: 'non_ordinato', label: 'Non ordinato' },
      ]

  const quoteToDelete = quotes.find(q => q.id === confirmDeleteId)
  const quoteToConfirm = quotes.find(q => q.id === confirmQuoteId)
  const quoteNotOrdered = quotes.find(q => q.id === notOrderedId)

  return (
    <PageContainer width="xl">
      <QuotesListTable
        title={title}
        icon={icon}
        subtitle={subtitle}
        onNew={() => navigate('/quotes/new')}
        rows={rows}
        emptyText={loading ? 'Caricamento…' : 'Nessun preventivo corrisponde ai filtri.'}
        expandedId={expandedId}
        onToggleExpand={toggleExpand}
        articleRows={articleRows}
        filters={filters}
        onFilterChange={onFilterChange}
        years={yearOptions}
        statusOptions={statusOptions}
        onOpen={(id) => navigate(`/quotes/${id}`)}
        onConfirm={showQuickActions && canConfirmPerm ? (id) => setConfirmQuoteId(id) : undefined}
        canConfirm={(r) => ['inviato', 'letto', 'in_attesa_cliente'].includes(r.status)}
        onNotOrdered={showQuickActions && canConfirmPerm ? (id) => setNotOrderedId(id) : undefined}
        canNotOrdered={(r) => ['inviato', 'letto', 'in_attesa_cliente'].includes(r.status)}
        onPdf={showQuickActions && canPdf ? (id) => { const q = quotes.find(x => x.id === id); if (q) downloadPdf(q) } : undefined}
        onDelete={(id) => setConfirmDeleteId(id)}
        canDelete={(r) => canDeleteAny || (r.created_by_user_id != null && r.created_by_user_id === user?.id)}
        pagination={
          <>
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
              className="rounded-[8px] border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40">
              ← Precedente
            </button>
            <span className="text-[13px] text-muted-foreground">Pagina {page}</span>
            <button type="button" disabled={quotes.length < pageSize} onClick={() => setPage(p => p + 1)}
              className="rounded-[8px] border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40">
              Successiva →
            </button>
          </>
        }
      />

      <ConfirmDialog
        open={confirmDeleteId !== null && !!quoteToDelete}
        title="Elimina preventivo"
        description={
          quoteToDelete
            ? `Eliminare il preventivo ${quoteToDelete.quote_number}` +
              (quoteToDelete.customer_name ? ` (${quoteToDelete.customer_name})` : '') +
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

      <ConfirmDialog
        open={notOrderedId !== null && !!quoteNotOrdered}
        variant="default"
        title="Segna come non ordinato"
        description={
          quoteNotOrdered
            ? `Il cliente non ha ordinato il preventivo ${quoteNotOrdered.quote_number}${quoteNotOrdered.customer_name ? ` (${quoteNotOrdered.customer_name})` : ''}? Passerà in archivio come "non ordinato" (reversibile).`
            : undefined
        }
        confirmLabel={markingNotOrdered ? 'Attendere...' : 'Segna non ordinato'}
        onConfirm={() => { if (notOrderedId !== null) doMarkNotOrdered(notOrderedId) }}
        onCancel={() => setNotOrderedId(null)}
      />
    </PageContainer>
  )
}
