import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Zap, Unlock, FileText, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Phase, CuttingCycle } from '@/types'
import { parseDecimal } from '@/lib/decimalInput'
import DxfProfilePicker, { type DxfPickerState } from '@/components/quotes/Dxf/DxfProfilePicker'

interface Props {
  phase: Phase
  edmAuto: boolean
  cuttingCycles: CuttingCycle[]
  partId?: number   // se presente, su conferma DXF il file viene allegato come PartFile
  onChange: (field: keyof Phase, value: Phase[keyof Phase]) => void
  onBlur: () => void
  onUnlockManual: () => void
  /** Aggiornamento atomico di più campi (riceve dal PhaseEditor un wrap su updateMany).
   *  Usato dalla modale DXF per popolare cut_length_mm + dxf_profile_ids + n_pierce
   *  in un colpo solo (altrimenti tre setState separate causerebbero race sul calcolo). */
  onPatch?: (updates: Partial<Phase>) => void
}

/** Campi extra per fasi Wire EDM: lunghezza profilo, altezza, ciclo, n_pierce.
 * Quando i 3 campi obbligatori sono valorizzati, il backend ricalcola
 * automaticamente cycle_hours_per_part (edmAuto = true).
 */
export default function EdmPhaseFields({ phase, edmAuto, cuttingCycles, partId, onChange, onBlur, onUnlockManual, onPatch }: Props) {
  const [showDxfModal, setShowDxfModal] = useState(false)
  const [pendingDxf, setPendingDxf] = useState<DxfPickerState | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const confirmDxf = async () => {
    if (!pendingDxf || pendingDxf.selectedIds.length === 0) {
      toast.error('Seleziona almeno un profilo')
      return
    }
    setSubmitting(true)
    try {
      // Allega il DXF al pezzo (best-effort: se manca partId o fallisce upload,
      // proseguiamo comunque con il patch dei campi della fase).
      if (partId) {
        try {
          const fd = new FormData()
          fd.append('file', pendingDxf.file)
          await api.post(`/parts/${partId}/files`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        } catch {
          toast.warning('DXF analizzato ma allegato non salvato (riprova manualmente)')
        }
      }
      const updates: Partial<Phase> = {
        cut_length_mm: Math.round(pendingDxf.selectedLengthMm * 100) / 100,
        dxf_profile_ids: pendingDxf.selectedIds,
      }
      // Suggerisci n_pierce solo se l'utente non l'ha ancora compilato.
      if (phase.n_pierce == null || phase.n_pierce === 0) {
        updates.n_pierce = pendingDxf.selectedClosedCount
      }
      if (onPatch) {
        onPatch(updates)
      } else {
        // Fallback: tre setState separati (può causare un breve sfasamento del calcolo
        // ma il backend riallinea alla save).
        onChange('cut_length_mm', updates.cut_length_mm ?? null)
        onChange('dxf_profile_ids', (updates.dxf_profile_ids ?? null) as Phase[keyof Phase])
        if (updates.n_pierce != null) onChange('n_pierce', updates.n_pierce)
      }
      onBlur()  // triggera la save
      toast.success(`${pendingDxf.selectedIds.length} profili importati (${updates.cut_length_mm} mm)`)
      setShowDxfModal(false)
      setPendingDxf(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
          <Zap className="w-3.5 h-3.5" />
          Parametri taglio EDM
          {edmAuto && <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-amber-200 text-amber-800">auto</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowDxfModal(true)}
            className="flex items-center gap-1 text-[11px] text-amber-700 hover:underline"
            title="Carica un DXF per popolare lunghezza profilo e numero pierce"
          >
            <FileText className="w-3 h-3" /> Carica da DXF
          </button>
          {edmAuto && (
            <button
              type="button"
              onClick={onUnlockManual}
              className="flex items-center gap-1 text-[11px] text-amber-700 hover:underline"
              title="Sblocca per inserire le ore manualmente"
            >
              <Unlock className="w-3 h-3" /> Modifica manualmente
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Lunghezza profilo (mm)</label>
          <Input onFocus={e => e.currentTarget.select()} type="number" step="1" min="0" className="mt-1 h-9 text-sm"
            value={phase.cut_length_mm ?? ''}
            placeholder="es. 320"
            onChange={e => onChange('cut_length_mm', e.target.value === '' ? null : parseDecimal(e.target.value))}
            onBlur={onBlur} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Altezza pezzo (mm)</label>
          <Input onFocus={e => e.currentTarget.select()} type="number" step="0.5" min="0" className="mt-1 h-9 text-sm"
            value={phase.cut_height_mm ?? ''}
            placeholder="es. 40"
            onChange={e => onChange('cut_height_mm', e.target.value === '' ? null : parseDecimal(e.target.value))}
            onBlur={onBlur} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Ciclo di taglio</label>
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={phase.cutting_cycle_id ?? ''}
            onChange={e => onChange('cutting_cycle_id', e.target.value === '' ? null : Number(e.target.value))}
            onBlur={onBlur}
          >
            <option value="">— scegli ciclo —</option>
            {cuttingCycles.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.passes.length} passate)</option>
            ))}
          </select>
          {cuttingCycles.length === 0 && (
            <p className="text-[10px] text-amber-700 mt-0.5">
              Configura i cicli in Impostazioni → Wire EDM
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">N° pierce (fori partenza)</label>
          <Input onFocus={e => e.currentTarget.select()} type="number" step="1" min="0" className="mt-1 h-9 text-sm"
            value={phase.n_pierce ?? ''}
            placeholder="0"
            onChange={e => onChange('n_pierce', e.target.value === '' ? null : parseInt(e.target.value, 10))}
            onBlur={onBlur} />
        </div>
      </div>
      {edmAuto && (
        <p className="text-[11px] text-amber-700 mt-2">
          Le ore ciclo sono calcolate automaticamente da area × ciclo + tempo pierce.
          Se la coppia materiale/altezza non è in tabella, popolala in Impostazioni → Wire EDM → Velocità di taglio.
        </p>
      )}

      {showDxfModal && (
        <div className="fixed inset-0 bg-gray-900/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" /> Carica DXF per fase EDM
              </h3>
              <button
                onClick={() => { setShowDxfModal(false); setPendingDxf(null) }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs text-muted-foreground mb-3">
                I profili selezionati popolano <span className="font-medium">lunghezza taglio</span> e
                <span className="font-medium"> N° pierce</span> della fase.
                Altezza pezzo e ciclo restano da inserire qui sotto.
              </p>
              <DxfProfilePicker onChange={setPendingDxf} viewerHeight={360} />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50">
              <Button variant="outline" onClick={() => { setShowDxfModal(false); setPendingDxf(null) }}>
                Annulla
              </Button>
              <Button
                onClick={confirmDxf}
                disabled={!pendingDxf || pendingDxf.selectedIds.length === 0 || submitting}
              >
                {submitting ? 'Salvataggio...' : 'Importa selezione'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
