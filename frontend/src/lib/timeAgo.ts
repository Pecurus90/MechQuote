/**
 * Italian relative-time formatting for ISO timestamps.
 *
 * Used by NotificationPanel, DashboardPage 'Attività recente' card,
 * QuoteEditor header workflow badge, etc.
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const diffMin = Math.round((Date.now() - then) / 60000)
  if (diffMin < 1) return 'adesso'
  if (diffMin < 60) return `${diffMin} min fa`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} h fa`
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return `${diffD} g fa`
  return new Date(iso).toLocaleDateString('it-IT')
}
