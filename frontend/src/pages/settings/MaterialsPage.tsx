import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'

interface MaterialSupplier {
  id: number
  name: string
  address: string | null
  shipping_cost: number
  cutting_cost_per_part?: number
  active: boolean
}

interface Material {
  id: number
  name: string
  family: string
  density_kg_dm3: number
  cost_per_kg: number
  edm_coefficient: number
  cnc_machinability_coefficient: number
  default_scrap_percent: number
  cutting_cost_per_part?: number
  active: boolean
  supplier_id: number | null
  material_supplier?: MaterialSupplier | null
}

interface SupplierForm { id: number | null; name: string; address: string; shipping_cost: string; cutting_cost_per_part: string; active: boolean }
const emptySupplier = (): SupplierForm => ({ id: null, name: '', address: '', shipping_cost: '0', cutting_cost_per_part: '0', active: true })

interface MatForm {
  id: number | null; name: string; family: string; density: string; cost: string
  edm: string; cnc: string; scrap: string; active: boolean; supplier_id: string
}
const emptyMat = (): MatForm => ({ id: null, name: '', family: '', density: '', cost: '', edm: '1.0', cnc: '1.0', scrap: '10', active: true, supplier_id: '' })

export default function MaterialsPage() {
  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [supForm, setSupForm] = useState<SupplierForm | null>(null)
  const [matForm, setMatForm] = useState<MatForm | null>(null)
  const [searchSup, setSearchSup] = useState('')
  const [searchMat, setSearchMat] = useState('')

  const loadData = () => {
    Promise.all([api.get('/material-suppliers'), api.get('/materials')]).then(([sRes, mRes]) => {
      setSuppliers(sRes.data)
      setMaterials(mRes.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const saveSupplier = async () => {
    if (!supForm) return
    const payload = { name: supForm.name, address: supForm.address || null, shipping_cost: Number(supForm.shipping_cost), cutting_cost_per_part: Number(supForm.cutting_cost_per_part), active: supForm.active }
    try {
      if (supForm.id) await api.put(`/material-suppliers/${supForm.id}`, payload)
      else await api.post('/material-suppliers', payload)
      toast.success('Fornitore salvato')
      setSupForm(null); loadData()
    } catch (e) {toast.error('Errore nel salvataggio') }
  }

  const deleteSupplier = async (id: number) => {
    if (!confirm('Eliminare questo fornitore?')) return
    try { await api.delete(`/material-suppliers/${id}`); toast.success('Fornitore eliminato'); loadData() } catch (e) {toast.error('Errore nell\'eliminazione') }
  }

  const saveMaterial = async () => {
    if (!matForm) return
    const payload = {
      name: matForm.name, family: matForm.family,
      density_kg_dm3: Number(matForm.density), cost_per_kg: Number(matForm.cost),
      edm_coefficient: Number(matForm.edm), cnc_machinability_coefficient: Number(matForm.cnc),
      default_scrap_percent: Number(matForm.scrap), active: matForm.active,
      supplier_id: matForm.supplier_id ? Number(matForm.supplier_id) : null,
    }
    try {
      if (matForm.id) await api.put(`/materials/${matForm.id}`, payload)
      else await api.post('/materials', payload)
      toast.success('Materiale salvato')
      setMatForm(null); loadData()
    } catch (e) {toast.error('Errore nel salvataggio') }
  }

  const deleteMaterial = async (id: number) => {
    if (!confirm('Eliminare questo materiale?')) return
    try { await api.delete(`/materials/${id}`); toast.success('Materiale eliminato'); loadData() } catch (e) {toast.error('Errore nell\'eliminazione') }
  }

  const startEditMat = (m: Material) => setMatForm({
    id: m.id, name: m.name, family: m.family,
    density: String(m.density_kg_dm3), cost: String(m.cost_per_kg),
    edm: String(m.edm_coefficient), cnc: String(m.cnc_machinability_coefficient),
    scrap: String(m.default_scrap_percent), active: m.active,
    supplier_id: m.supplier_id ? String(m.supplier_id) : '',
  })

  const visibleSup = [...suppliers]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(s => !searchSup || s.name.toLowerCase().includes(searchSup.toLowerCase()) || (s.address || '').toLowerCase().includes(searchSup.toLowerCase()))

  const visibleMat = [...materials]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(m => !searchMat || m.name.toLowerCase().includes(searchMat.toLowerCase()) || m.family.toLowerCase().includes(searchMat.toLowerCase()))

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Materiali</h1>

      {/* ── Fornitori materiali ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Fornitori materiali</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input placeholder="Cerca..." value={searchSup} onChange={e => setSearchSup(e.target.value)} className="pl-9 w-40" />
            </div>
            <Button size="sm" onClick={() => setSupForm(emptySupplier())}>
              <Plus className="w-4 h-4 mr-1" /> Nuovo fornitore
            </Button>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="table-fixed w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 w-[25%] font-medium text-gray-600">Nome</th>
                  <th className="text-left p-3 w-[33%] font-medium text-gray-600">Indirizzo</th>
                  <th className="text-right p-3 w-[14%] font-medium text-gray-600">Spedizione (€)</th>
                  <th className="text-right p-3 w-[14%] font-medium text-gray-600">Taglio (€/pz)</th>
                  <th className="text-center p-3 w-[14%] font-medium text-gray-600">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleSup.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-gray-400">Nessun fornitore trovato.</td></tr>
                )}
                {visibleSup.map(s => (
                  supForm?.id === s.id ? (
                    <tr key={s.id} className="border-b bg-blue-50">
                      <td className="p-2"><Input className="h-8 text-sm" value={supForm.name} onChange={e => setSupForm(f => f ? { ...f, name: e.target.value } : f)} /></td>
                      <td className="p-2"><Input className="h-8 text-sm" value={supForm.address} onChange={e => setSupForm(f => f ? { ...f, address: e.target.value } : f)} /></td>
                      <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm w-full" value={supForm.shipping_cost} onChange={e => setSupForm(f => f ? { ...f, shipping_cost: e.target.value } : f)} /></td>
                      <td className="p-2"><Input type="number" step="0.5" min="0" className="h-8 text-sm w-full" value={supForm.cutting_cost_per_part} onChange={e => setSupForm(f => f ? { ...f, cutting_cost_per_part: e.target.value } : f)} /></td>
                      <td className="p-2 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={saveSupplier} className="p-1 hover:bg-green-100 rounded"><Save className="w-4 h-4 text-green-600" /></button>
                          <button onClick={() => setSupForm(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 text-gray-500 truncate">{s.address || '—'}</td>
                      <td className="p-3 text-right font-mono">{s.shipping_cost.toFixed(2)} €</td>
                      <td className="p-3 text-right font-mono">{(s.cutting_cost_per_part ?? 0).toFixed(2)} €</td>
                      <td className="p-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => setSupForm({ id: s.id, name: s.name, address: s.address || '', shipping_cost: String(s.shipping_cost), cutting_cost_per_part: String(s.cutting_cost_per_part ?? 0), active: s.active })} className="p-1 hover:bg-gray-100 rounded">
                            <Pencil className="w-4 h-4 text-blue-600" />
                          </button>
                          <button onClick={() => deleteSupplier(s.id)} className="p-1 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
                {supForm?.id === null && (
                  <tr className="border-b bg-blue-50">
                    <td className="p-2"><Input className="h-8 text-sm" placeholder="Nome fornitore" value={supForm.name} onChange={e => setSupForm(f => f ? { ...f, name: e.target.value } : f)} /></td>
                    <td className="p-2"><Input className="h-8 text-sm" placeholder="Indirizzo (opzionale)" value={supForm.address} onChange={e => setSupForm(f => f ? { ...f, address: e.target.value } : f)} /></td>
                    <td className="p-2"><Input type="number" step="0.5" className="h-8 text-sm w-full" value={supForm.shipping_cost} onChange={e => setSupForm(f => f ? { ...f, shipping_cost: e.target.value } : f)} /></td>
                    <td className="p-2"><Input type="number" step="0.5" min="0" className="h-8 text-sm w-full" value={supForm.cutting_cost_per_part} onChange={e => setSupForm(f => f ? { ...f, cutting_cost_per_part: e.target.value } : f)} /></td>
                    <td className="p-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={saveSupplier} className="p-1 hover:bg-green-100 rounded"><Save className="w-4 h-4 text-green-600" /></button>
                        <button onClick={() => setSupForm(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* ── Materiali ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Materiali</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input placeholder="Cerca..." value={searchMat} onChange={e => setSearchMat(e.target.value)} className="pl-9 w-40" />
            </div>
            <Button size="sm" onClick={() => setMatForm(emptyMat())}>
              <Plus className="w-4 h-4 mr-1" /> Nuovo materiale
            </Button>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="table-fixed w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 w-[22%] font-medium text-gray-600">Nome</th>
                  <th className="text-left p-3 w-[17%] font-medium text-gray-600">Famiglia</th>
                  <th className="text-right p-3 w-[15%] font-medium text-gray-600">Densità (kg/dm³)</th>
                  <th className="text-right p-3 w-[15%] font-medium text-gray-600">Costo €/kg</th>
                  <th className="text-left p-3 w-[20%] font-medium text-gray-600">Fornitore</th>
                  <th className="text-center p-3 w-[11%] font-medium text-gray-600">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleMat.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-gray-400">Nessun materiale trovato.</td></tr>
                )}
                {visibleMat.map(m => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium truncate">{m.name}</td>
                    <td className="p-3 truncate">{m.family}</td>
                    <td className="p-3 text-right">{m.density_kg_dm3}</td>
                    <td className="p-3 text-right">{m.cost_per_kg}</td>
                    <td className="p-3 text-gray-500 text-xs truncate">{m.material_supplier?.name || '—'}</td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEditMat(m)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => deleteMaterial(m.id)} className="p-1 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Material modal */}
      {matForm && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{matForm.id ? 'Modifica' : 'Nuovo'} Materiale</h3>
              <button onClick={() => setMatForm(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Nome</label>
                  <Input value={matForm.name} onChange={e => setMatForm(f => f ? { ...f, name: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Famiglia</label>
                  <Input value={matForm.family} onChange={e => setMatForm(f => f ? { ...f, family: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Densità (kg/dm³)</label>
                  <Input type="number" step="0.01" value={matForm.density} onChange={e => setMatForm(f => f ? { ...f, density: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo €/kg</label>
                  <Input type="number" step="0.01" value={matForm.cost} onChange={e => setMatForm(f => f ? { ...f, cost: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">EDM Coeff.</label>
                  <Input type="number" step="0.1" value={matForm.edm} onChange={e => setMatForm(f => f ? { ...f, edm: e.target.value } : f)} />
                  <p className="text-[11px] text-gray-400 mt-0.5">Usato in fase di import DXF/STEP (in arrivo)</p>
                </div>
                <div>
                  <label className="text-sm font-medium">CNC Coeff. lavorabilità</label>
                  <Input type="number" step="0.1" value={matForm.cnc} onChange={e => setMatForm(f => f ? { ...f, cnc: e.target.value } : f)} />
                  <p className="text-[11px] text-gray-400 mt-0.5">Usato in fase di import DXF/STEP (in arrivo)</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Sfrido %</label>
                  <Input type="number" step="0.5" value={matForm.scrap} onChange={e => setMatForm(f => f ? { ...f, scrap: e.target.value } : f)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Fornitore materiale</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={matForm.supplier_id}
                    onChange={e => setMatForm(f => f ? { ...f, supplier_id: e.target.value } : f)}
                  >
                    <option value="">Nessun fornitore</option>
                    {[...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'it')).map(s => (
                      <option key={s.id} value={s.id}>{s.name} — {s.shipping_cost.toFixed(2)} € spedizione</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={matForm.active} onChange={e => setMatForm(f => f ? { ...f, active: e.target.checked } : f)} />
                  <label className="text-sm">Attivo</label>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={saveMaterial}><Save className="w-4 h-4 mr-1" /> Salva</Button>
                <Button variant="outline" onClick={() => setMatForm(null)}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
