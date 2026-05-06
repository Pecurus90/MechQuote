import type { Quote } from '@/types'

export interface PartIssue {
  partIdx: number
  partCode: string
  issues: string[]
}

export function validateQuote(quote: Quote): PartIssue[] {
  return quote.parts.flatMap((part, idx) => {
    const issues: string[] = []
    if (!part.phases || part.phases.length === 0) issues.push('Nessuna fase di lavorazione')
    if (!part.material_id) issues.push('Materiale non selezionato')
    if ((part.total_cost ?? 0) === 0) issues.push('Costo totale a zero')
    if ((part.unit_price ?? 0) === 0) issues.push('Prezzo unitario a zero')
    return issues.length > 0 ? [{ partIdx: idx, partCode: part.part_code, issues }] : []
  })
}
