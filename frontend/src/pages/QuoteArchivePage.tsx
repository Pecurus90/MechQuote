import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { QuoteListItem as Quote } from '@/types'
import api from '@/lib/api'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import { useAuth } from '@/lib/auth'
import { toast } from 'sonner'

export default function QuoteArchivePage() {
  const navigate = useNavigate()
  const { user, hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const canDelete = (q: Quote) => isAdmin || (q.created_by_user_id != null && q.created_by_user_id === user?.id)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [years, setYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'bozza' | 'inviato' | 'completato'>('all')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.get('/quotes/years').then(res => setYears(res.data))
  }, [])

  useEffect(() => {
    loadQuotes()
  }, [selectedYear, page])

  const loadQuotes = () => {
    setLoading(true)
    const params: Record<string, number> = { page, page_size: pageSize }
    if (selectedYear) params.year = selectedYear
    api.get('/quotes/archive', { params }).then(res => {
      setQuotes(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      await api.delete(`/quotes/${id}`)
      setConfirmDeleteId(null)
      toast.success('Preventivo eliminato')
      loadQuotes()
    } catch {
      toast.error('Errore nell\'eliminazione')
    } finally {
      setDeleting(false)
    }
  }

  const quoteTotal = (q: Quote) =>
    q.parts?.reduce((s, p) => s + (p.total_price || 0), 0) ?? 0

  // Normalizza i valori legacy del DB sotto i 3 stati visibili
  const normalizeStatus = (s: string): string => {
    if (s === 'bozza' || s === 'inviato' || s === 'completato') return s
    if (s === 'draft') return 'bozza'
    return 'completato'  // sent / inviato_cliente / vinto / perso
  }

  const visibleQuotes = statusFilter === 'all'
    ? quotes
    : quotes.filter(q => normalizeStatus(q.status) === statusFilter)

  const confirmingQuote = quotes.find(q => q.id === confirmDeleteId)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Archivio Preventivi</h1>
        <Button onClick={() => navigate('/quotes/manual/new')}>
          <Plus className="w-4 h-4 mr-1.5" /> Nuovo Preventivo
        </Button>
      </div>

      <div className="flex gap-4">
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
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1 block">Stato</label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={e => { setPage(1); setStatusFilter(e.target.value as typeof statusFilter) }}
          >
            <option value="all">Tutti</option>
            <option value="bozza">Bozza</option>
            <option value="inviato">Inviato</option>
            <option value="completato">Completato</option>
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
                  <th className="text-left p-3 font-medium text-gray-600">N. Preventivo</th>
                  <th className="text-left p-3 font-medium text-gray-600">Cliente</th>
                  <th className="text-left p-3 font-medium text-gray-600">Data</th>
                  <th className="text-left p-3 font-medium text-gray-600">Stato</th>
                  <th className="text-right p-3 font-medium text-gray-600">Totale</th>
                  <th className="text-center p-3 font-medium text-gray-600">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleQuotes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-400">
                      Nessun preventivo trovato.
                    </td>
                  </tr>
                ) : (
                  visibleQuotes.map(q => (
                    <tr
                      key={q.id}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/quotes/${q.id}`)}
                    >
                      <td className="p-3 font-mono font-medium text-blue-700">{q.quote_number}</td>
                      <td className="p-3">{q.customer_name || '-'}</td>
                      <td className="p-3 text-gray-500">{q.quote_date?.split('T')[0]}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[q.status] || STATUS_COLORS.bozza}`}>
                          {STATUS_LABELS[q.status] || q.status}
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium">{quoteTotal(q).toFixed(2)} €</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="outline" size="sm"
                            onClick={e => { e.stopPropagation(); navigate(`/quotes/${q.id}`) }}
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" /> Apri
                          </Button>
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
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Paginazione */}
      <div className="flex justify-center gap-2">
        {page > 1 && (
          <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)}>← Precedente</Button>
        )}
        <span className="flex items-center px-4 text-sm text-gray-500">Pagina {page}</span>
        {quotes.length >= pageSize && (
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Successiva →</Button>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirmDeleteId && confirmingQuote && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Elimina preventivo</h2>
                <p className="text-sm text-gray-500">Questa azione non è reversibile</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-6">
              Sei sicuro di voler eliminare il preventivo{' '}
              <span className="font-mono font-semibold text-blue-700">{confirmingQuote.quote_number}</span>
              {confirmingQuote.customer_name ? ` (${confirmingQuote.customer_name})` : ''}?
              <br />
              <span className="text-red-600 text-xs mt-1 block">
                Verranno eliminati anche tutte le parti e le fasi di lavorazione associate.
              </span>
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>
                Annulla
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleting}
              >
                {deleting ? 'Eliminazione...' : 'Elimina definitivamente'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
