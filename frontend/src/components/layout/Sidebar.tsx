import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Plus, Archive, FileText,
  Box, Cog, Layers, Ruler, Building2, FileText as FileTextIcon,
  Palette, Tag, Users, Database, ChevronDown, ChevronRight, LogOut, UserCog
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'

const navLinkClass = (isActive: boolean, small = false) =>
  cn(
    'flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors',
    small ? 'text-xs' : 'text-sm',
    isActive
      ? 'bg-blue-50 text-blue-700 font-medium'
      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
  )

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  ufficio_tecnico: 'Ufficio Tecnico',
  officina: 'Officina',
  amministrazione: 'Amministrazione',
}

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, hasRole, logout } = useAuth()

  const isQuotesActive = location.pathname.startsWith('/quotes')
  const isSystemActive =
    location.pathname.startsWith('/settings/customers') ||
    location.pathname.startsWith('/settings/company') ||
    location.pathname.startsWith('/settings/backup') ||
    location.pathname.startsWith('/settings/users')

  const isAdmin = hasRole('admin')
  const canQuote = hasRole('admin', 'ufficio_tecnico')
  const canDashboard = hasRole('admin', 'ufficio_tecnico', 'amministrazione')
  const canCustomers = hasRole('admin', 'ufficio_tecnico')
  // "Impostazioni" section visible only if at least one item is visible = admin
  const hasSettingsItems = isAdmin

  const [quotesOpen, setQuotesOpen] = useState(
    isQuotesActive || (location.pathname.startsWith('/settings') && !isSystemActive)
  )
  const [systemOpen, setSystemOpen] = useState(isSystemActive)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-60 bg-white border-r h-screen sticky top-0 flex flex-col shrink-0">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">FDV</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">MechQuote</h1>
            <p className="text-xs text-gray-500">Fratelli Dalla Via</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">

        {/* Dashboard */}
        {canDashboard && (
          <NavLink to="/dashboard" className={({ isActive }) => navLinkClass(isActive)}>
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>
        )}

        {/* Preventivazione */}
        <div className="pt-1">
          <button
            onClick={() => setQuotesOpen(o => !o)}
            className={cn(
              'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
              (isQuotesActive || (location.pathname.startsWith('/settings') && !isSystemActive))
                ? 'text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 shrink-0" />
              <span>Preventivazione</span>
            </span>
            {quotesOpen
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            }
          </button>

          {quotesOpen && (
            <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">

              {canQuote && (
                <NavLink to="/quotes/new" className={({ isActive }) => navLinkClass(isActive, true)}>
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Nuovo Preventivo</span>
                </NavLink>
              )}
              <NavLink to="/quotes/archive" className={({ isActive }) => navLinkClass(isActive, true)}>
                <Archive className="w-3.5 h-3.5 shrink-0" />
                <span>Archivio Preventivi</span>
              </NavLink>

              {hasSettingsItems && (
                <>
                  <p className="px-2 pt-2 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Impostazioni
                  </p>
                  <NavLink to="/settings/materials" className={({ isActive }) => navLinkClass(isActive, true)}>
                    <Box className="w-3.5 h-3.5 shrink-0" />
                    <span>Materiali</span>
                  </NavLink>
                  <NavLink to="/settings/machines" className={({ isActive }) => navLinkClass(isActive, true)}>
                    <Cog className="w-3.5 h-3.5 shrink-0" />
                    <span>Macchine</span>
                  </NavLink>
                  <NavLink to="/settings/templates" className={({ isActive }) => navLinkClass(isActive, true)}>
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span>Template Fasi</span>
                  </NavLink>
                  <NavLink to="/settings/treatments" className={({ isActive }) => navLinkClass(isActive, true)}>
                    <Ruler className="w-3.5 h-3.5 shrink-0" />
                    <span>Trattamenti</span>
                  </NavLink>
                  <NavLink to="/settings/cost-rules" className={({ isActive }) => navLinkClass(isActive, true)}>
                    <FileTextIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>Regole di Costo</span>
                  </NavLink>
                  <NavLink to="/settings/step-colors" className={({ isActive }) => navLinkClass(isActive, true)}>
                    <Palette className="w-3.5 h-3.5 shrink-0" />
                    <span>Colori STEP</span>
                  </NavLink>
                  <NavLink to="/settings/categories" className={({ isActive }) => navLinkClass(isActive, true)}>
                    <Tag className="w-3.5 h-3.5 shrink-0" />
                    <span>Categorie</span>
                  </NavLink>
                </>
              )}

            </div>
          )}
        </div>

        {/* Anagrafica e Sistema */}
        {(canCustomers || isAdmin) && (
          <div className="pt-1">
            <button
              onClick={() => setSystemOpen(o => !o)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
                isSystemActive
                  ? 'text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 shrink-0" />
                <span>Anagrafica e Sistema</span>
              </span>
              {systemOpen
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              }
            </button>

            {systemOpen && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">
                {canCustomers && (
                  <NavLink to="/settings/customers" className={({ isActive }) => navLinkClass(isActive, true)}>
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span>Clienti</span>
                  </NavLink>
                )}
                {isAdmin && (
                  <>
                    <NavLink to="/settings/company" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Dati Azienda</span>
                    </NavLink>
                    <NavLink to="/settings/backup" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Database className="w-3.5 h-3.5 shrink-0" />
                      <span>Backup / Esporta</span>
                    </NavLink>
                    <NavLink to="/settings/users" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <UserCog className="w-3.5 h-3.5 shrink-0" />
                      <span>Utenti</span>
                    </NavLink>
                  </>
                )}
              </div>
            )}
          </div>
        )}

      </nav>

      {/* Footer: utente loggato + logout */}
      {user && (
        <div className="p-3 border-t">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{user.full_name || user.username}</p>
              <p className="text-[10px] text-gray-400">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Esci"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
