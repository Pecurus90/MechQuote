import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Pencil, X, Copy, Search } from 'lucide-react'

import api from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  Quote, DieSpec, DieNormalizedItem, NormalizedSupplier, Material, Treatment,
  DieDifficulty, DieSubtype, Part,
} from '@/types'

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-gray-600 block mb-1">{children}</label>
}

const PLATE_ROLE_LABELS: Record<string, string> = {
  cappello: 'Cappello',
  porta_punzoni: 'Porta punzoni',
  premilamiera: 'Premilamiera',
  matrice: 'Matrice',
  base: 'Base',
}

export default function DieQuoteEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('dies.create')

  const [quote, setQuote] = useState<Quote | null>(null)
  const [spec, setSpec] = useState<DieSpec | null>(null)
  const [parts, setParts] = useState<Part[]>([])
  const [normalizedItems, setNormalizedItems] = useState<DieNormalizedItem[]>([])
  const [suppliers, setSuppliers] = useState<NormalizedSupplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingOverride, setEditingOverride] = useState<null | 'material' | 'normalized' | 'machining' | 'accessories'>(null)
  const [overrideValue, setOverrideValue] = useState('')

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [q, ni, mats, treats, sups] = await Promise.all([
        api.get(`/dies/${id}`),
        api.get(`/dies/${id}/normalized-items`),
        api.get('/materials'),
        api.get('/treatments'),
        api.get('/normalized-suppliers'),
      ])
      setQuote(q.data)
      setSpec(q.data.die_spec)
      setParts(q.data.parts || [])
      setNormalizedItems(ni.data)
      setMaterials(mats.data)
      setTreatments(treats.data)
      setSuppliers(sups.data)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore caricamento')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  if (loading || !quote || !spec) {
    return <div className="p-8 text-sm text-gray-500">Caricamento…</div>
  }

  const editable = quote.status === 'bozza'

  const saveSpec = async (patch: Partial<DieSpec>) => {
    setSaving(true)
    try {
      const res = await api.put(`/dies/${id}/spec`, patch)
      setSpec(res.data)
      // Ricarica anche le parts perché i raw_x/y delle piastre possono
      // essere auto-aggiornate dal castello.
      const q = await api.get(`/dies/${id}`)
      setParts(q.data.parts || [])
      setQuote(q.data)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const setOverride = (key: 'material' | 'normalized' | 'machining' | 'accessories', value: number | null) => {
    const k = `override_${key}` as keyof DieSpec
    saveSpec({ [k]: value } as Partial<DieSpec>)
    setEditingOverride(null)
    setOverrideValue('')
  }

  const updatePart = async (partId: number, patch: Partial<Part>) => {
    try {
      await api.put(`/parts/${partId}`, patch)
      await load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore aggiornamento piastra')
    }
  }

  const addNormalizedItem = async () => {
    try {
      await api.post(`/dies/${id}/normalized-items`, {
        description: 'Nuovo componente',
        quantity: 1,
        unit_price: 0,
      })
      await load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore aggiunta normalizzato')
    }
  }

  const updateNormalizedItem = async (itemId: number, patch: Partial<DieNormalizedItem>) => {
    try {
      await api.put(`/dies/${id}/normalized-items/${itemId}`, patch)
      await load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore aggiornamento normalizzato')
    }
  }

  const deleteNormalizedItem = async (itemId: number) => {
    try {
      await api.delete(`/dies/${id}/normalized-items/${itemId}`)
      await load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore eliminazione normalizzato')
    }
  }

  const cloneRev = async () => {
    try {
      const res = await api.post(`/dies/${id}/clone`)
      toast.success(`Creata revisione ${res.data.quote_number}`)
      navigate(`/quotes/${res.data.id}`)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Errore duplicazione')
    }
  }

  // Calcolo industrial usando override matita quando presenti.
  const effMaterial = spec.override_material ?? spec.cost_material
  const effNormalized = spec.override_normalized ?? spec.cost_normalized
  const effMachining = spec.override_machining ?? spec.cost_machining
  const effAccessories = spec.override_accessories ?? spec.cost_accessories
  const industrial = effMaterial + effNormalized + effMachining + effAccessories
  const margin = quote.global_margin_percent || 0
  const discount = quote.global_discount_percent || 0
  const finalPrice = industrial * (1 + margin / 100) * (1 - discount / 100)

  const renderOverrideCell = (
    key: 'material' | 'normalized' | 'machining' | 'accessories',
    calculated: number,
    override: number | null | undefined,
  ) => {
    if (editingOverride === key) {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={overrideValue}
            onChange={e => setOverrideValue(e.target.value)}
            className="h-7 w-24 text-right"
            autoFocus
          />
          <Button size="sm" variant="default" onClick={() => setOverride(key, parseFloat(overrideValue) || 0)}>OK</Button>
          <Button size="sm" variant="outline" onClick={() => { setEditingOverride(null); setOverrideValue('') }}>Annulla</Button>
        </div>
      )
    }
    if (override != null) {
      return (
        <div className="flex items-center gap-2 justify-end">
          <span className="font-medium text-orange-600">€ {override.toFixed(2)} <span className="text-xs text-gray-500">(manuale)</span></span>
          {editable && canWrite && (
            <button onClick={() => setOverride(key, null)} title="Rimuovi override" className="text-gray-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 justify-end">
        <span>€ {calculated.toFixed(2)}</span>
        {editable && canWrite && (
          <button onClick={() => { setEditingOverride(key); setOverrideValue(calculated.toFixed(2)) }} title="Override manuale" className="text-gray-400 hover:text-blue-600">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{quote.quote_number}</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700">Stampo</span>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{quote.status}</span>
            {spec.mode === 'rapid' && <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">Rapida</span>}
          </div>
          <p className="text-sm text-gray-500">{quote.customer_name || 'Cliente non specificato'}</p>
        </div>
        <div className="flex gap-2">
          {canWrite && <Button variant="outline" onClick={cloneRev}><Copy className="w-4 h-4 mr-1" />Duplica rev</Button>}
          <Button variant="outline" onClick={() => navigate('/quotes/archive')}>Archivio</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* COLONNA SX — Dati spec + Piastre + Normalizzati */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Dati stampo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Tipo</Label>
                  <select
                    disabled={!editable || !canWrite}
                    className="flex h-9 w-full rounded-md border px-2 text-sm"
                    value={spec.die_subtype}
                    onChange={e => saveSpec({ die_subtype: e.target.value as DieSubtype })}
                  >
                    <option value="passo">Passo</option>
                    <option value="blocco">Blocco</option>
                  </select>
                </div>
                <div>
                  <Label>Difficoltà</Label>
                  <select
                    disabled={!editable || !canWrite}
                    className="flex h-9 w-full rounded-md border px-2 text-sm"
                    value={spec.difficulty}
                    onChange={e => saveSpec({ difficulty: e.target.value as DieDifficulty })}
                  >
                    <option value="base">Base</option>
                    <option value="medium">Media</option>
                    <option value="hard">Alta</option>
                  </select>
                </div>
                <div>
                  <Label>Consegna (gg)</Label>
                  <Input
                    type="number"
                    disabled={!editable || !canWrite}
                    value={spec.delivery_days ?? ''}
                    onChange={e => saveSpec({ delivery_days: e.target.value ? parseInt(e.target.value, 10) : null })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Pezzo X (mm)</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.bbox_x_mm}
                    onChange={e => saveSpec({ bbox_x_mm: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Pezzo Y (mm)</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.bbox_y_mm}
                    onChange={e => saveSpec({ bbox_y_mm: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Spessore (mm)</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.sheet_thickness_mm}
                    onChange={e => saveSpec({ sheet_thickness_mm: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2">
                <div>
                  <Label>P semp</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_bends_simple}
                    onChange={e => saveSpec({ n_bends_simple: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>P media</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_bends_medium}
                    onChange={e => saveSpec({ n_bends_medium: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>P compl</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_bends_complex}
                    onChange={e => saveSpec({ n_bends_complex: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>Pz semp</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_punches_simple}
                    onChange={e => saveSpec({ n_punches_simple: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>Pz media</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_punches_medium}
                    onChange={e => saveSpec({ n_punches_medium: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>Pz compl</Label>
                  <Input type="number" disabled={!editable || !canWrite}
                    value={spec.n_punches_complex}
                    onChange={e => saveSpec({ n_punches_complex: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-500">P = pieghe, Pz = punzoni</p>
            </CardContent>
          </Card>

          {/* Piastre */}
          <Card>
            <CardHeader><CardTitle className="text-base">Piastre castello ({parts.length})</CardTitle></CardHeader>
            <CardContent>
              {parts.length === 0 ? (
                <p className="text-sm text-gray-500">Nessuna piastra. Crea il preventivo con un template oppure aggiungi manualmente.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="text-left py-1">Ruolo</th>
                      <th className="text-right py-1">X×Y×Z</th>
                      <th className="text-left py-1 pl-2">Materiale</th>
                      <th className="text-right py-1">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map(p => (
                      <tr key={p.id} className="border-b">
                        <td className="py-1">{p.plate_role ? (PLATE_ROLE_LABELS[p.plate_role] || p.plate_role) : '—'}</td>
                        <td className="text-right py-1 text-xs">{(p.raw_x_mm || 0).toFixed(0)}×{(p.raw_y_mm || 0).toFixed(0)}×
                          <input
                            type="number"
                            disabled={!editable || !canWrite}
                            className="w-14 text-right border-b border-gray-200 bg-transparent"
                            value={p.raw_z_mm || 0}
                            onChange={e => p.id && updatePart(p.id, { raw_z_mm: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="pl-2 py-1">
                          <select
                            disabled={!editable || !canWrite}
                            className="text-xs h-6 w-full"
                            value={p.material_id || ''}
                            onChange={e => p.id && updatePart(p.id, { material_id: e.target.value ? Number(e.target.value) : undefined })}
                          >
                            <option value="">—</option>
                            {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </td>
                        <td className="text-right py-1">€ {(p.total_cost || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Normalizzati */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Normalizzati ({normalizedItems.length})</CardTitle>
                {editable && canWrite && <Button size="sm" onClick={addNormalizedItem}>+ Aggiungi</Button>}
              </div>
            </CardHeader>
            <CardContent>
              {normalizedItems.length === 0 ? (
                <p className="text-sm text-gray-500">Nessun normalizzato.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="text-left py-1">Descrizione</th>
                      <th className="text-left py-1">Fornitore</th>
                      <th className="text-right py-1 w-16">Qty</th>
                      <th className="text-right py-1 w-20">€/u</th>
                      <th className="text-right py-1 w-20">Totale</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {normalizedItems.map(it => (
                      <tr key={it.id} className="border-b">
                        <td className="py-1">
                          <input
                            disabled={!editable || !canWrite}
                            className="w-full border-b border-gray-200 bg-transparent text-sm"
                            value={it.description}
                            onChange={e => updateNormalizedItem(it.id, { description: e.target.value })}
                          />
                        </td>
                        <td className="py-1">
                          <select
                            disabled={!editable || !canWrite}
                            className="text-xs h-6 w-full"
                            value={it.normalized_supplier_id || ''}
                            onChange={e => updateNormalizedItem(it.id, { normalized_supplier_id: e.target.value ? Number(e.target.value) : null })}
                          >
                            <option value="">—</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                        <td className="text-right py-1">
                          <input type="number" disabled={!editable || !canWrite}
                            className="w-12 text-right border-b border-gray-200 bg-transparent"
                            value={it.quantity}
                            onChange={e => updateNormalizedItem(it.id, { quantity: parseInt(e.target.value, 10) || 1 })}
                          />
                        </td>
                        <td className="text-right py-1">
                          <input type="number" disabled={!editable || !canWrite}
                            className="w-16 text-right border-b border-gray-200 bg-transparent"
                            value={it.unit_price}
                            onChange={e => updateNormalizedItem(it.id, { unit_price: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="text-right py-1">€ {(it.quantity * it.unit_price).toFixed(2)}</td>
                        <td className="text-right py-1">
                          {editable && canWrite && (
                            <button onClick={() => deleteNormalizedItem(it.id)} className="text-gray-400 hover:text-red-600">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* COLONNA DX — Cost table (L1-L7) + prezzo finale */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Riepilogo costi</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="py-2">L1 Materiale piastre</td>
                    <td className="py-2 text-right">{renderOverrideCell('material', spec.cost_material, spec.override_material)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">L2 Normalizzati + spedizione</td>
                    <td className="py-2 text-right">{renderOverrideCell('normalized', spec.cost_normalized, spec.override_normalized)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">L3 Lavorazioni (feature × coeff)</td>
                    <td className="py-2 text-right">{renderOverrideCell('machining', spec.cost_machining, spec.override_machining)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">L4 Accessori (design + montaggio + extras)</td>
                    <td className="py-2 text-right">{renderOverrideCell('accessories', spec.cost_accessories, spec.override_accessories)}</td>
                  </tr>
                  <tr className="border-b font-semibold bg-gray-50">
                    <td className="py-2">L5 Costo industriale</td>
                    <td className="py-2 text-right">€ {industrial.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="py-2">L6 Margine ({margin}%)</td>
                    <td className="py-2 text-right">+ € {(industrial * margin / 100).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="py-2">L7 Sconto ({discount}%)</td>
                    <td className="py-2 text-right text-gray-500">- € {(industrial * (1 + margin / 100) * discount / 100).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 pt-3 border-t-2 border-gray-800">
                {spec.mode === 'rapid' ? (
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Stima rapida (±{((spec.rapid_max / industrial - 1) * 100).toFixed(0)}%)</p>
                    <p className="text-2xl font-bold">€ {spec.rapid_min.toFixed(0)} — € {spec.rapid_max.toFixed(0)}</p>
                  </div>
                ) : (
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">Prezzo finale</span>
                    <span className="text-2xl font-bold text-green-700">€ {finalPrice.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Margin/discount */}
          <Card>
            <CardHeader><CardTitle className="text-base">Margine & sconto</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <div>
                <Label>Margine (%)</Label>
                <Input type="number" disabled={!editable || !canWrite}
                  value={quote.global_margin_percent}
                  onChange={async e => {
                    const v = parseFloat(e.target.value) || 0
                    await api.put(`/quotes/${id}`, { global_margin_percent: v, quote_type: quote.quote_type })
                    setQuote({ ...quote, global_margin_percent: v })
                  }}
                />
              </div>
              <div>
                <Label>Sconto (%)</Label>
                <Input type="number" disabled={!editable || !canWrite}
                  value={quote.global_discount_percent}
                  onChange={async e => {
                    const v = parseFloat(e.target.value) || 0
                    await api.put(`/quotes/${id}`, { global_discount_percent: v, quote_type: quote.quote_type })
                    setQuote({ ...quote, global_discount_percent: v })
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {saving && <div className="fixed bottom-4 right-4 px-3 py-2 rounded bg-gray-800 text-white text-sm">Salvataggio…</div>}
    </div>
  )
}
