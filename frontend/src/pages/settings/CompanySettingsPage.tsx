import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Save } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'

interface CompanySettings {
  company_name: string
  company_address: string
  company_vat: string
  company_phone: string
  company_email: string
  company_website: string
}

export default function CompanySettingsPage() {
  const [settings, setSettings] = useState<CompanySettings>({
    company_name: '',
    company_address: '',
    company_vat: '',
    company_phone: '',
    company_email: '',
    company_website: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Load company settings from cost-rules
    api.get('/cost-rules').then(res => {
      const rules = res.data
      const companySettings: any = {}
      rules.forEach((r: any) => {
        if (r.key.startsWith('company_')) {
          companySettings[r.key] = r.value || ''
        }
      })
      setSettings({
        company_name: companySettings.company_name || 'Fratelli Dalla Via',
        company_address: companySettings.company_address || 'Via dell\'Industria, 1 - 36040 Torri di Quartesolo (VI)',
        company_vat: companySettings.company_vat || 'IT12345678901',
        company_phone: companySettings.company_phone || '+39 0444 123456',
        company_email: companySettings.company_email || 'info@dallavia.it',
        company_website: companySettings.company_website || 'www.dallavia.it',
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save each setting as a cost rule
      for (const [key, value] of Object.entries(settings)) {
        const existing = await api.get('/cost-rules').then(res =>
          res.data.find((r: any) => r.key === key)
        )
        if (existing) {
          await api.put(`/cost-rules/${existing.id}`, { key, value, description: `Company ${key.replace('company_', '')}` })
        } else {
          await api.post('/cost-rules', { key, value, description: `Company ${key.replace('company_', '')}` })
        }
      }
      toast.success('Impostazioni salvate!')
    } catch (e) {
      console.error('Save error', e)
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-center">Caricamento...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dati Aziendali</h1>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Salvataggio...' : 'Salva'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informazioni Azienda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Nome Azienda</label>
              <Input
                value={settings.company_name}
                onChange={e => setSettings({ ...settings, company_name: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Indirizzo</label>
              <Input
                value={settings.company_address}
                onChange={e => setSettings({ ...settings, company_address: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">P.IVA / VAT</label>
              <Input
                value={settings.company_vat}
                onChange={e => setSettings({ ...settings, company_vat: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Telefono</label>
              <Input
                value={settings.company_phone}
                onChange={e => setSettings({ ...settings, company_phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={settings.company_email}
                onChange={e => setSettings({ ...settings, company_email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Sito Web</label>
              <Input
                value={settings.company_website}
                onChange={e => setSettings({ ...settings, company_website: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
