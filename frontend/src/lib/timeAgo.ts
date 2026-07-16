/**
 * Italian relative-time formatting for ISO timestamps.
 *
 * Used by TopBar notifications dropdown, DashboardPage 'Attività recente'
 * card, QuoteEditor header workflow badge, etc.
 */

/**
 * Parsa una stringa ISO assumendo UTC se manca il fuso orario.
 *
 * Il backend (vedi `backend/app/core/database.py:utc_now`) salva i campi
 * DateTime come UTC **naive**: `isoformat()` su un datetime naive produce
 * stringhe tipo `"2026-05-09T11:30:00"` senza `Z`. ECMAScript interpreta
 * queste stringhe come ora **locale** del browser, non UTC, causando uno
 * sfasamento pari all'offset locale (es. 2h in CEST → "2h fa" sempre).
 * Forziamo `Z` quando manca, coerente con la convenzione "backend salva UTC".
 */
function parseUtc(iso: string): Date {
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasTz ? iso : iso + 'Z')
}

/** Data + ora assoluta in italiano (es. "16/07/2026, 16:04"). Stesso parsing
 *  UTC-aware di timeAgo, per i timestamp naive-UTC del backend. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return parseUtc(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const then = parseUtc(iso).getTime()
  const diffMin = Math.round((Date.now() - then) / 60000)
  if (diffMin < 1) return 'adesso'
  if (diffMin < 60) return `${diffMin} min fa`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} h fa`
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return `${diffD} g fa`
  return parseUtc(iso).toLocaleDateString('it-IT')
}
