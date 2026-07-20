// Modale "matita" del pool ordini materiali: modifica una richiesta inviata
// (aggiungi righe dimenticate, correggi materiale/misure/qtà). Modifica solo le
// righe APERTE; quelle già ordinate (evase) restano nell'ordine emesso e non
// sono toccabili qui. Riusa MaterialsFileView + i mapper di lib/materialRows.
import { useEffect, useState } from 'react'
import { X, Lock } from 'lucide-react'
import api, { getApiErrorDetail } from '@/lib/api'
import { toast } from 'sonner'
import {
  MaterialsFileView, type FileRow, type MaterialOption, type Shape,
} from '@/pages/orders/MaterialsFileView'
import {
  type Row, newRowId, dimsToView, dimsToFields, emptyRow, itemToRow,
} from '@/lib/materialRows'
import type { FileOrderRow, Material, MaterialRequest } from '@/types'

interface Props {
  requestId: number
  onClose: () => void
  onSaved: () => void
}

export default function RequestEditModal({ requestId, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [title, setTitle] = useState('')
  const [evasoCount, setEvasoCount] = useState(0)
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/materials').then(r => setMaterials(r.data)).catch(() => undefined)
    api.get(`/orders/material-requests/${requestId}`)
      .then(r => {
        const req = r.data as MaterialRequest
        setTitle(req.title ?? '')
        setRows(req.items.filter(it => !it.evaso).map(itemToRow))
        setEvasoCount(req.items.filter(it => it.evaso).length)
      })
      .catch(e => { toast.error(getApiErrorDetail(e, 'Errore nel caricamento dell\'ordine')); onClose() })
      .finally(() => setLoading(false))
  }, [requestId, onClose])

  const patch = (id: string, p: Partial<Row>) => setRows(rs => rs.map(r => (r._id === id ? { ...r, ...p } : r)))

  const onImport = async (file: File) => {
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await api.post('/orders/materials/from-file/parse', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const parsed = (res.data.rows as FileOrderRow[]).map(r => ({ ...r, _id: newRowId() }))
      setRows(rs => [...rs, ...parsed])
      toast.success(`Distinta importata: ${parsed.length} righe`)
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nell\'import del CSV')) }
  }

  const onPickMaterial = (id: string, materialId: number) => {
    const m = materials.find(x => x.id === materialId)
    if (!m) return
    patch(id, { material_id: m.id, material_name: m.name, supplier_id: m.supplier_id ?? null, supplier_name: m.material_supplier?.name ?? null })
  }

  const onPatchRow = (id: string, p: Partial<Omit<FileRow, 'id'>>) => {
    const back: Partial<Row> = {}
    if (p.code !== undefined) back.part_code = p.code
    if (p.description !== undefined) back.description = p.description
    if (p.qty !== undefined) { const n = parseInt(p.qty, 10); back.quantity = Number.isFinite(n) && n >= 1 ? n : 1 }
    if (p.shape !== undefined) { back.shape = p.shape; Object.assign(back, dimsToFields(p.shape, {})) }
    if (p.dims !== undefined) { const cur = rows.find(r => r._id === id); Object.assign(back, dimsToFields((p.shape ?? cur?.shape ?? 'prismatico') as Shape, p.dims)) }
    patch(id, back)
  }

  const save = async () => {
    try {
      await api.put(`/orders/material-requests/${requestId}`, { title: title.trim() || null, rows })
      toast.success('Ordine aggiornato')
      onSaved(); onClose()
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nel salvataggio')) }
  }

  const materialOptions: MaterialOption[] = materials.map(m => ({ id: m.id, label: m.name, supplierName: m.material_supplier?.name ?? '—' }))
  const viewRows: FileRow[] = rows.map(r => ({
    id: r._id, code: r.part_code, description: r.description,
    materialId: r.material_id, supplierName: r.supplier_name ?? undefined,
    shape: r.shape, dims: dimsToView(r), qty: String(r.quantity ?? ''),
  }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div className="relative w-full max-w-[1120px]" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="absolute -top-2 right-0 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground sm:-right-2"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
        {evasoCount > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-border bg-card-muted px-3.5 py-2.5 text-[12.5px] font-medium text-muted-foreground">
            <Lock className="h-4 w-4 flex-none" />
            {evasoCount === 1
              ? '1 riga già ordinata non è modificabile qui (resta nell\'ordine emesso).'
              : `${evasoCount} righe già ordinate non sono modificabili qui (restano nell\'ordine emesso).`}
          </div>
        )}
        {!loading && (
          <MaterialsFileView
            headerTitle={`Modifica ordine RM-${String(requestId).padStart(4, '0')}`}
            subtitle="Aggiungi righe dimenticate o correggi materiale, misure e quantità"
            titleValue={title}
            onTitleChange={setTitle}
            rows={viewRows}
            materials={materialOptions}
            onPatchRow={onPatchRow}
            onAddRow={() => setRows(rs => [...rs, emptyRow()])}
            onRemoveRow={(id) => setRows(rs => rs.filter(r => r._id !== id))}
            onImport={onImport}
            onCreate={save}
            primaryLabel="Salva modifiche"
            onPickMaterial={onPickMaterial}
          />
        )}
      </div>
    </div>
  )
}
