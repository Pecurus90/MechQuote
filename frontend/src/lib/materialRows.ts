// Mapper puri condivisi tra l'editor richiesta (OrdersMaterialFilePage) e il
// modale di modifica nel pool (RequestEditModal): conversione riga backend
// (FileOrderRow) ⇄ dims per-forma della tabella editabile. Single source of
// truth per non divergere tra i due punti.
import type { FileOrderRow, MaterialRequestItem } from '@/types'
import { parseDecimalOrNull } from '@/lib/decimalInput'

// Riga interna = shape backend + id client per key/patch.
export type Row = FileOrderRow & { _id: string }

let _seq = 0
export const newRowId = (): string => `r${++_seq}`

// Fonte unica del parsing decimale IT (gestisce "1.300,50"): il vecchio
// replace(',', '.') naïf corrompeva i separatori di migliaia.
export const numOrNull = (v: string | undefined): number | null => parseDecimalOrNull(v ?? '')
export const str = (v: number | null | undefined): string => (v == null ? '' : String(v))

// backend row → dims Record della vista (per forma).
export function dimsToView(r: FileOrderRow): Record<string, string> {
  if (r.shape === 'tondo') return { diameter: str(r.diameter_mm), length: str(r.length_mm) }
  if (r.shape === 'tubo') return { outerDiameter: str(r.diameter_mm), wall: str(r.thickness_mm), length: str(r.length_mm) }
  return { width: str(r.width_mm), height: str(r.height_mm), thickness: str(r.thickness_mm) }
}

// dims Record della vista → campi espliciti backend (per forma).
export function dimsToFields(shape: FileOrderRow['shape'], dims: Record<string, string>): Partial<FileOrderRow> {
  if (shape === 'tondo') return { diameter_mm: numOrNull(dims.diameter), length_mm: numOrNull(dims.length), inner_diameter_mm: null, width_mm: null, height_mm: null, thickness_mm: null }
  if (shape === 'tubo') return { diameter_mm: numOrNull(dims.outerDiameter), thickness_mm: numOrNull(dims.wall), length_mm: numOrNull(dims.length), inner_diameter_mm: null, width_mm: null, height_mm: null }
  return { width_mm: numOrNull(dims.width), height_mm: numOrNull(dims.height), thickness_mm: numOrNull(dims.thickness), diameter_mm: null, inner_diameter_mm: null, length_mm: null }
}

export const emptyRow = (): Row => ({
  _id: newRowId(), part_code: '', description: '', csv_material: '',
  material_id: null, material_name: '', supplier_id: null, supplier_name: null,
  shape: 'prismatico', width_mm: null, height_mm: null, thickness_mm: null,
  diameter_mm: null, inner_diameter_mm: null, length_mm: null,
  quantity: 1, needs_dimensions: true, needs_material: true,
})

// Riga richiesta (backend) → riga editor.
export const itemToRow = (it: MaterialRequestItem): Row => ({
  _id: newRowId(), part_code: it.part_code, description: it.description,
  csv_material: it.material_name,
  material_id: it.material_id, material_name: it.material_name,
  supplier_id: it.supplier_id, supplier_name: it.supplier_name,
  shape: it.shape, width_mm: it.width_mm, height_mm: it.height_mm, thickness_mm: it.thickness_mm,
  diameter_mm: it.diameter_mm, inner_diameter_mm: it.inner_diameter_mm, length_mm: it.length_mm,
  quantity: it.quantity, needs_dimensions: false, needs_material: it.material_id == null,
})
