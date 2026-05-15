import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import type { NormalizedItem, NormalizedSupplier } from '@/types'

interface Props {
  partId: number
  items: NormalizedItem[]
  readOnly?: boolean
  /** Chiamato dopo create/update/delete (per ricaricare quote + snapshot costi). */
  onChanged: () => void
}

/** Editor inline dei componenti commerciali (NormalizedItem) di una piastra.
 *  Lista compatta con add/edit/delete; ogni mutazione triggera reload del quote
 *  per aggiornare il snapshot di costo L2 (cost_normalized). */
export default function NormalizedItemsEditor({ partId, items, readOnly = false, onChanged }: Props) {
  const [suppliers, setSuppliers] = useState<NormalizedSupplier[]>([])
  const [editing, setEditing] = useState<Partial<NormalizedItem> | null>(null)

  useEffect(() => {
    api.get<NormalizedSupplier[]>('/normalized-suppliers')
      .then(r => setSuppliers(r.data))
      .catch(() => undefined)
  }, [])

  const total = items.reduce((s, i) => s + (i.quantity || 1) * (i.unit_price || 0), 0)

  const save = async () => {
    if (!editing || !editing.description) {
      toast.error('Descrizione obbligatoria')
      return
    }
    try {
      if (editing.id) {
        await api.put(`/normalized-items/${editing.id}`, editing)
      } else {
        await api.post(`/parts/${partId}/normalized-items`, editing)
      }
      setEditing(null)
      onChanged()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Eliminare il normalizzato?')) return
    try {
      await api.delete(`/normalized-items/${id}`)
      onChanged()
    } catch {
      toast.error('Errore nell\'eliminazione')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">
          Normalizzati <span className="text-gray-400 font-normal">({items.length} · {total.toFixed(2)} €)</span>
        </CardTitle>
        {!readOnly && !editing && (
          <Button size="sm" variant="outline"
            onClick={() => setEditing({ description: '', quantity: 1, unit_price: 0 })}>
            <Plus className="w-4 h-4 mr-1" /> Aggiungi
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 && !editing && (
          <p className="px-4 py-4 text-sm text-gray-400 text-center">Nessun normalizzato aggiunto</p>
        )}
        {items.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2 font-medium text-gray-600">Descrizione</th>
                <th className="text-left p-2 font-medium text-gray-600">Fornitore</th>
                <th className="text-right p-2 font-medium text-gray-600 w-20">Qtà</th>
                <th className="text-right p-2 font-medium text-gray-600 w-24">€/pz</th>
                <th className="text-right p-2 font-medium text-gray-600 w-24">Totale</th>
                {!readOnly && <th className="w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => !readOnly && setEditing(it)}>
                  <td className="p-2">{it.description}</td>
                  <td className="p-2 text-gray-500">{it.supplier?.name || '—'}</td>
                  <td className="p-2 text-right font-mono">{it.quantity}</td>
                  <td className="p-2 text-right font-mono">{it.unit_price.toFixed(2)}</td>
                  <td className="p-2 text-right font-mono font-medium">{(it.quantity * it.unit_price).toFixed(2)} €</td>
                  {!readOnly && (
                    <td className="p-2 text-center">
                      <button onClick={e => { e.stopPropagation(); remove(it.id) }} className="p-1 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {editing && (
          <div className="p-3 bg-blue-50 border-t space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Descrizione</label>
                <Input className="mt-1 h-9 text-sm" value={editing.description || ''}
                  onChange={e => setEditing({ ...editing, description: e.target.value })}
                  placeholder="es. Vite M5×20 ISO 4762" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Fornitore</label>
                <select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={editing.normalized_supplier_id || ''}
                  onChange={e => setEditing({ ...editing, normalized_supplier_id: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">— nessuno —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Qtà</label>
                  <Input type="number" min={1} step={1} className="mt-1 h-9 text-sm"
                    value={editing.quantity ?? 1}
                    onChange={e => setEditing({ ...editing, quantity: parseInt(e.target.value, 10) || 1 })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">€/pz</label>
                  <Input type="number" min={0} step={0.01} className="mt-1 h-9 text-sm"
                    value={editing.unit_price ?? 0}
                    onChange={e => setEditing({ ...editing, unit_price: parseDecimal(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                <X className="w-4 h-4 mr-1" /> Annulla
              </Button>
              <Button size="sm" onClick={save}>
                <Save className="w-4 h-4 mr-1" /> Salva
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
