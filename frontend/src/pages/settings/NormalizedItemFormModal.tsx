import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X, Plus } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import api from '@/lib/api'
import { parseDecimal } from '@/lib/decimalInput'
import { DecimalField } from '@/components/ui/decimal-field'
import { toast } from 'sonner'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { NormalizedItem, NormalizedSupplier } from '@/types'

interface FormState {
  code: string
  description: string
  category: string
  supplier_id: number | null
  unit_price: number
  notes: string
  active: boolean
}

const fromItem = (it: NormalizedItem | null, defaultDescription = ''): FormState => ({
  code: it?.code ?? '',
  description: it?.description ?? defaultDescription,
  category: it?.category ?? '',
  supplier_id: it?.supplier_id ?? null,
  unit_price: it?.unit_price ?? 0,
  notes: it?.notes ?? '',
  active: it?.active ?? true,
})

interface Props {
  item: NormalizedItem | null     // null = nuovo
  suppliers: NormalizedSupplier[]
  categories: string[]
  defaultDescription?: string     // precompila la descrizione (creando da import)
  onClose: () => void
  onSaved: (saved?: NormalizedItem) => void  // restituisce la voce salvata
}

export default function NormalizedItemFormModal({ item, suppliers, categories, defaultDescription, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(fromItem(item, defaultDescription))
  const [saving, setSaving] = useState(false)
  // Alias: gestiti come sotto-risorsa (persistono subito, indipendenti dal
  // Salva principale). Solo per una voce già esistente.
  const [aliases, setAliases] = useState<{ id: number; csv_name: string }[]>(item?.aliases ?? [])
  const [newAlias, setNewAlias] = useState('')
  const [aliasBusy, setAliasBusy] = useState(false)
  useEscapeKey(onClose, true)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const addAlias = async () => {
    const v = newAlias.trim()
    if (!item || !v) return
    setAliasBusy(true)
    try {
      const res = await api.post(`/normalized-items/${item.id}/aliases`, { csv_name: v })
      setAliases((res.data as NormalizedItem).aliases ?? [])
      setNewAlias('')
      onSaved()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'aggiunta dell\'alias')
    } finally { setAliasBusy(false) }
  }

  const removeAlias = async (aliasId: number) => {
    if (!item) return
    setAliasBusy(true)
    try {
      const res = await api.delete(`/normalized-items/${item.id}/aliases/${aliasId}`)
      setAliases((res.data as NormalizedItem).aliases ?? [])
      onSaved()
    } catch { toast.error('Errore nella rimozione dell\'alias') }
    finally { setAliasBusy(false) }
  }

  const save = async () => {
    if (!form.code.trim()) { toast.error('Codice obbligatorio'); return }
    if (!form.description.trim()) { toast.error('Descrizione obbligatoria'); return }
    if (form.unit_price < 0) { toast.error('Il prezzo non può essere negativo'); return }
    const payload = {
      code: form.code.trim(),
      description: form.description.trim(),
      category: form.category.trim() || null,
      supplier_id: form.supplier_id,
      unit_price: form.unit_price,
      notes: form.notes.trim() || null,
      active: form.active,
    }
    setSaving(true)
    try {
      const res = item
        ? await api.put(`/normalized-items/${item.id}`, payload)
        : await api.post('/normalized-items', payload)
      toast.success(item ? 'Voce aggiornata' : 'Voce creata')
      onSaved(res.data as NormalizedItem)
      onClose()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-xl bg-card shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold">{item ? 'Modifica' : 'Nuovo'} normalizzato</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Codice *</label>
              <Input value={form.code} onChange={e => set('code', e.target.value)} placeholder="es. COL-D32-L250-RAB" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium">Categoria</label>
              <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="es. colonne, viti, molle" list="categories-suggest" />
              <datalist id="categories-suggest">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Descrizione *</label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="es. Colonna Ø32 L250 Rabourdin" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Fornitore</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm h-9"
                value={form.supplier_id ?? ''}
                onChange={e => set('supplier_id', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— nessuno —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Prezzo €/pz</label>
              <DecimalField value={String(form.unit_price ?? '')}
                onCommit={raw => set('unit_price', parseDecimal(raw))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Note</label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="riferimenti, link scheda tecnica..." />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="w-4 h-4" />
            Attivo
          </label>

          {/* Alias: designazioni grezze con cui il tipo compare in distinta */}
          {item ? (
            <div className="border-t pt-3">
              <label className="text-sm font-medium">Alias (nomi grezzi in distinta)</label>
              <p className="text-[11px] text-muted-foreground mb-2">
                Designazioni con cui questo tipo compare nelle distinte importate.
                L'import "normalizzati da file" le riconosce e le abbina a questa voce.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {aliases.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">Nessun alias</span>
                )}
                {aliases.map(a => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                    {a.csv_name}
                    <button
                      type="button"
                      onClick={() => removeAlias(a.id)}
                      disabled={aliasBusy}
                      className="hover:text-red-600 disabled:opacity-50"
                      title="Rimuovi alias"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-9 text-sm"
                  placeholder="Aggiungi alias (es. Vite TCEI M8x100)"
                  value={newAlias}
                  onChange={e => setNewAlias(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlias() } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addAlias} disabled={aliasBusy || !newAlias.trim()}>
                  <Plus className="w-4 h-4" /> Aggiungi
                </Button>
              </div>
            </div>
          ) : (
            <p className="border-t pt-3 text-[11px] text-muted-foreground italic">
              Salva la voce per poter aggiungere alias (nomi grezzi in distinta).
            </p>
          )}

          <div className="flex gap-2 mt-4">
            <PrimaryCtaButton color="sky" onClick={save} disabled={saving}>Salva</PrimaryCtaButton>
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
