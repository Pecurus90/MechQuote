// KPI card — design system (handoff). Card con barra accento a sinistra (3px)
// del colore semantico, riga label + icona lucide, valore grande in mono,
// hint opzionale. Cliccabile.
import type { LucideIcon } from 'lucide-react'

export type KpiTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'confirmed'

const TONE: Record<KpiTone, { bar: string; icon: string }> = {
  primary:   { bar: 'bg-primary',   icon: 'text-primary' },
  success:   { bar: 'bg-success',   icon: 'text-success' },
  warning:   { bar: 'bg-warning',   icon: 'text-warning' },
  danger:    { bar: 'bg-danger',    icon: 'text-danger' },
  info:      { bar: 'bg-info',      icon: 'text-info' },
  confirmed: { bar: 'bg-confirmed', icon: 'text-confirmed' },
}

export function KpiCard({
  label, value, hint, icon: Icon, tone = 'primary', onClick,
}: {
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  tone?: KpiTone
  onClick?: () => void
}) {
  const t = TONE[tone]
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`relative w-full text-left rounded-xl border border-border bg-card p-4 pl-5 overflow-hidden transition-shadow ${
        onClick ? 'hover:shadow-md cursor-pointer' : ''
      }`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${t.bar}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
        <Icon className={`w-4 h-4 shrink-0 ${t.icon}`} />
      </div>
      <div className="text-[28px] font-bold font-mono leading-none mt-2 text-foreground">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1 truncate">{hint}</div>}
    </Wrapper>
  )
}
