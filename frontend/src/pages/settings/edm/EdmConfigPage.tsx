import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { SlidersHorizontal } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import type { EdmConfig, Machine } from '@/types'
import { toast } from 'sonner'

const empty: Omit<EdmConfig, 'id' | 'updated_at'> = {
  rough_speed_factor: 1.0,
  semi_speed_factor: 0.9,
  finish_speed_factor: 0.7,
  default_pierce_time_s: 2.0,
  default_drilling_machine_id: null,
}

export default function EdmConfigPage() {
  const [cfg, setCfg] = useState(empty)
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/edm-config'), api.get('/machines')])
      .then(([cfgRes, mRes]) => {
        const { id: _id, updated_at: _u, ...rest } = cfgRes.data
        void _id; void _u
        setCfg(rest)
        setMachines(mRes.data)
      })
      .catch(() => toast.error('Errore nel caricamento'))
      .finally(() => setLoading(false))
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
    <StandardPage
      icon={SlidersHorizontal}
      color="amber"
      width="md"
      title="Parametri Wire EDM"
      subtitle="Costanti globali del calcolo: fattori di velocità per tipo di passata e tempo pierce di default."
      actions={
        <PrimaryCtaButton color="amber" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvataggio...' : 'Salva'}
        </PrimaryCtaButton>
      }
    >

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

      <Card>
        <CardHeader>
          <CardTitle>Foratrice EDM dedicata</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            La macchina utilizzata per i pre-fori prima del taglio Wire EDM.
            Il wizard "Nuovo Preventivo 2D" la usa automaticamente in modalità
            "Foratrice EDM" per popolare la fase Foratura del preventivo.
          </p>
        </CardHeader>
        <CardContent>
          <div className="max-w-md">
            <label className="text-sm font-medium">Macchina</label>
            <select
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={cfg.default_drilling_machine_id ?? ''}
              onChange={e => setCfg(c => ({
                ...c,
                default_drilling_machine_id: e.target.value === '' ? null : Number(e.target.value),
              }))}
            >
              <option value="">— nessuna selezionata —</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.hourly_rate.toFixed(0)} €/h{m.machine_type ? ` · ${m.machine_type}` : ''})
                </option>
              ))}
            </select>
            {!cfg.default_drilling_machine_id && (
              <p className="text-[11px] text-amber-700 mt-1">
                ⚠ Senza foratrice EDM dedicata, la modalità "Foratrice EDM" del wizard 2D
                non potrà creare la fase Foratura automaticamente.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </StandardPage>
  )
}
