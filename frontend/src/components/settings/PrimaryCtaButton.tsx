// CTA "evidente" per azioni primarie nelle pagine Impostazioni:
// bordo 2px + sfondo pieno + shadow leggera + hover lift.
// Il colore segue il tema della pagina (passato come prop) per dare
// identità immediata al modulo in cui si sta lavorando — stessa palette
// dei SettingsPageHeader, così header e bottone si "rispondono".
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Color =
  | 'blue' | 'indigo' | 'rose' | 'amber' | 'gray'
  | 'emerald' | 'violet' | 'orange' | 'sky' | 'red'
  | 'tools' | 'sales' | 'customers' | 'officina' | 'edm' | 'dies' | 'primary'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  size?: 'sm' | 'md'
  /** Tema colore. Default 'rose' = stampi/CTA generico. Le pagine
   *  settings devono passare il colore del proprio header per coerenza. */
  color?: Color
}

// Tailwind ha bisogno delle classi scritte per esteso (no string interpolation
// runtime), quindi mappiamo esplicitamente ogni colore a tutto lo stato.
const VARIANTS: Record<Color, string> = {
  primary: 'bg-primary border-primary hover:brightness-110',
  blue:    'bg-blue-600 border-blue-700 hover:bg-blue-700',
  indigo:  'bg-indigo-600 border-indigo-700 hover:bg-indigo-700',
  rose:    'bg-rose-600 border-rose-700 hover:bg-rose-700',
  amber:   'bg-amber-600 border-amber-700 hover:bg-amber-700',
  gray:    'bg-gray-700 border-gray-800 hover:bg-gray-800',
  emerald: 'bg-emerald-600 border-emerald-700 hover:bg-emerald-700',
  violet:  'bg-violet-600 border-violet-700 hover:bg-violet-700',
  orange:  'bg-orange-600 border-orange-700 hover:bg-orange-700',
  sky:     'bg-sky-600 border-sky-700 hover:bg-sky-700',
  red:     'bg-red-600 border-red-700 hover:bg-red-700',
  // Accenti d'area token-based (dark-aware, handoff): fondo pieno + hover lift.
  tools:     'bg-tools border-tools hover:brightness-110',
  sales:     'bg-sales border-sales hover:brightness-110',
  customers: 'bg-customers border-customers hover:brightness-110',
  officina:  'bg-officina border-officina hover:brightness-110',
  edm:       'bg-edm border-edm hover:brightness-110',
  dies:      'bg-dies border-dies hover:brightness-110',
}

export default function PrimaryCtaButton({
  children, size = 'md', color = 'rose', className = '', disabled, ...rest
}: Props) {
  const sizeClasses = size === 'sm'
    ? 'px-3 py-1.5 text-sm'
    : 'px-4 py-2 text-sm'
  return (
    <button
      type="button"
      disabled={disabled}
      className={`${sizeClasses} rounded-lg border-2 font-medium transition-all shadow-sm inline-flex items-center gap-1.5 ${
        disabled
          ? 'bg-muted border-border text-muted-foreground cursor-not-allowed'
          : `${VARIANTS[color]} text-white hover:shadow-md active:scale-[0.98]`
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
