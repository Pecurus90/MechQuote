import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Box, Flame, Pencil, Trash2, Factory, ChevronRight, FolderPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import CategoryFormModal from '@/components/officina/CategoryFormModal'
import { getIcon } from '@/lib/icons'
import type { OfficinaCategory } from '@/types'

export default function OfficinaHub() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canRead = hasPermission('officina')
  const canManageCategories = hasPermission('officina.write')

  const [categories, setCategories] = useState<OfficinaCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<OfficinaCategory | null>(null)
  const [pendingDelete, setPendingDelete] = useState<OfficinaCategory | null>(null)

  const load = () => { api.get('/officina/categories-full').then(r => setCategories(r.data)).catch(() => undefined) }
  useEffect(() => { load() }, [])

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const cat = pendingDelete
    setPendingDelete(null)
    try {
      await api.delete(`/officina/categories/${cat.id}`)
      toast.success('Categoria eliminata')
      load()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore eliminazione')
    }
  }

  if (!canRead) return null

  const Tile = ({ Icon, title, desc, onClick, children }: {
    Icon: LucideIcon; title: string; desc: string; onClick: () => void; children?: React.ReactNode
  }) => (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className="flex h-full w-full items-center gap-3.5 rounded-[14px] border border-border bg-card p-[18px] text-left transition-all hover:border-officina/[0.45] hover:shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
      >
        <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px] bg-officina/[0.13] text-officina">
          <Icon className="h-[21px] w-[21px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-foreground">{title}</div>
          <div className="truncate text-[12.5px] text-muted-foreground">{desc}</div>
        </div>
        <ChevronRight className="h-[18px] w-[18px] flex-none text-muted-foreground" />
      </button>
      {children}
    </div>
  )

  return (
    <StandardPage
      icon={Factory}
      color="officina"
      width="xl"
      title="Officina"
      subtitle="Documentazione operativa per il personale di produzione"
    >
      {/* Sezioni fisse */}
      <div>
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sezioni</h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <Tile Icon={Box} title="Materiali" desc="Catalogo materiali con schede tecniche PDF." onClick={() => navigate('/officina/materiali')} />
          <Tile Icon={FileText} title="Tutti i documenti" desc="PDF, Word, Excel, immagini e DXF." onClick={() => navigate('/officina/documenti')} />
          <Tile Icon={Flame} title="Tempra e deformazioni" desc="Registro misure pre/post tempra." onClick={() => navigate('/officina/tempra')} />
        </div>
      </div>

      {/* Categorie documenti */}
      <div>
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categorie documenti</h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map(c => {
            const Icon = getIcon(c.icon)
            return (
              <Tile
                key={c.id}
                Icon={Icon}
                title={c.name}
                desc={`Documenti della categoria "${c.name}".`}
                onClick={() => navigate(`/officina/documenti?category=${encodeURIComponent(c.name)}`)}
              >
                {canManageCategories && (
                  <div className="absolute right-2.5 top-2.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => { setEditing(c); setShowForm(true) }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-sm hover:text-foreground" title="Modifica categoria">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setPendingDelete(c)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-sm hover:text-danger" title="Elimina categoria">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </Tile>
            )
          })}

          {canManageCategories && (
            <button
              type="button"
              onClick={() => { setEditing(null); setShowForm(true) }}
              className="flex h-full min-h-[80px] items-center justify-center gap-2 rounded-[14px] border border-dashed border-border p-[18px] text-sm font-medium text-muted-foreground transition-colors hover:border-officina/[0.45] hover:text-officina"
            >
              <FolderPlus className="h-[18px] w-[18px]" /> Nuova categoria
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <CategoryFormModal
          category={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={load}
        />
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title={`Eliminare la categoria "${pendingDelete?.name ?? ''}"?`}
        description="Se ci sono documenti che usano questa categoria, l'eliminazione verrà bloccata."
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </StandardPage>
  )
}
