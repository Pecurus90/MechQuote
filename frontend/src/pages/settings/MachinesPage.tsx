import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Save, X, Search } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Machine } from '@/types'

const MACHINE_TYPES = [
  { value: 'cnc_3_axis', label: 'CNC 3 assi' },
  { value: 'cnc_5_axis', label: 'CNC 5 assi' },
  { value: 'turning', label: 'Tornio' },
  { value: 'wire_edm', label: 'EDM filo' },
  { value: 'sinker_edm', label: 'EDM a tuffo' },
  { value: 'grinding', label: 'Rettifica' },
  { value: 'manual', label: 'Manuale' },
  { value: 'inspection', label: 'Controllo' },
]

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [mtype, setMtype] = useState('')
  const [rate, setRate] = useState('')
  const [setup, setSetup] = useState('')
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadData = () => {
    api.get('/machines').then(res => { setMachines(res.data); setLoading(false) })
  }

  useEffect(() => { loadData() }, [])

  const resetForm = (isNew = false) => {
    setEditingId(isNew ? 0 : null)
    setName(''); setMtype(''); setRate(''); setSetup(''); setActive(true)
  }

  const startEdit = (m: Machine) => {
    setEditingId(m.id); setName(m.name); setMtype(m.machine_type)
    setRate(String(m.hourly_rate)); setSetup(String(m.setup_minimum_hours ?? 0)); setActive(m.active ?? true)
  }

  const handleSave = async () => {
    const payload = { name, machine_type: mtype, hourly_rate: Number(rate), setup_minimum_hours: Number(setup), active }
    try {
      if (editingId && editingId > 0) await api.put(`/machines/${editingId}`, payload)
      else await api.post('/machines', payload)
      toast.success('Macchina salvata')
      resetForm(); loadData()
    } catch (e) {toast.error('Errore nel salvataggio') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questa macchina?')) return
    try { await api.delete(`/machines/${id}`); toast.success('Macchina eliminata'); loadData() } catch (e) {toast.error('Errore nell\'eliminazione') }
  }

  const visible = [...machines]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()) || (MACHINE_TYPES.find(t => t.value === m.machine_type)?.label || m.machine_type).toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Macchine</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-48" />
          </div>
          <Button size="sm" onClick={() => resetForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuova
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="table-fixed w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 w-[38%] font-medium text-gray-600">Nome</th>
                <th className="text-left p-3 w-[38%] font-medium text-gray-600">Tipo</th>
                <th className="text-right p-3 w-[14%] font-medium text-gray-600">Tariffa €/h</th>
                <th className="text-center p-3 w-[10%] font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-gray-400">Nessuna macchina trovata.</td></tr>
              )}
              {visible.map(m => (
                <tr key={m.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium truncate">{m.name}</td>
                  <td className="p-3 truncate">{MACHINE_TYPES.find(t => t.value === m.machine_type)?.label || m.machine_type}</td>
                  <td className="p-3 text-right">{m.hourly_rate}</td>
                  <td className="p-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => startEdit(m)} className="p-1 hover:bg-gray-100 rounded">
                        <Pencil className="w-4 h-4 text-blue-600" />
                      </button>
                      <button onClick={() => handleDelete(m.id)} className="p-1 hover:bg-red-50 rounded">
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

      {editingId !== null && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{editingId > 0 ? 'Modifica' : 'Nuova'} Macchina</h3>
              <button onClick={() => resetForm()} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Nome</label>
                  <Input value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={mtype} onChange={e => setMtype(e.target.value)}>
                    <option value="">Seleziona...</option>
                    {MACHINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Tariffa €/ora</label>
                  <Input type="number" step="0.1" value={rate} onChange={e => setRate(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Setup minimo (h)</label>
                  <Input type="number" step="0.1" value={setup} onChange={e => setSetup(e.target.value)} />
                  <p className="text-[11px] text-gray-400 mt-0.5">Usato in fase di import DXF/STEP (in arrivo)</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                  <label className="text-sm">Attivo</label>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Salva</Button>
                <Button variant="outline" onClick={() => resetForm()}>Annulla</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
