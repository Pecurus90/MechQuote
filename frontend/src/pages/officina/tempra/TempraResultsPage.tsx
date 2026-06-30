import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, Flame, Circle, Square, Search, BarChart3 } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import type { HeatTreatmentResult } from '@/types'
import TempraFormModal from './TempraFormModal'
import TempraAnalysisModal from './TempraAnalysisModal'
import { dimensionsFor, fmtMm, formatDelta, deltaClass } from './tempraCalc'

const fmt = (v: number | null, suffix = ''): string =>
  v == null ? '—' : `${v}${suffix}`

export default function TempraResultsPage() {
  const { hasPermission } = useAuth()
  const canRead = hasPermission('officina')
  const canWrite = hasPermission('officina.write')

  const [rows, setRows] = useState<HeatTreatmentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<HeatTreatmentResult | null>(null)
  const [pendingDelete, setPendingDelete] = useState<HeatTreatmentResult | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/officina/heat-treatments')
      .then(r => setRows(r.data))
      .catch(() => toast.error('Errore caricamento risultati tempra'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setShowForm(true) }
  const openEdit = (r: HeatTreatmentResult) => { setEditing(r); setShowForm(true) }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const row = pendingDelete
    setPendingDelete(null)
    try {
      await api.delete(`/officina/heat-treatments/${row.id}`)
      toast.success('Risultato eliminato')
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore eliminazione')
    }
  }

  if (!canRead) return null

  const colCount = canWrite ? 9 : 8
  const q = search.trim().toLowerCase()
  const filtered = q ? rows.filter(r => r.material.toLowerCase().includes(q)) : rows

  return (
    <PageContainer width="xl">
      <div className="flex items-start justify-between gap-4">
        <SettingsPageHeader
          icon={Flame}
          color="emerald"
          title="Tempra e deformazioni"
          subtitle="Registro misure pre/post tempra e deformazioni rilevate"
        />
        {canWrite && (
          <PrimaryCtaButton color="emerald" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Aggiungi
          </PrimaryCtaButton>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder="Cerca per materiale…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => setShowAnalysis(true)} disabled={rows.length === 0}>
          <BarChart3 className="w-4 h-4 mr-1.5" /> Analisi materiale
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2 font-medium">Materiale</th>
              <th className="px-3 py-2 font-medium">Forma</th>
              <th className="px-3 py-2 font-medium text-right">Inser. °C</th>
              <th className="px-3 py-2 font-medium text-right">Tempra °C</th>
              <th className="px-3 py-2 font-medium text-right">Rinv. °C</th>
              <th className="px-3 py-2 font-medium text-right">Tempo</th>
              <th className="px-3 py-2 font-medium">Dimensioni (pre → post, Δ mm)</th>
              <th className="px-3 py-2 font-medium">Durezza</th>
              {canWrite && <th className="px-3 py-2 font-medium text-right">Azioni</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-gray-400">Caricamento…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-gray-400">Nessun risultato registrato.</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-gray-400">Nessun materiale corrisponde a «{search.trim()}».</td></tr>
            ) : filtered.map(r => {
              const ShapeIcon = r.shape === 'quadrato' ? Square : Circle
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60 align-top">
                  <td className="px-3 py-2 font-medium">
                    {r.material}
                    {r.notes && <div className="text-xs text-gray-400 font-normal max-w-[14rem] truncate" title={r.notes}>{r.notes}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-gray-700 capitalize">
                      <ShapeIcon className="w-3.5 h-3.5" /> {r.shape}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(r.temp_insertion_c)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.temp_quench_c)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.temp_temper_c)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.temper_time_min, ' min')}</td>
                  <td className="px-3 py-2">
                    <div className="space-y-0.5">
                      {dimensionsFor(r).map(dm => (
                        <div key={dm.key} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                          <span className="text-gray-500 w-[4.5rem] shrink-0">{dm.label}</span>
                          <span className="tabular-nums text-gray-700">{fmtMm(dm.pre)} → {fmtMm(dm.post)}</span>
                          <span className={`tabular-nums font-medium ${deltaClass(dm.delta)}`}>({formatDelta(dm.delta)})</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.hardness || '—'}</td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="p-1 hover:bg-gray-100 rounded" title="Modifica">
                          <Pencil className="w-4 h-4 text-blue-600" />
                        </button>
                        <button onClick={() => setPendingDelete(r)} className="p-1 hover:bg-red-50 rounded" title="Elimina">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {showForm && (
        <TempraFormModal
          result={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={load}
        />
      )}

      {showAnalysis && (
        <TempraAnalysisModal
          rows={rows}
          initialMaterial={filtered[0]?.material}
          onClose={() => setShowAnalysis(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questo risultato?"
        description="Questa azione non è reversibile."
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  )
}
