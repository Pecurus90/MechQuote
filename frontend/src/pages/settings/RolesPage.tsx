import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import api from '@/lib/api'
import { Plus, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'

interface Role {
  id: number
  name: string
  label: string
  color: string
  permissions: string[]
}

const COLOR_OPTIONS = [
  { value: 'green',  label: 'Verde',   cls: 'bg-green-100 text-green-800' },
  { value: 'blue',   label: 'Blu',     cls: 'bg-blue-100 text-blue-800' },
  { value: 'gray',   label: 'Grigio',  cls: 'bg-gray-100 text-gray-800' },
  { value: 'purple', label: 'Viola',   cls: 'bg-purple-100 text-purple-800' },
  { value: 'amber',  label: 'Ambra',   cls: 'bg-amber-100 text-amber-800' },
  { value: 'red',    label: 'Rosso',   cls: 'bg-red-100 text-red-800' },
  { value: 'indigo', label: 'Indaco',  cls: 'bg-indigo-100 text-indigo-800' },
]

const colorClass = (color: string) =>
  COLOR_OPTIONS.find(c => c.value === color)?.cls ?? 'bg-gray-100 text-gray-800'

const emptyNew = () => ({ name: '', label: '', color: 'gray' })

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newRole, setNewRole] = useState(emptyNew())
  const [toggling, setToggling] = useState<string | null>(null)  // "roleId:key"

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get('/roles'),
        api.get('/permissions'),
      ])
      setRoles(rolesRes.data)
      setPermissions(permsRes.data)
    } finally {
      setLoading(false)
    }
  }

  const togglePermission = async (roleId: number, key: string) => {
    const tid = `${roleId}:${key}`
    if (toggling === tid) return
    setToggling(tid)
    try {
      const res = await api.patch(`/roles/${roleId}/permissions/${key}`)
      setRoles(prev => prev.map(r => r.id === roleId ? { ...r, permissions: res.data.permissions } : r))
    } catch {
      toast.error('Errore nel salvataggio del permesso')
    } finally {
      setToggling(null)
    }
  }

  const createRole = async () => {
    if (!newRole.name) { toast.error('Nome slug obbligatorio'); return }
    if (!newRole.label) { toast.error('Etichetta obbligatoria'); return }
    if (/\s/.test(newRole.name)) { toast.error('Il nome slug non può contenere spazi'); return }
    try {
      const res = await api.post('/roles', newRole)
      setRoles(prev => [...prev, res.data])
      setShowNew(false)
      setNewRole(emptyNew())
      toast.success('Ruolo creato')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Errore nella creazione')
    }
  }

  const deleteRole = async (role: Role) => {
    if (!confirm(`Eliminare il ruolo "${role.label}"?`)) return
    try {
      await api.delete(`/roles/${role.id}`)
      setRoles(prev => prev.filter(r => r.id !== role.id))
      toast.success('Ruolo eliminato')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Errore: il ruolo potrebbe essere in uso')
    }
  }

  const permKeys = Object.keys(permissions)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ruoli e Permessi</h1>
          <p className="text-sm text-gray-500 mt-1">Configura i permessi per ogni ruolo — salvato al click</p>
        </div>
        {!showNew && (
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuovo Ruolo
          </Button>
        )}
      </div>

      {/* New role form */}
      {showNew && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Nuovo ruolo</p>
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nome slug (senza spazi)</label>
                <Input
                  className="h-8 text-sm w-44"
                  placeholder="es. commerciale"
                  value={newRole.name}
                  onChange={e => setNewRole(r => ({ ...r, name: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Etichetta</label>
                <Input
                  className="h-8 text-sm w-48"
                  placeholder="es. Ufficio Commerciale"
                  value={newRole.label}
                  onChange={e => setNewRole(r => ({ ...r, label: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Colore</label>
                <select
                  className="h-8 text-sm border rounded px-2 bg-white"
                  value={newRole.color}
                  onChange={e => setNewRole(r => ({ ...r, color: e.target.value }))}
                >
                  {COLOR_OPTIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-1 pb-0.5 mt-4">
                <button onClick={createRole} className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => { setShowNew(false); setNewRole(emptyNew()) }}
                  className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="p-6 text-sm text-gray-500">Caricamento...</div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs w-56">Permesso</th>
                  {roles.map(role => (
                    <th key={role.id} className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass(role.color)}`}>
                          {role.label}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">{role.name}</span>
                        <button
                          onClick={() => deleteRole(role)}
                          className="p-0.5 text-gray-300 hover:text-red-400 transition-colors"
                          title="Elimina ruolo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permKeys.map(key => (
                  <tr key={key} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div>
                        <p className="text-xs font-medium text-gray-700">{permissions[key]}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{key}</p>
                      </div>
                    </td>
                    {roles.map(role => {
                      const checked = role.permissions.includes(key)
                      const tid = `${role.id}:${key}`
                      return (
                        <td key={role.id} className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => togglePermission(role.id, key)}
                            disabled={toggling === tid}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                              checked
                                ? 'bg-blue-500 border-blue-500 text-white'
                                : 'border-gray-300 hover:border-blue-400'
                            } ${toggling === tid ? 'opacity-50' : ''}`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
