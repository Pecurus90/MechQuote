import { useState, useEffect, Fragment } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { Plus, Trash2, Check, X, Minus, ShieldCheck, Loader2 } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { tWrap } from '@/components/settings/inlineEdit'
import { RoleBadge, roleBadgeClass, ROLE_COLOR_OPTIONS } from '@/components/settings/RoleBadge'
import type { Role } from '@/types'

const COLOR_LABEL: Record<string, string> = { green: 'Verde', blue: 'Blu', gray: 'Grigio', purple: 'Viola', amber: 'Ambra', red: 'Rosso', indigo: 'Indaco' }
const emptyNew = () => ({ name: '', label: '', color: 'gray' })

interface PermItem { key: string; label: string }
interface PermGroup { group: string; items: PermItem[] }

const cellBase = 'mx-auto flex h-5 w-5 items-center justify-center rounded border-2 transition-colors'

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [groups, setGroups] = useState<PermGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newRole, setNewRole] = useState(emptyNew())
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [togglingGroup, setTogglingGroup] = useState<string | null>(null)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    try {
      const [rolesRes, permsRes] = await Promise.all([api.get('/roles'), api.get('/permissions/grouped')])
      setRoles(rolesRes.data); setGroups(permsRes.data)
    } finally { setLoading(false) }
  }

  const togglePermission = async (roleId: number, key: string) => {
    const tid = `${roleId}:${key}`
    if (toggling === tid) return
    setToggling(tid)
    try { const res = await api.patch(`/roles/${roleId}/permissions/${key}`); setRoles(prev => prev.map(r => r.id === roleId ? { ...r, permissions: res.data.permissions } : r)) }
    catch { toast.error('Errore nel salvataggio del permesso') } finally { setToggling(null) }
  }
  const toggleGroup = async (roleId: number, group: PermGroup) => {
    const gid = `${roleId}:${group.group}`
    if (togglingGroup === gid) return
    const role = roles.find(r => r.id === roleId); if (!role) return
    const keys = group.items.map(i => i.key)
    const value = !keys.every(k => (role.permissions ?? []).includes(k))
    setTogglingGroup(gid)
    try { const res = await api.patch(`/roles/${roleId}/permissions`, { keys, value }); setRoles(prev => prev.map(r => r.id === roleId ? { ...r, permissions: res.data.permissions } : r)) }
    catch { toast.error('Errore nel salvataggio del gruppo') } finally { setTogglingGroup(null) }
  }
  const createRole = async () => {
    if (!newRole.name) { toast.error('Nome slug obbligatorio'); return }
    if (!newRole.label) { toast.error('Etichetta obbligatoria'); return }
    if (/\s/.test(newRole.name)) { toast.error('Il nome slug non può contenere spazi'); return }
    try { const res = await api.post('/roles', newRole); setRoles(prev => [...prev, res.data]); setShowNew(false); setNewRole(emptyNew()); toast.success('Ruolo creato') }
    catch (e) { const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail; toast.error(msg ?? 'Errore nella creazione') }
  }
  const confirmDeleteRole = async () => {
    if (!pendingDelete) return
    const role = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/roles/${role.id}`); setRoles(prev => prev.filter(r => r.id !== role.id)); toast.success('Ruolo eliminato') }
    catch (e) { const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail; toast.error(msg ?? 'Errore: il ruolo potrebbe essere in uso') }
  }

  return (
    <StandardPage
      icon={ShieldCheck} color="gray" width="xl"
      title="Ruoli e Permessi"
      subtitle="Configura i permessi per ogni ruolo — salvato al click"
      actions={!showNew ? <PrimaryCtaButton color="primary" size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> Nuovo ruolo</PrimaryCtaButton> : undefined}
    >
      {showNew && (
        <div className="rounded-2xl border border-border bg-card-muted p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Nuovo ruolo</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Nome slug (senza spazi)</label>
              <Input className="h-9 w-44 font-mono" placeholder="es. commerciale" value={newRole.name} onChange={e => setNewRole(r => ({ ...r, name: e.target.value.toLowerCase().replace(/\s/g, '_') }))} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Etichetta</label>
              <Input className="h-9 w-48" placeholder="es. Ufficio commerciale" value={newRole.label} onChange={e => setNewRole(r => ({ ...r, label: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Colore</label>
              <div className="flex gap-1.5">
                {ROLE_COLOR_OPTIONS.map(c => (
                  <button key={c} type="button" onClick={() => setNewRole(r => ({ ...r, color: c }))} title={COLOR_LABEL[c]}
                    className={`h-7 w-7 rounded-full ${roleBadgeClass(c)} ${newRole.color === c ? 'ring-2 ring-ring ring-offset-1 ring-offset-card-muted' : ''}`}>
                    <span className="mx-auto block h-2 w-2 rounded-full bg-current" />
                  </button>
                ))}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowNew(false); setNewRole(emptyNew()) }}>Annulla</Button>
              <PrimaryCtaButton color="primary" size="sm" onClick={createRole}><Check className="h-4 w-4" /> Crea ruolo</PrimaryCtaButton>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="p-6 text-sm text-muted-foreground">Caricamento…</div> : (
        <div className={tWrap}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card-muted">
                  <th className="w-56 px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Permesso</th>
                  {roles.map(role => (
                    <th key={role.id} className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <RoleBadge label={role.label} color={role.color} />
                        <span className="font-mono text-[10px] text-muted-foreground">{role.name}</span>
                        <button onClick={() => setPendingDelete(role)} className="text-muted-foreground/50 transition-colors hover:text-danger" title="Elimina ruolo"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(group => {
                  const keys = group.items.map(i => i.key)
                  return (
                    <Fragment key={group.group}>
                      <tr className="border-y border-border bg-muted/[0.5]">
                        <td className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.group}</td>
                        {roles.map(role => {
                          const perms = role.permissions ?? []
                          const onCount = keys.filter(k => perms.includes(k)).length
                          const allOn = onCount === keys.length && keys.length > 0
                          const some = onCount > 0 && !allOn
                          const gid = `${role.id}:${group.group}`
                          const busy = togglingGroup === gid
                          return (
                            <td key={role.id} className="px-4 py-1.5 text-center">
                              <button onClick={() => toggleGroup(role.id, group)} disabled={busy}
                                title={allOn ? 'Disattiva tutto il gruppo' : 'Attiva tutto il gruppo'}
                                className={`${cellBase} ${allOn ? 'border-success bg-success text-white' : some ? 'border-warning bg-warning/[0.18] text-warning' : 'border-input bg-card hover:border-primary'}`}>
                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : allOn ? <Check className="h-3 w-3" /> : some ? <Minus className="h-3 w-3" /> : null}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                      {group.items.map(item => (
                        <tr key={item.key} className="border-b border-border transition-colors last:border-0 hover:bg-muted/[0.45]">
                          <td className="px-4 py-2.5 pl-8">
                            <p className="text-xs font-medium text-foreground">{item.label}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{item.key}</p>
                          </td>
                          {roles.map(role => {
                            const checked = (role.permissions ?? []).includes(item.key)
                            const tid = `${role.id}:${item.key}`
                            const busy = toggling === tid
                            return (
                              <td key={role.id} className="px-4 py-2.5 text-center">
                                <button onClick={() => togglePermission(role.id, item.key)} disabled={busy}
                                  className={`${cellBase} ${checked ? 'border-success bg-success text-white' : 'border-input bg-card hover:border-primary'}`}>
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : checked ? <Check className="h-3 w-3" /> : null}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ConfirmDialog open={pendingDelete != null} title={`Eliminare il ruolo "${pendingDelete?.label ?? ''}"?`} confirmLabel="Elimina" onConfirm={confirmDeleteRole} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
