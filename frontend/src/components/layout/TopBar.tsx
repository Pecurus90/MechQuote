// src/components/layout/TopBar.tsx
import { Search, Plus, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo, formatDateTime } from '@/lib/timeAgo'
import type { Notification } from '@/lib/useNotifications'

interface TopBarProps {
  search: string
  onSearch: (v: string) => void
  onSubmitSearch: () => void
  onNew?: () => void
  unreadCount: number
  notifOpen: boolean
  onToggleNotif: () => void
  notifications: Notification[]
  onOpenNotif: (n: Notification) => void
  onMarkAllRead: () => void
  onClearRead: () => void
}

// Pallino colorato per tipo evento (classi statiche per Tailwind JIT).
const DOT_CLASS: Record<string, string> = {
  quote_submitted: 'bg-state-inviato',
  quote_read: 'bg-state-letto',
  quote_confirmed: 'bg-confirmed',
  quote_completed: 'bg-success',
  quote_reopened: 'bg-state-letto',
  quote_awaiting_client: 'bg-state-attesa',
  quote_not_ordered: 'bg-state-perso',
  quote_restored: 'bg-state-letto',
  materials_ordered: 'bg-info',
  material_to_order: 'bg-warning',
  tools_ordered: 'bg-info',
  tools_low_stock_alert: 'bg-warning',
}

const QUOTE_NUMBER = /(\d{3}-\d{2}[A-Z]_\d{3})/g

function renderTitle(title: string) {
  // split con gruppo di cattura → i match cadono agli indici dispari.
  return title.split(QUOTE_NUMBER).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-mono font-semibold">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

export function TopBar({
  search,
  onSearch,
  onSubmitSearch,
  onNew,
  unreadCount,
  notifOpen,
  onToggleNotif,
  notifications,
  onOpenNotif,
  onMarkAllRead,
  onClearRead,
}: TopBarProps) {
  const hasRead = notifications.some((n) => n.read_at)
  return (
    <div className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-background/80 px-[26px] py-[11px] backdrop-blur">
      <form
        className="relative w-full max-w-[420px]"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmitSearch()
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Cerca preventivo, cliente, descrizione…"
          className="h-9 w-full rounded-[9px] border border-input bg-card pl-9 pr-3 text-[13px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/[0.18]"
        />
      </form>

      <div className="flex-1" />

      {onNew && (
        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-9 items-center gap-[7px] rounded-[9px] bg-primary px-[15px] text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105"
        >
          <Plus className="h-[15px] w-[15px]" />
          Nuovo preventivo
        </button>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={onToggleNotif}
          aria-label="Notifiche"
          className="relative flex h-9 w-9 items-center justify-center rounded-[9px] border border-border bg-card text-foreground transition-[filter] hover:brightness-105"
        >
          <Bell className="h-[17px] w-[17px]" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-background bg-danger px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-[13px] border border-border bg-card shadow-[0_16px_44px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between border-b border-border px-[15px] py-3">
              <span className="text-[13px] font-semibold">Notifiche</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="text-[11px] font-semibold text-primary"
                >
                  Segna lette
                </button>
                {hasRead && (
                  <button
                    type="button"
                    onClick={onClearRead}
                    className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Svuota lette
                  </button>
                )}
              </div>
            </div>
            {notifications.length === 0 ? (
              <div className="px-[15px] py-8 text-center text-[12.5px] text-muted-foreground">
                Nessuna notifica.
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onOpenNotif(n)}
                  className="flex w-full gap-2.5 border-b border-border px-[15px] py-[11px] text-left transition-colors last:border-b-0 hover:bg-muted/55"
                >
                  <span
                    className={cn(
                      'mt-[5px] h-2 w-2 flex-none rounded-full',
                      DOT_CLASS[n.type] ?? 'bg-muted-foreground',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={cn('text-[12.5px] leading-[1.4]', !n.read_at && 'font-semibold')}>
                      {renderTitle(n.title)}
                    </div>
                    {n.customer_name && (
                      <div className="mt-0.5 text-[11.5px] font-medium text-foreground/80">
                        Cliente: {n.customer_name}
                      </div>
                    )}
                    {n.body && (
                      <div className="mt-0.5 text-[11.5px] leading-[1.35] text-muted-foreground">{n.body}</div>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {formatDateTime(n.created_at)}
                      {n.created_at && <span className="text-muted-foreground/70"> · {timeAgo(n.created_at)}</span>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
