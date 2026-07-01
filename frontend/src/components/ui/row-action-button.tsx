// Bottone-icona standard per azioni di riga (edit, delete, view, download…).
// Target click ≥ 36px, hover background coerente, colore semantico per variant.
// Sostituisce i due pattern paralleli oggi presenti:
//   <button className="p-1 hover:bg-muted rounded">…</button>     (raw)
//   <Button size="sm" variant="outline" className="text-red-500 …">…</Button>
import type { ButtonHTMLAttributes } from 'react'
import { Pencil, Trash2, Eye, Download, type LucideIcon } from 'lucide-react'

type Variant = 'edit' | 'delete' | 'view' | 'download' | 'custom'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant: Variant
  /** Per variant='custom' passa l'icona da renderizzare. Per gli altri è ignorato. */
  icon?: LucideIcon
  /** Per variant='custom' passa il colore tailwind (es. 'text-emerald-600'). */
  colorClass?: string
  size?: 'sm' | 'md'
}

const PRESETS: Record<Exclude<Variant, 'custom'>, { icon: LucideIcon; color: string }> = {
  edit:     { icon: Pencil,    color: 'text-blue-600' },
  delete:   { icon: Trash2,    color: 'text-red-600' },
  view:     { icon: Eye,       color: 'text-muted-foreground' },
  download: { icon: Download,  color: 'text-emerald-600' },
}

export default function RowActionButton({
  variant, icon, colorClass, size = 'md', className = '', title, ...rest
}: Props) {
  let Icon: LucideIcon
  let color: string
  if (variant === 'custom') {
    if (!icon) throw new Error('RowActionButton variant="custom" richiede prop `icon`')
    Icon = icon
    color = colorClass || 'text-muted-foreground'
  } else {
    Icon = PRESETS[variant].icon
    color = PRESETS[variant].color
  }
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const padding = size === 'sm' ? 'p-1' : 'p-1.5'

  // Titolo accessibile di default per variant note
  const defaultTitle = title || (
    variant === 'edit' ? 'Modifica' :
    variant === 'delete' ? 'Elimina' :
    variant === 'view' ? 'Apri' :
    variant === 'download' ? 'Scarica' : undefined
  )

  return (
    <button
      type="button"
      title={defaultTitle}
      className={`${padding} rounded-md hover:bg-muted transition-colors ${color} ${className}`}
      {...rest}
    >
      <Icon className={iconSize} />
    </button>
  )
}
