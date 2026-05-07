import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Plus, Archive, FileText,
  Box, Cog, Layers, Ruler, Building2,
  Tag, Users, Database, ChevronDown, ChevronRight, LogOut, UserCog, ShieldCheck, Bell, Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useNotifications } from '@/lib/useNotifications'
import NotificationPanel from '@/components/layout/NotificationPanel'

const navLinkClass = (isActive: boolean, small = false) =>
  cn(
    'flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors',
    small ? 'text-xs' : 'text-sm',
    isActive
      ? 'bg-blue-50 text-blue-700 font-medium'
      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
  )

const sectionLabelClass = 'px-2 pt-2 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  ufficio_tecnico: 'Ufficio Tecnico',
  officina: 'Officina',
  amministrazione: 'Amministrazione',
}

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, hasRole, hasPermission, logout } = useAuth()

  const isQuotesActive = location.pathname.startsWith('/quotes')
  const isSettingsActive = location.pathname.startsWith('/settings')

  const isAdmin = hasRole('admin')
  const canQuote = hasPermission('quotes.create')
  const canDashboard = hasPermission('dashboard')
  const canCustomers = hasPermission('customers')
  const canSettings = hasPermission('settings')
  const canUsers = hasPermission('users')
  const canBackup = hasPermission('backup')

  const showCatalog = canSettings
  const showAziendaSection = isAdmin
  const showSystemSection = canUsers || canBackup
  const showSettingsRoot = showCatalog || showAziendaSection || showSystemSection

  const [quotesOpen, setQuotesOpen] = useState(isQuotesActive)
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive)
  const [notifOpen, setNotifOpen] = useState(false)

  const { enabled: notifEnabled, unreadCount, items, loading: notifLoading, fetchList, markRead, markConfirmed, clearRead } = useNotifications()

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

        {/* ─── Operatività quotidiana ─── */}

        {canDashboard && (
          <NavLink to="/dashboard" className={({ isActive }) => navLinkClass(isActive)}>
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>
        )}

        <div className="pt-1">
          <button
            onClick={() => setQuotesOpen(o => !o)}
            className={cn(
              'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
              isQuotesActive ? 'text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 shrink-0" />
              <span>Preventivazione</span>
            </span>
            {quotesOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
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
            </div>
          )}
        </div>

        {canCustomers && (
          <NavLink to="/settings/customers" className={({ isActive }) => navLinkClass(isActive)}>
            <Users className="w-4 h-4 shrink-0" />
            <span>Clienti</span>
          </NavLink>
        )}

        {/* ─── Configurazione ─── */}

        {showSettingsRoot && (
          <div className="pt-1">
            <button
              onClick={() => setSettingsOpen(o => !o)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
                isSettingsActive ? 'text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span className="flex items-center gap-2">
                <Settings className="w-4 h-4 shrink-0" />
                <span>Impostazioni</span>
              </span>
              {settingsOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
            </button>

            {settingsOpen && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">

                {showCatalog && (
                  <>
                    <p className={sectionLabelClass}>Catalogo</p>
                    <NavLink to="/settings/materials" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Box className="w-3.5 h-3.5 shrink-0" />
                      <span>Materiali</span>
                    </NavLink>
                    <NavLink to="/settings/machines" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Cog className="w-3.5 h-3.5 shrink-0" />
                      <span>Macchine</span>
                    </NavLink>
                    <NavLink to="/settings/treatments" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Ruler className="w-3.5 h-3.5 shrink-0" />
                      <span>Trattamenti</span>
                    </NavLink>
                    <NavLink to="/settings/templates" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Layers className="w-3.5 h-3.5 shrink-0" />
                      <span>Template Fasi</span>
                    </NavLink>
                    <NavLink to="/settings/categories" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Tag className="w-3.5 h-3.5 shrink-0" />
                      <span>Categorie</span>
                    </NavLink>
                  </>
                )}

                {showAziendaSection && (
                  <>
                    <p className={sectionLabelClass}>Azienda</p>
                    <NavLink to="/settings/company" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Dati Azienda</span>
                    </NavLink>
                  </>
                )}

                {showSystemSection && (
                  <>
                    <p className={sectionLabelClass}>Sistema</p>
                    {canUsers && (
                      <NavLink to="/settings/users" className={({ isActive }) => navLinkClass(isActive, true)}>
                        <UserCog className="w-3.5 h-3.5 shrink-0" />
                        <span>Utenti</span>
                      </NavLink>
                    )}
                    {canUsers && (
                      <NavLink to="/settings/roles" className={({ isActive }) => navLinkClass(isActive, true)}>
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>Ruoli e Permessi</span>
                      </NavLink>
                    )}
                    {canBackup && (
                      <NavLink to="/settings/backup" className={({ isActive }) => navLinkClass(isActive, true)}>
                        <Database className="w-3.5 h-3.5 shrink-0" />
                        <span>Backup / Esporta</span>
                      </NavLink>
                    )}
                  </>
                )}

              </div>
            )}
          </div>
        )}

      </nav>

      {/* Footer: utente loggato + notifiche + logout */}
      {user && (
        <div className="p-3 border-t">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{user.full_name || user.username}</p>
              <p className="text-[10px] text-gray-400">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {notifEnabled && (
                <button
                  onClick={() => setNotifOpen(true)}
                  className="relative p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Notifiche"
                >
                  <Bell className="w-3.5 h-3.5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[9px] leading-[14px] text-center font-semibold px-0.5">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Esci"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <NotificationPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        items={items}
        loading={notifLoading}
        onRefresh={fetchList}
        onMarkRead={markRead}
        onMarkConfirmed={markConfirmed}
        onClearRead={clearRead}
      />
    </aside>
  )
}
