import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Download, Upload, FileJson, Database } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'

export default function BackupSettingsPage() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null)

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/backup/export', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `mechquote_backup_${new Date().toISOString().split('T')[0]}.json`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      toast.error('Errore durante l\'esportazione')
    } finally {
      setExporting(false)
    }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) setPendingImportFile(file)
    }
    input.click()
  }

  const doImport = () => {
    const file = pendingImportFile
    setPendingImportFile(null)
    if (!file) return
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        await api.post('/backup/import', data)
        toast.success('Dati importati con successo!')
      } catch {
        toast.error('Errore durante l\'importazione')
      } finally {
        setImporting(false)
      }
    }
    reader.readAsText(file)
  }

  return (
    <StandardPage
      icon={Database}
      color="gray"
      title="Backup e Ripristino"
      subtitle="Esporta tutto il DB come JSON e reimporta da un file di backup"
      width="xl"
    >

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" /> Esporta Dati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Esporta tutti i dati del database in formato JSON. Include preventivi, clienti, materiali, macchine, ecc.
            </p>
            <PrimaryCtaButton color="emerald" onClick={handleExport} disabled={exporting} className="w-full justify-center">
              <FileJson className="w-4 h-4" />
              {exporting ? 'Esportazione...' : 'Scarica Backup'}
            </PrimaryCtaButton>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" /> Importa Dati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Importa dati da un file di backup JSON. <strong>Attenzione:</strong> tutti i dati attuali verranno sovrascritti.
            </p>
            <PrimaryCtaButton color="red" onClick={handleImport} disabled={importing} className="w-full justify-center">
              <Upload className="w-4 h-4" />
              {importing ? 'Importazione...' : 'Ripristina Backup'}
            </PrimaryCtaButton>
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={pendingImportFile != null}
        title="Sovrascrivere tutti i dati?"
        description={`L'importazione di "${pendingImportFile?.name ?? ''}" cancellerà i dati esistenti e li sostituirà con quelli del file. Operazione non reversibile — il backup file è la tua unica fonte di recupero.`}
        confirmLabel="Importa e sovrascrivi"
        onConfirm={doImport}
        onCancel={() => setPendingImportFile(null)}
      />
    </StandardPage>
  )
}
