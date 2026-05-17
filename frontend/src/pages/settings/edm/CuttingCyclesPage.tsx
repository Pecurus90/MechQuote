import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, ChevronUp, ChevronDown, Save, X, Zap } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import api from '@/lib/api'
import type { CuttingCycle, CuttingPass, PassType } from '@/types'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'

const PASS_TYPES: { value: PassType; label: string; color: string }[] = [
  { value: 'rough',  label: 'Sgrossatura', color: 'bg-amber-100 text-amber-700' },
  { value: 'semi',   label: 'Semifinitura', color: 'bg-blue-100 text-blue-700' },
  { value: 'finish', label: 'Finitura', color: 'bg-green-100 text-green-700' },
]

const passLabel = (t: PassType) => PASS_TYPES.find(p => p.value === t)?.label ?? t
const passColor = (t: PassType) => PASS_TYPES.find(p => p.value === t)?.color ?? ''

interface EditState {
  name: string
  description: string
  passes: CuttingPass[]
}

const empty = (): EditState => ({ name: '', description: '', passes: [] })

export default function CuttingCyclesPage() {
  const [cycles, setCycles] = useState<CuttingCycle[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)  // 0 = nuovo
  const [edit, setEdit] = useState<EditState>(empty())
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const load = () => api.get('/cutting-cycles').then(r => { setCycles(r.data); setLoading(false) })
  useEffect(() => { load() }, [])

  const startEdit = (c: CuttingCycle) => {
    setEditingId(c.id)
    setEdit({
      name: c.name,
      description: c.description ?? '',
      passes: c.passes.map((p, i) => ({ id: p.id, sequence_number: i + 1, pass_type: p.pass_type })),
    })
  }
  const startNew = () => { setEditingId(0); setEdit(empty()) }

  const addPass = (type: PassType) => {
    setEdit(s => ({
      ...s,
      passes: [...s.passes, { sequence_number: s.passes.length + 1, pass_type: type }],
    }))
  }
  const removePass = (i: number) => {
    setEdit(s => ({
      ...s,
      passes: s.passes.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, sequence_number: idx + 1 })),
    }))
  }
  const movePass = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= edit.passes.length) return
    setEdit(s => {
      const arr = [...s.passes]
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return { ...s, passes: arr.map((p, idx) => ({ ...p, sequence_number: idx + 1 })) }
    })
  }

  const save = async () => {
    if (!edit.name.trim()) { toast.error('Nome ciclo obbligatorio'); return }
    if (edit.passes.length === 0) { toast.error('Almeno una passata richiesta'); return }
    const payload = {
      name: edit.name,
      description: edit.description || null,
      passes: edit.passes.map((p, i) => ({ sequence_number: i + 1, pass_type: p.pass_type })),
    }
    try {
      if (editingId === 0) {
        await api.post('/cutting-cycles', payload)
        toast.success('Ciclo creato')
      } else {
        await api.put(`/cutting-cycles/${editingId}`, payload)
        toast.success('Ciclo salvato')
      }
      setEditingId(null); load()
    } catch {toast.error('Errore nel salvataggio') }
  }

  const remove = (id: number) => setPendingDelete(id)
  const confirmRemove = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete; setPendingDelete(null)
    try {
      await api.delete(`/cutting-cycles/${id}`)
      toast.success('Ciclo eliminato'); load()
    } catch { toast.error('Errore') }
  }

  if (loading) return <div className="p-8 text-center">Caricamento...</div>

  return (
    <PageContainer>
      <SettingsPageHeader
        icon={Zap}
        color="amber"
        title="Cicli di taglio"
        subtitle='Template sequenze di passate. Es. "Standard 1+3" = 1 sgrossatura + 3 finiture, applicati alla fase Wire EDM.'
        action={
          editingId === null ? (
            <PrimaryCtaButton color="amber" size="sm" onClick={startNew}>
              <Plus className="w-4 h-4" /> Nuovo ciclo
            </PrimaryCtaButton>
          ) : undefined
        }
      />

      {editingId !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editingId === 0 ? 'Nuovo ciclo' : `Modifica ciclo "${edit.name}"`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="text-xs font-medium text-muted-foreground">Nome</label>
                <Input value={edit.name} onChange={e => setEdit(s => ({ ...s, name: e.target.value }))}
                  placeholder="es. Standard 1+3" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Descrizione</label>
                <Input value={edit.description} onChange={e => setEdit(s => ({ ...s, description: e.target.value }))}
                  placeholder="Sgrossatura + 3 finiture" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Sequenza passate</label>
                <div className="flex items-center gap-1">
                  {PASS_TYPES.map(p => (
                    <button key={p.value} onClick={() => addPass(p.value)}
                      className={`text-xs px-2 py-1 rounded ${p.color} hover:opacity-80`}>
                      + {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {edit.passes.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center border-2 border-dashed rounded">
                  Aggiungi le passate che compongono il ciclo.
                </div>
              ) : (
                <ul className="space-y-1">
                  {edit.passes.map((p, i) => (
                    <li key={p.id ?? `${p.pass_type}-${i}`} className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded">
                      <span className="text-xs font-mono text-muted-foreground w-8">#{i + 1}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${passColor(p.pass_type)}`}>
                        {passLabel(p.pass_type)}
                      </span>
                      <div className="flex-1" />
                      <button onClick={() => movePass(i, -1)} disabled={i === 0}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => movePass(i, 1)} disabled={i === edit.passes.length - 1}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removePass(i)}
                        className="p-1 text-muted-foreground hover:text-red-500 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <PrimaryCtaButton color="amber" onClick={save}>Salva</PrimaryCtaButton>
              <Button variant="outline" onClick={() => setEditingId(null)}>
                <X className="w-4 h-4 mr-1" /> Annulla
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {cycles.map(c => (
          <Card key={c.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{c.name}</h3>
                  {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(c)} className="p-1 text-muted-foreground hover:text-blue-600 rounded text-xs">
                    Modifica
                  </button>
                  <button onClick={() => remove(c.id)} className="p-1 text-muted-foreground hover:text-red-500 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {c.passes.map((p, i) => (
                  <span key={p.id ?? `${p.pass_type}-${i}`} className={`text-[10px] px-1.5 py-0.5 rounded ${passColor(p.pass_type)}`}>
                    {passLabel(p.pass_type)}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{c.passes.length} passate</p>
            </CardContent>
          </Card>
        ))}

        {cycles.length === 0 && editingId === null && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nessun ciclo configurato. Crea il primo per iniziare.
            </CardContent>
          </Card>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questo ciclo?"
        confirmLabel="Elimina"
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  )
}
