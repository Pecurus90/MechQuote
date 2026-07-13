import { useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X, Upload } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { OfficinaCategory, Customer, MaterialSupplier, ToolSupplier, NormalizedSupplier } from '@/types'
import { fmtBytes, fmtCustomer, ALLOWED_ACCEPT, type RefKind } from './documentsUtil'

interface Props {
  categories: OfficinaCategory[]       // già ordinate
  customers: Customer[]                // già ordinati
  matSuppliers: MaterialSupplier[]     // già filtrati/ordinati
  toolSuppliers: ToolSupplier[]
  normSuppliers: NormalizedSupplier[]
  defaultCategory: string
  defaultRefKind: RefKind
  defaultRefId: string
  onClose: () => void
  onUploaded: () => void
}

export default function UploadModal({
  categories, customers, matSuppliers, toolSuppliers, normSuppliers,
  defaultCategory, defaultRefKind, defaultRefId, onClose, onUploaded,
}: Props) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [refKind, setRefKind] = useState<RefKind>(defaultRefKind)
  const [refId, setRefId] = useState(defaultRefId)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEscapeKey(onClose, true)

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      toast.error('Titolo e file sono obbligatori')
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('title', title.trim())
    if (category.trim()) fd.append('category', category.trim())
    if (refKind === 'customer' && refId) fd.append('customer_id', refId)
    if (refKind === 'material_supplier' && refId) fd.append('material_supplier_id', refId)
    if (refKind === 'tool_supplier' && refId) fd.append('tool_supplier_id', refId)
    if (refKind === 'normalized_supplier' && refId) fd.append('normalized_supplier_id', refId)
    fd.append('file', file)
    try {
      await api.post('/officina/documents', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Documento caricato')
      onUploaded()
      onClose()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore upload')
    } finally {
      setUploading(false)
    }
  }

  const refLabel =
    refKind === 'customer' ? 'Cliente' :
    refKind === 'material_supplier' ? 'Fornitore materiali' :
    refKind === 'tool_supplier' ? 'Fornitore utensili' :
    refKind === 'normalized_supplier' ? 'Fornitori normalizzati' : 'Selezione'

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg bg-card shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold">Carica file</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <CardContent className="pt-4 space-y-3">
          <div>
            <label className="text-sm font-medium">Titolo *</label>
            <Input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="es. Catalogo Sandvik 2024" autoFocus />
          </div>
          <div>
            <label className="text-sm font-medium">Categoria</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm mt-1"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="">— Nessuna —</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Le categorie sono gestite dall'amministratore (Hub Officina → "Nuova categoria").
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Tipo riferimento</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm mt-1"
                value={refKind}
                onChange={e => { setRefKind(e.target.value as RefKind); setRefId('') }}
              >
                <option value="none">— Nessuno —</option>
                <option value="customer">Cliente</option>
                <option value="material_supplier">Fornitore materiali</option>
                <option value="tool_supplier">Fornitore utensili</option>
                <option value="normalized_supplier">Fornitori normalizzati</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{refLabel}</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm mt-1 disabled:opacity-50"
                value={refId}
                disabled={refKind === 'none'}
                onChange={e => setRefId(e.target.value)}
              >
                <option value="">— Seleziona —</option>
                {refKind === 'customer' && customers.map(c => (
                  <option key={c.id} value={c.id}>{fmtCustomer(c)}</option>
                ))}
                {refKind === 'material_supplier' && matSuppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                {refKind === 'tool_supplier' && toolSuppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                {refKind === 'normalized_supplier' && normSuppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">File *</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_ACCEPT}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) setFile(f)
              }}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary/10 file:text-primary file:font-medium hover:file:bg-primary/20 cursor-pointer mt-1"
            />
            {file && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {file.name} ({fmtBytes(file.size)})
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Max 50 MB. Accettati: PDF, Word, Excel, immagini (PNG/JPG/GIF), DXF.
            </p>
          </div>
          <div className="flex gap-2 mt-4">
            <PrimaryCtaButton color="emerald" onClick={handleUpload} disabled={uploading}>
              <Upload className="w-4 h-4" /> {uploading ? 'Caricamento...' : 'Carica'}
            </PrimaryCtaButton>
            <Button variant="outline" onClick={onClose} disabled={uploading}>
              Annulla
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
