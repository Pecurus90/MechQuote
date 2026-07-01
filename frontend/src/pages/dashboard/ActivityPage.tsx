import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import api from '@/lib/api'
import { timeAgo } from '@/lib/timeAgo'
import { ACTIVITY_KIND } from '@/lib/activity'
import type { ActivityRow } from '@/types'
import { Activity as ActivityIcon, Search } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import { toast } from 'sonner'

type TypeFilter = 'all' | 'quote_submitted' | 'quote_completed' | 'materials_ordered' | 'tools_low_stock_alert'

export default function ActivityPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ActivityRow[]>([])
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 30
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string | number> = { page, page_size: pageSize }
    if (typeFilter !== 'all') params.type = typeFilter
    if (search.trim()) params.q = search.trim()
    const t = setTimeout(() => {
      api.get('/activity', { params })
        .then(r => setItems(r.data))
        .catch(() => toast.error('Errore nel caricamento attività'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [page, typeFilter, search])

  const onRowClick = (a: ActivityRow) => {
    const quoteId = typeof a.data?.quote_id === 'number' ? a.data.quote_id : null
    if (quoteId) navigate(`/quotes/${quoteId}`)
  }

  return (
    <StandardPage
      icon={ActivityIcon}
      color="gray"
      width="xl"
      title="Attività del team"
      subtitle="Log delle modifiche ai preventivi (chi, quando, cosa)"
      actions={
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-72">
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Cerca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="titolo, preventivo, autore..."
                value={search}
                onChange={e => { setPage(1); setSearch(e.target.value) }}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Filtro tipo</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={typeFilter}
              onChange={e => { setPage(1); setTypeFilter(e.target.value as TypeFilter) }}
            >
              <option value="all">Tutti</option>
              <option value="quote_submitted">Inviati</option>
              <option value="quote_completed">Completati</option>
              <option value="materials_ordered">Ordini materiali</option>
              <option value="tools_low_stock_alert">Utensili sotto minimo</option>
            </select>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Caricamento...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nessuna attività</div>
            ) : (
              <ul>
                {items.map(a => {
                  const kind = ACTIVITY_KIND[a.type]
                  const isCompleted = a.type === 'quote_completed'
                  const quoteId = typeof a.data?.quote_id === 'number' ? a.data.quote_id : null
                  const actorName = a.created_by?.full_name || a.created_by?.username || '—'
                  return (
                    <li
                      key={a.id}
                      onClick={() => onRowClick(a)}
                      className={`border-b last:border-0 px-4 py-3 ${quoteId ? 'cursor-pointer hover:bg-muted' : ''} ${isCompleted ? 'bg-green-50/40' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-xs text-muted-foreground w-20 shrink-0 pt-0.5">{timeAgo(a.created_at)}</div>
                        {kind ? (
                          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${kind.pillClass}`}>
                            {kind.icon}
                            {kind.label}
                          </span>
                        ) : (
                          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                            {a.type}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                          {a.body && <p className="text-xs text-muted-foreground truncate">{a.body}</p>}
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0 max-w-[160px] truncate" title={actorName}>
                          {actorName}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center gap-2">
        {page > 1 && (
          <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)}>← Precedente</Button>
        )}
        <span className="flex items-center px-4 text-sm text-muted-foreground">Pagina {page}</span>
        {items.length >= pageSize && (
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Successiva →</Button>
        )}
      </div>
    </StandardPage>
  )
}
