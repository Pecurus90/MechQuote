import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import api from '@/lib/api'
import { useAuth, UserRole } from '@/lib/auth'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'

interface User {
  id: number
  username: string
  full_name: string | null
  email: string | null
  role: UserRole
  is_active: boolean
}

interface EditRow {
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  password: string
}

interface NewRow extends EditRow {
  username: string
}

const ROLES: { value: UserRole; label: string; color: string }[] = [
  { value: 'admin',           label: 'Admin',            color: 'bg-green-100 text-green-800' },
  { value: 'ufficio_tecnico', label: 'Ufficio Tecnico',  color: 'bg-blue-100 text-blue-800' },
  { value: 'officina',        label: 'Officina',         color: 'bg-gray-100 text-gray-800' },
  { value: 'amministrazione', label: 'Amministrazione',  color: 'bg-purple-100 text-purple-800' },
]

const roleBadge = (role: UserRole) => {
  const r = ROLES.find(r => r.value === role)
  return r ? (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.color}`}>{r.label}</span>
  ) : <span>{role}</span>
}

const emptyEdit = (): EditRow => ({
  full_name: '', email: '', role: 'ufficio_tecnico', is_active: true, password: ''
})
const emptyNew = (): NewRow => ({ ...emptyEdit(), username: '' })

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<EditRow>(emptyEdit())
  const [newRow, setNewRow] = useState<NewRow>(emptyNew())
  const [showNew, setShowNew] = useState(false)

  useEffect(() => { load() }, [])

  const load = () => {
    setLoading(true)
    api.get('/users').then(r => { setUsers(r.data); setLoading(false) })
  }

  const startEdit = (u: User) => {
    setEditingId(u.id)
    setEditRow({ full_name: u.full_name ?? '', email: u.email ?? '', role: u.role, is_active: u.is_active, password: '' })
    setShowNew(false)
  }

  const saveEdit = async (id: number) => {
    try {
      const payload: Record<string, unknown> = {
        full_name: editRow.full_name || null,
        email: editRow.email || null,
        role: editRow.role,
        is_active: editRow.is_active,
      }
      if (editRow.password) payload.password = editRow.password
      await api.put(`/users/${id}`, payload)
      toast.success('Utente aggiornato')
      setEditingId(null)
      load()
    } catch { toast.error('Errore nel salvataggio') }
  }

  const deleteUser = async (u: User) => {
    if (u.id === currentUser?.id) return
    if (!confirm(`Eliminare l'utente "${u.username}"?`)) return
    try {
      await api.delete(`/users/${u.id}`)
      toast.success('Utente eliminato')
      load()
    } catch { toast.error('Errore nella eliminazione') }
  }

  const createUser = async () => {
    if (!newRow.username) { toast.error('Username obbligatorio'); return }
    if (!newRow.password) { toast.error('Password obbligatoria per nuovo utente'); return }
    try {
      await api.post('/users', {
        username: newRow.username,
        password: newRow.password,
        full_name: newRow.full_name || null,
        email: newRow.email || null,
        role: newRow.role,
      })
      toast.success('Utente creato')
      setShowNew(false)
      setNewRow(emptyNew())
      load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Errore nella creazione')
    }
  }

  const inp = 'h-7 text-xs px-2'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti</h1>
          <p className="text-sm text-gray-500 mt-1">Crea e gestisci gli account di accesso</p>
        </div>
        {!showNew && (
          <Button size="sm" onClick={() => { setShowNew(true); setEditingId(null) }}>
            <Plus className="w-4 h-4 mr-1" /> Nuovo Utente
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-gray-500">Caricamento...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Nome</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Username</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Ruolo</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Attivo</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                    {editingId === u.id ? (
                      <>
                        <td className="px-3 py-2">
                          <Input className={inp} value={editRow.full_name}
                            onChange={e => setEditRow(r => ({ ...r, full_name: e.target.value }))}
                            placeholder="Nome completo" />
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{u.username}</td>
                        <td className="px-3 py-2">
                          <Input className={inp} value={editRow.email}
                            onChange={e => setEditRow(r => ({ ...r, email: e.target.value }))}
                            placeholder="email@esempio.it" />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="h-7 text-xs border rounded px-1.5 bg-white"
                            value={editRow.role}
                            onChange={e => setEditRow(r => ({ ...r, role: e.target.value as UserRole }))}
                          >
                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={editRow.is_active}
                            onChange={e => setEditRow(r => ({ ...r, is_active: e.target.checked }))}
                            className="rounded" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Input className={`${inp} w-28`} type="password"
                              value={editRow.password}
                              onChange={e => setEditRow(r => ({ ...r, password: e.target.value }))}
                              placeholder="Nuova pwd" />
                            <button onClick={() => saveEdit(u.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5">{u.full_name ?? <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{u.username}</td>
                        <td className="px-4 py-2.5 text-gray-500">{u.email ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-2.5">{roleBadge(u.role)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium ${u.is_active ? 'text-green-600' : 'text-red-400'}`}>
                            {u.is_active ? 'Sì' : 'No'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(u)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteUser(u)}
                              disabled={u.id === currentUser?.id}
                              title={u.id === currentUser?.id ? 'Non puoi eliminare il tuo account' : 'Elimina'}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}

                {/* New user row */}
                {showNew && (
                  <tr className="bg-blue-50 border-b">
                    <td className="px-3 py-2">
                      <Input className={inp} value={newRow.full_name}
                        onChange={e => setNewRow(r => ({ ...r, full_name: e.target.value }))}
                        placeholder="Nome completo" />
                    </td>
                    <td className="px-3 py-2">
                      <Input className={inp} value={newRow.username}
                        onChange={e => setNewRow(r => ({ ...r, username: e.target.value }))}
                        placeholder="username *" />
                    </td>
                    <td className="px-3 py-2">
                      <Input className={inp} value={newRow.email}
                        onChange={e => setNewRow(r => ({ ...r, email: e.target.value }))}
                        placeholder="email" />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="h-7 text-xs border rounded px-1.5 bg-white"
                        value={newRow.role}
                        onChange={e => setNewRow(r => ({ ...r, role: e.target.value as UserRole }))}
                      >
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={newRow.is_active}
                        onChange={e => setNewRow(r => ({ ...r, is_active: e.target.checked }))}
                        className="rounded" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Input className={`${inp} w-28`} type="password"
                          value={newRow.password}
                          onChange={e => setNewRow(r => ({ ...r, password: e.target.value }))}
                          placeholder="Password *" />
                        <button onClick={createUser} className="p-1 text-green-600 hover:bg-green-50 rounded">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setShowNew(false); setNewRow(emptyNew()) }}
                          className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
