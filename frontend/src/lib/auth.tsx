import { createContext, useContext, useEffect, useState } from 'react'
import api from '@/lib/api'

export type UserRole = 'admin' | 'ufficio_tecnico' | 'officina' | 'amministrazione'

export interface AuthUser {
  id: number
  username: string
  full_name: string | null
  email: string | null
  role: UserRole
  permissions: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  setUser: (u: AuthUser | null) => void
  hasRole: (...roles: UserRole[]) => boolean
  hasPermission: (key: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  setUser: () => {},
  hasRole: () => false,
  hasPermission: () => false,
  logout: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    api.get('/auth/me')
      .then(r => setUser(r.data as AuthUser))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  const hasRole = (...roles: UserRole[]) => !!user && roles.includes(user.role)
  const hasPermission = (key: string) => !!user && user.permissions.includes(key)

  return (
    <AuthContext.Provider value={{ user, loading, setUser, hasRole, hasPermission, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
