// Header standardizzato per tutte le pagine di Impostazioni.
// Pattern: icona colorata in tondo + titolo grosso + sottotitolo opzionale.
// Stesso look dei container raggruppati (SuppliersSettingsPage, ecc.).
import type { LucideIcon } from 'lucide-react'

export type Color =
  | 'blue' | 'indigo' | 'rose' | 'amber' | 'gray'
  | 'emerald' | 'violet' | 'orange' | 'sky' | 'red'
  | 'tools' | 'sales' | 'customers' | 'officina' | 'edm' | 'primary'

// AUD-36: i chip generici erano tint chiari (`bg-*-100`) che non invertono in
// dark. Forma a opacità (fill semitrasparente sul card + testo con variante
// dark) → coerente in entrambi i temi. Fonte unica: cambia qui, cambiano tutte
// le intestazioni impostazioni.
const COLOR_MAP: Record<Color, string> = {
  primary: 'bg-primary/[0.13] text-primary',
  blue:    'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  indigo:  'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  rose:    'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  amber:   'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  gray:    'bg-muted text-foreground',
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  violet:  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  orange:  'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  sky:     'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  red:     'bg-red-500/15 text-red-600 dark:text-red-400',
  // Accenti d'area token-based (dark-aware, handoff).
  tools:     'bg-tools/[0.13] text-tools',
  sales:     'bg-sales/[0.13] text-sales',
  customers: 'bg-customers/[0.13] text-customers',
  officina:  'bg-officina/[0.13] text-officina',
  edm:       'bg-edm/[0.13] text-edm',
}

interface Props {
  icon: LucideIcon
  color?: Color
  title: string
  subtitle?: string
  action?: React.ReactNode  // CTA opzionale a destra dell'header
}

export default function SettingsPageHeader({ icon: Icon, color = 'blue', title, subtitle, action }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${COLOR_MAP[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
