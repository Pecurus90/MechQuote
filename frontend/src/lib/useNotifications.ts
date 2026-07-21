import { useEffect, useState, useCallback, useRef } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth'

export interface Notification {
  id: number
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  customer_name: string | null
  created_at: string | null
  read_at: string | null
}

// TD-10: con l'SSE (push reale) il polling serve solo da rete di sicurezza
// se la connessione stream cade → intervallo ampio.
const POLL_MS = 120_000

export function useNotifications() {
  const { hasPermission } = useAuth()
  const enabled = hasPermission('notifications')
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<number | null>(null)

  const fetchCount = useCallback(async () => {
    if (!enabled) return
    try {
      const res = await api.get('/notifications/unread-count')
      setUnreadCount(res.data?.count ?? 0)
    } catch {
      // silent: il polling continuerà a riprovare
    }
  }, [enabled])

  const fetchList = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const res = await api.get('/notifications')
      setItems(res.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [enabled])

  const markRead = useCallback(async (id: number) => {
    await api.post(`/notifications/${id}/read`)
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n))
    fetchCount()
  }, [fetchCount])

  const markAllRead = useCallback(async () => {
    await api.post('/notifications/read-all')
    const now = new Date().toISOString()
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
    fetchCount()
  }, [fetchCount])

  const clearRead = useCallback(async () => {
    await api.post('/notifications/clear-read')
    setItems(prev => prev.filter(n => !n.read_at))
    fetchCount()
  }, [fetchCount])

  useEffect(() => {
    if (!enabled) return
    fetchCount()
    intervalRef.current = window.setInterval(fetchCount, POLL_MS)

    // TD-10: push in tempo reale via SSE. EventSource non manda header, quindi
    // il token va in query param. Il browser riconnette da solo se cade; il
    // polling qui sopra resta come fallback. All'evento aggiorno il conteggio
    // (la lista si ricarica all'apertura del pannello).
    let es: EventSource | null = null
    const token = localStorage.getItem('token')
    if (token) {
      es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`)
      es.addEventListener('notify', () => { fetchCount() })
    }

    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
      if (es) es.close()
    }
  }, [enabled, fetchCount])

  return { enabled, unreadCount, items, loading, fetchList, markRead, markAllRead, clearRead }
}
