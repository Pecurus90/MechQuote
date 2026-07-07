// Ordini materiale "da file": importa una distinta CSV (o parti a mano),
// modifica le righe in tabella, abbina i materiali al catalogo (con alias) e
// crea un ordine per fornitore (CSV scaricati + storico). Non legato ai preventivi.
import { useEffect, useRef, useState } from 'react'
import { FileUp, Plus, Trash2, Package, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import api, { getApiErrorDetail } from '@/lib/api'
import StandardPage from '@/components/layout/StandardPage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FileOrderRow, Material } from '@/types'

const emptyRow = (): FileOrderRow => ({
  part_code: '', description: '', csv_material: '',
  material_id: null, material_name: '', supplier_id: null, supplier_name: null,
  shape: 'prismatico',
  width_mm: null, height_mm: null, thickness_mm: null, diameter_mm: null, length_mm: null,
  quantity: 1, needs_dimensions: true, needs_material: true,
})

// Dimensioni mancanti per forma (riga rossa finché non complete).
const dimsMissing = (r: FileOrderRow): boolean => {
  if (r.shape === 'tondo') return !(r.diameter_mm && r.length_mm)
  if (r.shape === 'tubo') return !(r.diameter_mm && r.thickness_mm && r.length_mm)
  return !(r.width_mm && r.height_mm && r.thickness_mm)
}

const numOrNull = (v: string): number | null => {
  const s = v.trim().replace(',', '.')
  if (s === '') return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export default function OrdersMaterialFilePage() {
  const [rows, setRows] = useState<FileOrderRow[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get('/materials').then(r => setMaterials(r.data)).catch(() => undefined)
  }, [])

  const patchRow = (i: number, patch: Partial<FileOrderRow>) =>
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const importCsv = async (file: File) => {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/orders/materials/from-file/parse', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setRows(res.data.rows as FileOrderRow[])
      toast.success(`Distinta importata: ${res.data.rows.length} righe`)
    } catch (e) {
      toast.error(getApiErrorDetail(e, 'Errore nell\'import del CSV'))
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Abbina un materiale del catalogo alla riga; salva l'alias (se la riga arriva
  // da distinta) così i prossimi import riconoscono da soli quel nome.
  const pickMaterial = async (i: number, materialId: number) => {
    const m = materials.find(x => x.id === materialId)
    if (!m) return
    patchRow(i, {
      material_id: m.id,
      material_name: m.name,
      supplier_id: m.supplier_id ?? null,
      supplier_name: m.material_supplier?.name ?? null,
      needs_material: !m.supplier_id,
    })
    const csvName = rows[i]?.csv_material?.trim()
    if (csvName) {
      try { await api.post('/orders/materials/aliases', { csv_name: csvName, material_id: m.id }) } catch { /* alias best-effort */ }
    }
  }

  const download = async (orderId: number) => {
    const res = await api.get(`/orders/materials/${orderId}/csv`, { responseType: 'blob' })
    const dispo = res.headers['content-disposition'] as string | undefined
    const match = dispo?.match(/filename="?([^"]+)"?/)
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = match ? match[1] : `ordine_${orderId}.csv`
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
  }

  const createOrder = async () => {
    if (rows.length === 0) { toast.error('Nessuna riga da ordinare'); return }
    const noSupplier = rows.filter(r => !r.supplier_id)
    if (noSupplier.length) {
      toast.error(`Abbina un materiale (con fornitore) a ${noSupplier.length} riga/e`)
      return
    }
    setCreating(true)
    try {
      const res = await api.post('/orders/materials/from-file', { rows })
      const orders = res.data as { id: number; supplier_name?: string }[]
      toast.success(`${orders.length} ordine/i creato/i — CSV in download`)
      for (const o of orders) await download(o.id)
      setRows([])
    } catch (e) {
      toast.error(getApiErrorDetail(e, 'Errore nella creazione dell\'ordine'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <StandardPage
      icon={Package}
      color="blue"
      width="xl"
      title="Ordini materiale da file"
      subtitle="Importa una distinta CSV (o inserisci a mano), abbina i materiali al catalogo e crea un ordine per fornitore. Non legato ai preventivi."
      actions={
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) importCsv(f) }} />
          <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
            <FileUp className="w-4 h-4 mr-1" /> {importing ? 'Importo…' : 'Importa CSV'}
          </Button>
          <Button variant="outline" onClick={() => setRows(rs => [...rs, emptyRow()])}>
            <Plus className="w-4 h-4 mr-1" /> Riga
          </Button>
          <Button disabled={creating || rows.length === 0} onClick={createOrder}>
            <ShoppingCart className="w-4 h-4 mr-1" /> {creating ? 'Creo…' : 'Crea ordine'}
          </Button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center text-muted-foreground">
          <FileUp className="mx-auto mb-3 h-8 w-8 opacity-60" />
          <p className="text-sm">Importa una distinta CSV o aggiungi una riga per iniziare.</p>
          <p className="mt-1 text-xs">Le dimensioni mostrate sono già il <b>grezzo</b> (L/A +5 mm, spessore al multiplo di 5).</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-[13px]">
            <thead className="border-b border-border bg-card-muted text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Codice</th>
                <th className="px-3 py-2 text-left font-semibold">Descrizione</th>
                <th className="px-3 py-2 text-left font-semibold">Materiale</th>
                <th className="px-3 py-2 text-left font-semibold">Fornitore</th>
                <th className="px-3 py-2 text-left font-semibold">Forma</th>
                <th className="px-3 py-2 text-left font-semibold">Misure grezzo (mm)</th>
                <th className="px-3 py-2 text-right font-semibold">Qtà</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const missingDims = dimsMissing(r)
                const missingMat = !r.supplier_id
                const dimInput = (field: keyof FileOrderRow, ph: string) => (
                  <label className="inline-flex flex-col text-[10px] text-muted-foreground">
                    {ph}
                    <Input value={(r[field] as number | null) ?? ''} placeholder={ph}
                      onChange={e => patchRow(i, { [field]: numOrNull(e.target.value) } as Partial<FileOrderRow>)}
                      className="h-7 w-[64px] text-right font-mono" />
                  </label>
                )
                return (
                  <tr key={i} className={`border-b border-border last:border-0 ${missingDims ? 'bg-danger/[0.06]' : ''}`}>
                    <td className="px-2 py-1">
                      <Input value={r.part_code} onChange={e => patchRow(i, { part_code: e.target.value })} className="h-8 font-mono" />
                    </td>
                    <td className="px-2 py-1">
                      <Input value={r.description} onChange={e => patchRow(i, { description: e.target.value })} className="h-8" />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={r.material_id ?? ''}
                        onChange={e => e.target.value && pickMaterial(i, Number(e.target.value))}
                        className={`h-8 w-full min-w-[150px] rounded-md border bg-background px-2 text-[13px] ${missingMat ? 'border-danger text-danger' : 'border-input'}`}
                      >
                        <option value="">{r.csv_material ? `⚠ ${r.csv_material} — abbina` : 'Scegli materiale…'}</option>
                        {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1 text-muted-foreground">{r.supplier_name ?? '—'}</td>
                    <td className="px-2 py-1">
                      <select value={r.shape}
                        onChange={e => patchRow(i, { shape: e.target.value as FileOrderRow['shape'] })}
                        className="h-8 rounded-md border border-input bg-background px-2 text-[13px]">
                        <option value="prismatico">Prismatico</option>
                        <option value="tondo">Tondo</option>
                        <option value="tubo">Tubo</option>
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-end gap-1.5">
                        {r.shape === 'prismatico' && <>{dimInput('width_mm', 'Largh.')}{dimInput('height_mm', 'Alt.')}{dimInput('thickness_mm', 'Spess.')}</>}
                        {r.shape === 'tondo' && <>{dimInput('diameter_mm', 'Ø')}{dimInput('length_mm', 'Lungh.')}</>}
                        {r.shape === 'tubo' && <>{dimInput('diameter_mm', 'Ø est.')}{dimInput('thickness_mm', 'Parete')}{dimInput('length_mm', 'Lungh.')}</>}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <Input value={r.quantity} onChange={e => patchRow(i, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} className="h-8 w-[56px] text-right font-mono" />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button type="button" title="Rimuovi riga" onClick={() => setRows(rs => rs.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground transition-colors hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.some(dimsMissing) && (
        <p className="mt-2 text-[12px] text-danger">Le righe evidenziate hanno dimensioni mancanti: compilale prima di creare l'ordine.</p>
      )}
    </StandardPage>
  )
}
