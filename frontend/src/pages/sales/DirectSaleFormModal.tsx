import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X, HandCoins, TrendingUp, TrendingDown } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { parseDecimal } from '@/lib/decimalInput'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { DirectSale, Customer, Category } from '@/types'

interface FormState {
  customerId: string; customerName: string; customerCode: string
  year: string; categoryCode: string; progressive: string
  customerOrder: string; customerArticle: string
  description: string; sale_date: string; quantity: string
  unit_price: string; unit_cost: string
  hasQuote: boolean; quoted_value: string
  notes: string
}

const today = () => new Date().toISOString().slice(0, 10)
const currentYear = () => new Date().getFullYear().toString().slice(-2)

// Codice legacy/nuovo: NNN-AAxC_PPP → estrae le componenti per il pre-fill.
const parseCode = (code: string) => {
  const m = code.match(/^(\d{1,3})-(\d{2})([A-Za-z])_(\d{1,3})$/)
  if (!m) return null
  return { customerCode: m[1], year: m[2], categoryCode: m[3].toUpperCase(), progressive: String(Number(m[4])) }
}

const fromSale = (s: DirectSale | null, customers: Customer[], categories: Category[]): FormState => {
  const parsed = s ? parseCode(s.code) : null
  // customerCode: dal numero cliente in anagrafica se collegato, altrimenti dal codice.
  const linked = s?.customer_id != null ? customers.find(c => c.id === s.customer_id) : undefined
  const customerCode = linked ? String(linked.customer_number).padStart(3, '0') : (parsed?.customerCode ?? '')
  return {
    customerId: s?.customer_id != null ? String(s.customer_id) : '',
    customerName: s?.customer_name ?? '',
    customerCode,
    year: parsed?.year ?? currentYear(),
    categoryCode: s?.category_code ?? parsed?.categoryCode ?? (categories[0]?.code || 'A'),
    progressive: parsed?.progressive ?? '',
    customerOrder: s?.customer_order ?? '',
    customerArticle: s?.customer_article ?? '',
    description: s?.description ?? '',
    sale_date: s?.sale_date ? s.sale_date.slice(0, 10) : today(),
    quantity: s != null ? String(s.quantity) : '1',
    unit_price: s != null ? String(s.unit_price) : '',
    unit_cost: s != null ? String(s.unit_cost) : '',
    hasQuote: s?.quoted_value != null,
    quoted_value: s?.quoted_value != null ? String(s.quoted_value) : '',
    notes: s?.notes ?? '',
  }
}

interface Props {
  sale: DirectSale | null
  customers: Customer[]
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}

const eur = (v: number) => '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const labelCls = 'mb-1 block text-[12px] font-medium text-foreground'
const num = (s: string) => parseDecimal(s)

export default function DirectSaleFormModal({ sale, customers, categories, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => fromSale(sale, customers, categories))
  const [saving, setSaving] = useState(false)
  const [showList, setShowList] = useState(false)
  useEscapeKey(onClose, true)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  // Autocomplete cliente (come il wizard manuale): match su numero o nome.
  const normalize = (s: string) => s.toLowerCase().replace(/\./g, '')
  const filtered = useMemo(() => {
    const q = normalize(form.customerName.trim())
    if (!q) return [] as Customer[]
    return customers
      .filter(c => String(c.customer_number).includes(q) || normalize(c.name).includes(q))
      .slice(0, 8)
  }, [customers, form.customerName])

  const selectCustomer = (c: Customer) => {
    setForm(f => ({ ...f, customerId: String(c.id), customerName: c.name, customerCode: String(c.customer_number).padStart(3, '0') }))
    setShowList(false)
  }

  // Codice generato: NNN-AAxC_PPP. Fallback al codice originale (vendite legacy).
  const composed = form.customerCode && form.progressive && form.categoryCode && form.year
    ? `${form.customerCode}-${form.year}${form.categoryCode}_${form.progressive.padStart(3, '0')}`
    : ''
  const code = composed || sale?.code || ''

  const qty = Math.max(1, parseInt(form.quantity, 10) || 1)
  const totalSold = num(form.unit_price) * qty
  const totalCost = num(form.unit_cost) * qty
  const margin = totalSold - totalCost
  const marginPos = margin >= 0
  const totalQuoted = num(form.quoted_value) * qty
  const hasScostamento = form.hasQuote && totalQuoted > 0
  const scostamentoPct = hasScostamento ? (totalSold - totalQuoted) / totalQuoted * 100 : 0
  const scostamentoPos = scostamentoPct >= 0

  const save = async () => {
    if (!code) { toast.error('Seleziona il cliente e inserisci categoria e progressivo'); return }
    if (!form.sale_date) { toast.error('Data obbligatoria'); return }
    const payload = {
      code,
      customer_id: form.customerId ? Number(form.customerId) : null,
      customer_name: form.customerName.trim() || null,
      category_code: form.categoryCode || null,
      customer_order: form.customerOrder.trim() || null,
      customer_article: form.customerArticle.trim() || null,
      description: form.description.trim() || null,
      sale_date: form.sale_date,
      unit_price: num(form.unit_price),
      unit_cost: num(form.unit_cost),
      quoted_value: form.hasQuote && num(form.quoted_value) > 0 ? num(form.quoted_value) : null,
      quantity: qty,
      notes: form.notes.trim() || null,
    }
    setSaving(true)
    try {
      if (sale) await api.put(`/direct-sales/${sale.id}`, payload)
      else await api.post('/direct-sales', payload)
      toast.success(sale ? 'Vendita aggiornata' : 'Vendita registrata')
      onSaved(); onClose()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-[640px] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-sales/[0.14] text-sales">
              <HandCoins className="h-[17px] w-[17px]" />
            </div>
            <h3 className="font-semibold text-foreground">{sale ? 'Modifica vendita diretta' : 'Nuova vendita diretta'}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {/* ── Codice: cliente + categoria + anno + progressivo ── */}
          <div className="relative">
            <label className={labelCls}>Cliente *</label>
            <Input
              value={form.customerName}
              onChange={e => { setForm(f => ({ ...f, customerName: e.target.value, customerId: '', customerCode: '' })); setShowList(true) }}
              onFocus={() => setShowList(true)}
              placeholder="Cerca per nome o numero cliente…"
              autoFocus={!sale}
            />
            {showList && filtered.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
                {filtered.map(c => (
                  <button
                    key={c.id}
                    onClick={() => selectCustomer(c)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{String(c.customer_number).padStart(3, '0')}</span>
                    <span className="text-foreground">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-3.5">
            <div>
              <label className={labelCls}>Categoria *</label>
              <select
                value={form.categoryCode}
                onChange={e => set('categoryCode', e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-2 font-mono text-sm"
              >
                {categories.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Anno</label>
              <Input className="font-mono" value={form.year} onChange={e => set('year', e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </div>
            <div>
              <label className={labelCls}>Progr. *</label>
              <Input className="font-mono" value={form.progressive} onChange={e => set('progressive', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="001" />
            </div>
            <div>
              <label className={labelCls}>Data *</label>
              <Input type="date" className="font-mono" value={form.sale_date} onChange={e => set('sale_date', e.target.value)} />
            </div>
          </div>

          {/* Anteprima codice */}
          <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card-muted px-3.5 py-2 text-[13px]">
            <span className="text-muted-foreground">Codice:</span>
            <span className="font-mono font-semibold text-foreground">{code || <span className="text-muted-foreground/60">—</span>}</span>
          </div>

          {/* ── Riferimenti cliente ── */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className={labelCls}>Ordine cliente</label>
              <Input value={form.customerOrder} onChange={e => set('customerOrder', e.target.value)} placeholder="es. ODA 2025/142" />
            </div>
            <div>
              <label className={labelCls}>Art. cliente</label>
              <Input value={form.customerArticle} onChange={e => set('customerArticle', e.target.value)} placeholder="codice articolo cliente" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Descrizione</label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="es. Cuscinetto SKF 6204 di ricambio" />
          </div>

          {/* ── Preventivo al volo ── */}
          <div className="rounded-[10px] border border-border bg-card-muted/[0.5] px-3.5 py-2.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-foreground">
              <input type="checkbox" checked={form.hasQuote} onChange={e => set('hasQuote', e.target.checked)} className="h-4 w-4 rounded border-input accent-sales" />
              È stato fatto un preventivo al volo
            </label>
          </div>

          {/* ── Valori (per pezzo) ── */}
          <div className={`grid gap-3.5 ${form.hasQuote ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {form.hasQuote && (
              <div>
                <label className={labelCls}>Valore preventivato €/pz</label>
                <Input type="text" inputMode="decimal" min={0} step="0.01" className="font-mono" value={form.quoted_value} onChange={e => set('quoted_value', e.target.value)} />
              </div>
            )}
            <div>
              <label className={labelCls}>Vendita €/pz</label>
              <Input type="text" inputMode="decimal" min={0} step="0.01" className="font-mono" value={form.unit_price} onChange={e => set('unit_price', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Costo effettivo €/pz</label>
              <Input type="text" inputMode="decimal" min={0} step="0.01" className="font-mono" value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Quantità</label>
              <Input type="text" inputMode="decimal" min={1} step="1" className="font-mono" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Note</label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="riferimento…" />
          </div>

          {/* Riepilogo live */}
          <div className="grid grid-cols-3 gap-3 rounded-[10px] border border-sales/[0.35] bg-sales/[0.07] px-4 py-3">
            {hasScostamento && (
              <div>
                <div className="text-[11px] text-muted-foreground">Preventivato</div>
                <div className="font-mono text-[15px] text-muted-foreground">{eur(totalQuoted)}</div>
              </div>
            )}
            <div>
              <div className="text-[11px] text-muted-foreground">Totale venduto</div>
              <div className="font-mono text-[19px] font-bold text-foreground">{eur(totalSold)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Costo</div>
              <div className="font-mono text-[15px] text-muted-foreground">{eur(totalCost)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Margine</div>
              <div className={`inline-flex items-center gap-1 font-mono text-[15px] font-semibold ${marginPos ? 'text-success' : 'text-danger'}`}>
                {marginPos ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{eur(margin)}
              </div>
            </div>
            {hasScostamento && (
              <div>
                <div className="text-[11px] text-muted-foreground">Scostamento</div>
                <div className={`font-mono text-[15px] font-semibold ${scostamentoPos ? 'text-success' : 'text-danger'}`}>
                  {scostamentoPos ? '+' : '−'}{Math.abs(scostamentoPct).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card-muted px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          <PrimaryCtaButton color="sales" onClick={save} disabled={saving}>
            {saving ? 'Salvataggio…' : 'Registra vendita'}
          </PrimaryCtaButton>
        </div>
      </div>
    </div>
  )
}
