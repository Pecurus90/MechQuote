import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { SlidersHorizontal } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import type { EdmConfig, Machine } from '@/types'
import { toast } from 'sonner'

const empty: Omit<EdmConfig, 'id' | 'updated_at'> = {
  rough_speed_factor: 1.0, semi_speed_factor: 0.9, finish_speed_factor: 0.7,
  default_pierce_time_s: 2.0, default_drilling_machine_id: null,
}
const labelCls = 'mb-1 block text-[12px] font-medium text-foreground'

function Section({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

export default function EdmConfigPage() {
  const [cfg, setCfg] = useState(empty)
  const [pristine, setPristine] = useState(empty)
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/edm-config'), api.get('/machines')]).then(([cfgRes, mRes]) => {
      const { id: _id, updated_at: _u, ...rest } = cfgRes.data
      void _id; void _u
      setCfg(rest); setPristine(rest); setMachines(mRes.data)
    }).catch(() => toast.error('Errore nel caricamento')).finally(() => setLoading(false))
  }, [])

  const dirty = JSON.stringify(cfg) !== JSON.stringify(pristine)
  const handleSave = async () => {
    setSaving(true)
    try { await api.put('/edm-config', cfg); setPristine(cfg); toast.success('Parametri salvati') }
    catch { toast.error('Errore nel salvataggio') } finally { setSaving(false) }
  }
  const num = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  const nf = (key: keyof typeof empty, label: string, help: string, step = '0.05') => (
    <div>
      <label className={labelCls}>{label}</label>
      <Input type="number" step={step} min="0" className="font-mono" value={cfg[key] as number} onChange={e => setCfg(c => ({ ...c, [key]: num(e.target.value) }))} />
      <p className="mt-1 text-[11px] text-muted-foreground">{help}</p>
    </div>
  )

  if (loading) return <div className="p-8 text-center text-muted-foreground">Caricamento…</div>

  return (
    <StandardPage
      icon={SlidersHorizontal} color="edm" width="lg"
      title="Parametri Wire EDM"
      subtitle="Costanti globali del calcolo: fattori di velocità per tipo di passata e tempo pierce di default."
      actions={
        <PrimaryCtaButton color="edm" onClick={handleSave} disabled={saving || !dirty}>
          {dirty && !saving && <span className="h-1.5 w-1.5 rounded-full bg-white/90" />}
          {saving ? 'Salvataggio…' : 'Salva'}
        </PrimaryCtaButton>
      }
    >
      <Section title="Fattori di velocità per passata" desc={<>Moltiplicatori della velocità base (sgrossatura). 1.0 = velocità piena. Velocità passata = velocità_base × fattore.</>}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {nf('rough_speed_factor', 'Sgrossatura (rough)', 'tipico 1.0 (velocità piena)')}
          {nf('semi_speed_factor', 'Semifinitura (semi)', 'tipico 0.9 (~90%)')}
          {nf('finish_speed_factor', 'Finitura (finish)', 'tipico 0.7 (~70%)')}
        </div>
      </Section>

      <Section title="Pierce time di default" desc="Secondi per ogni infilatura filo in un foro pre-fatto. Le righe della tabella velocità possono sovrascriverlo per range di altezza specifici.">
        <div className="max-w-xs">{nf('default_pierce_time_s', 'Pierce time (sec)', 'default globale', '0.5')}</div>
      </Section>

      <Section title="Foratrice EDM dedicata" desc="La macchina per i pre-fori prima del taglio. Il wizard 2D la usa in modalità 'Foratrice EDM' per popolare la fase Foratura.">
        <div className="max-w-md">
          <label className={labelCls}>Macchina</label>
          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={cfg.default_drilling_machine_id ?? ''} onChange={e => setCfg(c => ({ ...c, default_drilling_machine_id: e.target.value === '' ? null : Number(e.target.value) }))}>
            <option value="">— nessuna selezionata —</option>
            {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.hourly_rate.toFixed(0)} €/h{m.machine_type ? ` · ${m.machine_type}` : ''})</option>)}
          </select>
          {!cfg.default_drilling_machine_id && <p className="mt-1 text-[11px] text-warning">Senza foratrice EDM dedicata, la modalità "Foratrice EDM" del wizard 2D non crea la fase Foratura automaticamente.</p>}
        </div>
      </Section>
    </StandardPage>
  )
}
