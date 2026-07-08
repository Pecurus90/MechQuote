// Container "Materiale da file": import distinta CSV / righe manuali, tabella
// editabile (MaterialsFileView del design handoff), crea un ordine per fornitore.
// Mappa tra la shape backend (FileOrderRow, campi espliciti) e quella della vista
// (FileRow, dims Record per forma).
import { useEffect, useState } from 'react'
import api, { getApiErrorDetail } from '@/lib/api'
import { toast } from 'sonner'
import PageContainer from '@/components/ui/page-container'
import {
  MaterialsFileView, type FileRow, type MaterialOption, type Shape,
} from '@/pages/orders/MaterialsFileView'
import MaterialFormModal from '@/pages/settings/MaterialFormModal'
import { useAuth } from '@/lib/auth'
import type { FileOrderRow, Material, MaterialAlias, MaterialSupplier } from '@/types'

// Riga interna = shape backend + id client per key/patch.
type Row = FileOrderRow & { _id: string }
let _seq = 0
const newId = () => `r${++_seq}`

const numOrNull = (v: string | undefined): number | null => {
  const s = (v ?? '').trim().replace(',', '.')
  if (s === '') return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
const str = (v: number | null | undefined): string => (v == null ? '' : String(v))

// backend row → dims Record della vista (per forma).
function dimsToView(r: FileOrderRow): Record<string, string> {
  if (r.shape === 'tondo') return { diameter: str(r.diameter_mm), length: str(r.length_mm) }
  if (r.shape === 'tubo') return { outerDiameter: str(r.diameter_mm), wall: str(r.thickness_mm), length: str(r.length_mm) }
  return { width: str(r.width_mm), height: str(r.height_mm), thickness: str(r.thickness_mm) }
}
// dims Record della vista → campi espliciti backend (per forma).
function dimsToFields(shape: Shape, dims: Record<string, string>): Partial<FileOrderRow> {
  if (shape === 'tondo') return { diameter_mm: numOrNull(dims.diameter), length_mm: numOrNull(dims.length), inner_diameter_mm: null, width_mm: null, height_mm: null, thickness_mm: null }
  if (shape === 'tubo') return { diameter_mm: numOrNull(dims.outerDiameter), thickness_mm: numOrNull(dims.wall), length_mm: numOrNull(dims.length), inner_diameter_mm: null, width_mm: null, height_mm: null }
  return { width_mm: numOrNull(dims.width), height_mm: numOrNull(dims.height), thickness_mm: numOrNull(dims.thickness), diameter_mm: null, inner_diameter_mm: null, length_mm: null }
}

const emptyRow = (): Row => ({
  _id: newId(), part_code: '', description: '', csv_material: '',
  material_id: null, material_name: '', supplier_id: null, supplier_name: null,
  shape: 'prismatico', width_mm: null, height_mm: null, thickness_mm: null,
  diameter_mm: null, inner_diameter_mm: null, length_mm: null,
  quantity: 1, needs_dimensions: true, needs_material: true,
})

export default function OrdersMaterialFilePage() {
  const { hasPermission } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([])
  const [aliases, setAliases] = useState<MaterialAlias[]>([])
  // Riga per cui si sta creando un nuovo materiale (apre il MaterialFormModal).
  const [newMatRowId, setNewMatRowId] = useState<string | null>(null)

  const loadMaterials = () => api.get('/materials').then(r => setMaterials(r.data)).catch(() => undefined)
  const loadAliases = () => api.get('/orders/materials/aliases').then(r => setAliases(r.data)).catch(() => undefined)
  useEffect(() => {
    loadMaterials()
    // Fornitori: servono al MaterialFormModal (creazione materiale da import).
    // GET aperto (nessun permesso richiesto), quindi caricabile sempre.
    api.get('/material-suppliers').then(r => setSuppliers(r.data)).catch(() => undefined)
    loadAliases()
  }, [])

  const deleteAlias = async (id: number) => {
    try {
      await api.delete(`/orders/materials/aliases/${id}`)
      setAliases(a => a.filter(x => x.id !== id))
      toast.success('Alias rimosso')
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nella rimozione dell\'alias')) }
  }

  const patch = (id: string, p: Partial<Row>) => setRows(rs => rs.map(r => (r._id === id ? { ...r, ...p } : r)))

  const onImport = async (file: File) => {
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await api.post('/orders/materials/from-file/parse', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const parsed = (res.data.rows as FileOrderRow[]).map(r => ({ ...r, _id: newId() }))
      setRows(parsed)
      toast.success(`Distinta importata: ${parsed.length} righe`)
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nell\'import del CSV')) }
  }

  // Selezione materiale: aggiorna solo la riga. L'alias NON si salva qui (era
  // apprendimento da click transitorio/errato): viene appreso alla creazione
  // dell'ordine, dagli abbinamenti effettivamente confermati (vedi backend).
  const onPickMaterial = (id: string, materialId: number) => {
    const m = materials.find(x => x.id === materialId)
    if (!m) return
    patch(id, { material_id: m.id, material_name: m.name, supplier_id: m.supplier_id ?? null, supplier_name: m.material_supplier?.name ?? null })
  }

  // Nuovo materiale creato dal modal per la riga `newMatRowId`: aggiungilo alla
  // lista (per la tendina) e selezionalo sulla riga. L'alias nome-distinta →
  // materiale si imparerà alla creazione dell'ordine, come per un abbinamento
  // manuale (il backend usa row.csv_material, che resta invariato).
  const onNewMaterialSaved = (m?: Material) => {
    if (m && newMatRowId) {
      setMaterials(prev => prev.some(x => x.id === m.id) ? prev.map(x => (x.id === m.id ? m : x)) : [...prev, m])
      patch(newMatRowId, {
        material_id: m.id, material_name: m.name,
        supplier_id: m.supplier_id ?? null,
        supplier_name: m.material_supplier?.name ?? null,
      })
    }
    setNewMatRowId(null)
  }

  const download = async (orderId: number) => {
    const res = await api.get(`/orders/materials/${orderId}/csv`, { responseType: 'blob' })
    const cd = res.headers['content-disposition'] as string | undefined
    const match = cd?.match(/filename="?([^"]+)"?/)
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = match ? match[1] : `ordine_${orderId}.csv`
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
  }

  const onCreate = async () => {
    if (rows.length === 0) { toast.error('Nessuna riga'); return }
    const noSupplier = rows.filter(r => !r.supplier_id)
    if (noSupplier.length) { toast.error(`Abbina un materiale (con fornitore) a ${noSupplier.length} riga/e`); return }
    try {
      // Il campo extra `_id` viene ignorato dal backend (Pydantic extra=ignore).
      const res = await api.post('/orders/materials/from-file', { rows })
      const orders = res.data as { id: number }[]
      toast.success(`${orders.length} ordine/i creato/i — CSV in download`)
      for (const o of orders) await download(o.id)
      setRows([])
      loadAliases()  // il backend ha appreso gli alias dagli abbinamenti confermati
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nella creazione dell\'ordine')) }
  }

  // Map interno → props vista.
  const materialOptions: MaterialOption[] = materials.map(m => ({ id: m.id, label: m.name, supplierName: m.material_supplier?.name ?? '—' }))
  const viewRows: FileRow[] = rows.map(r => ({
    id: r._id, code: r.part_code, description: r.description,
    materialId: r.material_id, supplierName: r.supplier_name ?? undefined,
    shape: r.shape, dims: dimsToView(r), qty: String(r.quantity ?? ''),
  }))

  const onPatchRow = (id: string, p: Partial<Omit<FileRow, 'id'>>) => {
    const back: Partial<Row> = {}
    if (p.code !== undefined) back.part_code = p.code
    if (p.description !== undefined) back.description = p.description
    if (p.qty !== undefined) { const n = parseInt(p.qty, 10); back.quantity = Number.isFinite(n) && n >= 1 ? n : 1 }
    if (p.shape !== undefined) { back.shape = p.shape; Object.assign(back, dimsToFields(p.shape, {})) }
    if (p.dims !== undefined) { const cur = rows.find(r => r._id === id); Object.assign(back, dimsToFields((p.shape ?? cur?.shape ?? 'prismatico') as Shape, p.dims)) }
    patch(id, back)
  }

  return (
    <PageContainer width="xl">
      <MaterialsFileView
        rows={viewRows}
        materials={materialOptions}
        onPatchRow={onPatchRow}
        onAddRow={() => setRows(rs => [...rs, emptyRow()])}
        onRemoveRow={(id) => setRows(rs => rs.filter(r => r._id !== id))}
        onImport={onImport}
        onCreate={onCreate}
        onPickMaterial={onPickMaterial}
        onCreateNewMaterial={hasPermission('settings') ? (rowId) => setNewMatRowId(rowId) : undefined}
        aliases={aliases}
        onDeleteAlias={deleteAlias}
      />
      {newMatRowId && (
        <MaterialFormModal
          material={null}
          defaultName={rows.find(r => r._id === newMatRowId)?.csv_material || ''}
          suppliers={suppliers}
          onClose={() => setNewMatRowId(null)}
          onSaved={onNewMaterialSaved}
        />
      )}
    </PageContainer>
  )
}
