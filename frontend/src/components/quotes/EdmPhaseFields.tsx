import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Zap, Unlock, FileText, X, Paperclip, Edit3 } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { Phase, CuttingCycle } from '@/types'
import { parseDecimal } from '@/lib/decimalInput'
import DxfProfilePicker, { type DxfPickerState } from '@/components/quotes/Dxf/DxfProfilePicker'
import Dxf2dReselectModal, { type ReselectResult } from '@/components/quotes/Dxf/Dxf2dReselectModal'

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
  /** Dimensioni X/Y del grezzo della parte: passate al viewer DXF per
   *  disegnare un rettangolo tratteggiato attorno ai profili. */
  partRawXmm?: number
  partRawYmm?: number
  /** ID del PartFile DXF già allegato alla parte. Se presente + la fase ha
   *  dxf_profile_ids non vuoto, il bottone "DXF" apre il modale di
   *  re-selezione (niente re-upload del file). */
  partDxfFileId?: number
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
  /** Save sincrono (PUT + recalc) per campi critici come il ciclo di taglio:
   *  l'utente vede subito le ore EDM aggiornate senza dover spostare il focus. */
  onSaveImmediate?: (updates: Partial<Phase>) => Promise<void> | void
}

/** Campi extra per fasi Wire EDM: lunghezza profilo, altezza, ciclo, n_pierce.
 * Quando i 3 campi obbligatori sono valorizzati, il backend ricalcola
 * automaticamente cycle_hours_per_part (edmAuto = true).
 */
export default function EdmPhaseFields({ phase, edmAuto, cuttingCycles, partId, defaultCutHeightMm, partHasRawStock, partRawXmm, partRawYmm, partDxfFileId, suggestedMachineId, onReload, onChange, onBlur, onUnlockManual, onPatch, onSaveImmediate }: Props) {
  const [showDxfModal, setShowDxfModal] = useState(false)
  const [showReselectModal, setShowReselectModal] = useState(false)
  const [pendingDxf, setPendingDxf] = useState<DxfPickerState | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Modalità "modifica selezione" disponibile quando la fase ha già profili e
  // un DXF allegato: si riapre la stessa scelta senza ricaricare il file.
  const canReselect = !!partDxfFileId && (phase.dxf_profile_ids?.length ?? 0) > 0

  const handleReselectConfirm = async (r: ReselectResult) => {
    if (!phase.id) return
    const updates: Partial<Phase> = {
      cut_length_mm: Math.round(r.selectedLengthMm * 100) / 100,
      dxf_profile_ids: r.selectedIds,
    }
    // Aggiorna n_pierce solo se nullo/zero: l'utente potrebbe averlo già
    // ritoccato manualmente — evitiamo di sovrascrivere il valore custom.
    if (phase.n_pierce == null || phase.n_pierce === 0) {
      updates.n_pierce = r.selectedClosedCount
    }
    try {
      await api.put<Phase>(`/phases/${phase.id}`, { ...phase, ...updates })
    } catch {
      toast.error('Errore nel salvataggio della fase')
      return
    }
    if (onReload) onReload()
    else if (onPatch) onPatch(updates)
    toast.success(`${r.selectedIds.length} profili aggiornati (${updates.cut_length_mm} mm)`)
    setShowReselectModal(false)
  }

  const confirmDxf = async () => {
    if (!pendingDxf || pendingDxf.selectedIds.length === 0) {
      toast.error('Seleziona almeno un profilo')
      return
    }
    setSubmitting(true)
    try {
      // 1. Allega il DXF al pezzo. Se fallisce abortiamo: senza il file
      //    allegato i `dxf_profile_ids` salvati sulla fase puntano a
      //    "fantasmi" (la fase ha i profili ma la parte non ha più il DXF
      //    sorgente — riapertura del modale impossibile).
      if (partId) {
        try {
          const fd = new FormData()
          fd.append('file', pendingDxf.file)
          await api.post(`/parts/${partId}/files`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        } catch {
          toast.error('Allegato DXF non salvato — riprova (la fase NON è stata modificata)')
          return
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
    <div className="rounded-md border border-warning/30 bg-warning/[0.12] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
          <Zap className="w-3.5 h-3.5" />
          Parametri taglio EDM
          {edmAuto && <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-warning/25 text-warning">auto</span>}
          {phase.dxf_profile_ids && phase.dxf_profile_ids.length > 0 && (
            <span
              className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-primary/10 text-primary"
              title="Profili importati da DXF — riapri 'Carica da DXF' per cambiare selezione"
            >
              <Paperclip className="w-3 h-3" /> {phase.dxf_profile_ids.length} profili DXF
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {canReselect ? (
            <button
              type="button"
              onClick={() => setShowReselectModal(true)}
              className="flex items-center gap-1 text-[11px] text-warning hover:underline"
              title="Riapri la selezione dei profili sul DXF già allegato"
            >
              <Edit3 className="w-3 h-3" /> Modifica selezione DXF
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowDxfModal(true)}
              className="flex items-center gap-1 text-[11px] text-warning hover:underline"
              title="Carica un DXF per popolare lunghezza profilo e numero pierce"
            >
              <FileText className="w-3 h-3" /> Carica da DXF
            </button>
          )}
          {edmAuto && (
            <button
              type="button"
              onClick={onUnlockManual}
              className="flex items-center gap-1 text-[11px] text-warning hover:underline"
              title="Sblocca per inserire le ore manualmente"
            >
              <Unlock className="w-3 h-3" /> Modifica manualmente
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Lunghezza profilo (mm)</label>
          <Input onFocus={e => e.currentTarget.select()} type="number" step="1" min="0" className="mt-1 h-9 text-sm"
            value={phase.cut_length_mm ?? ''}
            placeholder="es. 320"
            onChange={e => onChange('cut_length_mm', e.target.value === '' ? null : parseDecimal(e.target.value))}
            onBlur={onBlur} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Altezza pezzo (mm)</label>
          <Input onFocus={e => e.currentTarget.select()} type="number" step="0.5" min="0" className="mt-1 h-9 text-sm"
            value={phase.cut_height_mm ?? ''}
            placeholder="es. 40"
            onChange={e => onChange('cut_height_mm', e.target.value === '' ? null : parseDecimal(e.target.value))}
            onBlur={onBlur} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Ciclo di taglio</label>
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={phase.cutting_cycle_id ?? ''}
            onChange={e => {
              const value = e.target.value === '' ? null : Number(e.target.value)
              // Save immediato: il backend ricalcola cycle_hours_per_part e
              // l'UI rimane allineata senza dover triggerare onBlur.
              if (onSaveImmediate) onSaveImmediate({ cutting_cycle_id: value })
              else onChange('cutting_cycle_id', value)
            }}
            onBlur={onBlur}
          >
            <option value="">— scegli ciclo —</option>
            {cuttingCycles.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.passes.length} passate)</option>
            ))}
          </select>
          {cuttingCycles.length === 0 && (
            <p className="text-[10px] text-warning mt-0.5">
              Configura i cicli in Impostazioni → Wire EDM
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">N° pierce (fori partenza)</label>
          <Input onFocus={e => e.currentTarget.select()} type="number" step="1" min="0" className="mt-1 h-9 text-sm"
            value={phase.n_pierce ?? ''}
            placeholder="0"
            onChange={e => onChange('n_pierce', e.target.value === '' ? null : parseInt(e.target.value, 10))}
            onBlur={onBlur} />
        </div>
      </div>

      {showReselectModal && partDxfFileId && (
        <Dxf2dReselectModal
          partFileId={partDxfFileId}
          initialSelectedIds={phase.dxf_profile_ids ?? []}
          rawX={partRawXmm}
          rawY={partRawYmm}
          onClose={() => setShowReselectModal(false)}
          onConfirm={handleReselectConfirm}
        />
      )}

      {showDxfModal && (
        <div className="fixed inset-0 bg-gray-900/70 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" /> Carica DXF per fase EDM
              </h3>
              <button
                onClick={() => { setShowDxfModal(false); setPendingDxf(null) }}
                className="p-1 hover:bg-muted rounded"
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
              <DxfProfilePicker onChange={setPendingDxf} viewerHeight={360} rawX={partRawXmm} rawY={partRawYmm} />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-muted">
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
