// Wrapper "preset" per le tabelle delle Impostazioni e pagine liste.
// Non è un table headless smart (no sort/filter built-in) — è un Card +
// table con thead/empty state già stilizzati, così le pagine non
// ripetono `bg-muted border-b` + `p-3 font-medium text-muted-foreground`
// ovunque. Le righe le scrivono ancora a mano (contenuti troppo
// eterogenei per astrarli).
//
// Uso:
//   <DataTable
//     columns={['Nome', { label: 'Costo', align: 'right' }, 'Azioni']}
//     empty="Nessun materiale"
//   >
//     {items.map(it => (
//       <tr key={it.id} className="border-b hover:bg-muted">
//         <td className="p-3">{it.name}</td>
//         <td className="p-3 text-right">€ {it.cost.toFixed(2)}</td>
//         <td className="p-3 text-center">…</td>
//       </tr>
//     ))}
//   </DataTable>
import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

type ColumnAlign = 'left' | 'right' | 'center'

export interface Column {
  label: string
  align?: ColumnAlign
  width?: string  // es. 'w-[14%]', 'w-16'
}

interface Props {
  columns: (string | Column)[]
  children?: ReactNode
  empty?: ReactNode      // ReactNode o stringa; appare se children è vuoto/null
  isEmpty?: boolean      // se omesso, valuta se children è null/array vuoto
  className?: string
}

function normalizeColumn(c: string | Column): Column {
  return typeof c === 'string' ? { label: c } : c
}

function alignClass(a?: ColumnAlign): string {
  if (a === 'right') return 'text-right'
  if (a === 'center') return 'text-center'
  return 'text-left'
}

export default function DataTable({ columns, children, empty, isEmpty, className = '' }: Props) {
  const cols = columns.map(normalizeColumn)
  const hasChildren = isEmpty == null
    ? Array.isArray(children) ? children.length > 0 : children != null && children !== false
    : !isEmpty

  return (
    <Card className={className}>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              {cols.map((c, i) => (
                <th
                  key={i}
                  className={`${alignClass(c.align)} p-3 font-medium text-muted-foreground ${c.width || ''}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hasChildren ? children : (
              <tr>
                <td colSpan={cols.length} className="p-6 text-center text-muted-foreground">
                  {empty || 'Nessun elemento.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
