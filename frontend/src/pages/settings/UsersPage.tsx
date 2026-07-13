import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Plus, UserCog, Pencil, Trash2 } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import StandardPage from '@/components/layout/StandardPage'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { tWrap, tHead, tRow, editRowStyle, EditActions } from '@/components/settings/inlineEdit'
import { RoleBadge } from '@/components/settings/RoleBadge'
import type { ApiUser, Role as ApiRole } from '@/types'

type User = ApiUser
interface EditRow { full_name: string; email: string; role: string; is_active: boolean; password: string }
interface NewRow extends EditRow { username: string }

const emptyEdit = (): EditRow => ({ full_name: '', email: '', role: 'ufficio_tecnico', is_active: true, password: '' })
const emptyNew = (): NewRow => ({ ...emptyEdit(), username: '' })
const inp = 'h-8 text-xs'

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<ApiRole[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<EditRow>(emptyEdit())
  const [newRow, setNewRow] = useState<NewRow>(emptyNew())
  const [showNew, setShowNew] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<User | null>(null)

  useEffect(() => { load() }, [])
  const load = () => { setLoading(true); Promise.all([api.get('/users'), api.get('/roles')]).then(([usersRes, rolesRes]) => { setUsers(usersRes.data); setRoles(rolesRes.data); setLoading(false) }) }

  const roleOf = (name: string) => roles.find(r => r.name === name)
  const startEdit = (u: User) => { setEditingId(u.id); setEditRow({ full_name: u.full_name ?? '', email: u.email ?? '', role: u.role, is_active: u.is_active, password: '' }); setShowNew(false) }

  const saveEdit = async (id: number) => {
    try {
      const payload: Record<string, unknown> = { full_name: editRow.full_name || null, email: editRow.email || null, role: editRow.role, is_active: editRow.is_active }
      if (editRow.password) payload.password = editRow.password
      await api.put(`/users/${id}`, payload)
      toast.success('Utente aggiornato'); setEditingId(null); load()
    } catch (e) { const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail; toast.error(msg || 'Errore nel salvataggio') }
  }
  const confirmDeleteUser = async () => {
    if (!pendingDelete) return
    const u = pendingDelete; setPendingDelete(null)
    try { await api.delete(`/users/${u.id}`); toast.success('Utente eliminato'); load() }
    catch (e) { const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail; toast.error(msg || 'Errore nella eliminazione') }
  }
  const createUser = async () => {
    if (!newRow.username) { toast.error('Username obbligatorio'); return }
    if (!newRow.password) { toast.error('Password obbligatoria per nuovo utente'); return }
    try {
      await api.post('/users', { username: newRow.username, password: newRow.password, full_name: newRow.full_name || null, email: newRow.email || null, role: newRow.role })
      toast.success('Utente creato'); setShowNew(false); setNewRow(emptyNew()); load()
    } catch (e) { const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail; toast.error(msg ?? 'Errore nella creazione') }
  }

  const roleSelect = (value: string, on: (v: string) => void) => (
    <select className="h-8 rounded-md border border-input bg-background px-1.5 text-xs" value={value} onChange={e => on(e.target.value)}>
      {roles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
    </select>
  )

  return (
    <StandardPage
      icon={UserCog} color="gray" width="xl"
      title="Gestione utenti"
      subtitle="Crea e gestisci gli account di accesso"
      actions={!showNew ? <PrimaryCtaButton color="primary" size="sm" onClick={() => { setShowNew(true); setEditingId(null) }}><Plus className="h-4 w-4" /> Nuovo utente</PrimaryCtaButton> : undefined}
    >
      <div className={tWrap}>
        {loading ? <div className="p-6 text-sm text-muted-foreground">Caricamento…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <colgroup><col /><col style={{ width: 160 }} /><col /><col style={{ width: 160 }} /><col style={{ width: 80 }} /><col style={{ width: 220 }} /></colgroup>
              <thead>
                <tr className={tHead}>
                  <th className="p-2.5 text-left font-medium">Nome</th>
                  <th className="p-2.5 text-left font-medium">Username</th>
                  <th className="p-2.5 text-left font-medium">Email</th>
                  <th className="p-2.5 text-left font-medium">Ruolo</th>
                  <th className="p-2.5 text-center font-medium">Attivo</th>
                  <th className="p-2.5 text-center font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => editingId === u.id ? (
                  <tr key={u.id} className="border-b border-border bg-primary/[0.05]" style={editRowStyle('primary')}>
                    <td className="p-2"><Input className={inp} value={editRow.full_name} onChange={e => setEditRow(r => ({ ...r, full_name: e.target.value }))} placeholder="Nome completo" /></td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{u.username}</td>
                    <td className="p-2"><Input className={inp} value={editRow.email} onChange={e => setEditRow(r => ({ ...r, email: e.target.value }))} placeholder="email@esempio.it" /></td>
                    <td className="p-2">{roleSelect(editRow.role, v => setEditRow(r => ({ ...r, role: v })))}</td>
                    <td className="p-2 text-center"><input type="checkbox" className="accent-primary" checked={editRow.is_active} onChange={e => setEditRow(r => ({ ...r, is_active: e.target.checked }))} /></td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-1">
                        <Input className={`${inp} w-32`} type="password" value={editRow.password} onChange={e => setEditRow(r => ({ ...r, password: e.target.value }))} placeholder="Nuova pwd (opz.)" />
                        <EditActions onSave={() => saveEdit(u.id)} onCancel={() => setEditingId(null)} />
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id} className={tRow}>
                    <td className="p-2.5">{u.full_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2.5 font-mono text-xs text-muted-foreground">{u.username}</td>
                    <td className="p-2.5 text-muted-foreground">{u.email ?? <span className="text-muted-foreground/50">—</span>}</td>
                    <td className="p-2.5">{roleOf(u.role) ? <RoleBadge label={roleOf(u.role)!.label} color={roleOf(u.role)!.color} /> : <span className="text-xs text-muted-foreground">{u.role}</span>}</td>
                    <td className="p-2.5 text-center"><span className={`text-xs font-medium ${u.is_active ? 'text-success' : 'text-muted-foreground'}`}>{u.is_active ? 'Sì' : 'No'}</span></td>
                    <td className="p-2.5">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => startEdit(u)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Modifica"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => u.id !== currentUser?.id && setPendingDelete(u)} disabled={u.id === currentUser?.id} title={u.id === currentUser?.id ? 'Non puoi eliminare il tuo account' : 'Elimina'} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}

                {showNew && (
                  <tr className="border-t-2 border-dashed border-border bg-primary/[0.04]">
                    <td className="p-2"><Input className={inp} value={newRow.full_name} onChange={e => setNewRow(r => ({ ...r, full_name: e.target.value }))} placeholder="Nome completo" /></td>
                    <td className="p-2"><Input className={inp} value={newRow.username} onChange={e => setNewRow(r => ({ ...r, username: e.target.value }))} placeholder="username *" /></td>
                    <td className="p-2"><Input className={inp} value={newRow.email} onChange={e => setNewRow(r => ({ ...r, email: e.target.value }))} placeholder="email" /></td>
                    <td className="p-2">{roleSelect(newRow.role, v => setNewRow(r => ({ ...r, role: v })))}</td>
                    <td className="p-2 text-center"><input type="checkbox" className="accent-primary" checked={newRow.is_active} onChange={e => setNewRow(r => ({ ...r, is_active: e.target.checked }))} /></td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-1">
                        <Input className={`${inp} w-32`} type="password" value={newRow.password} onChange={e => setNewRow(r => ({ ...r, password: e.target.value }))} placeholder="Password *" />
                        <EditActions onSave={createUser} onCancel={() => { setShowNew(false); setNewRow(emptyNew()) }} />
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmDialog open={pendingDelete != null} title={`Eliminare l'utente "${pendingDelete?.username ?? ''}"?`} confirmLabel="Elimina" onConfirm={confirmDeleteUser} onCancel={() => setPendingDelete(null)} />
    </StandardPage>
  )
}
