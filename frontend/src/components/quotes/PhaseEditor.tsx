import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import api from '@/lib/api'
import type { Phase, Machine, Treatment, PhaseTemplate, Supplier, CuttingCycle } from '@/types'
import { PHASE_TYPES } from '@/lib/constants'
import { calcTreatmentCost } from '@/lib/quoteCalc'
import { toast } from 'sonner'
import EdmPhaseFields from '@/components/quotes/EdmPhaseFields'

const isEdmAuto = (p: Phase) =>
  p.phase_type === 'wire_edm' &&
  !!p.cut_length_mm && p.cut_length_mm > 0 &&
  !!p.cut_height_mm && p.cut_height_mm > 0 &&
  !!p.cutting_cycle_id

interface Props {
  partId?: number
  phases: Phase[]
  quantity: number
  nParts?: number
  machines: Machine[]
  suppliers?: Supplier[]
  templates?: PhaseTemplate[]
  treatments?: Treatment[]
  finishedWeightKg?: number
  readOnly?: boolean
  onChange: (phases: Phase[]) => void
}

const TREATMENT_PHASE_TYPES = new Set(['heat_treatment', 'surface_treatment'])
const SUPPLIER_PHASE_TYPES = new Set(['heat_treatment', 'surface_treatment', 'external_supplier'])

function calcPhase(phase: Phase, machines: Machine[], qty: number, nParts = 1): Phase {
  const machine = machines.find(m => m.id === phase.machine_id)
  const rate = phase.hourly_rate_override ?? machine?.hourly_rate ?? 0
  const divisor = qty * (phase.is_shared ? nParts : 1)
  const cost =
    (phase.setup_hours || 0) * rate / divisor +
    (phase.cycle_hours_per_part || 0) * rate +
    (phase.fixed_cost || 0) / divisor +
    (phase.variable_cost_per_part || 0)
  return { ...phase, calculated_cost: Math.round(cost * 10000) / 10000 }
}

export default function PhaseEditor({ partId, phases, quantity, nParts = 1, machines, suppliers = [], templates = [], treatments = [], finishedWeightKg, readOnly = false, onChange }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [advancedIdx, setAdvancedIdx] = useState<Set<number>>(new Set())
  const [cuttingCycles, setCuttingCycles] = useState<CuttingCycle[]>([])

  useEffect(() => {
    api.get('/cutting-cycles')
      .then(r => setCuttingCycles(r.data.filter((c: CuttingCycle) => c.active)))
      .catch(() => { /* tabelle EDM non popolate ancora — ok */ })
  }, [])

  // Quando cambia il peso finito o la quantità, ricalcola i costi delle fasi treatment.
  // Phases/treatments/machines/onChange sono volutamente fuori dalle deps: phases viene
  // ricreata ad ogni render del parent (riferimento nuovo) e onChange è una callback inline,
  // metterli innescherebbe rerender continui. Il check `changed` evita loop comunque.
  useEffect(() => {
    const updated = phases.map(ph => {
      if (!ph.treatment_id) return ph
      const t = treatments.find(t => t.id === ph.treatment_id)
      if (!t) return ph
      const varCost = calcTreatmentCost(t, finishedWeightKg, quantity)
      return calcPhase({ ...ph, variable_cost_per_part: varCost }, machines, quantity, nParts)
    })
    const changed = updated.some((ph, i) => ph.variable_cost_per_part !== phases[i].variable_cost_per_part)
    if (changed) onChange(updated)
  }, [finishedWeightKg, quantity]) // eslint-disable-line react-hooks/exhaustive-deps

  const addPhase = async () => {
    const seq = phases.length > 0 ? Math.max(...phases.map(p => p.sequence_number)) + 10 : 10
    const newPhase: Phase = {
      sequence_number: seq,
      phase_type: 'cnc_milling',
      description: '',
      setup_hours: 0.5,
      cycle_hours_per_part: 0.25,
      fixed_cost: 0,
      variable_cost_per_part: 0,
      calculated_cost: 0,
      customer_visible: true,
      is_shared: false,
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
    onChange(phases.filter((_, i) => i !== idx))
    if (expandedIdx === idx) setExpandedIdx(null)
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
    } catch (e) {toast.error('Errore nel salvataggio della fase') }
  }

  const unlockManualEdm = (idx: number) => {
    updateMany(idx, {
      cut_length_mm: null,
      cut_height_mm: null,
      cutting_cycle_id: null,
      n_pierce: null,
    })
    // Salva immediatamente: dopo lo sblocco il backend non ricalcolerà più auto.
    setTimeout(() => savePhase(idx), 0)
  }

  const handleTreatmentSelect = (idx: number, treatmentId: number | undefined) => {
    const phase = phases[idx]
    if (!treatmentId) {
      updateMany(idx, { treatment_id: undefined, fixed_cost: 0, variable_cost_per_part: 0 })
      return
    }
    const t = treatments.find(t => t.id === treatmentId)
    if (!t) return
    const varCost = calcTreatmentCost(t, finishedWeightKg, quantity)
    const shippingCost = t.supplier?.shipping_cost || 0
    updateMany(idx, {
      treatment_id: treatmentId,
      fixed_cost: shippingCost,
      variable_cost_per_part: varCost,
      description: phase.description || t.name,
      supplier_id: t.supplier_id ?? phase.supplier_id,
    })
  }

  const applyTemplate = async (tpl: PhaseTemplate) => {
    const seq = phases.length > 0 ? Math.max(...phases.map(p => p.sequence_number)) + 10 : 10
    const newPhase: Phase = {
      sequence_number: seq,
      phase_type: tpl.phase_type,
      description: tpl.name,
      machine_id: tpl.default_machine_id ?? undefined,
      supplier_id: tpl.default_supplier_id ?? undefined,
      setup_hours: tpl.setup_hours,
      cycle_hours_per_part: tpl.cycle_hours_per_part,
      fixed_cost: tpl.fixed_cost,
      variable_cost_per_part: tpl.variable_cost_per_part,
      calculated_cost: 0,
      customer_visible: tpl.customer_visible,
      is_shared: tpl.is_shared,
    }
    if (partId) {
      try {
        const res = await api.post(`/parts/${partId}/phases`, newPhase)
        onChange([...phases, calcPhase(res.data, machines, quantity, nParts)])
        setExpandedIdx(phases.length)
      } catch (e) {toast.error('Errore nell\'applicazione del template') }
    } else {
      onChange([...phases, calcPhase(newPhase, machines, quantity, nParts)])
      setExpandedIdx(phases.length)
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

  const phaseLabel = (type: string) => PHASE_TYPES.find(t => t.value === type)?.label || type

  return (
    <fieldset disabled={readOnly} className="border-0 p-0 m-0 disabled:opacity-90">
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <CardTitle className="text-base">Ciclo di Lavorazione</CardTitle>
          <div className="flex items-center gap-2">
            {templates.length > 0 && (
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value=""
                onChange={e => {
                  const tpl = templates.find(t => t.id === Number(e.target.value))
                  if (tpl) applyTemplate(tpl)
                }}
              >
                <option value="">Da template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
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
            <p className="text-sm text-gray-400 text-center py-6">
              Nessuna fase. Clicca "Aggiungi Fase" per iniziare.
            </p>
          )}
          {phases.map((phase, idx) => {
            const isTreatment = TREATMENT_PHASE_TYPES.has(phase.phase_type)
            const selectedTreatment = treatments.find(t => t.id === phase.treatment_id)
            const totalBatchWeight = (finishedWeightKg || 0) * quantity
            const weightThresholdActive = selectedTreatment?.minimum_weight_kg != null &&
              selectedTreatment.minimum_weight_kg > 0 &&
              totalBatchWeight < selectedTreatment.minimum_weight_kg
            const showMinWarning = isTreatment && selectedTreatment &&
              !weightThresholdActive &&
              selectedTreatment.minimum_cost > 0 &&
              (phase.variable_cost_per_part * quantity) < selectedTreatment.minimum_cost

            return (
              <div
                key={phase.id ?? idx}
                className={`border rounded-lg overflow-hidden ${dragIdx !== null && dragIdx !== idx ? 'border-dashed border-blue-300' : ''}`}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
              >
                {/* Header row */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                >
                  <span
                    className="shrink-0 cursor-grab"
                    draggable
                    onDragStart={e => { e.stopPropagation(); setDragIdx(idx) }}
                    onClick={e => e.stopPropagation()}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-gray-400" />
                  </span>
                  <span className="text-xs font-mono w-6 text-gray-400">{phase.sequence_number}</span>
                  <span className="flex-1 text-sm font-medium truncate">
                    {phaseLabel(phase.phase_type)}
                    {selectedTreatment && <span className="text-gray-400 font-normal"> — {selectedTreatment.name}</span>}
                  </span>
                  {phase.description && !selectedTreatment && (
                    <span className="text-xs text-gray-400 truncate max-w-32">{phase.description}</span>
                  )}
                  {showMinWarning && (
                    <span className="text-amber-500 text-xs shrink-0" title={`Sotto il minimo: ${selectedTreatment!.minimum_cost.toFixed(2)} €`}>⚠</span>
                  )}
                  <span className="text-sm font-semibold text-blue-700 whitespace-nowrap">
                    {phase.calculated_cost.toFixed(2)} €/pz
                  </span>
                  <button onClick={e => { e.stopPropagation(); removePhase(idx) }} className="p-1 hover:bg-red-50 rounded ml-1">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                  {expandedIdx === idx
                    ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  }
                </div>

                {/* Expanded editor */}
                {expandedIdx === idx && (() => {
                  const isWireEdm = phase.phase_type === 'wire_edm'
                  const edmAuto = isEdmAuto(phase)
                  return (
                  <div className="p-4 border-t bg-white space-y-3">
                    {/* Row 1: Tipo + Macchina/Fornitore + Descrizione */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Tipo Fase</label>
                        <select
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={phase.phase_type}
                          onChange={e => {
                            updateField(idx, 'phase_type', e.target.value)
                            // reset treatment if switching away from treatment type
                            if (!TREATMENT_PHASE_TYPES.has(e.target.value) && phase.treatment_id) {
                              updateMany(idx, { phase_type: e.target.value, treatment_id: undefined })
                            }
                          }}
                          onBlur={() => savePhase(idx)}
                        >
                          {PHASE_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>

                      {!isTreatment && (
                        <div>
                          <label className="text-xs font-medium text-gray-600">Macchina</label>
                          <select
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={phase.machine_id || ''}
                            onChange={e => updateField(idx, 'machine_id', Number(e.target.value) || undefined)}
                            onBlur={() => savePhase(idx)}
                          >
                            <option value="">Nessuna</option>
                            {machines.map(m => (
                              <option key={m.id} value={m.id}>{m.name} ({m.hourly_rate.toFixed(0)} €/h)</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {isTreatment && treatments.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-gray-600">Trattamento</label>
                          <select
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={phase.treatment_id || ''}
                            onChange={e => handleTreatmentSelect(idx, Number(e.target.value) || undefined)}
                            onBlur={() => savePhase(idx)}
                          >
                            <option value="">Seleziona...</option>
                            {treatments.filter(t => t.active).map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name}{t.cost_per_kg ? ` — ${t.cost_per_kg} €/kg` : ''}
                              </option>
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
                        </div>
                      )}

                      {suppliers.length > 0 && SUPPLIER_PHASE_TYPES.has(phase.phase_type) && (
                        <div>
                          <label className="text-xs font-medium text-gray-600">Fornitore</label>
                          <select
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={phase.supplier_id || ''}
                            onChange={e => updateField(idx, 'supplier_id', Number(e.target.value) || undefined)}
                            onBlur={() => savePhase(idx)}
                          >
                            <option value="">Nessuno</option>
                            {suppliers.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className={isTreatment ? 'col-span-2 md:col-span-1' : 'col-span-2 md:col-span-1'}>
                        <label className="text-xs font-medium text-gray-600">Descrizione</label>
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
                        onChange={(field, value) => updateField(idx, field, value)}
                        onBlur={() => savePhase(idx)}
                        onUnlockManual={() => unlockManualEdm(idx)}
                      />
                    )}

                    {/* Row 2: Ore (solo per fasi non-trattamento) + Costi + Visibile + Condivisa */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {!isTreatment && (
                        <>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Ore setup</label>
                            <Input type="number" step="0.05" min="0" className="mt-1 h-9 text-sm"
                              value={phase.setup_hours}
                              onChange={e => updateField(idx, 'setup_hours', parseFloat(e.target.value) || 0)}
                              onBlur={() => savePhase(idx)} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">
                              Ore ciclo / pz {edmAuto && <span className="text-[10px] font-normal text-amber-600">(auto)</span>}
                            </label>
                            <Input type="number" step="0.05" min="0" className="mt-1 h-9 text-sm"
                              value={phase.cycle_hours_per_part}
                              readOnly={edmAuto}
                              disabled={edmAuto}
                              title={edmAuto ? 'Calcolato dai parametri EDM. Sblocca per modificare manualmente.' : undefined}
                              onChange={e => updateField(idx, 'cycle_hours_per_part', parseFloat(e.target.value) || 0)}
                              onBlur={() => savePhase(idx)} />
                          </div>
                        </>
                      )}

                      <div>
                        <label className="text-xs font-medium text-gray-600">
                          {isTreatment ? 'Spedizione / fisso (€)' : 'Costo fisso (€)'}
                        </label>
                        <Input type="number" step="0.5" min="0" className="mt-1 h-9 text-sm"
                          value={phase.fixed_cost}
                          onChange={e => updateField(idx, 'fixed_cost', parseFloat(e.target.value) || 0)}
                          onBlur={() => savePhase(idx)} />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-gray-600">
                          {isTreatment ? 'Costo / pz (€)' : 'Costo var / pz (€)'}
                        </label>
                        <Input type="number" step="0.01" min="0" className="mt-1 h-9 text-sm"
                          value={phase.variable_cost_per_part}
                          onChange={e => updateField(idx, 'variable_cost_per_part', parseFloat(e.target.value) || 0)}
                          onBlur={() => savePhase(idx)} />
                        {isTreatment && finishedWeightKg && selectedTreatment?.cost_per_kg ? (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {finishedWeightKg} kg × {selectedTreatment.cost_per_kg} €/kg
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-2 justify-end pb-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`vis-${idx}`}
                            checked={phase.customer_visible}
                            onChange={e => { updateField(idx, 'customer_visible', e.target.checked); savePhase(idx) }}
                          />
                          <label htmlFor={`vis-${idx}`} className="text-xs text-gray-600 cursor-pointer">
                            Visibile al cliente
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Advanced section (collapsible) */}
                    <div className="border-t pt-2">
                      <button
                        type="button"
                        onClick={() => toggleAdvanced(idx)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                      >
                        {advancedIdx.has(idx) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Avanzato
                      </button>
                      {advancedIdx.has(idx) && (
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium text-gray-600">Tariffa override (€/h)</label>
                            <Input type="number" step="1" min="0" className="mt-1 h-9 text-sm"
                              value={phase.hourly_rate_override ?? ''}
                              placeholder="Auto"
                              onChange={e => updateField(idx, 'hourly_rate_override', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                              onBlur={() => savePhase(idx)} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Cost breakdown */}
                    <div className="pt-1 border-t flex justify-end items-center gap-4">
                      {(() => {
                        const machine = machines.find(m => m.id === phase.machine_id)
                        const rate = phase.hourly_rate_override ?? machine?.hourly_rate ?? 0
                        const divisor = quantity * (phase.is_shared ? nParts : 1)
                        if (isTreatment) {
                          const treatSupplierName = selectedTreatment?.supplier?.name
                          return (
                            <span className="text-xs text-gray-400">
                              {treatSupplierName && <span className="mr-2 text-indigo-400">{treatSupplierName}</span>}
                              {weightThresholdActive && <span className="mr-2 text-amber-500">minimo lotto {'<'}{selectedTreatment!.minimum_weight_kg} kg</span>}
                              Fisso: {((phase.fixed_cost || 0) / divisor).toFixed(2)} € · Lavorazione: {(phase.variable_cost_per_part || 0).toFixed(2)} €/pz
                            </span>
                          )
                        }
                        return (
                          <span className="text-xs text-gray-400">
                            Tariffa: {rate.toFixed(0)} €/h ·
                            Setup: {((phase.setup_hours || 0) * rate / divisor).toFixed(2)} € (÷{quantity}pz) ·
                            Ciclo: {((phase.cycle_hours_per_part || 0) * rate).toFixed(2)} €/pz
                          </span>
                        )
                      })()}
                      <span className="text-sm font-bold text-blue-700">
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
