import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Zap, Unlock, FileText, X, Paperclip } from 'lucide-react'
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
  /** Altezza grezzo della parte (raw_z_mm). Suggerita come cut_height_mm
   *  quando si conferma il DXF e cut_height_mm è ancora vuoto. */
  defaultCutHeightMm?: number
  /** Se true, la parte ha già un grezzo (X+Y o Ø): non sovrascrivere con la
   *  bbox del DXF. */
  partHasRawStock?: boolean
  /** ID di una macchina wire_edm attiva (la prima trovata). Usato come
   *  fallback se la fase non ha machine_id al momento del confirm DXF —
   *  senza macchina la tariffa oraria è 0 e il costo non viene calcolato. */
  suggestedMachineId?: number
  /** Callback per ricaricare la parte dal backend dopo aver aggiornato il
   *  grezzo (raw_x_mm/raw_y_mm) — così PartCard rinfresca la UI. */
  onReload?: () => void
  onChange: (field: keyof Phase, value: Phase[keyof Phase]) => void
  onBlur: () => void
  onUnlockManual: () => void
  /** Aggiornamento atomico di più campi nello state locale del PhaseEditor.
   *  Usato dalla modale DXF per allineare lo state dopo la save sincrona. */
  onPatch?: (updates: Partial<Phase>) => void
}

/** Campi extra per fasi Wire EDM: lunghezza profilo, altezza, ciclo, n_pierce.
 * Quando i 3 campi obbligatori sono valorizzati, il backend ricalcola
 * automaticamente cycle_hours_per_part (edmAuto = true).
 */
export default function EdmPhaseFields({ phase, edmAuto, cuttingCycles, partId, defaultCutHeightMm, partHasRawStock, suggestedMachineId, onReload, onChange, onBlur, onUnlockManual, onPatch }: Props) {
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
      // 1. Allega il DXF al pezzo (best-effort).
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

      // 2. Costruisci gli updates per la fase.
      const updates: Partial<Phase> = {
        cut_length_mm: Math.round(pendingDxf.selectedLengthMm * 100) / 100,
        dxf_profile_ids: pendingDxf.selectedIds,
      }
      if (phase.n_pierce == null || phase.n_pierce === 0) {
        updates.n_pierce = pendingDxf.selectedClosedCount
      }
      if ((phase.cut_height_mm == null || phase.cut_height_mm === 0) && defaultCutHeightMm) {
        updates.cut_height_mm = defaultCutHeightMm
      }
      // Suggerisci una macchina wire_edm se la fase non ne ha una: senza
      // machine_id la tariffa è 0 → calculated_cost resta 0 anche con ore.
      if (!phase.machine_id && suggestedMachineId) {
        updates.machine_id = suggestedMachineId
      }

      // 3. Save SINCRONA della fase via API. Non deleghiamo a savePhase via
      //    onBlur(): la sua closure su `phases` legge il valore PRE-patch
      //    (race con setState non ancora flushato) e finirebbe per inviare
      //    al backend i campi vecchi, sovrascrivendo lo state pendente.
      if (phase.id) {
        try {
          await api.put<Phase>(`/phases/${phase.id}`, { ...phase, ...updates })
        } catch {
          toast.error('Errore nel salvataggio della fase')
          return
        }
      }

      // 4. Aggiorna il grezzo della parte se non è ancora stato impostato.
      if (partId && !partHasRawStock) {
        const bbox = pendingDxf.analysis.bbox_global
        if (bbox.w > 0 && bbox.h > 0) {
          try {
            await api.put(`/parts/${partId}`, {
              raw_x_mm: Math.ceil(bbox.w),
              raw_y_mm: Math.ceil(bbox.h),
            })
          } catch {
            toast.warning('Grezzo non aggiornato dalla bbox (compilalo manualmente)')
          }
        }
      }

      // 5. Reload completo dal backend: l'unico modo robusto di tornare allo
      //    stato coerente. Fallback a onPatch solo se onReload non disponibile
      //    (caso edge — copre comunque i campi della fase, nuovo grezzo perso).
      if (onReload) {
        onReload()
      } else if (onPatch) {
        onPatch(updates)
      }

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
          {phase.dxf_profile_ids && phase.dxf_profile_ids.length > 0 && (
            <span
              className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700"
              title="Profili importati da DXF — riapri 'Carica da DXF' per cambiare selezione"
            >
              <Paperclip className="w-3 h-3" /> {phase.dxf_profile_ids.length} profili DXF
            </span>
          )}
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
