import { Trash2, ExternalLink, Eye, Download, FileText, FileSpreadsheet, Image as ImageIcon, Box, Building2, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { OfficinaDocument } from '@/types'
import { fileKind, fmtCustomer } from './documentsUtil'

interface Props {
  docs: OfficinaDocument[]
  loading: boolean
  groupByCustomer: boolean
  canWrite: boolean
  hasFilters: boolean
  onOpen: (d: OfficinaDocument) => void
  onDelete: (d: OfficinaDocument) => void
}

// Badge tipo file: tinte da token (dark-aware). Distingue DOCX/XLSX dentro Office.
const badgeFor = (filename: string): { label: string; cls: string; Icon: LucideIcon } => {
  const ext = filename.toLowerCase().split('.').pop() || ''
  if (ext === 'pdf') return { label: 'PDF', cls: 'bg-danger/[0.12] text-danger', Icon: FileText }
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return { label: 'IMG', cls: 'bg-confirmed/[0.13] text-confirmed', Icon: ImageIcon }
  if (ext === 'dxf') return { label: 'DXF', cls: 'bg-warning/[0.14] text-warning', Icon: Box }
  if (['doc', 'docx'].includes(ext)) return { label: 'DOCX', cls: 'bg-info/[0.13] text-info', Icon: FileText }
  if (['xls', 'xlsx'].includes(ext)) return { label: 'XLSX', cls: 'bg-success/[0.13] text-success', Icon: FileSpreadsheet }
  return { label: '—', cls: 'bg-muted text-muted-foreground', Icon: FileText }
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })

const refKeyLabel = (d: OfficinaDocument): { key: string; label: string; Icon: LucideIcon } => {
  if (d.customer) return { key: `c${d.customer.id}`, label: `${fmtCustomer(d.customer)} · Cliente`, Icon: Building2 }
  if (d.material_supplier) return { key: `m${d.material_supplier.id}`, label: `${d.material_supplier.name} · Fornitore materiali`, Icon: Truck }
  if (d.tool_supplier) return { key: `t${d.tool_supplier.id}`, label: `${d.tool_supplier.name} · Fornitore utensili`, Icon: Truck }
  if (d.normalized_supplier) return { key: `n${d.normalized_supplier.id}`, label: `${d.normalized_supplier.name} · Fornitori normalizzati`, Icon: Truck }
  return { key: 'none', label: 'Senza riferimento', Icon: Building2 }
}

const refInline = (d: OfficinaDocument): string => {
  if (d.customer) return `${String(d.customer.customer_number).padStart(3, '0')} · ${d.customer.name}`
  if (d.material_supplier) return d.material_supplier.name
  if (d.tool_supplier) return d.tool_supplier.name
  if (d.normalized_supplier) return d.normalized_supplier.name
  return '—'
}

export default function DocumentsTable({ docs, loading, groupByCustomer, canWrite, hasFilters, onOpen, onDelete }: Props) {
  const renderRow = (d: OfficinaDocument) => {
    const kind = fileKind(d.filename)
    const badge = badgeFor(d.filename)
    const OpenIcon = kind === 'dxf' ? Eye : (kind === 'office' || kind === 'other') ? Download : ExternalLink
    return (
      <tr key={d.id} className="border-b border-border transition-colors hover:bg-muted/[0.45]">
        <td className="p-2.5">
          <div className="truncate font-medium text-foreground">{d.title}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">{d.filename}</div>
        </td>
        <td className="p-2.5">
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${badge.cls}`}>
            <badge.Icon className="h-3 w-3" />{badge.label}
          </span>
        </td>
        <td className="truncate p-2.5 text-muted-foreground">{d.category || <span className="text-muted-foreground/60">—</span>}</td>
        <td className="truncate p-2.5 text-muted-foreground">{refInline(d)}</td>
        <td className="p-2.5 font-mono text-xs text-muted-foreground">{shortDate(d.uploaded_at)}</td>
        <td className="p-2.5">
          <div className="flex justify-center gap-1">
            <button onClick={() => onOpen(d)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={kind === 'dxf' ? 'Anteprima DXF' : kind === 'office' || kind === 'other' ? 'Scarica' : 'Apri in nuova scheda'}>
              <OpenIcon className="h-4 w-4" />
            </button>
            {canWrite && (
              <button onClick={() => onDelete(d)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  const groups: Array<{ key: string; label: string; Icon: LucideIcon; items: OfficinaDocument[] }> = []
  if (groupByCustomer) {
    const map = new Map<string, OfficinaDocument[]>()
    for (const d of docs) {
      const { key } = refKeyLabel(d)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    for (const [key, items] of map) {
      const { label, Icon } = refKeyLabel(items[0])
      groups.push({ key, label, Icon, items })
    }
    groups.sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : a.label.localeCompare(b.label, 'it')))
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <colgroup><col /><col style={{ width: 100 }} /><col style={{ width: 150 }} /><col style={{ width: '26%' }} /><col style={{ width: 96 }} /><col style={{ width: 76 }} /></colgroup>
          <thead>
            <tr className="border-b border-border bg-card-muted text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="p-2.5 text-left font-medium">Titolo</th>
              <th className="p-2.5 text-left font-medium">Tipo</th>
              <th className="p-2.5 text-left font-medium">Categoria</th>
              <th className="p-2.5 text-left font-medium">Riferimento</th>
              <th className="p-2.5 text-left font-medium">Data</th>
              <th className="p-2.5 text-center font-medium">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Caricamento…</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{hasFilters ? 'Nessun documento corrisponde ai filtri.' : 'Nessun documento ancora caricato.'}</td></tr>
            ) : groupByCustomer ? (
              groups.flatMap(g => [
                <tr key={`h-${g.key}`} className="border-b border-border bg-muted/[0.5]">
                  <td colSpan={6} className="px-2.5 py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <g.Icon className="h-3.5 w-3.5 text-muted-foreground" /> {g.label}
                      <span className="font-normal text-muted-foreground">· {g.items.length} documenti</span>
                    </span>
                  </td>
                </tr>,
                ...g.items.map(renderRow),
              ])
            ) : docs.map(renderRow)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
