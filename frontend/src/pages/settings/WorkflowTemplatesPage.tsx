import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from 'react-router-dom'
import { Plus, Trash2, ChevronUp, ChevronDown, Save, X, Workflow } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import type { WorkflowTemplate, WorkflowTemplateStep, Machine, Operation } from '@/types'

interface EditState {
  name: string
  description: string
  steps: WorkflowTemplateStep[]
}

const empty = (): EditState => ({ name: '', description: '', steps: [] })

export default function WorkflowTemplatesPage() {
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [edit, setEdit] = useState<EditState>(empty())
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  useEscapeKey(() => setEditingId(null), editingId !== null)

  const load = () => Promise.all([
    api.get('/workflow-templates'),
    api.get('/machines'),
    api.get('/operations'),
  ]).then(([w, mc, op]) => {
    setWorkflows(w.data)
    setMachines(mc.data)
    setOperations(op.data)
    setLoading(false)
  })
  useEffect(() => { load() }, [])

  const startNew = () => { setEditingId(0); setEdit(empty()) }
  const startEdit = (w: WorkflowTemplate) => {
    setEditingId(w.id)
    setEdit({
      name: w.name,
      description: w.description ?? '',
      steps: w.steps.map((s, i) => ({
        sequence_number: i + 1,
        machine_id: s.machine_id ?? null,
        operation_id: s.operation_id,
      })),
    })
  }

  const addRow = () => {
    if (operations.length === 0) {
      toast.error('Crea prima almeno una Lavorazione in Impostazioni → Catalogo')
      return
    }
    setEdit(s => ({
      ...s,
      steps: [...s.steps, {
        sequence_number: s.steps.length + 1,
        machine_id: null,
        operation_id: operations[0].id,
      }],
    }))
  }
  const updateRow = (i: number, patch: Partial<WorkflowTemplateStep>) => {
    setEdit(s => ({ ...s, steps: s.steps.map((st, idx) => idx === i ? { ...st, ...patch } : st) }))
  }
  const removeRow = (i: number) => {
    setEdit(s => ({
      ...s,
      steps: s.steps.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, sequence_number: idx + 1 })),
    }))
  }
  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= edit.steps.length) return
    setEdit(s => {
      const arr = [...s.steps]
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return { ...s, steps: arr.map((st, idx) => ({ ...st, sequence_number: idx + 1 })) }
    })
  }

  const save = async () => {
    if (!edit.name.trim()) { toast.error('Nome flusso obbligatorio'); return }
    if (edit.steps.length === 0) { toast.error('Almeno una riga richiesta'); return }
    const payload = {
      name: edit.name.trim(),
      description: edit.description || null,
      steps: edit.steps.map((s, i) => ({
        sequence_number: i + 1,
        machine_id: s.machine_id ?? null,
        operation_id: s.operation_id,
      })),
    }
    try {
      if (editingId === 0) await api.post('/workflow-templates', payload)
      else await api.put(`/workflow-templates/${editingId}`, payload)
      toast.success('Template flusso salvato')
      setEditingId(null); load()
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const remove = (id: number) => setPendingDelete(id)
  const confirmRemove = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try {
      await api.delete(`/workflow-templates/${id}`)
      toast.success('Flusso eliminato'); load()
    } catch { toast.error('Errore') }
  }

  const machineName = (id?: number | null) =>
    id != null ? (machines.find(m => m.id === id)?.name ?? `#${id}`) : '—'
  const operationName = (id: number) =>
    operations.find(o => o.id === id)?.name ?? `#${id}`

  if (loading) return <div className="p-8 text-center">Caricamento...</div>

  if (operations.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Template flusso</h1>
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <p className="mb-2">Nessuna lavorazione disponibile.</p>
            <p className="text-sm">
              Crea prima le lavorazioni in{' '}
              <Link to="/settings/operations" className="text-blue-600 underline">Lavorazioni</Link>,
              poi torna qui per comporle in flussi multi-fase.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <StandardPage
      icon={Workflow}
      color="indigo"
      width="full"
      title="Template flusso"
      subtitle="Sequenze (Macchina + Lavorazione) applicate in un colpo al preventivo. L'apply genera le fasi pre-popolate."
      actions={
        editingId === null ? (
          <PrimaryCtaButton color="indigo" size="sm" onClick={startNew}>
            <Plus className="w-4 h-4" /> Nuovo flusso
          </PrimaryCtaButton>
        ) : undefined
      }
    >

      {editingId !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editingId === 0 ? 'Nuovo flusso' : `Modifica "${edit.name}"`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="text-xs font-medium text-muted-foreground">Nome</label>
                <Input value={edit.name} onChange={e => setEdit(s => ({ ...s, name: e.target.value }))}
                  placeholder="es. Componente di precisione" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Descrizione</label>
                <Input value={edit.description} onChange={e => setEdit(s => ({ ...s, description: e.target.value }))}
                  placeholder="Note interne" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Sequenza fasi</label>
                <Button size="sm" variant="outline" onClick={addRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi riga
                </Button>
              </div>

              {edit.steps.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center border-2 border-dashed rounded">
                  Nessuna riga. Click "Aggiungi riga" per iniziare.
                </div>
              ) : (
                <table className="w-full text-sm border rounded overflow-hidden">
                  <thead className="bg-muted/40">
                    <tr className="border-b">
                      <th className="text-left px-3 py-2 w-12 text-xs font-medium text-muted-foreground">#</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Macchina</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Lavorazione</th>
                      <th className="text-right px-3 py-2 w-28 text-xs font-medium text-muted-foreground">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {edit.steps.map((step, i) => (
                      <tr key={step.id ?? `step-${i}`} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={step.machine_id ?? ''}
                            onChange={e => updateRow(i, { machine_id: e.target.value === '' ? null : Number(e.target.value) })}
                          >
                            <option value="">— Nessuna macchina —</option>
                            {machines.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={step.operation_id}
                            onChange={e => updateRow(i, { operation_id: Number(e.target.value) })}
                          >
                            {operations.map(o => (
                              <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => moveRow(i, -1)} disabled={i === 0}
                              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded">
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => moveRow(i, 1)} disabled={i === edit.steps.length - 1}
                              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded">
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => removeRow(i)}
                              className="p-1 text-muted-foreground hover:text-red-500 rounded">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <PrimaryCtaButton color="indigo" onClick={save}>Salva</PrimaryCtaButton>
              <Button variant="outline" onClick={() => setEditingId(null)}>
                <X className="w-4 h-4 mr-1" /> Annulla
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {workflows.map(w => (
          <Card key={w.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{w.name}</h3>
                  {w.description && <p className="text-xs text-muted-foreground">{w.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(w)} className="p-1 text-muted-foreground hover:text-blue-600 rounded text-xs">
                    Modifica
                  </button>
                  <button onClick={() => remove(w.id)} className="p-1 text-muted-foreground hover:text-red-500 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <ol className="space-y-0.5">
                {w.steps.map((s, i) => (
                  <li key={s.id ?? `step-${i}`} className="text-xs text-gray-600 flex gap-2">
                    <span className="font-mono text-gray-400 w-5">{i + 1}.</span>
                    <span className="flex-1 truncate">
                      {operationName(s.operation_id)}
                      <span className="text-gray-400"> — {machineName(s.machine_id)}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-muted-foreground">{w.steps.length} fasi</p>
            </CardContent>
          </Card>
        ))}

        {workflows.length === 0 && editingId === null && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nessun flusso. Crea il primo per iniziare.
            </CardContent>
          </Card>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questo flusso?"
        confirmLabel="Elimina"
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />
    </StandardPage>
  )
}
