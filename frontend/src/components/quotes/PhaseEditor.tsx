import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import api from '@/lib/api'
import { parseDecimal } from '@/lib/decimalInput'
import type { Part, Phase, Machine, Treatment, Supplier, CuttingCycle, WorkflowTemplate, Operation } from '@/types'
import { buildCatalogOptions } from '@/lib/catalogSelect'
import { calcTreatmentCost, calcPhaseCost } from '@/lib/quoteCalc'
import { toast } from 'sonner'
import EdmPhaseFields from '@/components/quotes/EdmPhaseFields'

// L'autocalc EDM si attiva quando la macchina è di tipo wire_edm
// (machine_type) + i 3 campi obbligatori sono popolati. Nessuna dipendenza
// dal nome della Lavorazione (Operation libera dall'utente).
const isWireEdmMachine = (p: Phase, machines: Machine[]) =>
  !!p.machine_id && machines.find(m => m.id === p.machine_id)?.machine_type === 'wire_edm'

const isEdmAuto = (p: Phase, machines: Machine[]) =>
  isWireEdmMachine(p, machines) &&
  !!p.cut_length_mm && p.cut_length_mm > 0 &&
  !!p.cut_height_mm && p.cut_height_mm > 0 &&
  !!p.cutting_cycle_id

interface Props {
  partId?: number
  /** Material della parte corrente. Il batch trattamento è aggregato per
   *  (treatment_id, material_id) — materiali diversi = batch separati per
   *  il fornitore (caratteristiche fisiche diverse). Gemello del backend
   *  calculation.py:188-198. */
  partMaterialId?: number | null
  phases: Phase[]
  quantity: number
  nParts?: number
  machines: Machine[]
  suppliers?: Supplier[]
  treatments?: Treatment[]
  finishedWeightKg?: number
  /** Altre parti del quote (escluso self). Servono per aggregare i pesi
   *  per `(treatment_id, material_id)` nel preview live: il backend amortizza
   *  i batch trattamento solo tra parti con stesso trattamento E materiale. */
  siblings?: Part[]
  /** Altezza grezzo della parte (raw_z_mm). Se popolata, viene suggerita
   *  come `cut_height_mm` quando si carica un DXF su una fase EDM con
   *  altezza ancora vuota — niente sovrascrittura se già impostata. */
  partRawZmm?: number
  /** Dimensioni X/Y del grezzo della parte. Passate al viewer DXF per
   *  disegnare il rettangolo grezzo attorno ai profili. Servono anche al
   *  preview live dei trattamenti €/dm³ (volume = X×Y×Z). */
  partRawXmm?: number
  partRawYmm?: number
  /** Diametro del grezzo (per pezzi tondi). Serve al preview live dei
   *  trattamenti €/dm³ — volume cilindro π × r² × Z. */
  partRawDiameterMm?: number
  /** ID del PartFile DXF allegato alla parte (primo file_type='dxf'): abilita
   *  il bottone "Modifica selezione DXF" nella fase EDM. */
  partDxfFileId?: number
  /** True se la parte ha già un grezzo selezionato (X+Y o Ø): il modale DXF
   *  evita di sovrascrivere il grezzo con la bbox. */
  partHasRawStock?: boolean
  /** Ricarica la parte dal backend (es. dopo che il modale DXF ha
   *  aggiornato raw_x_mm/raw_y_mm). */
  onReload?: () => void
  readOnly?: boolean
  onChange: (phases: Phase[]) => void
}

// "Treatment phase" = ha treatment_id popolato. Niente più check su phase_type
// (oggi `description` è solo etichetta libera dell'utente).

function calcPhase(phase: Phase, machines: Machine[], qty: number, nParts = 1): Phase {
  // La formula pura vive in quoteCalc.calcPhaseCost (gemello DRY di
  // backend/services/calculation.py recalculate_part). Qui si risolvono solo
  // le tariffe dalla macchina: setup_rate da Machine.setup_hourly_rate (fallback
  // a hourly_rate se NULL); hourly_rate_override agisce SOLO sul ciclo.
  void nParts  // parità di firma col backend; is_shared rimosso, divisor = qty
  const machine = machines.find(m => m.id === phase.machine_id)
  const workRate = phase.hourly_rate_override ?? machine?.hourly_rate ?? 0
  const setupRate = (machine?.setup_hourly_rate != null) ? machine.setup_hourly_rate : workRate
  const calculated_cost = calcPhaseCost({
    setup_hours: phase.setup_hours,
    cycle_hours_per_part: phase.cycle_hours_per_part,
    fixed_cost: phase.fixed_cost,
    variable_cost_per_part: phase.variable_cost_per_part,
    work_rate: workRate,
    setup_rate: setupRate,
    qty,
  })
  return { ...phase, calculated_cost }
}

export default function PhaseEditor({ partId, partMaterialId, phases, quantity, nParts = 1, machines, suppliers = [], treatments = [], finishedWeightKg, siblings = [], partRawZmm, partRawXmm, partRawYmm, partRawDiameterMm, partDxfFileId, partHasRawStock, onReload, readOnly = false, onChange }: Props) {
  // Siblings filtrati per (treatment_id, material_id): batch separati per
  // materiale anche con stesso trattamento (caratteristiche fisiche
  // diverse). Gemello dell'aggregazione backend calculation.py:188-198.
  // Le dim del grezzo sono incluse: servono ai trattamenti €/dm³ (volume).
  const siblingsByTreatmentAndMaterial = (treatmentId: number) =>
    siblings.flatMap(p =>
      p.material_id === partMaterialId && p.phases.some(ph => ph.treatment_id === treatmentId)
        ? [{
            finishedWeightKg: p.finished_weight_kg,
            qty: p.quantity || 1,
            raw_x_mm: p.raw_x_mm, raw_y_mm: p.raw_y_mm,
            raw_z_mm: p.raw_z_mm, raw_diameter_mm: p.raw_diameter_mm,
          }]
        : []
    )
  // Dimensioni del grezzo della parte corrente — usate dal preview live dei
  // trattamenti €/dm³. Identico al `Part` lato backend per la formula del volume.
  const partDims = {
    raw_x_mm: partRawXmm, raw_y_mm: partRawYmm,
    raw_z_mm: partRawZmm, raw_diameter_mm: partRawDiameterMm,
  }
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [advancedIdx, setAdvancedIdx] = useState<Set<number>>(new Set())
  const [cuttingCycles, setCuttingCycles] = useState<CuttingCycle[]>([])
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([])
  const [operations, setOperations] = useState<Operation[]>([])

  useEffect(() => {
    // Tabelle ausiliarie: tabella vuota = HTTP 200 con []. Il .catch scatta
    // solo su veri errori (rete, 500, 401). Niente toast user-facing per
    // non spammare se il BE è giù — la UI degrada graceful (i dropdown
    // restano vuoti). DEV-only warning per facilitare il debug.
    const devWarn = (label: string) => (e: unknown) => {
      if (import.meta.env.DEV) console.warn(`[PhaseEditor] load ${label} failed`, e)
    }
    api.get('/cutting-cycles').then(r => setCuttingCycles(r.data)).catch(devWarn('cutting-cycles'))
    api.get('/workflow-templates').then(r => setWorkflows(r.data)).catch(devWarn('workflow-templates'))
    // CAT-1 Fase 2: solo lavorazioni attive nelle dropdown.
    api.get('/operations?active=true').then(r => setOperations(r.data)).catch(devWarn('operations'))
  }, [])

  // Quando cambia peso finito, quantità o nParts, ricalcola TUTTE le fasi:
  //  - treatment: variable_cost_per_part da calcTreatmentCost(weight × qty),
  //    poi calcPhase per il calculated_cost
  //  - non-treatment: solo calcPhase (setup_hours / divisor varia con qty)
  // Phases/treatments/machines/onChange sono volutamente fuori dalle deps: phases
  // viene ricreata ad ogni render del parent (riferimento nuovo) e onChange è una
  // callback inline; metterli causerebbe rerender continui. Il check `changed`
  // basato su calculated_cost evita loop comunque (idempotente se nulla cambia).
  useEffect(() => {
    const updated = phases.map(ph => {
      let next = ph
      if (ph.treatment_id) {
        const t = treatments.find(t => t.id === ph.treatment_id)
        if (t) {
          const varCost = calcTreatmentCost(t, finishedWeightKg, quantity, siblingsByTreatmentAndMaterial(t.id), partDims)
          next = { ...ph, variable_cost_per_part: varCost }
        }
      }
      return calcPhase(next, machines, quantity, nParts)
    })
    const changed = updated.some((ph, i) =>
      ph.calculated_cost !== phases[i].calculated_cost ||
      ph.variable_cost_per_part !== phases[i].variable_cost_per_part
    )
    if (changed) onChange(updated)
  }, [finishedWeightKg, quantity, nParts]) // eslint-disable-line react-hooks/exhaustive-deps

  const addPhase = async () => {
    // Numerazione progressiva basata sulla posizione: 10, 20, 30, … sempre.
    // Indipendente da gap o numerazioni anomale già presenti.
    const seq = (phases.length + 1) * 10
    const newPhase: Phase = {
      sequence_number: seq,
      phase_type: '',  // legacy column, non più usato dal cost engine
      description: '',
      setup_hours: 0.5,
      cycle_hours_per_part: 0.25,
      fixed_cost: 0,
      variable_cost_per_part: 0,
      calculated_cost: 0,
    }
    if (partId) {
      try {
        const res = await api.post(`/parts/${partId}/phases`, newPhase)
        const saved: Phase = res.data
        onChange([...phases, calcPhase(saved, machines, quantity, nParts)])
        setExpandedIdx(phases.length)
      } catch (e) {toast.error('Errore nell\'aggiunta della fase') }
    } else {
      onChange([...phases, calcPhase(newPhase, machines, quantity, nParts)])
      setExpandedIdx(phases.length)
    }
  }

  const removePhase = async (idx: number) => {
    const phase = phases[idx]
    if (phase.id) {
      try { await api.delete(`/phases/${phase.id}`) } catch (e) {toast.error('Errore nell\'eliminazione della fase') }
    }
    // Rinumera le fasi rimanenti come 10, 20, 30, … e persiste via reorder.
    const remaining = phases.filter((_, i) => i !== idx).map((p, i) => ({
      ...p, sequence_number: (i + 1) * 10,
    }))
    onChange(remaining)
    if (expandedIdx === idx) setExpandedIdx(null)
    if (partId && remaining.length > 0) {
      const ids = remaining.filter(p => p.id).map(p => p.id as number)
      if (ids.length > 0) {
        api.post(`/parts/${partId}/phases/reorder`, ids)
          .catch(() => toast.error('Errore nella rinumerazione delle fasi'))
      }
    }
  }

  const updateField = (idx: number, field: keyof Phase, value: Phase[keyof Phase]) => {
    onChange(phases.map((p, i) =>
      i !== idx ? p : calcPhase({ ...p, [field]: value }, machines, quantity, nParts)
    ))
  }

  const updateMany = (idx: number, updates: Partial<Phase>) => {
    onChange(phases.map((p, i) =>
      i !== idx ? p : calcPhase({ ...p, ...updates }, machines, quantity, nParts)
    ))
  }

  // Save sincrono per campi critici della fase EDM (es. cambio cutting_cycle_id):
  // 1) update locale ottimistic con `updates`,
  // 2) PUT al backend con payload completo,
  // 3) applica cycle_hours_per_part/calculated_cost ricalcolati dal BE.
  // NB: il secondo updateMany ri-include `updates`. La closure di `phases`
  // dentro updateMany è quella del momento di saveImmediate (stale dopo il
  // re-render del primo update), quindi senza ri-include perderemmo il
  // valore ottimistico (es. cutting_cycle_id tornerebbe al precedente).
  const saveImmediate = async (idx: number, updates: Partial<Phase>) => {
    const current = phases[idx]
    updateMany(idx, updates)
    if (!current.id) return
    try {
      const res = await api.put<Phase>(`/phases/${current.id}`, { ...current, ...updates })
      const saved: Phase = res.data
      updateMany(idx, {
        ...updates,
        cycle_hours_per_part: saved.cycle_hours_per_part,
        calculated_cost: saved.calculated_cost,
      })
    } catch {
      toast.error('Errore nel salvataggio della fase')
    }
  }

  const savePhase = async (idx: number) => {
    const phase = phases[idx]
    if (!phase.id) return
    try {
      const res = await api.put(`/phases/${phase.id}`, phase)
      // Il backend può ricalcolare cycle_hours_per_part (es. fase Wire EDM con dati EDM popolati).
      // Riportiamo nel state i campi calcolati lato server per tenerli allineati.
      const saved: Phase = res.data
      onChange(phases.map((p, i) =>
        i !== idx ? p : calcPhase({ ...p, cycle_hours_per_part: saved.cycle_hours_per_part, calculated_cost: saved.calculated_cost }, machines, quantity, nParts)
      ))
      // Trattamenti: il backend ridistribuisce il batch tra i siblings con
      // stesso (treatment_id, material_id). Senza reload, le altre parti
      // restano coi costi stantii fino al prossimo open. Cfr CLAUDE.md §9.
      if (phase.treatment_id && onReload) {
        onReload()
      }
    } catch (e) {toast.error('Errore nel salvataggio della fase') }
  }

  const unlockManualEdm = async (idx: number) => {
    const phase = phases[idx]
    const updates = {
      cut_length_mm: null,
      cut_height_mm: null,
      cutting_cycle_id: null,
      n_pierce: null,
    }
    // Save SINCRONA via API con il payload nuovo. setTimeout(savePhase) non
    // funzionerebbe: la closure di savePhase su `phases` punta al valore
    // pre-update (campi ancora popolati) → sovrascriverebbe lo sblocco.
    if (phase.id) {
      try {
        await api.put(`/phases/${phase.id}`, { ...phase, ...updates })
        if (onReload) onReload()
        else updateMany(idx, updates)
      } catch {
        toast.error('Errore nello sblocco')
      }
    } else {
      updateMany(idx, updates)
    }
  }

  const handleTreatmentSelect = (idx: number, treatmentId: number | undefined) => {
    const phase = phases[idx]
    if (!treatmentId) {
      updateMany(idx, { treatment_id: undefined, fixed_cost: 0, variable_cost_per_part: 0 })
      return
    }
    const t = treatments.find(t => t.id === treatmentId)
    if (!t) return
    const varCost = calcTreatmentCost(t, finishedWeightKg, quantity, [], partDims)
    const shippingCost = t.supplier?.shipping_cost || 0
    updateMany(idx, {
      treatment_id: treatmentId,
      fixed_cost: shippingCost,
      variable_cost_per_part: varCost,
      description: phase.description || t.name,
      supplier_id: t.supplier_id ?? phase.supplier_id,
    })
  }

  // Applica un Template flusso. CLEAN SLATE: sostituisce TUTTE le fasi
  // esistenti della parte con quelle del flusso.
  // Backend: POST /parts/:id/apply-workflow/:workflow_id (cancella + crea atomic).
  const applyWorkflow = async (wf: WorkflowTemplate) => {
    if (!partId) {
      toast.error('Salva prima il preventivo per applicare un flusso')
      return
    }
    if (wf.steps.length === 0) {
      toast.error('Il flusso non ha fasi')
      return
    }
    if (phases.length > 0) {
      const ok = confirm(
        `Applicare "${wf.name}" sostituirà le ${phases.length} fasi esistenti con le ${wf.steps.length} del flusso. Procedere?`
      )
      if (!ok) return
    }
    try {
      await api.post(`/parts/${partId}/apply-workflow/${wf.id}`)
      toast.success(`${wf.steps.length} fasi caricate da "${wf.name}"`)
      // Le fasi sono cambiate sul backend: chiediamo al parent un reload pieno.
      onReload?.()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nell\'applicazione del flusso')
    }
  }

  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const handleDrop = async (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return }
    const reordered = [...phases]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(targetIdx, 0, moved)
    const updated = reordered.map((p, i) => ({ ...p, sequence_number: (i + 1) * 10 }))
    onChange(updated)
    setDragIdx(null)
    if (partId) {
      const ids = updated.filter(p => p.id).map(p => p.id as number)
      try { await api.post(`/parts/${partId}/phases/reorder`, ids) } catch (e) {toast.error('Errore nel riordino delle fasi') }
    }
  }

  const toggleAdvanced = (idx: number) => {
    setAdvancedIdx(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  // Etichetta della fase: nome dalla Operation (FK), fallback su description.
  const phaseLabel = (phase: Phase) => {
    if (phase.operation_id) {
      const op = operations.find(o => o.id === phase.operation_id)
      if (op) return op.name
    }
    return phase.description || '—'
  }

  return (
    <fieldset disabled={readOnly} className="border-0 p-0 m-0 disabled:opacity-90">
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <CardTitle className="text-base">Ciclo di Lavorazione</CardTitle>
          <div className="flex items-center gap-2">
            {workflows.length > 0 && partId && (
              <select
                className="h-8 rounded-md border border-blue-200 bg-primary/10 px-2 text-xs"
                value=""
                onChange={e => {
                  const wf = workflows.find(w => w.id === Number(e.target.value))
                  if (wf) applyWorkflow(wf)
                }}
                title="Carica un flusso multi-fase: sostituisce le fasi esistenti"
              >
                <option value="">Da flusso...</option>
                {workflows.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.steps.length} fasi)</option>
                ))}
              </select>
            )}
            <Button size="sm" onClick={addPhase}>
              <Plus className="w-4 h-4 mr-1" /> Aggiungi Fase
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1.5">
          {phases.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessuna fase. Clicca "Aggiungi Fase" per iniziare.
            </p>
          )}
          {phases.map((phase, idx) => {
            const isTreatment = phase.treatment_id != null
            const selectedTreatment = treatments.find(t => t.id === phase.treatment_id)
            // Peso BATCH = peso questa parte + somma siblings con stesso
            // treatment_id (gemello DRY di calculation.py treatment_batch).
            // Senza l'aggregazione, il warning "lotto sotto soglia" appariva
            // anche se in commessa il batch totale superava il minimo.
            const myBatchWeight = (finishedWeightKg || 0) * quantity
            const sibsBatchWeight = phase.treatment_id
              ? siblingsByTreatmentAndMaterial(phase.treatment_id).reduce(
                  (s, x) => s + (x.finishedWeightKg || 0) * Math.max(x.qty, 1), 0)
              : 0
            const totalBatchWeight = myBatchWeight + sibsBatchWeight
            const weightThresholdActive = selectedTreatment?.minimum_weight_kg != null &&
              selectedTreatment.minimum_weight_kg > 0 &&
              totalBatchWeight < selectedTreatment.minimum_weight_kg
            // Costo totale del batch al €/kg (gemello del backend `cost_per_kg × batch_w`).
            // showMinWarning va confrontato sul TOTALE batch, non sulla quota di
            // singola parte: con 3 parti di 5/8/10 kg @ 2€/kg il batch è 46€,
            // sopra il minimo 20€, ma la quota della parte 1 (10€) era < 20€ →
            // warning errato. Cfr scenario C1 in CHECKLIST_PREVENTIVATORE.md.
            const batchTotalCost = (selectedTreatment?.cost_per_kg ?? 0) * totalBatchWeight
            const showMinWarning = isTreatment && selectedTreatment &&
              !weightThresholdActive &&
              selectedTreatment.minimum_cost > 0 &&
              batchTotalCost < selectedTreatment.minimum_cost

            return (
              <div
                key={phase.id ?? idx}
                className={`border rounded-lg overflow-hidden ${dragIdx !== null && dragIdx !== idx ? 'border-dashed border-blue-300' : ''}`}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
              >
                {/* Header row */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-muted cursor-pointer hover:bg-muted select-none"
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                >
                  <span
                    className="shrink-0 cursor-grab"
                    draggable
                    onDragStart={e => { e.stopPropagation(); setDragIdx(idx) }}
                    onClick={e => e.stopPropagation()}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                  </span>
                  <span className="text-xs font-mono w-6 text-muted-foreground">{phase.sequence_number}</span>
                  <span className="flex-1 text-sm font-medium truncate">
                    {phaseLabel(phase)}
                    {selectedTreatment && <span className="text-muted-foreground font-normal"> — {selectedTreatment.name}</span>}
                  </span>
                  {phase.description && !selectedTreatment && (
                    <span className="text-xs text-muted-foreground truncate max-w-32">{phase.description}</span>
                  )}
                  {showMinWarning && (
                    <span className="text-amber-500 text-xs shrink-0" title={`Sotto il minimo: ${selectedTreatment!.minimum_cost.toFixed(2)} €`}>⚠</span>
                  )}
                  <span className="text-sm font-semibold text-primary whitespace-nowrap">
                    {phase.calculated_cost.toFixed(2)} €/pz
                  </span>
                  <button onClick={e => { e.stopPropagation(); removePhase(idx) }} className="p-1 hover:bg-red-50 rounded ml-1">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                  {expandedIdx === idx
                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  }
                </div>

                {/* Expanded editor */}
                {expandedIdx === idx && (() => {
                  const isWireEdm = isWireEdmMachine(phase, machines)
                  const edmAuto = isEdmAuto(phase, machines)
                  return (
                  <div className="p-4 border-t bg-card space-y-3">
                    {/* Row 1: Tipo + Macchina/Fornitore + Descrizione */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Lavorazione</label>
                        <select
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={phase.operation_id ?? ''}
                          onChange={e => {
                            const newOpId = e.target.value === '' ? null : Number(e.target.value)
                            const updates: Partial<Phase> = { operation_id: newOpId }
                            // Auto-popola description con nome operation se vuota.
                            const op = newOpId ? operations.find(o => o.id === newOpId) : null
                            if (op && (!phase.description || phase.description.trim() === '')) {
                              updates.description = op.name
                            }
                            updateMany(idx, updates)
                          }}
                          onBlur={() => savePhase(idx)}
                        >
                          <option value="">— Scegli lavorazione —</option>
                          {buildCatalogOptions(operations, phase.operation_id, phase.operation, o => o.name).map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      {!isTreatment && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Macchina</label>
                          <select
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={phase.machine_id || ''}
                            onChange={e => updateField(idx, 'machine_id', Number(e.target.value) || undefined)}
                            onBlur={() => savePhase(idx)}
                          >
                            <option value="">Nessuna</option>
                            {buildCatalogOptions(
                              machines,
                              phase.machine_id,
                              phase.machine,
                              m => `${m.name} (${m.hourly_rate.toFixed(0)} €/h)`,
                            ).map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {isTreatment && treatments.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Trattamento</label>
                          <select
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={phase.treatment_id || ''}
                            onChange={e => handleTreatmentSelect(idx, Number(e.target.value) || undefined)}
                            onBlur={() => savePhase(idx)}
                          >
                            <option value="">Seleziona...</option>
                            {buildCatalogOptions(
                              treatments,
                              phase.treatment_id,
                              phase.treatment,
                              t => `${t.name}${t.cost_per_kg ? ` — ${t.cost_per_kg} €/kg` : ''}`,
                            ).map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          {!finishedWeightKg && phase.treatment_id && (
                            <p className="text-[10px] text-amber-600 mt-0.5">⚠ Inserisci il peso finito nella scheda pezzo</p>
                          )}
                          {weightThresholdActive && (
                            <p className="text-[10px] text-amber-600 mt-0.5">
                              ⚠ Lotto sotto soglia ({totalBatchWeight.toFixed(2)} kg {'<'} {selectedTreatment!.minimum_weight_kg} kg) — costo minimo applicato
                            </p>
                          )}
                          {showMinWarning && (
                            <p className="text-[10px] text-amber-600 mt-0.5">
                              ⚠ Sotto il minimo ({selectedTreatment!.minimum_cost.toFixed(2)} €)
                            </p>
                          )}
                          {/* Riepilogo batch: peso × cost/kg = totale, oppure forfait
                              se sotto soglia. Aiuta a capire perché scatta il forfait. */}
                          {selectedTreatment && totalBatchWeight > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Batch: {totalBatchWeight.toFixed(2)} kg
                              {weightThresholdActive
                                ? ` → forfait ${selectedTreatment.minimum_cost.toFixed(2)} €`
                                : ` × ${(selectedTreatment.cost_per_kg ?? 0).toFixed(2)} €/kg = ${batchTotalCost.toFixed(2)} €`}
                              {' '}(quota tua: {(phase.variable_cost_per_part * quantity).toFixed(2)} €)
                            </p>
                          )}
                        </div>
                      )}

                      {suppliers.length > 0 && phase.supplier_id != null && !isTreatment && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Fornitore</label>
                          <select
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={phase.supplier_id || ''}
                            onChange={e => updateField(idx, 'supplier_id', Number(e.target.value) || undefined)}
                            onBlur={() => savePhase(idx)}
                          >
                            <option value="">Nessuno</option>
                            {buildCatalogOptions(
                              suppliers,
                              phase.supplier_id,
                              phase.supplier,
                              s => s.name,
                            ).map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className={isTreatment ? 'col-span-2 md:col-span-1' : 'col-span-2 md:col-span-1'}>
                        <label className="text-xs font-medium text-muted-foreground">Descrizione</label>
                        <Input
                          className="mt-1 h-9 text-sm"
                          value={phase.description}
                          onChange={e => updateField(idx, 'description', e.target.value)}
                          onBlur={() => savePhase(idx)}
                          placeholder="Descrizione opzionale"
                        />
                      </div>
                    </div>

                    {isWireEdm && (
                      <EdmPhaseFields
                        phase={phase}
                        edmAuto={edmAuto}
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
                        onUnlockManual={() => unlockManualEdm(idx)}
                        onPatch={(updates) => updateMany(idx, updates)}
                        onSaveImmediate={(updates) => saveImmediate(idx, updates)}
                      />
                    )}

                    {/* Row 2: Ore (solo per fasi non-trattamento) + Costi + Visibile + Condivisa */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {!isTreatment && (
                        <>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Ore setup</label>
                            <Input onFocus={e => e.currentTarget.select()} type="number" step="0.05" min="0" className="mt-1 h-9 text-sm"
                              value={phase.setup_hours}
                              onChange={e => updateField(idx, 'setup_hours', parseDecimal(e.target.value) || 0)}
                              onBlur={() => savePhase(idx)} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              Ore ciclo / pz {edmAuto && <span className="text-[10px] font-normal text-amber-600">(auto)</span>}
                            </label>
                            <Input onFocus={e => e.currentTarget.select()} type="number" step="0.05" min="0" className="mt-1 h-9 text-sm"
                              value={phase.cycle_hours_per_part}
                              readOnly={edmAuto}
                              disabled={edmAuto}
                              title={edmAuto ? 'Calcolato dai parametri EDM. Sblocca per modificare manualmente.' : undefined}
                              onChange={e => updateField(idx, 'cycle_hours_per_part', parseDecimal(e.target.value) || 0)}
                              onBlur={() => savePhase(idx)} />
                          </div>
                        </>
                      )}

                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          {isTreatment ? 'Spedizione / fisso (€)' : 'Costo fisso (€)'}
                        </label>
                        <Input onFocus={e => e.currentTarget.select()} type="number" step="0.5" min="0" className="mt-1 h-9 text-sm"
                          value={phase.fixed_cost}
                          onChange={e => updateField(idx, 'fixed_cost', parseDecimal(e.target.value) || 0)}
                          onBlur={() => savePhase(idx)} />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          {isTreatment ? 'Costo / pz (€)' : 'Costo var / pz (€)'}
                        </label>
                        <Input onFocus={e => e.currentTarget.select()} type="number" step="0.01" min="0" className="mt-1 h-9 text-sm"
                          value={phase.variable_cost_per_part}
                          onChange={e => updateField(idx, 'variable_cost_per_part', parseDecimal(e.target.value) || 0)}
                          onBlur={() => savePhase(idx)} />
                        {isTreatment && finishedWeightKg && selectedTreatment?.cost_per_kg ? (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {finishedWeightKg} kg × {selectedTreatment.cost_per_kg} €/kg
                          </p>
                        ) : null}
                      </div>

                    </div>

                    {/* Advanced section (collapsible) */}
                    <div className="border-t pt-2">
                      <button
                        type="button"
                        onClick={() => toggleAdvanced(idx)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground"
                      >
                        {advancedIdx.has(idx) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Avanzato
                      </button>
                      {advancedIdx.has(idx) && (
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Tariffa override (€/h)</label>
                            <Input onFocus={e => e.currentTarget.select()} type="number" step="1" min="0" className="mt-1 h-9 text-sm"
                              value={phase.hourly_rate_override ?? ''}
                              placeholder="Auto"
                              onChange={e => updateField(idx, 'hourly_rate_override', e.target.value === '' ? undefined : parseDecimal(e.target.value))}
                              onBlur={() => savePhase(idx)} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Total per pezzo (breakdown setup/lavoro spostato nel riepilogo PartCard) */}
                    <div className="pt-1 border-t flex justify-end items-center gap-4">
                      {isTreatment && (() => {
                        const treatSupplierName = selectedTreatment?.supplier?.name
                        return (
                          <span className="text-xs text-muted-foreground">
                            {treatSupplierName && <span className="mr-2 text-indigo-400">{treatSupplierName}</span>}
                            {weightThresholdActive && <span className="mr-2 text-amber-500">minimo lotto {'<'}{selectedTreatment!.minimum_weight_kg} kg</span>}
                          </span>
                        )
                      })()}
                      <span className="text-sm font-bold text-primary">
                        = {phase.calculated_cost.toFixed(2)} €/pz
                      </span>
                    </div>
                  </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
    </fieldset>
  )
}
