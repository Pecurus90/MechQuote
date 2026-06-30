import { Card, CardContent } from '@/components/ui/card'
import { Trash2, ExternalLink } from 'lucide-react'
import { timeAgo } from '@/lib/timeAgo'
import type { OfficinaDocument } from '@/types'
import { fileKind, fmtBytes, fmtCustomer, FileTypeBadge } from './documentsUtil'

interface Props {
  docs: OfficinaDocument[]
  loading: boolean
  groupByCustomer: boolean
  canWrite: boolean
  hasFilters: boolean
  onOpen: (d: OfficinaDocument) => void
  onDelete: (d: OfficinaDocument) => void
}

const refKeyLabel = (d: OfficinaDocument): { key: string; label: string } => {
  if (d.customer) return { key: `c${d.customer.id}`, label: `Cliente · ${fmtCustomer(d.customer)}` }
  if (d.material_supplier) return { key: `m${d.material_supplier.id}`, label: `Fornitore materiali · ${d.material_supplier.name}` }
  if (d.tool_supplier) return { key: `t${d.tool_supplier.id}`, label: `Fornitore utensili · ${d.tool_supplier.name}` }
  if (d.normalized_supplier) return { key: `n${d.normalized_supplier.id}`, label: `Fornitori normalizzati · ${d.normalized_supplier.name}` }
  return { key: 'none', label: 'Senza riferimento' }
}

const refInlineCell = (d: OfficinaDocument) => {
  if (d.customer) return (
    <span title={d.customer.name}>
      <span className="text-[10px] font-semibold text-blue-600 uppercase mr-1">CL</span>
      <span className="font-mono text-gray-400">{String(d.customer.customer_number).padStart(3, '0')}</span>
      {' '}{d.customer.name}
    </span>
  )
  if (d.material_supplier) return (
    <span title={d.material_supplier.name}>
      <span className="text-[10px] font-semibold text-amber-600 uppercase mr-1">MAT</span>
      {d.material_supplier.name}
    </span>
  )
  if (d.tool_supplier) return (
    <span title={d.tool_supplier.name}>
      <span className="text-[10px] font-semibold text-purple-600 uppercase mr-1">UT</span>
      {d.tool_supplier.name}
    </span>
  )
  if (d.normalized_supplier) return (
    <span title={d.normalized_supplier.name}>
      <span className="text-[10px] font-semibold text-orange-600 uppercase mr-1">NORM</span>
      {d.normalized_supplier.name}
    </span>
  )
  return <span className="text-gray-300">—</span>
}

export default function DocumentsTable({
  docs, loading, groupByCustomer, canWrite, hasFilters, onOpen, onDelete,
}: Props) {
  const renderRow = (d: OfficinaDocument) => {
    const kind = fileKind(d.filename)
    return (
      <tr key={d.id} className="border-b hover:bg-gray-50">
        <td className="p-2"><FileTypeBadge kind={kind} /></td>
        <td className="p-2">
          <div className="font-medium text-gray-900 truncate">{d.title}</div>
          <div className="text-[11px] text-gray-400 font-mono truncate">{d.filename}</div>
        </td>
        <td className="p-2">
          {d.category ? (
            <span className="inline-block bg-blue-50 text-blue-700 text-[11px] font-medium px-2 py-0.5 rounded">
              {d.category}
            </span>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="p-2 text-xs text-gray-600 truncate">{refInlineCell(d)}</td>
        <td className="p-2 text-right font-mono text-xs text-gray-600">{fmtBytes(d.size_bytes)}</td>
        <td className="p-2 text-xs text-gray-500">
          <div>{timeAgo(d.uploaded_at)}</div>
          {d.uploaded_by && (
            <div className="text-[10px] text-gray-400 truncate">{d.uploaded_by.full_name || d.uploaded_by.username}</div>
          )}
        </td>
        <td className="p-2 text-center">
          <div className="flex gap-1.5 justify-center">
            <button onClick={() => onOpen(d)} className="p-1 hover:bg-blue-50 rounded"
              title={kind === 'dxf' ? 'Anteprima DXF' : kind === 'office' || kind === 'other' ? 'Scarica' : 'Apri in nuova tab'}>
              <ExternalLink className="w-4 h-4 text-blue-600" />
            </button>
            {canWrite && (
              <button onClick={() => onDelete(d)} className="p-1 hover:bg-red-50 rounded" title="Elimina">
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  // Raggruppamento per riferimento quando attivo
  const groups: Array<{ key: string; label: string; items: OfficinaDocument[] }> = []
  if (groupByCustomer) {
    const map = new Map<string, OfficinaDocument[]>()
    for (const d of docs) {
      const { key } = refKeyLabel(d)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    for (const [key, items] of map) {
      const { label } = refKeyLabel(items[0])
      groups.push({ key, label, items })
    }
    groups.sort((a, b) => {
      if (a.key === 'none') return 1
      if (b.key === 'none') return -1
      return a.label.localeCompare(b.label, 'it')
    })
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="table-fixed w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-2 w-[7%] font-medium text-gray-600">Tipo</th>
              <th className="text-left p-2 w-[26%] font-medium text-gray-600">Titolo</th>
              <th className="text-left p-2 w-[13%] font-medium text-gray-600">Categoria</th>
              <th className="text-left p-2 w-[20%] font-medium text-gray-600">Riferimento</th>
              <th className="text-right p-2 w-[9%] font-medium text-gray-600">Dim.</th>
              <th className="text-left p-2 w-[13%] font-medium text-gray-600">Caricato</th>
              <th className="text-center p-2 w-[12%] font-medium text-gray-600">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">Caricamento...</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-gray-400">
                {hasFilters ? 'Nessun documento corrisponde ai filtri.' : 'Nessun documento ancora caricato.'}
              </td></tr>
            ) : groupByCustomer ? (
              groups.flatMap(g => [
                <tr key={`h-${g.key}`} className="bg-blue-50/60 border-b">
                  <td colSpan={7} className="px-2 py-1.5 text-xs font-semibold text-blue-900">
                    {g.label} <span className="text-gray-500 font-normal">— {g.items.length} doc</span>
                  </td>
                </tr>,
                ...g.items.map(renderRow),
              ])
            ) : (
              docs.map(renderRow)
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
