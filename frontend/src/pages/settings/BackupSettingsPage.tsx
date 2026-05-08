import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Download, Upload, FileJson } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'

export default function BackupSettingsPage() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

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
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      if (!confirm('Attenzione: l\'importazione sovrascriverà tutti i dati esistenti. Continuare?')) return

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
    input.click()
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Backup e Ripristino</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" /> Esporta Dati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Esporta tutti i dati del database in formato JSON. Include preventivi, clienti, materiali, macchine, ecc.
            </p>
            <Button onClick={handleExport} disabled={exporting} className="w-full">
              <FileJson className="w-4 h-4 mr-1" />
              {exporting ? 'Esportazione...' : 'Scarica Backup'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" /> Importa Dati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Importa dati da un file di backup JSON. <strong>Attenzione:</strong> tutti i dati attuali verranno sovrascritti.
            </p>
            <Button onClick={handleImport} disabled={importing} variant="destructive" className="w-full">
              <Upload className="w-4 h-4 mr-1" />
              {importing ? 'Importazione...' : 'Ripristina Backup'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
