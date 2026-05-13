import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { X, Save, Check } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { ICON_MAP, ICON_NAMES, type IconName } from '@/lib/icons'
import type { OfficinaCategory } from '@/types'

interface Props {
  /** Se passato, modal in modalità Edit; altrimenti Create. */
  category?: OfficinaCategory | null
  onClose: () => void
  onSaved: () => void
}

export default function CategoryFormModal({ category, onClose, onSaved }: Props) {
  const isEdit = !!category
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState<IconName>((category?.icon as IconName) ?? 'Folder')
  const [sortOrder, setSortOrder] = useState(category?.sort_order ?? 100)
  const [saving, setSaving] = useState(false)

  useEscapeKey(onClose)

  useEffect(() => {
    setName(category?.name ?? '')
    setIcon((category?.icon as IconName) ?? 'Folder')
    setSortOrder(category?.sort_order ?? 100)
  }, [category])

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) { toast.error('Nome obbligatorio'); return }
    setSaving(true)
    try {
      if (isEdit && category) {
        await api.put(`/officina/categories/${category.id}`, {
          name: trimmed, icon, sort_order: sortOrder,
        })
        toast.success('Categoria aggiornata')
      } else {
        await api.post('/officina/categories', {
          name: trimmed, icon, sort_order: sortOrder,
        })
        toast.success('Categoria creata')
      }
      onSaved()
      onClose()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card className="w-full max-w-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold">{isEdit ? 'Modifica categoria' : 'Nuova categoria'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Nome *</label>
              <Input value={name} onChange={e => setName(e.target.value)}
                placeholder="es. Procedure, Setup macchine, DPI..." autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium">Ordine</label>
              <Input type="number" min={0} value={sortOrder}
                onChange={e => setSortOrder(parseInt(e.target.value) || 0)} />
              <p className="text-[11px] text-gray-400 mt-0.5">Più basso = appare prima</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">Icona</label>
            <div className="grid grid-cols-10 sm:grid-cols-15 gap-1.5 max-h-48 overflow-y-auto p-2 border rounded-md bg-gray-50">
              {ICON_NAMES.map(iconName => {
                const Icon = ICON_MAP[iconName]
                const selected = icon === iconName
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setIcon(iconName)}
                    title={iconName}
                    className={`relative p-2 rounded-md border transition-colors flex items-center justify-center ${
                      selected
                        ? 'bg-blue-100 border-blue-400 text-blue-700'
                        : 'bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-200 text-gray-600'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {selected && (
                      <Check className="absolute -top-1 -right-1 w-3 h-3 text-white bg-blue-600 rounded-full p-0.5" />
                    )}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Selezionata: <strong>{icon}</strong></p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Salvataggio...' : 'Salva'}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
