import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Plus, Search, Cog } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { tWrap, tHead, tRow, RowActions } from '@/components/settings/inlineEdit'
import { SettingsModal, CsvImportButtons, fieldLabel } from '@/components/settings/crud'
import type { Machine } from '@/types'

const MACHINE_TYPES = [
  { value: 'cnc_3_axis', label: 'CNC 3 assi' }, { value: 'cnc_5_axis', label: 'CNC 5 assi' },
  { value: 'milling', label: 'Fresatrice' }, { value: 'turning', label: 'Tornio' },
  { value: 'wire_edm', label: 'EDM filo' }, { value: 'sinker_edm', label: 'EDM a tuffo' },
  { value: 'laser', label: 'Laser' }, { value: 'grinding', label: 'Rettifica' },
  { value: 'manual', label: 'Manuale' }, { value: 'cad_design', label: 'Progettazione CAD' },
  { value: 'cam_programming', label: 'Programmazione CAM' }, { value: 'assembly', label: 'Montaggio' },
  { value: 'inspection', label: 'Controllo CMM' },
]
const typeLabel = (v?: string | null) => MACHINE_TYPES.find(t => t.value === v)?.label || v || '—'

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState(''); const [mtype, setMtype] = useState('')
  const [rate, setRate] = useState(''); const [setupRate, setSetupRate] = useState(''); const [setup, setSetup] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const loadData = () => api.get('/machines').then(res => { setMachines(res.data); setLoading(false) })
  useEffect(() => { loadData() }, [])

  const openNew = () => { setEditingId(0); setName(''); setMtype(''); setRate(''); setSetupRate(''); setSetup('') }
  const startEdit = (m: Machine) => { setEditingId(m.id); setName(m.name); setMtype(m.machine_type ?? ''); setRate(String(m.hourly_rate)); setSetupRate(m.setup_hourly_rate != null ? String(m.setup_hourly_rate) : ''); setSetup(String(m.setup_minimum_hours ?? 0)) }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nome obbligatorio'); return }
    const payload = { name, machine_type: mtype, hourly_rate: Number(rate), setup_hourly_rate: setupRate === '' ? null : Number(setupRate), setup_minimum_hours: Number(setup) }
    try {
      if (editingId && editingId > 0) await api.put(`/machines/${editingId}`, payload); else await api.post('/machines', payload)
      toast.success('Centro di costo salvato'); setEditingId(null); loadData()
    } catch { toast.error('Errore nel salvataggio') }
  }
  const confirmDelete = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/machines/${id}`); toast.success('Centro di costo eliminato'); loadData() }
    catch (e) { const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail; toast.error(msg || 'Errore nell\'eliminazione') }
  }

  const visible = [...machines].sort((a, b) => a.name.localeCompare(b.name, 'it')).filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()) || typeLabel(m.machine_type).toLowerCase().includes(search.toLowerCase()))
  if (loading) return <div className="p-8 text-muted-foreground">Caricamento…</div>

  return (
    <StandardPage
      icon={Cog} color="primary" width="xl"
      title="Centri di costo"
      subtitle="Macchine e postazioni con tariffa €/h e setup"
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-48"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Cerca…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9" /></div>
          <CsvImportButtons importUrl="/machines/import-csv" templateUrl="/machines/csv-template" templateName="centri_di_costo_modello.csv" importTitle="Importa un CSV di centri di costo (separatore ;)" onImported={loadData} />
          <PrimaryCtaButton color="primary" size="sm" onClick={openNew}><Plus className="h-4 w-4" /> Nuovo</PrimaryCtaButton>
        </div>
      }
    >
      <div className={tWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <colgroup><col style={{ width: '32%' }} /><col style={{ width: '28%' }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 90 }} /></colgroup>
            <thead>
              <tr className={tHead}>
                <th className="p-2.5 text-left font-medium">Nome</th>
                <th className="p-2.5 text-left font-medium">Tipo</th>
                <th className="p-2.5 text-right font-medium">Lavoro €/h</th>
                <th className="p-2.5 text-right font-medium">Setup €/h</th>
                <th className="p-2.5 text-center font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nessun centro di costo trovato.</td></tr>
              ) : visible.map(m => (
                <tr key={m.id} className={tRow}>
                  <td className="truncate p-2.5 font-medium text-foreground">{m.name}</td>
                  <td className="truncate p-2.5">{typeLabel(m.machine_type)}</td>
                  <td className="p-2.5 text-right font-mono">{m.hourly_rate}</td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">{m.setup_hourly_rate != null ? m.setup_hourly_rate : <span>= {m.hourly_rate}</span>}</td>
                  <td className="p-2.5"><RowActions onEdit={() => startEdit(m)} onDelete={() => setPendingDelete(m.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingId !== null && (
        <SettingsModal title={editingId > 0 ? 'Modifica centro di costo' : 'Nuovo centro di costo'} icon={Cog} accent="primary" width="max-w-2xl" onClose={() => setEditingId(null)} onSave={handleSave} saveLabel="Salva">
          <div className="grid grid-cols-2 gap-3.5">
            <div><label className={fieldLabel}>Nome</label><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
            <div>
              <label className={fieldLabel}>Tipo</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={mtype} onChange={e => setMtype(e.target.value)}>
                <option value="">Seleziona…</option>
                {MACHINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Tariffa lavoro €/ora</label>
              <Input onFocus={e => e.currentTarget.select()} type="number" step="0.1" className="font-mono" value={rate} onChange={e => setRate(e.target.value)} />
              <p className="mt-1 text-[11px] text-muted-foreground">Costo orario quando la macchina lavora.</p>
            </div>
            <div>
              <label className={fieldLabel}>Tariffa setup €/ora</label>
              <Input onFocus={e => e.currentTarget.select()} type="number" step="0.1" className="font-mono" placeholder={`default ${rate || '…'}`} value={setupRate} onChange={e => setSetupRate(e.target.value)} />
              <p className="mt-1 text-[11px] text-muted-foreground">Attrezzaggio (operatore senza macchina). Vuoto = stessa di lavoro.</p>
            </div>
            <div>
              <label className={fieldLabel}>Setup minimo (h)</label>
              <Input onFocus={e => e.currentTarget.select()} type="number" step="0.1" className="font-mono" value={setup} onChange={e => setSetup(e.target.value)} />
              <p className="mt-1 text-[11px] text-muted-foreground">Usato in fase di import DXF/STEP (in arrivo).</p>
            </div>
          </div>
        </SettingsModal>
      )}
      <ConfirmDialog open={pendingDelete != null} title="Eliminare questo centro di costo?" confirmLabel="Elimina" onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
