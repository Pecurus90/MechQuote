import { useEffect, useState, useCallback, useRef } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth'

export interface Notification {
  id: number
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  requires_action: boolean
  created_at: string | null
  read_at: string | null
  confirmed_at: string | null
}

const POLL_MS = 60_000

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

  const markConfirmed = useCallback(async (id: number) => {
    await api.post(`/notifications/${id}/confirm`)
    const now = new Date().toISOString()
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: n.read_at ?? now, confirmed_at: now } : n))
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
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    }
  }, [enabled, fetchCount])

  return { enabled, unreadCount, items, loading, fetchList, markRead, markConfirmed, clearRead }
}
