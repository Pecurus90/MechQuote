import { useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { TopBar } from './TopBar'
import { useAuth } from '@/lib/auth'
import { useNotifications, type Notification } from '@/lib/useNotifications'

// Container del guscio: Sidebar + TopBar (grafica handoff) + area contenuto.
// Qui vive la logica della top bar (ricerca, notifiche); TopBar è presentazionale.

export default function AppLayout() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canQuote = hasPermission('quotes.create')
  const { unreadCount, items, fetchList, markRead, markAllRead, clearRead } = useNotifications()

  const [search, setSearch] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  // Chiudi il dropdown notifiche cliccando fuori dalla top bar.
  useEffect(() => {
    if (!notifOpen) return
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [notifOpen])

  const toggleNotif = () => {
    setNotifOpen(o => {
      const next = !o
      if (next) fetchList()
      return next
    })
  }

  const openNotif = (n: Notification) => {
    if (!n.read_at) markRead(n.id)
    const quoteId = n.data?.quote_id
    if (typeof quoteId === 'number') { navigate(`/quotes/${quoteId}`); setNotifOpen(false); return }
    const navTo = n.data?.navigate_to
    if (typeof navTo === 'string' && navTo.startsWith('/')) { navigate(navTo); setNotifOpen(false) }
  }

  const submitSearch = () => {
    const q = search.trim()
    navigate(q ? `/quotes/archive?q=${encodeURIComponent(q)}` : '/quotes/archive')
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div ref={barRef}>
          <TopBar
            search={search}
            onSearch={setSearch}
            onSubmitSearch={submitSearch}
            onNew={canQuote ? () => navigate('/quotes/new') : undefined}
            unreadCount={unreadCount}
            notifOpen={notifOpen}
            onToggleNotif={toggleNotif}
            notifications={items}
            onOpenNotif={openNotif}
            onMarkAllRead={markAllRead}
            onClearRead={clearRead}
          />
        </div>
        <Outlet />
      </main>
    </div>
  )
}
