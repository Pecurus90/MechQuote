import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import type { Category, Customer, Material } from '@/types'
import api from '@/lib/api'

interface Props {
  categories: Category[]
  customers: Customer[]
  materials: Material[]
  onCreated: (quoteId: number) => void
}

type StockType = 'none' | 'round' | 'square'

export default function QuoteWizard({ categories, customers, materials, onCreated }: Props) {
  const currentYear = new Date().getFullYear().toString().slice(-2)
  const [form, setForm] = useState({
    customer_code: '',
    year: currentYear,
    category_code: categories[0]?.code || 'A',
    progressive: '',
    customer_id: '',
    customer_name: '',
    quote_type: 'single' as 'single' | 'commessa',
    num_components: 2,
    global_margin_percent: 20,
    quote_date: new Date().toISOString().split('T')[0],
    // grezzo
    material_id: '',
    stock_type: 'none' as StockType,
    raw_x_mm: '',
    raw_y_mm: '',
    raw_z_mm: '',
    raw_diameter_mm: '',
    raw_length_mm: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const quoteNumber = form.customer_code && form.progressive
    ? `${form.customer_code}-${form.year}${form.category_code}_${form.progressive}`
    : ''

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.customer_code || !form.progressive) {
      setError('Inserisci codice cliente e progressivo')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await api.post('/quotes', {
        quote_number: quoteNumber,
        quote_type: form.quote_type,
        num_components: form.quote_type === 'commessa' ? form.num_components : undefined,
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        customer_name: form.customer_name || customers.find(c => c.id === Number(form.customer_id))?.name || '',
        global_margin_percent: form.global_margin_percent,
        quote_date: form.quote_date,
      })

      const quote = res.data
      // Pre-fill raw stock on first part (single quotes only, or all parts for commessa)
      if (form.stock_type !== 'none' && quote.parts?.length > 0) {
        const partUpdates: Record<string, number | undefined> = {}
        if (form.material_id) partUpdates.material_id = Number(form.material_id)
        if (form.stock_type === 'round') {
          if (form.raw_diameter_mm) partUpdates.raw_diameter_mm = parseFloat(form.raw_diameter_mm)
          if (form.raw_length_mm) partUpdates.raw_z_mm = parseFloat(form.raw_length_mm)
        } else {
          if (form.raw_x_mm) partUpdates.raw_x_mm = parseFloat(form.raw_x_mm)
          if (form.raw_y_mm) partUpdates.raw_y_mm = parseFloat(form.raw_y_mm)
          if (form.raw_z_mm) partUpdates.raw_z_mm = parseFloat(form.raw_z_mm)
        }
        if (Object.keys(partUpdates).length > 0) {
          const targets = form.quote_type === 'single' ? [quote.parts[0]] : quote.parts
          await Promise.all(targets.map((p: { id: number }) => api.put(`/parts/${p.id}`, partUpdates)))
        }
      }

      onCreated(quote.id)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail || 'Errore nella creazione del preventivo')
    } finally {
      setSaving(false)
    }
  }

  const selectedMaterial = materials.find(m => m.id === Number(form.material_id))

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nuovo Preventivo — Manuale</h1>
      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Quote number */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Codice Preventivo</label>
            <div className="flex items-center gap-2 flex-wrap">
              <div>
                <p className="text-xs text-gray-400 mb-1">Cod. cliente</p>
                <Input className="w-20 text-center font-mono" maxLength={3} placeholder="240"
                  value={form.customer_code}
                  onChange={e => set('customer_code', e.target.value.replace(/\D/g, '').slice(0, 3))}
                />
              </div>
              <span className="text-gray-400 mt-4">-</span>
              <div>
                <p className="text-xs text-gray-400 mb-1">Anno</p>
                <Input className="w-14 text-center font-mono" maxLength={2}
                  value={form.year}
                  onChange={e => set('year', e.target.value.replace(/\D/g, '').slice(0, 2))}
                />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Categoria</p>
                <select
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm font-mono w-24"
                  value={form.category_code}
                  onChange={e => set('category_code', e.target.value)}
                >
                  {categories.map(c => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
              <span className="text-gray-400 mt-4">_</span>
              <div>
                <p className="text-xs text-gray-400 mb-1">Progressivo</p>
                <Input className="w-24 text-center font-mono" placeholder="001"
                  value={form.progressive}
                  onChange={e => set('progressive', e.target.value)}
                />
              </div>
            </div>
            {quoteNumber && (
              <p className="mt-2 text-sm font-mono text-blue-700 bg-blue-50 px-3 py-1.5 rounded inline-block">
                {quoteNumber}
              </p>
            )}
          </div>

          {/* Quote type */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Tipo Preventivo</label>
            <div className="flex gap-3">
              {([
                { value: 'single', label: 'Pezzo singolo', sub: 'Un solo codice parte' },
                { value: 'commessa', label: 'Commessa', sub: 'Più pezzi con suffisso _01 _02...' },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => set('quote_type', opt.value)}
                  className={`flex-1 p-3 rounded-lg border-2 text-left transition-colors ${
                    form.quote_type === opt.value ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Num components */}
          {form.quote_type === 'commessa' && (
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Numero di componenti</label>
              <Input type="number" min={1} max={50} className="w-32"
                value={form.num_components}
                onChange={e => set('num_components', parseInt(e.target.value) || 1)}
              />
              {quoteNumber && form.num_components > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Verranno creati: {Array.from({ length: Math.min(form.num_components, 3) }, (_, i) =>
                    `${quoteNumber}_${String(i + 1).padStart(2, '0')}`).join(', ')}
                  {form.num_components > 3 ? ` ... _${String(form.num_components).padStart(2, '0')}` : ''}
                </p>
              )}
            </div>
          )}

          {/* Customer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Cliente (anagrafica)</label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.customer_id}
                onChange={e => {
                  const cust = customers.find(c => c.id === Number(e.target.value))
                  set('customer_id', e.target.value)
                  if (cust) set('customer_name', cust.name)
                }}
              >
                <option value="">Seleziona...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.customer_number} — {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Nome cliente (libero)</label>
              <Input value={form.customer_name}
                onChange={e => { set('customer_name', e.target.value); set('customer_id', '') }}
                placeholder="oppure digita il nome"
              />
            </div>
          </div>

          {/* Date and margin */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Data</label>
              <Input type="date" value={form.quote_date} onChange={e => set('quote_date', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Margine default (%)</label>
              <Input type="number" min={0} max={200} step={1}
                value={form.global_margin_percent}
                onChange={e => set('global_margin_percent', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Grezzo — optionale */}
          <div className="border-t pt-4">
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              Grezzo iniziale <span className="text-gray-400 font-normal">(opzionale — pre-compila la parte)</span>
            </label>

            {/* Material selector */}
            <div className="mb-3">
              <label className="text-xs font-medium text-gray-600">Materiale</label>
              <select
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.material_id}
                onChange={e => set('material_id', e.target.value)}
              >
                <option value="">Seleziona materiale... (opzionale)</option>
                {materials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.family}) — {m.density_kg_dm3} kg/dm³
                  </option>
                ))}
              </select>
            </div>

            {/* Stock type toggle */}
            <div className="mb-3">
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Tipo grezzo</label>
              <div className="flex gap-2">
                {([
                  { value: 'none', label: 'Nessuno' },
                  { value: 'round', label: '⬤ Tondo' },
                  { value: 'square', label: '■ Quadro / Prismatico' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('stock_type', opt.value)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      form.stock_type === opt.value
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dimensioni round */}
            {form.stock_type === 'round' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Diametro grezzo (mm)</label>
                  <Input type="number" min={0} step={0.1} className="mt-1 h-9 text-sm"
                    placeholder="es. 50"
                    value={form.raw_diameter_mm}
                    onChange={e => set('raw_diameter_mm', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Lunghezza (mm)</label>
                  <Input type="number" min={0} step={0.1} className="mt-1 h-9 text-sm"
                    placeholder="es. 120"
                    value={form.raw_length_mm}
                    onChange={e => set('raw_length_mm', e.target.value)}
                  />
                </div>
                {selectedMaterial && form.raw_diameter_mm && form.raw_length_mm && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">
                      {(() => {
                        const r = parseFloat(form.raw_diameter_mm) / 2
                        const l = parseFloat(form.raw_length_mm)
                        const vol = Math.PI * r * r * l / 1_000_000
                        const kg = vol * selectedMaterial.density_kg_dm3
                        return `Volume: ${vol.toFixed(4)} dm³ · Peso grezzo: ~${kg.toFixed(3)} kg`
                      })()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Dimensioni square */}
            {form.stock_type === 'square' && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">X (mm)</label>
                  <Input type="number" min={0} step={0.1} className="mt-1 h-9 text-sm"
                    placeholder="es. 100"
                    value={form.raw_x_mm}
                    onChange={e => set('raw_x_mm', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Y (mm)</label>
                  <Input type="number" min={0} step={0.1} className="mt-1 h-9 text-sm"
                    placeholder="es. 80"
                    value={form.raw_y_mm}
                    onChange={e => set('raw_y_mm', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Z (mm)</label>
                  <Input type="number" min={0} step={0.1} className="mt-1 h-9 text-sm"
                    placeholder="es. 50"
                    value={form.raw_z_mm}
                    onChange={e => set('raw_z_mm', e.target.value)}
                  />
                </div>
                {selectedMaterial && form.raw_x_mm && form.raw_y_mm && form.raw_z_mm && (
                  <div className="col-span-3">
                    <p className="text-xs text-gray-400">
                      {(() => {
                        const vol = parseFloat(form.raw_x_mm) * parseFloat(form.raw_y_mm) * parseFloat(form.raw_z_mm) / 1_000_000
                        const kg = vol * selectedMaterial.density_kg_dm3
                        return `Volume: ${vol.toFixed(4)} dm³ · Peso grezzo: ~${kg.toFixed(3)} kg`
                      })()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button className="w-full" onClick={submit} disabled={saving || !quoteNumber}>
            {saving ? 'Creazione...' : 'Crea Preventivo'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
