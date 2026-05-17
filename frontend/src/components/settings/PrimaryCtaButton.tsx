// CTA "evidente" per azioni primarie nelle pagine Impostazioni:
// bordo 2px + sfondo pieno rosa-600 + shadow leggera + hover lift.
// Stesso stile del bottone "Crea preventivo" sotto allo spaccato nel
// wizard stampi — uniformato su tutta la UI delle impostazioni.
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  size?: 'sm' | 'md'
}

export default function PrimaryCtaButton({ children, size = 'md', className = '', disabled, ...rest }: Props) {
  const sizeClasses = size === 'sm'
    ? 'px-3 py-1.5 text-sm'
    : 'px-4 py-2 text-sm'
  return (
    <button
      type="button"
      disabled={disabled}
      className={`${sizeClasses} rounded-lg border-2 font-medium transition-all shadow-sm inline-flex items-center gap-1.5 ${
        disabled
          ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
          : 'bg-rose-600 border-rose-700 text-white hover:bg-rose-700 hover:shadow-md active:scale-[0.98]'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
