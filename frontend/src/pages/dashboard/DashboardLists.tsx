import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Check, ChevronRight } from 'lucide-react'
import type { WorkflowStats, DashboardQuoteRow } from '@/types'
import type { Notification } from '@/lib/useNotifications'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import { timeAgo } from '@/lib/timeAgo'
import { ACTIVITY_KIND } from '@/lib/activity'

// 3 chip cliccabili con conteggio per stato. Click → archivio filtrato.
export function StatusChips({ stats, onClick }: {
  stats: WorkflowStats
  onClick: (status: 'bozza' | 'inviato' | 'letto' | 'confermato' | 'completo') => void
}) {
  const counts = stats.by_status
  // Spec 18: 5 stati. "In revisione" raggruppa inviato+letto (in mano ad
  // amministrazione). Il breakdown fine arriverà col redesign dashboard.
  const CHIPS = [
    { status: 'bozza' as const,      label: 'Bozze',        count: counts.bozza ?? 0,                                    colors: 'bg-gray-50 border-gray-200 hover:border-gray-400 text-gray-700' },
    { status: 'inviato' as const,    label: 'In revisione', count: (counts.inviato ?? 0) + (counts.letto ?? 0),          colors: 'bg-amber-50 border-amber-200 hover:border-amber-400 text-amber-800' },
    { status: 'confermato' as const, label: 'Confermati',   count: counts.confermato ?? 0,                               colors: 'bg-violet-50 border-violet-200 hover:border-violet-400 text-violet-800' },
    { status: 'completo' as const,   label: 'Completi',     count: counts.completo ?? 0,                                 colors: 'bg-green-50 border-green-200 hover:border-green-400 text-green-800' },
  ]
  return (
    <div className="grid grid-cols-4 gap-3">
      {CHIPS.map(c => (
        <button
          key={c.status}
          type="button"
          onClick={() => onClick(c.status)}
          className={`p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${c.colors}`}
        >
          <div className="text-3xl font-bold leading-none">{c.count}</div>
          <div className="text-sm font-medium mt-1">{c.label}</div>
        </button>
      ))}
    </div>
  )
}

export function QuoteListSection({
  title, count, rows, emptyText, icon, onClick, showSubmitter = false,
}: {
  title: string
  count: number
  rows: DashboardQuoteRow[]
  emptyText: string
  icon: React.ReactNode
  onClick: (id: number) => void
  showSubmitter?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
          <span className="text-sm font-normal text-gray-400">({count})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">{emptyText}</div>
        ) : (
          <ul>
            {rows.map(q => (
              <li
                key={q.id}
                onClick={() => onClick(q.id)}
                className="border-b last:border-0 px-4 py-2.5 cursor-pointer hover:bg-gray-50 flex items-center gap-3"
              >
                <span className="font-mono font-medium text-blue-700 text-sm shrink-0">{q.quote_number}</span>
                <span className="text-sm text-gray-600 truncate flex-1">{q.customer_name || '—'}</span>
                {showSubmitter && q.submitted_by && (
                  <span className="text-xs text-gray-400 shrink-0">
                    {q.submitted_by.full_name || q.submitted_by.username}
                    {q.submitted_at && <> · {timeAgo(q.submitted_at)}</>}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_COLORS[q.status] || STATUS_COLORS.bozza}`}>
                  {STATUS_LABELS[q.status] || q.status}
                </span>
                <span className="font-medium text-sm shrink-0 w-24 text-right">{q.total_price.toFixed(2)} €</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function ActivityCard({ items, onClick, onSeeAll }: {
  items: Notification[]
  onClick: (quoteId: number) => void
  onSeeAll?: () => void
}) {
  return (
    <Card className="lg:sticky lg:top-4 self-start">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base">Attività recente</CardTitle>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
            Tutte <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">Nessuna attività</div>
        ) : (
          <ul>
            {items.map(a => {
              const unread = !a.read_at
              const confirmed = !!a.confirmed_at
              const quoteId = typeof a.data?.quote_id === 'number' ? a.data.quote_id : null
              const kind = ACTIVITY_KIND[a.type]
              const isCompleted = a.type === 'quote_completed'
              return (
                <li
                  key={a.id}
                  onClick={() => quoteId && onClick(quoteId)}
                  className={`border-b last:border-0 px-4 py-3 ${quoteId ? 'cursor-pointer hover:bg-gray-50' : ''} ${isCompleted ? 'bg-green-50/40' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="pt-1.5 shrink-0">
                      {confirmed ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : unread ? (
                        <span className="block w-2 h-2 rounded-full bg-blue-500" />
                      ) : (
                        <span className="block w-2 h-2 rounded-full border border-gray-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2 justify-between">
                        <p className={`text-sm ${unread ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{a.title}</p>
                        {kind && (
                          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${kind.pillClass}`}>
                            {kind.icon}
                            {kind.label}
                          </span>
                        )}
                      </div>
                      {a.body && <p className="text-xs text-gray-500">{a.body}</p>}
                      <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(a.created_at)}</p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
