import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X, Check, CheckCheck, Bell, Trash2 } from 'lucide-react'
import type { Notification } from '@/lib/useNotifications'
import { timeAgo } from '@/lib/timeAgo'
import ConfirmDialog from '@/components/ui/confirm-dialog'

interface Props {
  open: boolean
  onClose: () => void
  items: Notification[]
  loading: boolean
  onRefresh: () => void
  onMarkRead: (id: number) => void
  onMarkAllRead: () => void
  onClearRead: () => void
}

export default function NotificationPanel({
  open, onClose, items, loading, onRefresh, onMarkRead, onMarkAllRead, onClearRead,
}: Props) {
  const navigate = useNavigate()
  const readCount = items.filter(n => n.read_at).length
  const unreadCount = items.filter(n => !n.read_at).length
  const [confirmClear, setConfirmClear] = useState(false)

  const handleClearRead = () => {
    if (readCount === 0) return
    setConfirmClear(true)
  }
  const doClearRead = () => {
    setConfirmClear(false)
    onClearRead()
  }

  useEffect(() => {
    if (open) onRefresh()
  }, [open, onRefresh])

  if (!open) return null

  const handleClick = (n: Notification) => {
    if (!n.read_at) onMarkRead(n.id)
    const quoteId = n.data?.quote_id
    if (typeof quoteId === 'number') {
      navigate(`/quotes/${quoteId}`)
      onClose()
      return
    }
    // Fallback: navigazione esplicita dichiarata dalla notifica (ordini, scorte…)
    const navTo = n.data?.navigate_to
    if (typeof navTo === 'string' && navTo.startsWith('/')) {
      navigate(navTo)
      onClose()
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/30 z-[9998]" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-screen w-96 bg-card shadow-2xl z-[9999] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Notifiche</h2>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                title="Segna tutte come lette"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Segna lette
              </button>
            )}
            {readCount > 0 && (
              <button
                onClick={handleClearRead}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50"
                title="Svuota notifiche lette"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Svuota lette
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-muted" title="Chiudi">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Caricamento...</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Nessuna notifica</div>
          ) : (
            <ul>
              {items.map(n => {
                const unread = !n.read_at
                const confirmed = !!n.confirmed_at
                return (
                  <li
                    key={n.id}
                    className={`border-b px-4 py-3 cursor-pointer hover:bg-muted ${unread ? 'bg-primary/10/30' : ''}`}
                    onClick={() => handleClick(n)}
                  >
                    <div className="flex gap-2">
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
                        <p className={`text-sm ${unread ? 'font-medium text-foreground' : 'text-foreground'}`}>
                          {n.title}
                        </p>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                        <p className="text-[11px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
      <ConfirmDialog
        open={confirmClear}
        title={`Svuotare ${readCount} notifiche già lette?`}
        confirmLabel="Svuota"
        onConfirm={doClearRead}
        onCancel={() => setConfirmClear(false)}
      />
    </>,
    document.body,
  )
}
