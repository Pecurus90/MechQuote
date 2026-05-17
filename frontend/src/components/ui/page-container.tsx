// Wrap standard per le pagine: padding, max-width, spazio verticale.
// Pattern uniformato per eliminare l'inconsistenza tra pagine che oggi
// usano p-6/p-8 e max-w che oscillano tra 3xl e 7xl. Default copre ~90%
// dei casi; le pagine con liste larghe (Archivio, Activity, Ordini) usano
// width="xl" per max-w-7xl.
import type { ReactNode } from 'react'

type Width = 'md' | 'lg' | 'xl' | 'full'

const WIDTH_MAP: Record<Width, string> = {
  md:   'max-w-3xl',
  lg:   'max-w-5xl',
  xl:   'max-w-7xl',
  full: 'max-w-none',
}

interface Props {
  children: ReactNode
  width?: Width    // default 'lg' = max-w-5xl, comodo per la maggior parte dei form
  className?: string
}

export default function PageContainer({ children, width = 'lg', className = '' }: Props) {
  return (
    <div className={`p-6 ${WIDTH_MAP[width]} mx-auto space-y-5 ${className}`}>
      {children}
    </div>
  )
}
