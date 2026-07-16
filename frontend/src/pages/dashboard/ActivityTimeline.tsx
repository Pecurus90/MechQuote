// src/pages/dashboard/ActivityTimeline.tsx
import type { LucideIcon } from 'lucide-react'
import {
  Send,
  CheckCheck,
  PackageCheck,
  RotateCcw,
  Truck,
  AlertTriangle,
  Clock,
  Hourglass,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/timeAgo'

interface ActivityItem {
  id: number
  type: string
  title: string
  body?: string | null
  created_at: string | null
  quoteId?: number | null
}

interface Props {
  items: ActivityItem[]
  onOpen: (quoteId: number) => void
}

// Classi statiche (niente interpolazione: Tailwind JIT deve poterle vedere).
const TYPE_META: Record<string, { icon: LucideIcon; cls: string }> = {
  quote_submitted: { icon: Send, cls: 'bg-state-inviato/15 text-state-inviato' },
  quote_confirmed: { icon: CheckCheck, cls: 'bg-confirmed/15 text-confirmed' },
  quote_completed: { icon: PackageCheck, cls: 'bg-success/15 text-success' },
  quote_reopened: { icon: RotateCcw, cls: 'bg-state-letto/15 text-state-letto' },
  quote_awaiting_client: { icon: Hourglass, cls: 'bg-state-attesa/15 text-state-attesa' },
  quote_not_ordered: { icon: XCircle, cls: 'bg-state-perso/15 text-state-perso' },
  quote_restored: { icon: RotateCcw, cls: 'bg-state-letto/15 text-state-letto' },
  materials_ordered: { icon: Truck, cls: 'bg-info/15 text-info' },
  tools_ordered: { icon: Truck, cls: 'bg-info/15 text-info' },
  tools_low_stock_alert: { icon: AlertTriangle, cls: 'bg-warning/15 text-warning' },
}

const FALLBACK = { icon: Clock, cls: 'bg-muted text-muted-foreground' }

// Il numero preventivo dentro il titolo (es. 240-26A_001) va reso in mono.
// Formato reale (vedi generatore in NewQuote*Page): CUST-YY<CAT>_PROG con CUST
// e PROG a 3+ cifre (padStart 3, ma 4 se >=1000), YY 2 cifre, CAT 1-2 lettere.
const QUOTE_NUMBER = /(\d{3,}-\d{2}[A-Z]{1,2}_\d{3,})/g

function renderTitle(title: string) {
  // split con gruppo di cattura → i match cadono agli indici dispari.
  const parts = title.split(QUOTE_NUMBER)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-mono font-semibold">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

export function ActivityTimeline({ items, onOpen }: Props) {
  return (
    <div className="rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="mb-4 text-[15px] font-semibold text-foreground">Attività recente</div>
      <div className="flex flex-col">
        {items.map((item, idx) => {
          const meta = TYPE_META[item.type] ?? FALLBACK
          const Icon = meta.icon
          const last = idx === items.length - 1
          const clickable = item.quoteId != null
          return (
            <div
              key={item.id}
              onClick={() => clickable && onOpen(item.quoteId as number)}
              className={cn(
                'relative flex gap-3',
                !last && 'pb-4',
                clickable && 'cursor-pointer',
              )}
            >
              {!last && (
                <span className="absolute left-[13px] top-[26px] bottom-0 w-[1.5px] bg-border" />
              )}
              <div
                className={cn(
                  'z-[1] flex h-7 w-7 flex-none items-center justify-center rounded-full',
                  meta.cls,
                )}
              >
                <Icon className="h-[15px] w-[15px]" />
              </div>
              <div className="pt-0.5">
                <div className="text-[13px] leading-[1.45] text-foreground">
                  {renderTitle(item.title)}
                </div>
                <div className="mt-px text-[11.5px] text-muted-foreground">
                  {item.body ? `${item.body} · ` : ''}
                  {timeAgo(item.created_at)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
