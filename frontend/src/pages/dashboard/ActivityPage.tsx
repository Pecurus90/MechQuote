import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import api from '@/lib/api'
import { timeAgo } from '@/lib/timeAgo'
import type { ActivityRow } from '@/types'
import { Activity as ActivityIcon, Search } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import { toast } from 'sonner'
import { ACTIVITY_KINDS } from '@/lib/activity'

type TypeFilter = 'all' | 'quote_submitted' | 'quote_confirmed' | 'quote_completed' | 'quote_not_ordered'
  | 'materials_ordered' | 'tools_ordered' | 'material_to_order' | 'tools_low_stock_alert'
  | 'direct_sale_created' | 'direct_sale_deleted'

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

  const rangeStart = items.length ? (page - 1) * pageSize + 1 : 0
  const rangeEnd = (page - 1) * pageSize + items.length

  return (
    <StandardPage
      icon={ActivityIcon}
      color="gray"
      width="xl"
      title="Attività del team"
      subtitle="Log del team: preventivi (invio, conferma, completo, perso), ordini, materiali, utensili e vendite"
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="titolo, preventivo, autore…" value={search}
              onChange={e => { setPage(1); setSearch(e.target.value) }} className="h-9 pl-9 text-sm" />
          </div>
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={typeFilter} onChange={e => { setPage(1); setTypeFilter(e.target.value as TypeFilter) }}>
            <option value="all">Tutti i tipi</option>
            <option value="quote_submitted">Preventivi inviati</option>
            <option value="quote_confirmed">Preventivi confermati</option>
            <option value="quote_completed">Preventivi completati</option>
            <option value="quote_not_ordered">Preventivi non ordinati</option>
            <option value="materials_ordered">Ordini materiali</option>
            <option value="tools_ordered">Ordini utensili</option>
            <option value="material_to_order">Fabbisogno materiale</option>
            <option value="tools_low_stock_alert">Utensili sotto minimo</option>
            <option value="direct_sale_created">Vendite dirette</option>
            <option value="direct_sale_deleted">Vendite eliminate</option>
          </select>
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">Caricamento…</div>
        ) : items.length === 0 ? (
          <div className="p-10">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><ActivityIcon className="h-5 w-5" /></div>
              <div className="text-sm font-medium text-foreground">Nessuna attività</div>
              {(search || typeFilter !== 'all') && (
                <button onClick={() => { setSearch(''); setTypeFilter('all'); setPage(1) }} className="mt-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">Azzera filtri</button>
              )}
            </div>
          </div>
        ) : (
          <ul className="px-4 py-1.5">
            {items.map((a, i) => {
              const kind = ACTIVITY_KINDS[a.type]
              const Icon = kind?.Icon ?? ActivityIcon
              const quoteId = typeof a.data?.quote_id === 'number' ? a.data.quote_id : null
              const actorName = kind?.system ? 'Sistema' : (a.created_by?.full_name || a.created_by?.username || '—')
              const isCompleted = a.type === 'quote_completed'
              const last = i === items.length - 1
              return (
                <li key={a.id} className="relative flex gap-3 pb-4">
                  {/* Connettore verticale */}
                  {!last && <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border" />}
                  <div className={`z-10 flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full ${kind?.cls ?? 'bg-muted text-muted-foreground'}`}>
                    <Icon className="h-[15px] w-[15px]" />
                  </div>
                  <div
                    onClick={() => onRowClick(a)}
                    onKeyDown={e => { if (quoteId && e.key === 'Enter') onRowClick(a) }}
                    role={quoteId ? 'link' : undefined}
                    tabIndex={quoteId ? 0 : undefined}
                    className={`min-w-0 flex-1 rounded-lg px-3 py-2 ${quoteId ? 'cursor-pointer hover:bg-muted/[0.45]' : ''} ${isCompleted ? 'bg-success/[0.05]' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[13.5px] font-semibold text-foreground">{a.title}</span>
                          <span className={`inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${kind?.cls ?? 'bg-muted text-muted-foreground'}`}>
                            <Icon className="h-2.5 w-2.5" />{kind?.label ?? a.type}
                          </span>
                        </div>
                        {a.body && <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.body}</p>}
                      </div>
                      <div className="flex-none text-right">
                        <div className="max-w-[160px] truncate text-[12.5px] font-semibold text-foreground" title={actorName}>{actorName}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{timeAgo(a.created_at)}</div>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">
          {items.length ? `Mostrate ${rangeStart}–${rangeEnd}` : '—'}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Precedente</Button>
          <Button variant="outline" size="sm" disabled={items.length < pageSize} onClick={() => setPage(p => p + 1)}>Successiva →</Button>
        </div>
      </div>
    </StandardPage>
  )
}
