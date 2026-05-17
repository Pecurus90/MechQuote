import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Check, X, Wrench } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import api from '@/lib/api'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import type { ToolAttribute } from '@/types'

type SectionKey = 'types' | 'brands'

interface Section {
  key: SectionKey
  title: string
  description: string
  endpoint: string  // /tools/types | /tools/brands | /tools/locations
  newPlaceholder: string
}

const SECTIONS: Section[] = [
  {
    key: 'types',
    title: 'Tipi utensile',
    description: 'es. Cilindrica, Sferica, Conica',
    endpoint: '/tools/types',
    newPlaceholder: 'es. Cilindrica',
  },
  {
    key: 'brands',
    title: 'Marchi',
    description: 'es. Sandvik, JJ Tools, OSG',
    endpoint: '/tools/brands',
    newPlaceholder: 'es. Sandvik',
  },
]

function AttributeTable({ section }: { section: Section }) {
  const [items, setItems] = useState<ToolAttribute[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    api.get(section.endpoint)
      .then(r => setItems(r.data))
      .catch(() => toast.error('Errore caricamento'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const startEdit = (it: ToolAttribute) => {
    setEditingId(it.id)
    setEditName(it.name)
  }

  const saveEdit = async (id: number) => {
    const name = editName.trim()
    if (!name) { toast.error('Nome obbligatorio'); return }
    try {
      await api.put(`${section.endpoint}/${id}`, { name })
      toast.success('Salvato')
      setEditingId(null); load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    }
  }

  const remove = (id: number) => setPendingDelete(id)
  const confirmRemove = async () => {
    if (pendingDelete == null) return
    const id = pendingDelete
    setPendingDelete(null)
    try {
      await api.delete(`${section.endpoint}/${id}`)
      toast.success('Eliminato'); load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore eliminazione')
    }
  }

  const create = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await api.post(section.endpoint, { name, active: true })
      toast.success('Creato')
      setNewName(''); setShowNew(false); load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore creazione')
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="font-semibold">{section.title}</h2>
          <p className="text-xs text-gray-500">{section.description}</p>
        </div>
        <PrimaryCtaButton color="violet" size="sm" onClick={() => setShowNew(true)} disabled={showNew}>
          <Plus className="w-4 h-4" /> Aggiungi
        </PrimaryCtaButton>
      </div>
      <CardContent className="p-0">
        <table className="table-fixed w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-2 font-medium text-gray-600">Nome</th>
              <th className="text-center p-2 w-[18%] font-medium text-gray-600">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={2} className="p-4 text-center text-gray-400">Caricamento...</td></tr>
            ) : (
              <>
                {items.map(it => (
                  <tr key={it.id} className="border-b hover:bg-gray-50">
                    {editingId === it.id ? (
                      <>
                        <td className="p-2">
                          <Input className="h-8 text-sm" value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveEdit(it.id)}
                            autoFocus />
                        </td>
                        <td className="p-2 text-center">
                          <button onClick={() => saveEdit(it.id)} className="p-1 text-green-600 hover:bg-green-50 rounded mr-1">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3">{it.name}</td>
                        <td className="p-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <button onClick={() => startEdit(it)} className="p-1 hover:bg-gray-100 rounded">
                              <Pencil className="w-4 h-4 text-blue-600" />
                            </button>
                            <button onClick={() => remove(it.id)} className="p-1 hover:bg-red-50 rounded">
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}

                {showNew && (
                  <tr className="border-b bg-blue-50">
                    <td className="p-2">
                      <Input className="h-8 text-sm" placeholder={section.newPlaceholder}
                        value={newName} onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && create()}
                        autoFocus />
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={create} className="p-1 text-green-600 hover:bg-green-100 rounded mr-1">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setShowNew(false); setNewName('') }}
                        className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )}

                {items.length === 0 && !showNew && (
                  <tr><td colSpan={2} className="p-6 text-center text-gray-400">Nessuna voce.</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </CardContent>
      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare definitivamente?"
        confirmLabel="Elimina"
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  )
}

export default function ToolAttributesPage() {
  return (
    <PageContainer width="md">
      <SettingsPageHeader
        icon={Wrench}
        color="violet"
        title="Attributi utensili"
        subtitle="Valori usati nei dropdown del catalogo utensili. Aggiungere/rimuovere voci qui non modifica gli utensili esistenti."
      />
      {SECTIONS.map(s => <AttributeTable key={s.key} section={s} />)}
    </PageContainer>
  )
}
