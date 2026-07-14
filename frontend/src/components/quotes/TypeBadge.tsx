// src/components/quotes/TypeBadge.tsx
import { Box, Layers } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type QuoteType = 'single' | 'commessa'

const META: Record<QuoteType, { label: string; icon: LucideIcon; cls: string }> = {
  single: {
    label: 'Singolo',
    icon: Box,
    cls: 'border-border text-muted-foreground',
  },
  commessa: {
    label: 'Commessa',
    icon: Layers,
    cls: 'border-info/40 bg-info/[0.08] text-info',
  },
}

export function TypeBadge({ type }: { type: QuoteType }) {
  const { label, icon: Icon, cls } = META[type]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[8px] border px-[11px] py-1 text-[11px] font-semibold',
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
