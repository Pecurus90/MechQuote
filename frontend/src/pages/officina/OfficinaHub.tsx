import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Hammer, Box, Plus, Pencil, Trash2, Factory, Flame } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import PageContainer from '@/components/ui/page-container'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import CategoryFormModal from '@/components/officina/CategoryFormModal'
import { getIcon } from '@/lib/icons'
import type { OfficinaCategory } from '@/types'

export default function OfficinaHub() {
  const { hasPermission } = useAuth()
  const canRead = hasPermission('officina')
  const canManageCategories = hasPermission('officina.write')

  const [categories, setCategories] = useState<OfficinaCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<OfficinaCategory | null>(null)
  const [pendingDelete, setPendingDelete] = useState<OfficinaCategory | null>(null)

  const load = () => {
    api.get('/officina/categories-full')
      .then(r => setCategories(r.data))
      .catch(() => undefined)
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setShowForm(true) }
  const openEdit = (c: OfficinaCategory) => { setEditing(c); setShowForm(true) }

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

  return (
    <PageContainer>
      <SettingsPageHeader
        icon={Factory}
        color="emerald"
        title="Officina"
        subtitle="Documentazione operativa per il personale di produzione"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card fisse */}
        <Link to="/officina/materiali" className="block">
          <Card className="hover:bg-primary/10/50 hover:border-blue-200 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <Box className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Materiali</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Catalogo materiali con schede tecniche PDF.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/officina/documenti" className="block">
          <Card className="hover:bg-primary/10/50 hover:border-blue-200 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <FileText className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Tutti i documenti</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Vista completa: PDF, Word, Excel, immagini, DXF.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/officina/tempra" className="block">
          <Card className="hover:bg-primary/10/50 hover:border-blue-200 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <Flame className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Tempra e deformazioni</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Registro misure pre/post tempra e deformazioni rilevate.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Card dinamiche per ogni categoria */}
        {categories.map(c => {
          const Icon = getIcon(c.icon)
          return (
            <div key={c.id} className="relative group">
              <Link to={`/officina/documenti?category=${encodeURIComponent(c.name)}`} className="block">
                <Card className="hover:bg-primary/10/50 hover:border-blue-200 transition-colors cursor-pointer h-full">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      <Icon className="w-7 h-7 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-foreground truncate">{c.name}</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Documenti categoria "{c.name}".
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              {canManageCategories && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={e => { e.preventDefault(); openEdit(c) }}
                    className="p-1 bg-card border border-border hover:bg-muted rounded shadow-sm"
                    title="Modifica categoria"
                  >
                    <Pencil className="w-3.5 h-3.5 text-blue-600" />
                  </button>
                  <button
                    onClick={e => { e.preventDefault(); setPendingDelete(c) }}
                    className="p-1 bg-card border border-border hover:bg-red-50 rounded shadow-sm"
                    title="Elimina categoria"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {canManageCategories && (
        <div className="pt-2">
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Nuova categoria
          </Button>
        </div>
      )}

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
    </PageContainer>
  )
}
