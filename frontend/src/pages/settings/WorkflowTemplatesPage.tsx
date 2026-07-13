import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { Plus, Trash2, ChevronUp, ChevronDown, X, Workflow, Pencil } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { tHead } from '@/components/settings/inlineEdit'
import type { WorkflowTemplate, WorkflowTemplateStep, Machine, Operation } from '@/types'

interface EditState { name: string; description: string; steps: WorkflowTemplateStep[] }
const empty = (): EditState => ({ name: '', description: '', steps: [] })

export default function WorkflowTemplatesPage() {
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [edit, setEdit] = useState<EditState>(empty())
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const load = () => Promise.all([api.get('/workflow-templates'), api.get('/machines'), api.get('/operations')]).then(([w, mc, op]) => { setWorkflows(w.data); setMachines(mc.data); setOperations(op.data); setLoading(false) })
  useEffect(() => { load() }, [])

  const startNew = () => { setEditingId(0); setEdit(empty()) }
  const startEdit = (w: WorkflowTemplate) => {
    setEditingId(w.id)
    setEdit({ name: w.name, description: w.description ?? '', steps: w.steps.map((s, i) => ({ sequence_number: i + 1, machine_id: s.machine_id ?? null, operation_id: s.operation_id })) })
  }

  const addRow = () => {
    if (operations.length === 0) { toast.error('Crea prima almeno una Lavorazione'); return }
    setEdit(s => ({ ...s, steps: [...s.steps, { sequence_number: s.steps.length + 1, machine_id: null, operation_id: operations[0].id }] }))
  }
  const updateRow = (i: number, patch: Partial<WorkflowTemplateStep>) => setEdit(s => ({ ...s, steps: s.steps.map((st, idx) => idx === i ? { ...st, ...patch } : st) }))
  const removeRow = (i: number) => setEdit(s => ({ ...s, steps: s.steps.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, sequence_number: idx + 1 })) }))
  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= edit.steps.length) return
    setEdit(s => { const arr = [...s.steps]; [arr[i], arr[j]] = [arr[j], arr[i]]; return { ...s, steps: arr.map((st, idx) => ({ ...st, sequence_number: idx + 1 })) } })
  }
  const save = async () => {
    if (!edit.name.trim()) { toast.error('Nome flusso obbligatorio'); return }
    if (edit.steps.length === 0) { toast.error('Almeno una riga richiesta'); return }
    const payload = { name: edit.name.trim(), description: edit.description || null, steps: edit.steps.map((s, i) => ({ sequence_number: i + 1, machine_id: s.machine_id ?? null, operation_id: s.operation_id })) }
    try { if (editingId === 0) await api.post('/workflow-templates', payload); else await api.put(`/workflow-templates/${editingId}`, payload); toast.success('Template flusso salvato'); setEditingId(null); load() }
    catch { toast.error('Errore nel salvataggio') }
  }
  const confirmRemove = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/workflow-templates/${id}`); toast.success('Flusso eliminato'); load() } catch { toast.error('Errore') }
  }
  const machineName = (id?: number | null) => id != null ? (machines.find(m => m.id === id)?.name ?? `#${id}`) : '—'
  const operationName = (id: number) => operations.find(o => o.id === id)?.name ?? `#${id}`

  if (loading) return <div className="p-8 text-center text-muted-foreground">Caricamento…</div>

  if (operations.length === 0) {
    return (
      <StandardPage icon={Workflow} color="primary" width="xl" title="Template flusso" subtitle="Sequenze applicate in un colpo al preventivo.">
        <div className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
          <Workflow className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-medium text-foreground">Nessuna lavorazione disponibile</div>
          <div className="text-xs text-muted-foreground">Crea prima le lavorazioni, poi torna qui per comporle in flussi.</div>
          <Link to="/settings/catalog" className="mt-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">Vai a Lavorazioni</Link>
        </div>
      </StandardPage>
    )
  }

  const selCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm'

  return (
    <StandardPage
      icon={Workflow} color="primary" width="xl"
      title="Template flusso"
      subtitle="Sequenze (Macchina + Lavorazione) applicate in un colpo al preventivo. L'apply genera le fasi pre-popolate."
      actions={editingId === null ? <PrimaryCtaButton color="primary" size="sm" onClick={startNew}><Plus className="h-4 w-4" /> Nuovo flusso</PrimaryCtaButton> : undefined}
    >
      {editingId !== null && (
        <div className="rounded-2xl border border-primary/[0.3] bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="mb-3 text-[15px] font-semibold text-foreground">{editingId === 0 ? 'Nuovo flusso' : `Modifica "${edit.name}"`}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><label className="mb-1 block text-[12px] font-medium text-foreground">Nome</label><Input value={edit.name} onChange={e => setEdit(s => ({ ...s, name: e.target.value }))} placeholder="es. Componente di precisione" /></div>
            <div className="md:col-span-2"><label className="mb-1 block text-[12px] font-medium text-foreground">Descrizione</label><Input value={edit.description} onChange={e => setEdit(s => ({ ...s, description: e.target.value }))} placeholder="Note interne" /></div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Sequenza fasi</label>
              <Button size="sm" variant="outline" onClick={addRow}><Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi riga</Button>
            </div>
            {edit.steps.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nessuna riga. Click "Aggiungi riga" per iniziare.</div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <colgroup><col style={{ width: 48 }} /><col /><col /><col style={{ width: 120 }} /></colgroup>
                  <thead><tr className={tHead}><th className="p-2.5 text-left font-medium">#</th><th className="p-2.5 text-left font-medium">Macchina</th><th className="p-2.5 text-left font-medium">Lavorazione</th><th className="p-2.5 text-right font-medium">Azioni</th></tr></thead>
                  <tbody>
                    {edit.steps.map((step, i) => (
                      <tr key={step.id ?? `step-${i}`} className="border-b border-border last:border-0">
                        <td className="p-2.5 font-mono text-xs text-muted-foreground">{i + 1}</td>
                        <td className="p-2"><select className={selCls} value={step.machine_id ?? ''} onChange={e => updateRow(i, { machine_id: e.target.value === '' ? null : Number(e.target.value) })}><option value="">— Nessuna macchina —</option>{machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></td>
                        <td className="p-2"><select className={selCls} value={step.operation_id} onChange={e => updateRow(i, { operation_id: Number(e.target.value) })}>{operations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></td>
                        <td className="p-2">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => moveRow(i, -1)} disabled={i === 0} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                            <button onClick={() => moveRow(i, 1)} disabled={i === edit.steps.length - 1} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                            <button onClick={() => removeRow(i)} className="rounded p-1 text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <PrimaryCtaButton color="primary" onClick={save}>Salva</PrimaryCtaButton>
            <Button variant="outline" onClick={() => setEditingId(null)}><X className="mr-1 h-4 w-4" /> Annulla</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
        {workflows.map(w => (
          <div key={w.id} className="rounded-[14px] border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-foreground">{w.name}</h3>
                {w.description && <p className="truncate text-xs text-muted-foreground">{w.description}</p>}
              </div>
              <div className="flex flex-none items-center gap-1">
                <button onClick={() => startEdit(w)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifica"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setPendingDelete(w.id)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <ol className="mt-2 space-y-0.5">
              {w.steps.map((s, i) => (
                <li key={s.id ?? `step-${i}`} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="w-5 font-mono">{i + 1}.</span>
                  <span className="flex-1 truncate text-foreground">{operationName(s.operation_id)}<span className="text-muted-foreground"> — {machineName(s.machine_id)}</span></span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] text-muted-foreground">{w.steps.length} fasi</p>
          </div>
        ))}
        {workflows.length === 0 && editingId === null && (
          <div className="rounded-[14px] border border-dashed border-border p-8 text-center text-sm text-muted-foreground md:col-span-2 lg:col-span-3">Nessun flusso. Crea il primo per iniziare.</div>
        )}
      </div>
      <ConfirmDialog open={pendingDelete != null} title="Eliminare questo flusso?" confirmLabel="Elimina" onConfirm={confirmRemove} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
