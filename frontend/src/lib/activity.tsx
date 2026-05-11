import { Send, CheckCircle2, Package } from 'lucide-react'

/** Mappa tipo evento → label/colore/icona, condivisa fra Dashboard e ActivityPage. */
export type ActivityKind = {
  label: string
  pillClass: string
  icon: React.ReactNode
}

export const ACTIVITY_KIND: Record<string, ActivityKind> = {
  quote_submitted: {
    label: 'Inviato',
    pillClass: 'bg-amber-100 text-amber-700',
    icon: <Send className="w-3 h-3" />,
  },
  quote_completed: {
    label: 'Completato',
    pillClass: 'bg-green-100 text-green-700',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  materials_ordered: {
    label: 'Ordine materiale',
    pillClass: 'bg-rose-100 text-rose-700',
    icon: <Package className="w-3 h-3" />,
  },
}
