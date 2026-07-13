import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Building2 } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { CompanySettings } from '@/types'

const empty: Omit<CompanySettings, 'id' | 'updated_at'> = {
  name: '', address: '', vat: '', phone: '', email: '', website: '',
  default_margin_percent: 20, default_minimum_part_price: 0,
  default_transport_cost: 0, default_packaging_cost: 0,
  stock_shipping_cost: 0, stock_cutting_cost_per_part: 0,
}

// P3 — card sezione: bordo + titolo 11 uppercase + descrizione opzionale.
function Section({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </div>
  )
}

const labelCls = 'mb-1 block text-[12px] font-medium text-foreground'

export default function CompanySettingsPage() {
  const [settings, setSettings] = useState(empty)
  const [pristine, setPristine] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/company-settings').then(r => {
      const { id: _id, updated_at: _u, ...rest } = r.data
      void _id; void _u
      setSettings(rest); setPristine(rest)
    }).catch(() => toast.error('Errore nel caricamento')).finally(() => setLoading(false))
  }, [])

  const dirty = JSON.stringify(settings) !== JSON.stringify(pristine)

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/company-settings', settings)
      setPristine(settings)
      toast.success('Impostazioni salvate')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const num = (v: string): number => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

  const text = (key: keyof typeof empty, label: string, full?: boolean, type = 'text') => (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className={labelCls}>{label}</label>
      <Input type={type} value={settings[key] as string} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))} />
    </div>
  )
  const nf = (key: keyof typeof empty, label: string, help: string) => (
    <div>
      <label className={labelCls}>{label}</label>
      <Input type="number" min={0} step={0.5} className="font-mono" value={settings[key] as number}
        onChange={e => setSettings(s => ({ ...s, [key]: num(e.target.value) }))} />
      <p className="mt-1 text-[11px] text-muted-foreground">{help}</p>
    </div>
  )

  if (loading) return <div className="p-8 text-center text-muted-foreground">Caricamento…</div>

  return (
    <StandardPage
      icon={Building2}
      color="gray"
      title="Dati azienda"
      subtitle="Anagrafica + default operativi (margine, prezzo minimo, trasporto, imballaggio)"
      width="lg"
      actions={
        <PrimaryCtaButton color="blue" onClick={handleSave} disabled={saving || !dirty}>
          {dirty && !saving && <span className="h-1.5 w-1.5 rounded-full bg-white/90" />}
          {saving ? 'Salvataggio…' : 'Salva'}
        </PrimaryCtaButton>
      }
    >
      <Section title="Informazioni azienda">
        {text('name', 'Nome azienda', true)}
        {text('address', 'Indirizzo', true)}
        {text('vat', 'P.IVA / VAT')}
        {text('phone', 'Telefono')}
        {text('email', 'Email', false, 'email')}
        {text('website', 'Sito web')}
      </Section>

      <Section title="Default preventivi" desc="Precompilano ogni nuovo preventivo o parte; l'utente può sovrascriverli caso per caso.">
        {nf('default_margin_percent', 'Margine globale (%)', 'Margine di default applicato al preventivo.')}
        {nf('default_minimum_part_price', 'Prezzo minimo parte (€)', 'Soglia minima del prezzo unitario di una parte.')}
        {nf('default_transport_cost', 'Trasporto di default (€)', 'Importo precompilato come spese di trasporto.')}
        {nf('default_packaging_cost', 'Imballaggio di default (€)', 'Importo precompilato come spese di imballaggio.')}
      </Section>

      <Section title="Materiale a magazzino" desc={<>Applicati quando una parte è marcata <strong>"A magazzino"</strong>: sostituiscono spedizione e taglio del fornitore abituale (il costo grezzo è comunque calcolato).</>}>
        {nf('stock_shipping_cost', 'Costo spedizione (€)', 'Spedizione fissa per parte a magazzino.')}
        {nf('stock_cutting_cost_per_part', 'Costo taglio per pezzo (€)', 'Taglio applicato per ogni pezzo a magazzino.')}
      </Section>
    </StandardPage>
  )
}
