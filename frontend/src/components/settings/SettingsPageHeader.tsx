// Header standardizzato per tutte le pagine di Impostazioni.
// Pattern: icona colorata in tondo + titolo grosso + sottotitolo opzionale.
// Stesso look dei container raggruppati (SuppliersSettingsPage, ecc.).
import type { LucideIcon } from 'lucide-react'

type Color =
  | 'blue' | 'indigo' | 'rose' | 'amber' | 'gray'
  | 'emerald' | 'violet' | 'orange' | 'sky' | 'red'

const COLOR_MAP: Record<Color, string> = {
  blue:    'bg-blue-100 text-blue-700',
  indigo:  'bg-indigo-100 text-indigo-700',
  rose:    'bg-rose-100 text-rose-700',
  amber:   'bg-amber-100 text-amber-700',
  gray:    'bg-gray-100 text-gray-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet:  'bg-violet-100 text-violet-700',
  orange:  'bg-orange-100 text-orange-700',
  sky:     'bg-sky-100 text-sky-700',
  red:     'bg-red-100 text-red-700',
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
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
