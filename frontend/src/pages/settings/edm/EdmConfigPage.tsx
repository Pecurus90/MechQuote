import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Save } from 'lucide-react'
import api from '@/lib/api'
import type { EdmConfig } from '@/types'
import { toast } from 'sonner'

const empty: Omit<EdmConfig, 'id' | 'updated_at'> = {
  rough_speed_factor: 1.0,
  semi_speed_factor: 0.9,
  finish_speed_factor: 0.7,
  default_pierce_time_s: 2.0,
}

export default function EdmConfigPage() {
  const [cfg, setCfg] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/edm-config').then(r => {
      const { id: _id, updated_at: _u, ...rest } = r.data
      void _id; void _u
      setCfg(rest)
    }).catch(() => toast.error('Errore nel caricamento')).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/edm-config', cfg)
      toast.success('Parametri salvati')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const num = (v: string) => {
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
  }

  if (loading) return <div className="p-8 text-center">Caricamento...</div>

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Parametri Wire EDM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Costanti globali del calcolo: fattori di velocità per tipo di passata e tempo pierce di default.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Salvataggio...' : 'Salva'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fattori di velocità per passata</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Moltiplicatori della velocità base (sgrossatura). 1.0 = velocità piena. La velocità di una passata è
            <code className="px-1 bg-muted rounded mx-0.5">velocità_base × fattore</code>.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Sgrossatura (rough)</label>
              <Input type="number" step="0.05" min="0" value={cfg.rough_speed_factor}
                onChange={e => setCfg(c => ({ ...c, rough_speed_factor: num(e.target.value) }))} />
              <p className="text-[11px] text-muted-foreground mt-0.5">tipico 1.0 (velocità piena)</p>
            </div>
            <div>
              <label className="text-sm font-medium">Semifinitura (semi)</label>
              <Input type="number" step="0.05" min="0" value={cfg.semi_speed_factor}
                onChange={e => setCfg(c => ({ ...c, semi_speed_factor: num(e.target.value) }))} />
              <p className="text-[11px] text-muted-foreground mt-0.5">tipico 0.9 (~90%)</p>
            </div>
            <div>
              <label className="text-sm font-medium">Finitura (finish)</label>
              <Input type="number" step="0.05" min="0" value={cfg.finish_speed_factor}
                onChange={e => setCfg(c => ({ ...c, finish_speed_factor: num(e.target.value) }))} />
              <p className="text-[11px] text-muted-foreground mt-0.5">tipico 0.7 (~70%)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pierce time di default</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Secondi per ogni "infilatura filo" in un foro pre-fatto. Le righe della tabella velocità
            possono sovrascrivere questo valore per range di altezza specifici.
          </p>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <label className="text-sm font-medium">Pierce time (sec)</label>
            <Input type="number" step="0.5" min="0" value={cfg.default_pierce_time_s}
              onChange={e => setCfg(c => ({ ...c, default_pierce_time_s: num(e.target.value) }))} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
