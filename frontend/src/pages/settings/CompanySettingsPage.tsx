import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Save } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { CompanySettings } from '@/types'

const empty: Omit<CompanySettings, 'id' | 'updated_at'> = {
  name: '', address: '', vat: '', phone: '', email: '', website: '',
  default_margin_percent: 20, default_minimum_part_price: 0,
  default_transport_cost: 0, default_packaging_cost: 0,
}

export default function CompanySettingsPage() {
  const [settings, setSettings] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/company-settings').then(r => {
      const { id: _id, updated_at: _u, ...rest } = r.data
      void _id; void _u
      setSettings(rest)
    }).catch(() => toast.error('Errore nel caricamento')).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/company-settings', settings)
      toast.success('Impostazioni salvate')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const num = (v: number | string): number => {
    const n = typeof v === 'number' ? v : parseFloat(v)
    return isNaN(n) ? 0 : n
  }

  if (loading) return <div className="p-8 text-center">Caricamento...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dati Azienda</h1>
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
              <Input value={settings.name}
                onChange={e => setSettings(s => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Indirizzo</label>
              <Input value={settings.address}
                onChange={e => setSettings(s => ({ ...s, address: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">P.IVA / VAT</label>
              <Input value={settings.vat}
                onChange={e => setSettings(s => ({ ...s, vat: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Telefono</label>
              <Input value={settings.phone}
                onChange={e => setSettings(s => ({ ...s, phone: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input type="email" value={settings.email}
                onChange={e => setSettings(s => ({ ...s, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Sito Web</label>
              <Input value={settings.website}
                onChange={e => setSettings(s => ({ ...s, website: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default Preventivi</CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Valori applicati automaticamente ad ogni nuovo preventivo o parte. L'utente può sovrascriverli caso per caso.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Margine globale (%)</label>
              <Input type="number" min={0} step={0.5} value={settings.default_margin_percent}
                onChange={e => setSettings(s => ({ ...s, default_margin_percent: num(e.target.value) }))} />
              <p className="text-[11px] text-gray-400 mt-0.5">Margine di default applicato al preventivo</p>
            </div>
            <div>
              <label className="text-sm font-medium">Prezzo minimo parte (€)</label>
              <Input type="number" min={0} step={0.5} value={settings.default_minimum_part_price}
                onChange={e => setSettings(s => ({ ...s, default_minimum_part_price: num(e.target.value) }))} />
              <p className="text-[11px] text-gray-400 mt-0.5">Soglia minima del prezzo unitario di una parte</p>
            </div>
            <div>
              <label className="text-sm font-medium">Trasporto di default (€)</label>
              <Input type="number" min={0} step={0.5} value={settings.default_transport_cost}
                onChange={e => setSettings(s => ({ ...s, default_transport_cost: num(e.target.value) }))} />
              <p className="text-[11px] text-gray-400 mt-0.5">Importo precompilato come spese di trasporto</p>
            </div>
            <div>
              <label className="text-sm font-medium">Imballaggio di default (€)</label>
              <Input type="number" min={0} step={0.5} value={settings.default_packaging_cost}
                onChange={e => setSettings(s => ({ ...s, default_packaging_cost: num(e.target.value) }))} />
              <p className="text-[11px] text-gray-400 mt-0.5">Importo precompilato come spese di imballaggio</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
