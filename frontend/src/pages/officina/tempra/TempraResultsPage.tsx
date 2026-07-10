import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, Flame, Circle, Square, Search, BarChart3, ChevronLeft, ArrowUp, ArrowDown } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import type { HeatTreatmentResult } from '@/types'
import TempraFormModal from './TempraFormModal'
import TempraAnalysisModal from './TempraAnalysisModal'
import { dimensionsFor, fmtMm, formatDelta } from './tempraCalc'

const fmt = (v: number | null, suffix = ''): string => v == null ? '—' : `${v}${suffix}`

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
    <StandardPage
      icon={Flame}
      color="officina"
      width="xl"
      title="Tempra e deformazioni"
      subtitle="Registro misure pre/post trattamento e deformazioni rilevate sui pezzi"
      breadcrumb={
        <div className="mb-1 flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground">
          <Link to="/officina" className="flex items-center gap-1 hover:text-officina"><ChevronLeft className="h-3.5 w-3.5" /> Officina</Link>
        </div>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9 text-sm" placeholder="Cerca per materiale…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowAnalysis(true)} disabled={rows.length === 0}>
            <BarChart3 className="mr-1.5 h-4 w-4" /> Analisi materiale
          </Button>
          {canWrite && (
            <PrimaryCtaButton color="officina" size="sm" onClick={() => { setEditing(null); setShowForm(true) }}>
              <Plus className="h-4 w-4" /> Aggiungi
            </PrimaryCtaButton>
          )}
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border bg-card-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="p-2.5 text-left font-medium">Materiale</th>
                <th className="p-2.5 text-left font-medium">Forma</th>
                <th className="p-2.5 text-right font-medium">Inser. °C</th>
                <th className="p-2.5 text-right font-medium">Tempra °C</th>
                <th className="p-2.5 text-right font-medium">Rinv. °C</th>
                <th className="p-2.5 text-right font-medium">Tempo</th>
                <th className="p-2.5 text-left font-medium">Dimensioni (pre → post, Δ mm)</th>
                <th className="p-2.5 text-left font-medium">Durezza</th>
                {canWrite && <th className="p-2.5 text-center font-medium">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={colCount} className="p-8 text-center text-muted-foreground">Caricamento…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={colCount} className="p-8 text-center text-muted-foreground">Nessun risultato registrato.</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={colCount} className="p-8 text-center text-muted-foreground">Nessun materiale corrisponde a «{search.trim()}».</td></tr>
              ) : filtered.map(r => {
                const ShapeIcon = r.shape === 'quadrato' ? Square : Circle
                return (
                  <tr key={r.id} className="border-b border-border align-top transition-colors hover:bg-muted/[0.45]">
                    <td className="p-2.5 font-medium text-foreground">
                      {r.material}
                      {r.notes && <div className="max-w-[14rem] truncate text-xs font-normal text-muted-foreground" title={r.notes}>{r.notes}</div>}
                    </td>
                    <td className="p-2.5">
                      <span className="inline-flex items-center gap-1 capitalize text-foreground"><ShapeIcon className="h-3.5 w-3.5" /> {r.shape}</span>
                    </td>
                    <td className="p-2.5 text-right font-mono">{fmt(r.temp_insertion_c)}</td>
                    <td className="p-2.5 text-right font-mono">{fmt(r.temp_quench_c)}</td>
                    <td className="p-2.5 text-right font-mono">{fmt(r.temp_temper_c)}</td>
                    <td className="p-2.5 text-right font-mono">{fmt(r.temper_time_min, ' min')}</td>
                    <td className="p-2.5">
                      <div className="space-y-0.5">
                        {dimensionsFor(r).map(dm => {
                          const d = dm.delta
                          const cls = d == null ? 'text-muted-foreground' : d < 0 ? 'text-info' : d > 0 ? 'text-warning' : 'text-muted-foreground'
                          const DirIcon = d != null && d < 0 ? ArrowDown : d != null && d > 0 ? ArrowUp : null
                          return (
                            <div key={dm.key} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                              <span className="w-[4.5rem] shrink-0 text-muted-foreground">{dm.label}</span>
                              <span className="font-mono tabular-nums text-foreground">{fmtMm(dm.pre)} → {fmtMm(dm.post)}</span>
                              <span className={`inline-flex items-center gap-0.5 font-mono font-medium tabular-nums ${cls}`}>
                                {DirIcon && <DirIcon className="h-3 w-3" />}({formatDelta(d)})
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                    <td className="whitespace-nowrap p-2.5">{r.hardness || '—'}</td>
                    {canWrite && (
                      <td className="p-2.5">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => { setEditing(r); setShowForm(true) }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifica"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setPendingDelete(r)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Elimina"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <TempraFormModal result={editing} onClose={() => { setShowForm(false); setEditing(null) }} onSaved={load} />}
      {showAnalysis && <TempraAnalysisModal rows={rows} initialMaterial={filtered[0]?.material} onClose={() => setShowAnalysis(false)} />}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Eliminare questo risultato?"
        description="Questa azione non è reversibile."
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </StandardPage>
  )
}
