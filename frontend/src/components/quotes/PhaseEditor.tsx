import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import api from '@/lib/api'
import type { Phase, Machine, Treatment } from '@/types'
import { PHASE_TYPES } from '@/lib/constants'

interface Supplier { id: number; name: string }
interface PhaseTemplate {
  id: number
  name: string
  phase_type: string
  default_machine_id: number | null
  default_supplier_id: number | null
  setup_hours: number
  cycle_hours_per_part: number
  fixed_cost: number
  variable_cost_per_part: number
  customer_visible: boolean
}

interface Props {
  partId?: number
  phases: Phase[]
  quantity: number
  machines: Machine[]
  suppliers?: Supplier[]
  templates?: PhaseTemplate[]
  treatments?: Treatment[]
  finishedWeightKg?: number
  onChange: (phases: Phase[]) => void
}

const TREATMENT_PHASE_TYPES = new Set(['heat_treatment', 'surface_treatment'])
const SUPPLIER_PHASE_TYPES = new Set(['heat_treatment', 'surface_treatment', 'external_supplier'])

function calcPhase(phase: Phase, machines: Machine[], qty: number): Phase {
  const machine = machines.find(m => m.id === phase.machine_id)
  const rate = phase.hourly_rate_override ?? machine?.hourly_rate ?? 0
  const cost =
    (phase.setup_hours || 0) * rate +
    (phase.cycle_hours_per_part || 0) * qty * rate +
    (phase.fixed_cost || 0) +
    (phase.variable_cost_per_part || 0) * qty
  return { ...phase, calculated_cost: Math.round(cost * 100) / 100 }
}

export default function PhaseEditor({ partId, phases, quantity, machines, suppliers = [], templates = [], treatments = [], finishedWeightKg, onChange }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [advancedIdx, setAdvancedIdx] = useState<Set<number>>(new Set())

  // When finishedWeightKg changes, recalculate treatment phases
  useEffect(() => {
    const updated = phases.map(ph => {
      if (!ph.treatment_id) return ph
      const t = treatments.find(t => t.id === ph.treatment_id)
      if (!t) return ph
      const varCost = (t.cost_per_kg || 0) * (finishedWeightKg || 0)
      return calcPhase({ ...ph, variable_cost_per_part: varCost }, machines, quantity)
    })
    const changed = updated.some((ph, i) => ph.variable_cost_per_part !== phases[i].variable_cost_per_part)
    if (changed) onChange(updated)
  }, [finishedWeightKg]) // eslint-disable-line react-hooks/exhaustive-deps

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
    }
    if (partId) {
      try {
        const res = await api.post(`/parts/${partId}/phases`, newPhase)
        const saved: Phase = res.data
        onChange([...phases, calcPhase(saved, machines, quantity)])
        setExpandedIdx(phases.length)
      } catch (e) { console.error(e) }
    } else {
      onChange([...phases, calcPhase(newPhase, machines, quantity)])
      setExpandedIdx(phases.length)
    }
  }

  const removePhase = async (idx: number) => {
    const phase = phases[idx]
    if (phase.id) {
      try { await api.delete(`/phases/${phase.id}`) } catch (e) { console.error(e) }
    }
    onChange(phases.filter((_, i) => i !== idx))
    if (expandedIdx === idx) setExpandedIdx(null)
  }

  const updateField = (idx: number, field: keyof Phase, value: Phase[keyof Phase]) => {
    onChange(phases.map((p, i) =>
      i !== idx ? p : calcPhase({ ...p, [field]: value }, machines, quantity)
    ))
  }

  const updateMany = (idx: number, updates: Partial<Phase>) => {
    onChange(phases.map((p, i) =>
      i !== idx ? p : calcPhase({ ...p, ...updates }, machines, quantity)
    ))
  }

  const savePhase = async (idx: number) => {
    const phase = phases[idx]
    if (!phase.id) return
    try { await api.put(`/phases/${phase.id}`, phase) } catch (e) { console.error(e) }
  }

  const handleTreatmentSelect = (idx: number, treatmentId: number | undefined) => {
    const phase = phases[idx]
    if (!treatmentId) {
      updateMany(idx, { treatment_id: undefined, fixed_cost: 0, variable_cost_per_part: 0 })
      return
    }
    const t = treatments.find(t => t.id === treatmentId)
    if (!t) return
    const varCost = (t.cost_per_kg || 0) * (finishedWeightKg || 0)
    updateMany(idx, {
      treatment_id: treatmentId,
      fixed_cost: t.fixed_cost || 0,
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
    }
    if (partId) {
      try {
        const res = await api.post(`/parts/${partId}/phases`, newPhase)
        onChange([...phases, calcPhase(res.data, machines, quantity)])
        setExpandedIdx(phases.length)
      } catch (e) { console.error(e) }
    } else {
      onChange([...phases, calcPhase(newPhase, machines, quantity)])
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
      try { await api.post(`/parts/${partId}/phases/reorder`, ids) } catch (e) { console.error(e) }
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
            const showMinWarning = isTreatment && selectedTreatment &&
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
                    {phase.calculated_cost.toFixed(2)} €
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
                {expandedIdx === idx && (
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

                    {/* Row 2: Ore (solo per fasi non-trattamento) + Costi + Visibile */}
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
                            <label className="text-xs font-medium text-gray-600">Ore ciclo / pz</label>
                            <Input type="number" step="0.05" min="0" className="mt-1 h-9 text-sm"
                              value={phase.cycle_hours_per_part}
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

                      <div className="flex items-end pb-1 gap-2">
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
                        if (isTreatment) {
                          return (
                            <span className="text-xs text-gray-400">
                              Fisso: {(phase.fixed_cost || 0).toFixed(2)} € · Lavorazione: {((phase.variable_cost_per_part || 0) * quantity).toFixed(2)} €
                            </span>
                          )
                        }
                        return (
                          <span className="text-xs text-gray-400">
                            Tariffa: {rate.toFixed(0)} €/h ·
                            Setup: {((phase.setup_hours || 0) * rate).toFixed(2)} € ·
                            Ciclo: {((phase.cycle_hours_per_part || 0) * quantity * rate).toFixed(2)} €
                          </span>
                        )
                      })()}
                      <span className="text-sm font-bold text-blue-700">
                        = {phase.calculated_cost.toFixed(2)} €
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
