import { useState } from 'react'
import { Download, Upload, FileJson, Database, TriangleAlert } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'

export default function BackupSettingsPage() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importAck, setImportAck] = useState(false)
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null)

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/backup/export', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `mechquote_backup_${new Date().toISOString().split('T')[0]}.json`)
      document.body.appendChild(link); link.click(); link.remove()
    } catch { toast.error('Errore durante l\'esportazione') } finally { setExporting(false) }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = (e: Event) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) setPendingImportFile(file) }
    input.click()
  }

  const doImport = () => {
    const file = pendingImportFile; setPendingImportFile(null)
    if (!file) return
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try { const data = JSON.parse(ev.target?.result as string); await api.post('/backup/import', data); toast.success('Dati importati con successo'); setImportAck(false) }
      catch { toast.error('Errore durante l\'importazione') } finally { setImporting(false) }
    }
    reader.readAsText(file)
  }

  return (
    <StandardPage
      icon={Database} color="gray" width="xl"
      title="Backup e ripristino"
      subtitle="Esporta tutto il DB come JSON e reimporta da un file di backup"
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Esporta */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-success/[0.14] text-success"><Download className="h-[18px] w-[18px]" /></div>
            <h2 className="text-[15px] font-semibold text-foreground">Esporta dati</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">Esporta tutti i dati del database in formato JSON (preventivi, clienti, materiali, macchine, ecc.). Non include notifiche né i file fisici allegati.</p>
          <PrimaryCtaButton color="emerald" onClick={handleExport} disabled={exporting} className="w-full justify-center">
            <FileJson className="h-4 w-4" /> {exporting ? 'Esportazione…' : 'Scarica backup'}
          </PrimaryCtaButton>
        </div>

        {/* Importa (distruttivo) */}
        <div className="rounded-2xl border border-danger/[0.3] bg-danger/[0.04] p-6">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-danger/[0.14] text-danger"><Upload className="h-[18px] w-[18px]" /></div>
            <h2 className="text-[15px] font-semibold text-foreground">Importa dati</h2>
          </div>
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/[0.3] bg-danger/[0.06] px-3 py-2 text-xs text-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-none text-danger" />
            <span>Operazione <b>distruttiva e non reversibile</b>: tutti i dati attuali vengono sovrascritti con quelli del file. L'import ricrea i record preservando gli ID.</span>
          </div>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="accent-danger" checked={importAck} onChange={e => setImportAck(e.target.checked)} />
            Ho un backup e capisco che sovrascrivo tutto.
          </label>
          <PrimaryCtaButton color="red" onClick={handleImport} disabled={importing || !importAck} className="w-full justify-center">
            <Upload className="h-4 w-4" /> {importing ? 'Importazione…' : 'Ripristina backup'}
          </PrimaryCtaButton>
        </div>
      </div>

      <ConfirmDialog
        open={pendingImportFile != null}
        title="Sovrascrivere tutti i dati?"
        description={`L'importazione di "${pendingImportFile?.name ?? ''}" cancellerà i dati esistenti e li sostituirà con quelli del file. Operazione non reversibile — il file di backup è la tua unica fonte di recupero.`}
        confirmLabel="Importa e sovrascrivi"
        onConfirm={doImport}
        onCancel={() => setPendingImportFile(null)}
      />
    </StandardPage>
  )
}
