// Container "Nuovo ordine materiale" (richiesta materiale manuale): righe a
// mano o da distinta SolidWorks, salva come bozza o invia nel pool ordini
// materiali (/orders/materials) insieme ai preventivi. Riusa MaterialsFileView
// per la tabella righe. Mappa tra la shape backend (FileOrderRow) e la vista.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileClock, Send, Trash2 } from 'lucide-react'
import api, { getApiErrorDetail } from '@/lib/api'
import { toast } from 'sonner'
import PageContainer from '@/components/ui/page-container'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import {
  MaterialsFileView, type FileRow, type MaterialOption, type Shape,
} from '@/pages/orders/MaterialsFileView'
import MaterialFormModal from '@/pages/settings/MaterialFormModal'
import { useAuth } from '@/lib/auth'
import { timeAgo } from '@/lib/timeAgo'
import {
  type Row, newRowId, dimsToView, dimsToFields, emptyRow, itemToRow,
} from '@/lib/materialRows'
import type { FileOrderRow, Material, MaterialAlias, MaterialRequest, MaterialSupplier } from '@/types'

export default function OrdersMaterialFilePage() {
  const { hasPermission } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [title, setTitle] = useState('')
  // Bozza in modifica (null = nuova richiesta). Impostata dopo il primo salvataggio.
  const [requestId, setRequestId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<MaterialRequest[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([])
  const [aliases, setAliases] = useState<MaterialAlias[]>([])
  const [newMatRowId, setNewMatRowId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<MaterialRequest | null>(null)

  const loadMaterials = () => api.get('/materials').then(r => setMaterials(r.data)).catch(() => undefined)
  const loadAliases = () => api.get('/orders/materials/aliases').then(r => setAliases(r.data)).catch(() => undefined)
  const loadDrafts = () => api.get('/orders/material-requests?status=bozza').then(r => setDrafts(r.data)).catch(() => undefined)
  useEffect(() => {
    loadMaterials()
    api.get('/material-suppliers').then(r => setSuppliers(r.data)).catch(() => undefined)
    loadAliases()
    loadDrafts()
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

  const resetEditor = () => { setRows([]); setTitle(''); setRequestId(null) }

  // Salva/aggiorna la bozza; ritorna l'id (o null in errore). Il backend ignora
  // l'extra `_id` sulle righe (Pydantic extra=ignore).
  const persist = async (): Promise<number | null> => {
    try {
      const payload = { title: title.trim() || null, rows }
      if (requestId == null) {
        const res = await api.post('/orders/material-requests', payload)
        setRequestId(res.data.id)
        return res.data.id as number
      }
      await api.put(`/orders/material-requests/${requestId}`, payload)
      return requestId
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nel salvataggio')); return null }
  }

  const saveDraft = async () => {
    const id = await persist()
    if (id != null) { toast.success('Bozza salvata'); loadDrafts() }
  }

  const send = async () => {
    const id = await persist()
    if (id == null) return
    try {
      await api.post(`/orders/material-requests/${id}/send`)
      toast.success('Ordine inviato — è nel pool ordini materiali')
      resetEditor(); loadDrafts()
      navigate('/orders/materials')
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nell\'invio dell\'ordine')) }
  }

  const resumeDraft = async (d: MaterialRequest) => {
    try {
      const res = await api.get(`/orders/material-requests/${d.id}`)
      const req = res.data as MaterialRequest
      setRequestId(req.id)
      setTitle(req.title ?? '')
      setRows(req.items.map(itemToRow))
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nel caricamento della bozza')) }
  }

  const deleteDraft = async (d: MaterialRequest) => {
    try {
      await api.delete(`/orders/material-requests/${d.id}`)
      toast.success('Bozza eliminata')
      if (requestId === d.id) resetEditor()
      loadDrafts()
    } catch (e) { toast.error(getApiErrorDetail(e, 'Errore nell\'eliminazione')) }
  }

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
      {/* Bozze salvate: riprendi o elimina */}
      {drafts.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 border-b border-border bg-card-muted px-[18px] py-3">
            <FileClock className="h-[17px] w-[17px] text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground">Bozze salvate</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{drafts.length}</span>
          </div>
          <div className="divide-y divide-border">
            {drafts.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-[18px] py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {d.title || `RM-${String(d.id).padStart(4, '0')}`}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {d.item_count} righe · {timeAgo(d.created_at)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => resumeDraft(d)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground transition-[filter] hover:brightness-105"
                >
                  <Send className="h-[13px] w-[13px]" /> Riprendi
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(d)}
                  title="Elimina bozza"
                  aria-label="Elimina bozza"
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <MaterialsFileView
        headerTitle={requestId != null ? `Modifica bozza RM-${String(requestId).padStart(4, '0')}` : 'Nuovo ordine materiale'}
        subtitle="Importa una distinta o inserisci a mano · salva la bozza o invia l'ordine nel pool materiali (con o senza preventivi)"
        titleValue={title}
        onTitleChange={setTitle}
        rows={viewRows}
        materials={materialOptions}
        onPatchRow={onPatchRow}
        onAddRow={() => setRows(rs => [...rs, emptyRow()])}
        onRemoveRow={(id) => setRows(rs => rs.filter(r => r._id !== id))}
        onImport={onImport}
        onCreate={send}
        primaryLabel="Invia ordine"
        secondaryLabel="Salva bozza"
        onSecondary={saveDraft}
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
      <ConfirmDialog
        open={pendingDelete !== null}
        variant="destructive"
        title={pendingDelete ? `Eliminare la bozza ${pendingDelete.title || `RM-${String(pendingDelete.id).padStart(4, '0')}`}?` : ''}
        description="La bozza verrà rimossa. Non reversibile."
        confirmLabel="Elimina"
        onConfirm={() => { const d = pendingDelete; setPendingDelete(null); if (d) deleteDraft(d) }}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  )
}
