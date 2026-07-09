// Container "Normalizzati da file": import distinta / righe manuali, tabella
// editabile (NormalizedFileView), crea un ordine per fornitore. Gemello di
// OrdersMaterialFilePage ma senza forma/misure (i normalizzati non hanno grezzo).
import { useEffect, useState } from 'react'
import api, { getApiErrorDetail } from '@/lib/api'
import { toast } from 'sonner'
import PageContainer from '@/components/ui/page-container'
import {
  NormalizedFileView, type NormRow, type TypeOption, type NormAliasEntry,
} from '@/pages/orders/NormalizedFileView'
import type { NormalizedItem } from '@/types'

// Riga interna = shape backend (NormalizedFileRow) + id client per key/patch.
interface BackRow {
  reference: string
  csv_raw: string
  normalized_item_id: number | null
  article: string
  description: string
  supplier_id: number | null
  supplier_name: string | null
  quantity: number
  needs_type: boolean
}
type Row = BackRow & { _id: string }
let _seq = 0
const newId = () => `n${++_seq}`

const emptyRow = (): Row => ({
  _id: newId(), reference: '', csv_raw: '', normalized_item_id: null, article: '',
  description: '', supplier_id: null, supplier_name: null, quantity: 1, needs_type: true,
})

export default function OrdersNormalizedFilePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [items, setItems] = useState<NormalizedItem[]>([])
  const [aliases, setAliases] = useState<NormAliasEntry[]>([])

  const loadItems = () => api.get('/normalized-items').then(r => setItems(r.data)).catch(() => undefined)
  const loadAliases = () => api.get('/orders/normalized/aliases').then(r => setAliases(r.data)).catch(() => undefined)
  useEffect(() => { loadItems(); loadAliases() }, [])

  const patch = (id: string, p: Partial<Row>) => setRows(rs => rs.map(r => (r._id === id ? { ...r, ...p } : r)))

  const onImport = async (file: File) => {
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await api.post('/orders/normalized/from-file/parse', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const parsed = (res.data.rows as BackRow[]).map(r => ({ ...r, _id: newId() }))
      setRows(parsed)
      toast.success(`Distinta importata: ${parsed.length} righe`)
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nell\'import del CSV')) }
  }

  // Selezione tipo: aggiorna la riga (fornitore derivato dalla voce). L'alias si
  // impara alla creazione dell'ordine dagli abbinamenti confermati (come materiali).
  const onPickType = (id: string, typeId: number) => {
    const it = items.find(x => x.id === typeId)
    if (!it) return
    patch(id, {
      normalized_item_id: it.id, article: it.description,
      supplier_id: it.supplier_id ?? null, supplier_name: it.supplier?.name ?? null,
      needs_type: false,
    })
  }

  const download = async (orderId: number) => {
    const res = await api.get(`/orders/normalized/${orderId}/csv`, { responseType: 'blob' })
    const cd = res.headers['content-disposition'] as string | undefined
    const match = cd?.match(/filename="?([^"]+)"?/)
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = match ? match[1] : `ordine_normalizzati_${orderId}.csv`
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
  }

  const onCreate = async () => {
    if (rows.length === 0) { toast.error('Nessuna riga'); return }
    const noSup = rows.filter(r => !r.supplier_id)
    if (noSup.length) { toast.error(`Abbina un tipo (con fornitore) a ${noSup.length} riga/e`); return }
    try {
      const res = await api.post('/orders/normalized/from-file', { rows })
      const orders = res.data as { id: number }[]
      toast.success(`${orders.length} ordine/i creato/i — CSV in download`)
      for (const o of orders) await download(o.id)
      setRows([])
      loadAliases()  // il backend ha appreso gli alias dagli abbinamenti confermati
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nella creazione dell\'ordine')) }
  }

  const deleteAlias = async (id: number) => {
    try {
      await api.delete(`/orders/normalized/aliases/${id}`)
      setAliases(a => a.filter(x => x.id !== id))
      toast.success('Alias rimosso')
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nella rimozione dell\'alias')) }
  }

  const typeOptions: TypeOption[] = items.map(it => ({
    id: it.id, label: it.description, supplierName: it.supplier?.name ?? '—',
  }))
  const viewRows: NormRow[] = rows.map(r => ({
    id: r._id, reference: r.reference, description: r.description,
    typeId: r.normalized_item_id, supplierName: r.supplier_name ?? undefined,
    qty: String(r.quantity ?? ''),
  }))

  const onPatchRow = (id: string, p: Partial<Omit<NormRow, 'id'>>) => {
    const back: Partial<Row> = {}
    if (p.reference !== undefined) back.reference = p.reference
    if (p.description !== undefined) back.description = p.description
    if (p.qty !== undefined) { const n = parseInt(p.qty, 10); back.quantity = Number.isFinite(n) && n >= 1 ? n : 1 }
    patch(id, back)
  }

  return (
    <PageContainer width="xl">
      <NormalizedFileView
        rows={viewRows}
        types={typeOptions}
        onPatchRow={onPatchRow}
        onAddRow={() => setRows(rs => [...rs, emptyRow()])}
        onRemoveRow={(id) => setRows(rs => rs.filter(r => r._id !== id))}
        onImport={onImport}
        onCreate={onCreate}
        onPickType={onPickType}
        aliases={aliases}
        onDeleteAlias={deleteAlias}
      />
    </PageContainer>
  )
}
