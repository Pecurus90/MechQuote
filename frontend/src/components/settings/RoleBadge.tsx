// Badge ruolo con colore token-based (dark-aware). Mappa i valori colore
// storici dei ruoli (green/blue/gray/purple/amber/red/indigo) sui token
// semantici. Condiviso tra Utenti e la matrice Ruoli & Permessi.

const ROLE_CLS: Record<string, string> = {
  green:  'bg-success/[0.14] text-success',
  blue:   'bg-info/[0.14] text-info',
  gray:   'bg-muted text-muted-foreground',
  purple: 'bg-confirmed/[0.14] text-confirmed',
  amber:  'bg-warning/[0.16] text-warning',
  red:    'bg-danger/[0.14] text-danger',
  indigo: 'bg-primary/[0.14] text-primary',
}

export const roleBadgeClass = (color?: string) => ROLE_CLS[color || ''] || 'bg-muted text-muted-foreground'

export const ROLE_COLOR_OPTIONS = ['green', 'blue', 'gray', 'purple', 'amber', 'red', 'indigo'] as const

export function RoleBadge({ label, color }: { label: string; color?: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${roleBadgeClass(color)}`}>{label}</span>
}
