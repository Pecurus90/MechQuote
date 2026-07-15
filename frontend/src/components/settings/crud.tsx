import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { X, Upload, Download } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import { useEscapeKey } from '@/lib/useEscapeKey'
import api from '@/lib/api'
import { toast } from 'sonner'

// Kit condiviso per il pattern P2 (tabella + modale CRUD). Uniforma modale,
// pallino "Attivo" e bottoni CSV su tutte le pagine catalogo.

export type Accent = 'primary' | 'tools' | 'sales' | 'customers' | 'officina' | 'edm'

/** Pallino stato: verde = attivo, grigio = ritirato (con title per accessibilità). */
export function ActiveDot({ active }: { active: boolean }) {
  return active
    ? <span className="text-success" title="Attivo">●</span>
    : <span className="text-muted-foreground/50" title="Ritirato">●</span>
}

export const fieldLabel = 'mb-1 block text-[12px] font-medium text-foreground'

/** Shell modale CRUD: overlay + card (header icona/titolo/X, corpo, footer card-muted). */
export function SettingsModal({
  title, icon: Icon, accent = 'primary', onClose, onSave, saveLabel = 'Salva', saving, width = 'max-w-lg', children,
}: {
  title: string; icon?: LucideIcon; accent?: Accent
  onClose: () => void; onSave: () => void; saveLabel?: string; saving?: boolean
  width?: string; children: ReactNode
}) {
  useEscapeKey(onClose, true)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
      <div className={`w-full ${width} overflow-hidden rounded-2xl border border-border bg-card shadow-xl`}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="flex h-8 w-8 items-center justify-center rounded-[9px]"
                style={{ backgroundColor: `hsl(var(--${accent}) / 0.14)`, color: `hsl(var(--${accent}))` }}>
                <Icon className="h-[17px] w-[17px]" />
              </div>
            )}
            <h3 className="font-semibold text-foreground">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-auto px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border bg-card-muted px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          <PrimaryCtaButton color={accent} onClick={onSave} disabled={saving}>{saving ? 'Salvataggio…' : saveLabel}</PrimaryCtaButton>
        </div>
      </div>
    </div>
  )
}

/** Coppia bottoni "Modello" (scarica CSV vuoto) + "Importa CSV" (upload). */
export function CsvImportButtons({ importUrl, templateUrl, templateName, importTitle, onImported }: {
  importUrl: string; templateUrl: string; templateName: string; importTitle?: string; onImported: () => void
}) {
  const [importing, setImporting] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const doImport = async (file: File) => {
    setImporting(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await api.post(importUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const d = res.data as Record<string, unknown>
      const parts: string[] = []
      if (d.created) parts.push(`${d.created} aggiunti`)
      if (d.updated) parts.push(`${d.updated} aggiornati`)
      if (d.skipped_existing) parts.push(`${d.skipped_existing} già presenti`)
      if (d.skipped) parts.push(`${d.skipped} saltati`)
      if (d.skipped_invalid) parts.push(`${d.skipped_invalid} scartati`)
      toast.success(`Import OK: ${parts.join(', ') || 'nessuna modifica'}`)
      const ex = d.examples as string[] | undefined
      if (d.skipped_invalid && ex?.length) toast.warning(`Esempi scartati: ${ex.slice(0, 3).join(' · ')}`)
      onImported()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'import')
    } finally { setImporting(false); if (ref.current) ref.current.value = '' }
  }

  const template = async () => {
    try {
      const res = await api.get(templateUrl, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a'); a.href = url; a.download = templateName
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch { toast.error('Errore scaricamento modello') }
  }

  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f) }} />
      <Button size="sm" variant="outline" onClick={template} title="Scarica un modello CSV vuoto da compilare"><Download className="mr-1 h-4 w-4" /> Modello</Button>
      <Button size="sm" variant="outline" disabled={importing} onClick={() => ref.current?.click()} title={importTitle}><Upload className="mr-1 h-4 w-4" /> {importing ? 'Import…' : 'Importa CSV'}</Button>
    </>
  )
}
