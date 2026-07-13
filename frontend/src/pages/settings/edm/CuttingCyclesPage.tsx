import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, ChevronUp, ChevronDown, X, Zap, Pencil } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import type { CuttingCycle, CuttingPass, PassType } from '@/types'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'

const PASS_TYPES: { value: PassType; label: string; cls: string }[] = [
  { value: 'rough', label: 'Sgrossatura', cls: 'bg-warning/[0.16] text-warning' },
  { value: 'semi', label: 'Semifinitura', cls: 'bg-info/[0.14] text-info' },
  { value: 'finish', label: 'Finitura', cls: 'bg-success/[0.14] text-success' },
]
const passLabel = (t: PassType) => PASS_TYPES.find(p => p.value === t)?.label ?? t
const passCls = (t: PassType) => PASS_TYPES.find(p => p.value === t)?.cls ?? 'bg-muted text-muted-foreground'

interface EditState { name: string; description: string; passes: CuttingPass[] }
const empty = (): EditState => ({ name: '', description: '', passes: [] })

export default function CuttingCyclesPage() {
  const [cycles, setCycles] = useState<CuttingCycle[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [edit, setEdit] = useState<EditState>(empty())
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const load = () => api.get('/cutting-cycles').then(r => { setCycles(r.data); setLoading(false) })
  useEffect(() => { load() }, [])

  const startEdit = (c: CuttingCycle) => { setEditingId(c.id); setEdit({ name: c.name, description: c.description ?? '', passes: c.passes.map((p, i) => ({ id: p.id, sequence_number: i + 1, pass_type: p.pass_type })) }) }
  const startNew = () => { setEditingId(0); setEdit(empty()) }
  const addPass = (type: PassType) => setEdit(s => ({ ...s, passes: [...s.passes, { sequence_number: s.passes.length + 1, pass_type: type }] }))
  const removePass = (i: number) => setEdit(s => ({ ...s, passes: s.passes.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, sequence_number: idx + 1 })) }))
  const movePass = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= edit.passes.length) return
    setEdit(s => { const arr = [...s.passes]; [arr[i], arr[j]] = [arr[j], arr[i]]; return { ...s, passes: arr.map((p, idx) => ({ ...p, sequence_number: idx + 1 })) } })
  }
  const save = async () => {
    if (!edit.name.trim()) { toast.error('Nome ciclo obbligatorio'); return }
    if (edit.passes.length === 0) { toast.error('Almeno una passata richiesta'); return }
    const payload = { name: edit.name, description: edit.description || null, passes: edit.passes.map((p, i) => ({ sequence_number: i + 1, pass_type: p.pass_type })) }
    try { if (editingId === 0) { await api.post('/cutting-cycles', payload); toast.success('Ciclo creato') } else { await api.put(`/cutting-cycles/${editingId}`, payload); toast.success('Ciclo salvato') } setEditingId(null); load() }
    catch { toast.error('Errore nel salvataggio') }
  }
  const confirmRemove = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/cutting-cycles/${id}`); toast.success('Ciclo eliminato'); load() } catch { toast.error('Errore') }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Caricamento…</div>

  return (
    <StandardPage
      icon={Zap} color="edm" width="xl"
      title="Cicli di taglio"
      subtitle='Template sequenze di passate. Es. "Standard 1+3" = 1 sgrossatura + 3 finiture, applicati alla fase Wire EDM.'
      actions={editingId === null ? <PrimaryCtaButton color="edm" size="sm" onClick={startNew}><Plus className="h-4 w-4" /> Nuovo ciclo</PrimaryCtaButton> : undefined}
    >
      {editingId !== null && (
        <div className="rounded-2xl border border-edm/[0.3] bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="mb-3 text-[15px] font-semibold text-foreground">{editingId === 0 ? 'Nuovo ciclo' : `Modifica ciclo "${edit.name}"`}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><label className="mb-1 block text-[12px] font-medium text-foreground">Nome</label><Input value={edit.name} onChange={e => setEdit(s => ({ ...s, name: e.target.value }))} placeholder="es. Standard 1+3" /></div>
            <div className="md:col-span-2"><label className="mb-1 block text-[12px] font-medium text-foreground">Descrizione</label><Input value={edit.description} onChange={e => setEdit(s => ({ ...s, description: e.target.value }))} placeholder="Sgrossatura + 3 finiture" /></div>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Sequenza passate</label>
              <div className="flex items-center gap-1.5">
                {PASS_TYPES.map(p => <button key={p.value} onClick={() => addPass(p.value)} className={`rounded-md px-2 py-1 text-xs font-medium ${p.cls} hover:brightness-105`}>+ {p.label}</button>)}
              </div>
            </div>
            {edit.passes.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aggiungi le passate che compongono il ciclo.</div>
            ) : (
              <ul className="space-y-1">
                {edit.passes.map((p, i) => (
                  <li key={p.id ?? `${p.pass_type}-${i}`} className="flex items-center gap-2 rounded-lg bg-muted/[0.5] px-3 py-2">
                    <span className="w-8 font-mono text-xs text-muted-foreground">#{i + 1}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${passCls(p.pass_type)}`}>{passLabel(p.pass_type)}</span>
                    <div className="flex-1" />
                    <button onClick={() => movePass(i, -1)} disabled={i === 0} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => movePass(i, 1)} disabled={i === edit.passes.length - 1} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                    <button onClick={() => removePass(i)} className="rounded p-1 text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <PrimaryCtaButton color="edm" onClick={save}>Salva</PrimaryCtaButton>
            <Button variant="outline" onClick={() => setEditingId(null)}><X className="mr-1 h-4 w-4" /> Annulla</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
        {cycles.map(c => (
          <div key={c.id} className="rounded-[14px] border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between">
              <div className="min-w-0"><h3 className="truncate font-semibold text-foreground">{c.name}</h3>{c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}</div>
              <div className="flex flex-none items-center gap-1">
                <button onClick={() => startEdit(c)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifica"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setPendingDelete(c.id)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {c.passes.map((p, i) => <span key={p.id ?? `${p.pass_type}-${i}`} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${passCls(p.pass_type)}`}>{passLabel(p.pass_type)}</span>)}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{c.passes.length} passate</p>
          </div>
        ))}
        {cycles.length === 0 && editingId === null && <div className="rounded-[14px] border border-dashed border-border p-8 text-center text-sm text-muted-foreground md:col-span-2 lg:col-span-3">Nessun ciclo configurato. Crea il primo per iniziare.</div>}
      </div>
      <ConfirmDialog open={pendingDelete != null} title="Eliminare questo ciclo?" confirmLabel="Elimina" onConfirm={confirmRemove} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
