import { useState, useEffect } from 'react'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import api from '@/lib/api'
import { parseDecimal } from '@/lib/decimalInput'
import { hoursToMinutes, minutesToHours } from '@/lib/timeUnits'
import type { Part, Phase, Machine, Treatment, Supplier, CuttingCycle, WorkflowTemplate, Operation } from '@/types'
import { calcTreatmentCost, calcPhaseCost } from '@/lib/quoteCalc'
import { toast } from 'sonner'
import EdmPhaseFields from '@/components/quotes/EdmPhaseFields'
import { PhaseListView, type PhaseVM, type PhaseField, type SelectOption } from '@/components/quotes/PhaseListView'

const isWireEdmMachine = (p: Phase, machines: Machine[]) =>
  !!p.machine_id && machines.find(m => m.id === p.machine_id)?.machine_type === 'wire_edm'
const isEdmAuto = (p: Phase, machines: Machine[]) =>
  isWireEdmMachine(p, machines) && !!p.cut_length_mm && p.cut_length_mm > 0 && !!p.cut_height_mm && p.cut_height_mm > 0 && !!p.cutting_cycle_id

interface Props {
  partId?: number
  partMaterialId?: number | null
  phases: Phase[]
  quantity: number
  nParts?: number
  machines: Machine[]
  suppliers?: Supplier[]
  treatments?: Treatment[]
  finishedWeightKg?: number
  siblings?: Part[]
  partRawZmm?: number
  partRawXmm?: number
  partRawYmm?: number
  partRawDiameterMm?: number
  partDxfFileId?: number
  partHasRawStock?: boolean
  onReload?: () => void
  readOnly?: boolean
  onChange: (phases: Phase[]) => void
}

function calcPhase(phase: Phase, machines: Machine[], qty: number, nParts = 1): Phase {
  void nParts
  const machine = machines.find(m => m.id === phase.machine_id)
  const workRate = phase.hourly_rate_override ?? machine?.hourly_rate ?? 0
  const setupRate = (machine?.setup_hourly_rate != null) ? machine.setup_hourly_rate : workRate
  const calculated_cost = calcPhaseCost({
    setup_hours: phase.setup_hours, cycle_hours_per_part: phase.cycle_hours_per_part,
    fixed_cost: phase.fixed_cost, variable_cost_per_part: phase.variable_cost_per_part,
    work_rate: workRate, setup_rate: setupRate, qty,
  })
  return { ...phase, calculated_cost }
}

export default function PhaseEditor({
  partId, partMaterialId, phases, quantity, nParts = 1, machines, suppliers = [], treatments = [],
  finishedWeightKg, siblings = [], partRawZmm, partRawXmm, partRawYmm, partRawDiameterMm,
  partDxfFileId, partHasRawStock, onReload, readOnly = false, onChange,
}: Props) {
  const siblingsByTreatmentAndMaterial = (treatmentId: number) =>
    siblings.flatMap(p =>
      p.material_id === partMaterialId && p.phases.some(ph => ph.treatment_id === treatmentId)
        ? [{ finishedWeightKg: p.finished_weight_kg, qty: p.quantity || 1, raw_x_mm: p.raw_x_mm, raw_y_mm: p.raw_y_mm, raw_z_mm: p.raw_z_mm, raw_diameter_mm: p.raw_diameter_mm }]
        : []
    )
  const partDims = { raw_x_mm: partRawXmm, raw_y_mm: partRawYmm, raw_z_mm: partRawZmm, raw_diameter_mm: partRawDiameterMm }

  const [cuttingCycles, setCuttingCycles] = useState<CuttingCycle[]>([])
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  // AUD-8/9: gate di conferma per le azioni distruttive (elimina fase, sblocco
  // EDM manuale, sostituzione fasi da flusso). Sostituisce i confirm() nativi.
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string; description: string; confirmLabel: string
    variant?: 'default' | 'destructive'; run: () => void
  } | null>(null)

  useEffect(() => {
    const devWarn = (label: string) => (e: unknown) => { if (import.meta.env.DEV) console.warn(`[PhaseEditor] load ${label} failed`, e) }
    api.get('/cutting-cycles').then(r => setCuttingCycles(r.data)).catch(devWarn('cutting-cycles'))
    api.get('/workflow-templates').then(r => setWorkflows(r.data)).catch(devWarn('workflow-templates'))
    api.get('/operations?active=true').then(r => setOperations(r.data)).catch(devWarn('operations'))
  }, [])

  // Ricalcolo locale delle fasi quando cambiano gli input che influenzano il
  // costo (qty/peso/nParts) o quando arrivano i cataloghi.
  // ⚠️ BUG STORICO (fix): il catalogo macchine si carica in parallelo al
  // preventivo; se questo effect gira PRIMA che `machines` sia popolato,
  // calcPhase userebbe rate 0 e AZZEREBBE il costo di tutte le fasi macchina
  // (le ore restano scritte ma il € va a 0) — e non si ripristinava più perché
  // `machines` non era nelle deps. Fix: skip finché il catalogo è vuoto +
  // `machines`/`treatments` nelle deps così rifira quando arrivano.
  useEffect(() => {
    if (!machines.length) return
    const updated = phases.map(ph => {
      let next = ph
      if (ph.treatment_id) {
        const t = treatments.find(t => t.id === ph.treatment_id)
        if (t) next = { ...ph, variable_cost_per_part: calcTreatmentCost(t, finishedWeightKg, quantity, siblingsByTreatmentAndMaterial(t.id), partDims) }
      }
      return calcPhase(next, machines, quantity, nParts)
    })
    const changed = updated.some((ph, i) => ph.calculated_cost !== phases[i].calculated_cost || ph.variable_cost_per_part !== phases[i].variable_cost_per_part)
    if (changed) onChange(updated)
  }, [finishedWeightKg, quantity, nParts, machines, treatments]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── mutazioni (invariate) ─────────────────────────────────────────────────
  const updateField = (idx: number, field: keyof Phase, value: Phase[keyof Phase]) =>
    onChange(phases.map((p, i) => i !== idx ? p : calcPhase({ ...p, [field]: value }, machines, quantity, nParts)))
  const updateMany = (idx: number, updates: Partial<Phase>) =>
    onChange(phases.map((p, i) => i !== idx ? p : calcPhase({ ...p, ...updates }, machines, quantity, nParts)))

  // Ritorna true se il salvataggio è andato a buon fine. Su errore fa il
  // toast e ricarica dal server (fonte di verità = revert dell'anteprima
  // ottimistica). Il booleano serve ai chiamanti che devono agire solo su
  // successo (es. changeTreatment, per non ricaricare due volte).
  const saveImmediate = async (idx: number, updates: Partial<Phase>): Promise<boolean> => {
    const current = phases[idx]
    updateMany(idx, updates)
    if (!current.id) return true
    try {
      const res = await api.put<Phase>(`/phases/${current.id}`, { ...current, ...updates })
      const saved = res.data
      updateMany(idx, { ...updates, cycle_hours_per_part: saved.cycle_hours_per_part, calculated_cost: saved.calculated_cost })
      return true
    } catch { toast.error('Errore nel salvataggio della fase'); onReload?.(); return false }
  }

  const savePhase = async (idx: number) => {
    const phase = phases[idx]
    if (!phase.id) return
    try {
      const res = await api.put(`/phases/${phase.id}`, phase)
      const saved: Phase = res.data
      onChange(phases.map((p, i) => i !== idx ? p : calcPhase({ ...p, cycle_hours_per_part: saved.cycle_hours_per_part, calculated_cost: saved.calculated_cost }, machines, quantity, nParts)))
      if (phase.treatment_id && onReload) onReload()
    } catch { toast.error('Errore nel salvataggio della fase'); onReload?.() }
  }

  const addPhase = async () => {
    const seq = (phases.length + 1) * 10
    const newPhase: Phase = { sequence_number: seq, phase_type: '', description: '', setup_hours: 0.5, cycle_hours_per_part: 0.25, fixed_cost: 0, variable_cost_per_part: 0, calculated_cost: 0 }
    if (partId) {
      try {
        const res = await api.post(`/parts/${partId}/phases`, newPhase)
        onChange([...phases, calcPhase(res.data, machines, quantity, nParts)])
      } catch { toast.error("Errore nell'aggiunta della fase") }
    } else {
      onChange([...phases, calcPhase(newPhase, machines, quantity, nParts)])
    }
  }

  const removePhase = async (idx: number) => {
    const phase = phases[idx]
    if (phase.id) {
      try { await api.delete(`/phases/${phase.id}`) }
      catch { toast.error("Errore nell'eliminazione della fase"); return }
    }
    const remaining = phases.filter((_, i) => i !== idx).map((p, i) => ({ ...p, sequence_number: (i + 1) * 10 }))
    onChange(remaining)
    toast.success('Fase eliminata')
    if (partId && remaining.length > 0) {
      const ids = remaining.filter(p => p.id).map(p => p.id as number)
      if (ids.length > 0) api.post(`/parts/${partId}/phases/reorder`, ids).catch(() => toast.error('Errore nella rinumerazione delle fasi'))
    }
  }

  const unlockManualEdm = async (idx: number) => {
    const phase = phases[idx]
    const updates = { cut_length_mm: null, cut_height_mm: null, cutting_cycle_id: null, n_pierce: null }
    if (phase.id) {
      try { await api.put(`/phases/${phase.id}`, { ...phase, ...updates }); if (onReload) onReload(); else updateMany(idx, updates) }
      catch { toast.error('Errore nello sblocco') }
    } else { updateMany(idx, updates) }
  }

  const changeTreatment = async (idx: number, treatmentId: number | undefined) => {
    const phase = phases[idx]
    let updates: Partial<Phase>
    if (!treatmentId) {
      // null esplicito, NON undefined: JSON.stringify scarta le chiavi undefined
      // e col backend exclude_unset il treatment_id NON verrebbe azzerato
      // (trattamento fantasma con costi a 0). Vedi supplier_id, stesso pattern.
      updates = { treatment_id: null, fixed_cost: 0, variable_cost_per_part: 0 }
    } else {
      const t = treatments.find(t => t.id === treatmentId); if (!t) return
      const varCost = calcTreatmentCost(t, finishedWeightKg, quantity, [], partDims)
      updates = { treatment_id: treatmentId, fixed_cost: t.supplier?.shipping_cost || 0, variable_cost_per_part: varCost, description: phase.description || t.name, supplier_id: t.supplier_id ?? phase.supplier_id }
    }
    // Ricarica SOLO su successo: cambiare trattamento tocca le aggregazioni di
    // batch/spedizione tra le parti sorelle, quindi il reload riallinea l'intero
    // preventivo. Su errore saveImmediate ha già ricaricato (revert) → così si
    // evita il doppio reload.
    const ok = await saveImmediate(idx, updates)
    if (ok) onReload?.()
  }

  const applyWorkflow = async (wf: WorkflowTemplate) => {
    if (!partId) { toast.error('Salva prima il preventivo per applicare un flusso'); return }
    if (wf.steps.length === 0) { toast.error('Il flusso non ha fasi'); return }
    try {
      await api.post(`/parts/${partId}/apply-workflow/${wf.id}`)
      toast.success(`${wf.steps.length} fasi caricate da "${wf.name}"`)
      onReload?.()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || "Errore nell'applicazione del flusso")
    }
  }

  const reorder = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return
    const reordered = [...phases]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const updated = reordered.map((p, i) => ({ ...p, sequence_number: (i + 1) * 10 }))
    onChange(updated)
    if (partId) {
      const ids = updated.filter(p => p.id).map(p => p.id as number)
      try { await api.post(`/parts/${partId}/phases/reorder`, ids) } catch { toast.error('Errore nel riordino delle fasi') }
    }
  }

  // ─── mappatura VM ──────────────────────────────────────────────────────────
  const vmId = (p: Phase, i: number) => p.id ?? -(i + 1)
  const idxById = (id: number) => phases.findIndex((p, i) => vmId(p, i) === id)
  const phaseLabel = (phase: Phase) => {
    if (phase.operation_id) { const op = operations.find(o => o.id === phase.operation_id); if (op) return op.name }
    return phase.description || '—'
  }

  const batchInfo = (phase: Phase) => {
    const selectedTreatment = treatments.find(t => t.id === phase.treatment_id)
    const myBatchWeight = (finishedWeightKg || 0) * quantity
    const sibsBatchWeight = phase.treatment_id ? siblingsByTreatmentAndMaterial(phase.treatment_id).reduce((s, x) => s + (x.finishedWeightKg || 0) * Math.max(x.qty, 1), 0) : 0
    const totalBatchWeight = myBatchWeight + sibsBatchWeight
    const weightThresholdActive = selectedTreatment?.minimum_weight_kg != null && selectedTreatment.minimum_weight_kg > 0 && totalBatchWeight < selectedTreatment.minimum_weight_kg
    const batchTotalCost = (selectedTreatment?.cost_per_kg ?? 0) * totalBatchWeight
    const showMinWarning = !!(phase.treatment_id != null && selectedTreatment && !weightThresholdActive && selectedTreatment.minimum_cost > 0 && batchTotalCost < selectedTreatment.minimum_cost)
    return { selectedTreatment, totalBatchWeight, weightThresholdActive, batchTotalCost, showMinWarning }
  }

  const vms: PhaseVM[] = phases.map((phase, i) => {
    const isTreatment = phase.treatment_id != null
    const info = batchInfo(phase)
    const machineName = machines.find(m => m.id === phase.machine_id)?.name
    const subtitle = isTreatment
      ? `Trattamento${info.selectedTreatment?.supplier?.name ? ` · ${info.selectedTreatment.supplier.name}` : ''}`
      : machineName
    return {
      id: vmId(phase, i),
      sequence_number: phase.sequence_number,
      title: phaseLabel(phase),
      subtitle,
      calculatedCost: phase.calculated_cost,
      belowMinimum: info.showMinWarning || info.weightThresholdActive,
      isTreatment,
      isWireEdm: isWireEdmMachine(phase, machines),
      operationId: phase.operation_id != null ? String(phase.operation_id) : '',
      machineId: phase.machine_id != null ? String(phase.machine_id) : '',
      treatmentId: phase.treatment_id != null ? String(phase.treatment_id) : '',
      supplierId: phase.supplier_id != null ? String(phase.supplier_id) : '',
      description: phase.description ?? '',
      setupMinutes: phase.setup_hours != null ? String(hoursToMinutes(phase.setup_hours)) : '',
      cycleMinutes: phase.cycle_hours_per_part != null ? String(hoursToMinutes(phase.cycle_hours_per_part)) : '',
      cycleAuto: isEdmAuto(phase, machines),
      fixedCost: phase.fixed_cost != null ? String(phase.fixed_cost) : '',
      variableCostPerPart: phase.variable_cost_per_part != null ? String(phase.variable_cost_per_part) : '',
      hourlyRateOverride: phase.hourly_rate_override != null ? String(phase.hourly_rate_override) : '',
    }
  })

  // Opzioni = attivi ∪ voci referenziate dalle fasi (anche se ritirate dal
  // catalogo), così una macchina/lavorazione/trattamento ritirato ma ancora
  // usato resta visibile e la label si risolve.
  function mergeOpts<T extends { id: number }>(active: T[], referenced: (T | null | undefined)[], label: (t: T) => string): SelectOption[] {
    const map = new Map<number, T>()
    active.forEach(t => map.set(t.id, t))
    referenced.forEach(t => { if (t && !map.has(t.id)) map.set(t.id, t) })
    return Array.from(map.values()).map(t => ({ value: String(t.id), label: label(t) })).sort((a, b) => a.label.localeCompare(b.label, 'it'))
  }
  const operationOpts = mergeOpts(operations, phases.map(p => p.operation), o => o.name)
  const machineOpts = mergeOpts(machines, phases.map(p => p.machine), m => `${m.name} (${m.hourly_rate.toFixed(0)} €/h)`)
  const treatmentOpts = mergeOpts(treatments, phases.map(p => p.treatment), t => `${t.name}${t.cost_per_kg ? ` — ${t.cost_per_kg} €/kg` : ''}`)
  const supplierOpts = mergeOpts(suppliers, phases.map(p => p.supplier), s => s.name)
  const workflowOpts: SelectOption[] = workflows.map(w => ({ value: String(w.id), label: `${w.name} (${w.steps.length} fasi)` }))

  const onFieldChange = (id: number, field: PhaseField, val: string) => {
    const idx = idxById(id); if (idx < 0) return
    switch (field) {
      case 'operationId': {
        const newOpId = val === '' ? null : Number(val)
        const op = newOpId ? operations.find(o => o.id === newOpId) : null
        const cur = phases[idx]
        const updates: Partial<Phase> = { operation_id: newOpId }
        if (op && (!cur.description || cur.description.trim() === '')) updates.description = op.name
        saveImmediate(idx, updates); break
      }
      case 'machineId': saveImmediate(idx, { machine_id: val ? Number(val) : undefined }); break
      case 'treatmentId': changeTreatment(idx, val ? Number(val) : undefined); break
      // null (non undefined): il backend usa exclude_unset, quindi per SVUOTARE
      // il fornitore va inviato esplicitamente null (undefined verrebbe omesso).
      case 'supplierId': saveImmediate(idx, { supplier_id: val ? Number(val) : null }); break
      case 'description': updateField(idx, 'description', val); break
    }
  }
  const onBlurField = (id: number) => { const idx = idxById(id); if (idx >= 0) savePhase(idx) }

  // Campi numerici: commit atomico al blur (evita il round-trip che strippava i
  // decimali). saveImmediate fa updateMany (anteprima) + PUT con l'override.
  const onFieldCommit = (id: number, field: PhaseField, raw: string) => {
    const idx = idxById(id); if (idx < 0) return
    switch (field) {
      case 'setupMinutes': saveImmediate(idx, { setup_hours: minutesToHours(parseDecimal(raw)) }); break
      case 'cycleMinutes': saveImmediate(idx, { cycle_hours_per_part: minutesToHours(parseDecimal(raw)) }); break
      case 'fixedCost': saveImmediate(idx, { fixed_cost: parseDecimal(raw) || 0 }); break
      case 'variableCostPerPart': saveImmediate(idx, { variable_cost_per_part: parseDecimal(raw) || 0 }); break
      case 'hourlyRateOverride': saveImmediate(idx, { hourly_rate_override: raw === '' ? undefined : parseDecimal(raw) }); break
    }
  }

  const renderEdm = (id: number) => {
    const idx = idxById(id); if (idx < 0) return null
    const phase = phases[idx]
    return (
      <EdmPhaseFields
        phase={phase}
        edmAuto={isEdmAuto(phase, machines)}
        cuttingCycles={cuttingCycles}
        partId={partId}
        defaultCutHeightMm={partRawZmm}
        partHasRawStock={partHasRawStock}
        partRawXmm={partRawXmm}
        partRawYmm={partRawYmm}
        partDxfFileId={partDxfFileId}
        suggestedMachineId={machines.find(m => m.machine_type === 'wire_edm')?.id}
        onReload={onReload}
        onChange={(field, value) => updateField(idx, field, value)}
        onBlur={() => savePhase(idx)}
        onUnlockManual={() => setPendingConfirm({ title: 'Sbloccare i campi EDM manuali?', description: 'I valori calcolati da DXF (lunghezza, altezza, ciclo, fori) verranno azzerati: potrai inserirli a mano.', confirmLabel: 'Sblocca', variant: 'destructive', run: () => unlockManualEdm(idx) })}
        onPatch={(updates) => updateMany(idx, updates)}
        onSaveImmediate={(updates) => { void saveImmediate(idx, updates) }}
      />
    )
  }

  const renderTreatmentInfo = (id: number) => {
    const idx = idxById(id); if (idx < 0) return null
    const phase = phases[idx]
    const info = batchInfo(phase); const t = info.selectedTreatment
    return (
      <div className="mt-2 space-y-0.5">
        {!finishedWeightKg && phase.treatment_id && (
          <p className="text-[11px] font-medium text-warning">⚠ Inserisci il peso finito nella scheda pezzo</p>
        )}
        {info.weightThresholdActive && t && (
          <p className="text-[11px] font-medium text-warning">⚠ Lotto sotto soglia ({info.totalBatchWeight.toFixed(2)} kg &lt; {t.minimum_weight_kg} kg) — costo minimo applicato</p>
        )}
        {info.showMinWarning && t && (
          <p className="text-[11px] font-medium text-warning">⚠ Sotto il minimo ({t.minimum_cost.toFixed(2)} €)</p>
        )}
        {t && info.totalBatchWeight > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Batch: {info.totalBatchWeight.toFixed(2)} kg{' '}
            {info.weightThresholdActive
              ? `→ forfait ${t.minimum_cost.toFixed(2)} €`
              : `× ${(t.cost_per_kg ?? 0).toFixed(2)} €/kg = ${info.batchTotalCost.toFixed(2)} €`}
            {' '}(quota tua: {(phase.variable_cost_per_part * quantity).toFixed(2)} €)
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <PhaseListView
        phases={vms}
        locked={readOnly}
        workflowTemplates={partId ? workflowOpts : []}
        operations={operationOpts}
        machines={machineOpts}
        treatments={treatmentOpts}
        suppliers={supplierOpts}
        onAdd={addPhase}
        onApplyTemplate={(tid) => {
          const wf = workflows.find(w => String(w.id) === tid); if (!wf) return
          if (phases.length > 0) setPendingConfirm({
            title: 'Sostituire le fasi esistenti?',
            description: `Applicare "${wf.name}" sostituirà le ${phases.length} fasi esistenti con le ${wf.steps.length} del flusso.`,
            confirmLabel: 'Applica flusso', variant: 'destructive', run: () => applyWorkflow(wf),
          })
          else applyWorkflow(wf)
        }}
        onChange={onFieldChange}
        onCommitField={onFieldCommit}
        onBlurField={onBlurField}
        onDelete={(id) => { const idx = idxById(id); if (idx >= 0) setPendingConfirm({ title: 'Eliminare la fase?', description: 'La fase verrà rimossa dalla parte.', confirmLabel: 'Elimina', variant: 'destructive', run: () => removePhase(idx) }) }}
        onReorder={(fromId, toId) => { const f = idxById(fromId), t = idxById(toId); if (f >= 0 && t >= 0) reorder(f, t) }}
        renderEdm={renderEdm}
        renderTreatmentInfo={renderTreatmentInfo}
      />
      <ConfirmDialog
        open={pendingConfirm !== null}
        variant={pendingConfirm?.variant ?? 'default'}
        title={pendingConfirm?.title ?? ''}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel ?? 'Conferma'}
        onConfirm={() => { const p = pendingConfirm; setPendingConfirm(null); p?.run() }}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  )
}
