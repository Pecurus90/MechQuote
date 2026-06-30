import { FileText, Image as ImageIcon, FileSpreadsheet, FileType2, Box } from 'lucide-react'

// Riferimento opzionale di un documento: cliente o uno dei 3 tipi fornitore.
export type RefKind = 'none' | 'customer' | 'material_supplier' | 'tool_supplier' | 'normalized_supplier'

export type FileKind = 'pdf' | 'image' | 'dxf' | 'office' | 'other'

/** Determina come "aprire" il file in base all'estensione. */
export function fileKind(filename: string): FileKind {
  const ext = filename.toLowerCase().split('.').pop() || ''
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'image'
  if (ext === 'dxf') return 'dxf'
  if (['doc', 'docx', 'xls', 'xlsx'].includes(ext)) return 'office'
  return 'other'
}

export const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

export const fmtCustomer = (c: { customer_number: number; name: string }) =>
  `${String(c.customer_number).padStart(3, '0')} — ${c.name}`

export const ALLOWED_ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.dxf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/gif'

export function FileTypeBadge({ kind }: { kind: FileKind }) {
  const map: Record<FileKind, { icon: typeof FileText; color: string; label: string }> = {
    pdf:    { icon: FileText,        color: 'text-red-600',   label: 'PDF' },
    image:  { icon: ImageIcon,       color: 'text-pink-600',  label: 'IMG' },
    dxf:    { icon: Box,             color: 'text-blue-600',  label: 'DXF' },
    office: { icon: FileSpreadsheet, color: 'text-green-700', label: 'DOC' },
    other:  { icon: FileType2,       color: 'text-gray-500',  label: '—' },
  }
  const { icon: Icon, color, label } = map[kind]
  return (
    <span className={`inline-flex items-center gap-1 ${color} font-mono text-[10px] font-semibold uppercase`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  )
}
