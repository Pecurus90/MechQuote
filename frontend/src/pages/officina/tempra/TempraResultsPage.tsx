import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Flame } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import PageContainer from '@/components/ui/page-container'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import type { HeatTreatmentResult } from '@/types'
import TempraFormModal from './TempraFormModal'
import { computeDeformations, formatDelta } from './tempraCalc'

const fmt = (v: number | null, suffix = ''): string =>
  v == null ? '—' : `${v}${suffix}`

export default function TempraResultsPage() {
  const { hasPermission } = useAuth()
  const canRead = hasPermission('officina')
  const canWrite = hasPermission('officina.write')

  const [rows, setRows] = useState<HeatTreatmentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<HeatTreatmentResult | null>(null)
  const [pendingDelete, setPendingDelete] = useState<HeatTreatmentResult | null>(null)

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

  return (
    <PageContainer>
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

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2 font-medium">Materiale</th>
              <th className="px-3 py-2 font-medium text-right">Inser. °C</th>
              <th className="px-3 py-2 font-medium text-right">Tempra °C</th>
              <th className="px-3 py-2 font-medium text-right">Rinv. °C</th>
              <th className="px-3 py-2 font-medium text-right">Tempo</th>
              <th className="px-3 py-2 font-medium text-right">Ø est. pre→post</th>
              <th className="px-3 py-2 font-medium text-right">ΔØ est.</th>
              <th className="px-3 py-2 font-medium text-right">Ø int. pre→post</th>
              <th className="px-3 py-2 font-medium text-right">ΔØ int.</th>
              <th className="px-3 py-2 font-medium text-right">Lungh. pre→post</th>
              <th className="px-3 py-2 font-medium text-right">Δ lungh.</th>
              <th className="px-3 py-2 font-medium">Durezza</th>
              <th className="px-3 py-2 font-medium">Note</th>
              {canWrite && <th className="px-3 py-2 font-medium text-right">Azioni</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} className="px-3 py-6 text-center text-gray-400">Caricamento…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={14} className="px-3 py-6 text-center text-gray-400">Nessun risultato registrato.</td></tr>
            ) : rows.map(r => {
              const d = computeDeformations(r)
              const deltaCls = (v: number | null) =>
                v == null ? 'text-gray-400' : v < 0 ? 'text-blue-600' : v > 0 ? 'text-orange-600' : 'text-gray-600'
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                  <td className="px-3 py-2 font-medium">{r.material}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.temp_insertion_c)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.temp_quench_c)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.temp_temper_c)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.temper_time_min, ' min')}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(r.outer_dia_pre_mm)} → {fmt(r.outer_dia_post_mm)}</td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${deltaCls(d.outerDelta)}`}>{formatDelta(d.outerDelta)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(r.inner_dia_pre_mm)} → {fmt(r.inner_dia_post_mm)}</td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${deltaCls(d.innerDelta)}`}>{formatDelta(d.innerDelta)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(r.length_pre_mm)} → {fmt(r.length_post_mm)}</td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${deltaCls(d.lengthDelta)}`}>{formatDelta(d.lengthDelta)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.hardness || '—'}</td>
                  <td className="px-3 py-2 max-w-[16rem] truncate" title={r.notes || ''}>{r.notes || '—'}</td>
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
