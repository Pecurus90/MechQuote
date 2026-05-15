import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Hammer, FileText, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { parseDecimal } from '@/lib/decimalInput'
import type { DieQuoteSpec, DieDifficulty } from '@/types'
import DxfProfilePicker, { type DxfPickerState } from '@/components/quotes/Dxf/DxfProfilePicker'

interface Props {
  spec: DieQuoteSpec
  readOnly?: boolean
  onChange: (next: DieQuoteSpec) => void
  /** Chiamato dopo PUT al backend (per ricaricare quote + snapshot costi). */
  onSaved: () => void
}

/** Pannello editor DieQuoteSpec: geometria pezzo, striscia, ingombro castello,
 *  difficoltà + feature (pieghe/punzoni), tempo consegna, note, extras. */
export default function DieSpecPanel({ spec, readOnly = false, onChange, onSaved }: Props) {
  const [saving, setSaving] = useState(false)
  const [showDxfModal, setShowDxfModal] = useState(false)
  const [pendingDxf, setPendingDxf] = useState<DxfPickerState | null>(null)
  const isPasso = spec.die_subtype === 'passo'

  const upd = <K extends keyof DieQuoteSpec>(k: K, v: DieQuoteSpec[K]) => onChange({ ...spec, [k]: v })

  const confirmDxfBbox = () => {
    if (!pendingDxf) return
    const base = pendingDxf.selectedBbox ?? pendingDxf.analysis.bbox_global
    const round1 = (n: number) => Math.round(n * 10) / 10
    onChange({ ...spec, bbox_x_mm: round1(base.w), bbox_y_mm: round1(base.h) })
    toast.success(`Bbox importato: ${round1(base.w)}×${round1(base.h)} mm`)
    setShowDxfModal(false)
    setPendingDxf(null)
    // Salva subito dopo l'import: l'onSaved triggera anche il recalc.
    setTimeout(save, 0)
  }

  const save = async () => {
    if (readOnly) return
    setSaving(true)
    try {
      const { quote_id, cost_material, cost_normalized, cost_machining, cost_accessories, cost_industrial, ...payload } = spec
      await api.put(`/dies/${quote_id}/spec`, payload)
      onSaved()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel salvataggio dati stampo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <fieldset disabled={readOnly} className="border-0 p-0 m-0 disabled:opacity-90 space-y-4">

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Hammer className="w-4 h-4 text-rose-600" /> Dati Stampo ({spec.die_subtype === 'passo' ? 'a passo' : 'a blocco'})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Geometria pezzo */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Geometria pezzo</h3>
              {!readOnly && (
                <Button size="sm" variant="outline" onClick={() => setShowDxfModal(true)}>
                  <FileText className="w-3.5 h-3.5 mr-1" /> Carica DXF
                </Button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Bbox X (mm)" v={spec.bbox_x_mm} on={v => upd('bbox_x_mm', v)} onBlur={save} />
              <NumField label="Bbox Y (mm)" v={spec.bbox_y_mm} on={v => upd('bbox_y_mm', v)} onBlur={save} />
              <NumField label="Spessore lamiera (mm)" v={spec.sheet_thickness_mm} on={v => upd('sheet_thickness_mm', v)} onBlur={save} step={0.1} />
            </div>
          </div>

          {/* Striscia */}
          <div className="border-t pt-3">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              {isPasso ? 'Striscia (a passo)' : 'Operazioni (a blocco)'}
            </h3>
            {isPasso ? (
              <div className="grid grid-cols-3 gap-3">
                <NumField label="N° stazioni" v={spec.n_stations ?? 0} on={v => upd('n_stations', v)} onBlur={save} step={1} int />
                <NumField label="Passo (mm)" v={spec.pitch_mm ?? 0} on={v => upd('pitch_mm', v)} onBlur={save} />
                <NumField label="Offset Y (mm)" v={spec.strip_offset_y_mm ?? 0} on={v => upd('strip_offset_y_mm', v)} onBlur={save} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <NumField label="N° operazioni" v={spec.n_operations ?? 0} on={v => upd('n_operations', v)} onBlur={save} int />
              </div>
            )}
          </div>

          {/* Ingombro castello */}
          <div className="border-t pt-3">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Ingombro castello (offset attorno alla striscia)</h3>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Offset castello X (mm)" v={spec.castle_offset_x_mm ?? 0} on={v => upd('castle_offset_x_mm', v)} onBlur={save} />
              <NumField label="Offset castello Y (mm)" v={spec.castle_offset_y_mm ?? 0} on={v => upd('castle_offset_y_mm', v)} onBlur={save} />
            </div>
          </div>

          {/* Difficoltà */}
          <div className="border-t pt-3">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Difficoltà</h3>
            <div className="flex gap-2">
              {(['base', 'medium', 'hard'] as DieDifficulty[]).map(d => (
                <button key={d} type="button" disabled={readOnly}
                  onClick={() => { upd('difficulty', d); setTimeout(save, 0) }}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    spec.difficulty === d ? 'border-rose-600 bg-rose-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  {d === 'base' ? 'Base' : d === 'medium' ? 'Medio' : 'Difficile'}
                </button>
              ))}
            </div>
          </div>

          {/* Feature pieghe / punzoni */}
          <div className="border-t pt-3">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Pieghe per fascia</h3>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Semplici" v={spec.n_bends_simple} on={v => upd('n_bends_simple', v)} onBlur={save} int />
              <NumField label="Medie" v={spec.n_bends_medium} on={v => upd('n_bends_medium', v)} onBlur={save} int />
              <NumField label="Complesse" v={spec.n_bends_complex} on={v => upd('n_bends_complex', v)} onBlur={save} int />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Punzoni per fascia</h3>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Semplici" v={spec.n_punches_simple} on={v => upd('n_punches_simple', v)} onBlur={save} int />
              <NumField label="Medi" v={spec.n_punches_medium} on={v => upd('n_punches_medium', v)} onBlur={save} int />
              <NumField label="Complessi" v={spec.n_punches_complex} on={v => upd('n_punches_complex', v)} onBlur={save} int />
            </div>
          </div>

          {/* Note + consegna + extras */}
          <div className="border-t pt-3 grid grid-cols-2 gap-3">
            <NumField label="Consegna (giorni lav.)" v={spec.delivery_days ?? 0} on={v => upd('delivery_days', v)} onBlur={save} int />
            <NumField label="Extras (€)" v={spec.extras_amount} on={v => upd('extras_amount', v)} onBlur={save} />
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Descrizione extras</label>
              <Input className="mt-1 h-9 text-sm" value={spec.extras_description || ''}
                onChange={e => upd('extras_description', e.target.value)} onBlur={save}
                placeholder="es. attrezzaggio speciale fornitore esterno" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Note tecniche</label>
              <textarea className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-20 resize-none"
                value={spec.technical_notes || ''}
                onChange={e => upd('technical_notes', e.target.value)} onBlur={save}
                placeholder="Particolarità che impattano il prezzo" />
            </div>
          </div>

          {saving && <p className="text-xs text-gray-400">Salvataggio...</p>}
        </CardContent>
      </Card>

      {/* Modale upload DXF (estrae bbox del pezzo) */}
      {showDxfModal && (
        <div className="fixed inset-0 bg-gray-900/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" /> Carica DXF per bbox pezzo
              </h3>
              <button onClick={() => { setShowDxfModal(false); setPendingDxf(null) }}
                className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs text-muted-foreground mb-3">
                Il bounding box dell'unione dei profili selezionati popola Bbox X / Y del pezzo.
                Lo spessore lamiera resta a inserimento manuale.
              </p>
              <DxfProfilePicker onChange={setPendingDxf} viewerHeight={360} />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50">
              <Button variant="outline" onClick={() => { setShowDxfModal(false); setPendingDxf(null) }}>
                Annulla
              </Button>
              <Button onClick={confirmDxfBbox} disabled={!pendingDxf} className="bg-rose-600 hover:bg-rose-700">
                Importa bbox
              </Button>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  )
}

function NumField({ label, v, on, onBlur, step = 0.5, int = false }: {
  label: string; v: number; on: (n: number) => void; onBlur: () => void; step?: number; int?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input onFocus={e => e.currentTarget.select()} type="number" min={0} step={int ? 1 : step}
        className="mt-1 h-9 text-sm"
        value={v || ''}
        onChange={e => on(int ? (parseInt(e.target.value, 10) || 0) : (parseDecimal(e.target.value) || 0))}
        onBlur={onBlur} />
    </div>
  )
}
