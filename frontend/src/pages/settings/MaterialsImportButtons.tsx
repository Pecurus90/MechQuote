import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Upload } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'

// Bottoni "Modello" + "Importa CSV" per i materiali, auto-contenuti.
export default function MaterialsImportButtons({ onImported }: { onImported: () => void }) {
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleImport = async (file: File) => {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/materials/import-csv', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const { created, skipped_existing, skipped_invalid, examples } = res.data as {
        created: number; skipped_existing: number; skipped_invalid: number; examples: string[]
      }
      const parts = []
      if (created) parts.push(`${created} aggiunti`)
      if (skipped_existing) parts.push(`${skipped_existing} già presenti`)
      if (skipped_invalid) parts.push(`${skipped_invalid} scartati`)
      toast.success(`Import OK: ${parts.join(', ') || 'nessuna modifica'}`)
      if (skipped_invalid && examples?.length) {
        toast.warning(`Esempi scartati: ${examples.slice(0, 3).join(' · ')}`)
      }
      onImported()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'import')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/materials/csv-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'materiali_modello.csv'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Errore scaricamento modello')
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleImport(f)
        }}
      />
      <Button size="sm" variant="outline" onClick={downloadTemplate}
              title="Scarica un modello CSV vuoto da compilare">
        <Download className="w-4 h-4 mr-1" /> Modello
      </Button>
      <Button size="sm" variant="outline" disabled={importing}
              onClick={() => fileRef.current?.click()}
              title="Importa un CSV di materiali (separatore ;). Aggancio fornitore via nome esatto.">
        <Upload className="w-4 h-4 mr-1" /> {importing ? 'Import...' : 'Importa CSV'}
      </Button>
    </>
  )
}
