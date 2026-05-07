import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X, Check, Bell, Trash2 } from 'lucide-react'
import type { Notification } from '@/lib/useNotifications'
import { timeAgo } from '@/lib/timeAgo'

interface Props {
  open: boolean
  onClose: () => void
  items: Notification[]
  loading: boolean
  onRefresh: () => void
  onMarkRead: (id: number) => void
  onMarkConfirmed: (id: number) => void
  onClearRead: () => void
}

export default function NotificationPanel({
  open, onClose, items, loading, onRefresh, onMarkRead, onMarkConfirmed, onClearRead,
}: Props) {
  const navigate = useNavigate()
  const readCount = items.filter(n => n.read_at).length

  const handleClearRead = () => {
    if (readCount === 0) return
    if (!confirm(`Svuotare ${readCount} notifiche già lette?`)) return
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
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/30 z-[9998]" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-screen w-96 bg-white shadow-2xl z-[9999] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Notifiche</h2>
          </div>
          <div className="flex items-center gap-1">
            {readCount > 0 && (
              <button
                onClick={handleClearRead}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500 hover:text-red-600 hover:bg-red-50"
                title="Svuota notifiche lette"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Svuota lette
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" title="Chiudi">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-sm text-gray-400 text-center">Caricamento...</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-gray-400 text-center">Nessuna notifica</div>
          ) : (
            <ul>
              {items.map(n => {
                const unread = !n.read_at
                const confirmed = !!n.confirmed_at
                return (
                  <li
                    key={n.id}
                    className={`border-b px-4 py-3 cursor-pointer hover:bg-gray-50 ${unread ? 'bg-blue-50/30' : ''}`}
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
                        <p className={`text-sm ${unread ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                          {n.title}
                        </p>
                        {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                        <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                        {n.requires_action && !confirmed && (
                          <button
                            onClick={e => { e.stopPropagation(); onMarkConfirmed(n.id) }}
                            className="mt-2 text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50"
                          >
                            Fatto ✓
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </>,
    document.body,
  )
}
