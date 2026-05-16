import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Plus, Archive, FileText, Activity,
  Box, Cog, Layers, Ruler, Building2, Workflow,
  Tag, Users, Database, ChevronDown, ChevronRight, LogOut, UserCog, ShieldCheck, Bell, Settings,
  Zap, Gauge, Drill, SlidersHorizontal, Package, ShoppingCart, Wrench, Hammer,
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
  const { user, hasPermission, logout } = useAuth()

  const isQuotesActive = location.pathname.startsWith('/quotes')
  const isOrdersActive = location.pathname.startsWith('/orders')
  const isSettingsActive = location.pathname.startsWith('/settings')

  const canQuote = hasPermission('quotes.create')
  const canArchive = hasPermission('quotes.archive')
  const canDashboard = hasPermission('dashboard')
  const canCustomers = hasPermission('customers')
  const canSettings = hasPermission('settings')
  const canCompany = hasPermission('company')
  const canUsers = hasPermission('users')
  const canBackup = hasPermission('backup')
  const canOrdersMaterials = hasPermission('orders.materials')

  const showCatalog = canSettings
  const showAziendaSection = canCompany
  const showSystemSection = canUsers || canBackup
  const canTools = hasPermission('tools')
  const showSettingsRoot = showCatalog || canTools || showAziendaSection || showSystemSection

  const [quotesOpen, setQuotesOpen] = useState(isQuotesActive)
  const [ordersOpen, setOrdersOpen] = useState(isOrdersActive)
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive)
  const [notifOpen, setNotifOpen] = useState(false)

  const { enabled: notifEnabled, unreadCount, items, loading: notifLoading, fetchList, markRead, markConfirmed, clearRead } = useNotifications()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-60 bg-card border-r h-screen sticky top-0 flex flex-col shrink-0">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">FDV</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground leading-tight">MechQuote</h1>
            <p className="text-xs text-muted-foreground">Fratelli Dalla Via</p>
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
              {canArchive && (
                <NavLink to="/quotes/archive" className={({ isActive }) => navLinkClass(isActive, true)}>
                  <Archive className="w-3.5 h-3.5 shrink-0" />
                  <span>Archivio Preventivi</span>
                </NavLink>
              )}
            </div>
          )}
        </div>

        {/* ─── Ordini (collapsible) ─── */}
        {canOrdersMaterials && (
          <div className="pt-1">
            <button
              onClick={() => setOrdersOpen(o => !o)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
                isOrdersActive ? 'text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 shrink-0" />
                <span>Ordini</span>
              </span>
              {ordersOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
            </button>
            {ordersOpen && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">
                <NavLink to="/orders/materials" className={({ isActive }) => navLinkClass(isActive, true)}>
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <span>Ordini materiali</span>
                </NavLink>
                <NavLink to="/orders/tools" className={({ isActive }) => navLinkClass(isActive, true)}>
                  <Wrench className="w-3.5 h-3.5 shrink-0" />
                  <span>Ordini utensili</span>
                </NavLink>
              </div>
            )}
          </div>
        )}

        {canCustomers && (
          <NavLink to="/settings/customers" className={({ isActive }) => navLinkClass(isActive)}>
            <Users className="w-4 h-4 shrink-0" />
            <span>Clienti</span>
          </NavLink>
        )}

        {hasPermission('tools') && (
          <NavLink to="/tools" className={({ isActive }) => navLinkClass(isActive)}>
            <Wrench className="w-4 h-4 shrink-0" />
            <span>Utensili</span>
          </NavLink>
        )}

        {hasPermission('officina') && (
          <NavLink to="/officina" className={({ isActive }) => navLinkClass(isActive)}>
            <Hammer className="w-4 h-4 shrink-0" />
            <span>Officina</span>
          </NavLink>
        )}

        {canDashboard && (
          <NavLink to="/activity" className={({ isActive }) => navLinkClass(isActive)}>
            <Activity className="w-4 h-4 shrink-0" />
            <span>Attività</span>
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
                      <span>Centri di costo</span>
                    </NavLink>
                    <NavLink to="/settings/treatments" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Ruler className="w-3.5 h-3.5 shrink-0" />
                      <span>Trattamenti</span>
                    </NavLink>
                    <NavLink to="/settings/operations" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Layers className="w-3.5 h-3.5 shrink-0" />
                      <span>Lavorazioni</span>
                    </NavLink>
                    <NavLink to="/settings/workflows" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Workflow className="w-3.5 h-3.5 shrink-0" />
                      <span>Template flusso</span>
                    </NavLink>
                    <NavLink to="/settings/categories" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Tag className="w-3.5 h-3.5 shrink-0" />
                      <span>Categorie</span>
                    </NavLink>
                  </>
                )}

                {hasPermission('tools') && (
                  <>
                    <p className={sectionLabelClass}>Utensili</p>
                    <NavLink to="/settings/tool-attributes" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Wrench className="w-3.5 h-3.5 shrink-0" />
                      <span>Attributi utensili</span>
                    </NavLink>
                  </>
                )}

                {(showCatalog || hasPermission('tools')) && (
                  <>
                    <p className={sectionLabelClass}>Fornitori</p>
                    {showCatalog && (
                      <NavLink to="/settings/material-suppliers" className={({ isActive }) => navLinkClass(isActive, true)}>
                        <Box className="w-3.5 h-3.5 shrink-0" />
                        <span>Fornitori materiali</span>
                      </NavLink>
                    )}
                    {showCatalog && (
                      <NavLink to="/settings/treatment-suppliers" className={({ isActive }) => navLinkClass(isActive, true)}>
                        <Ruler className="w-3.5 h-3.5 shrink-0" />
                        <span>Fornitori trattamenti</span>
                      </NavLink>
                    )}
                    {hasPermission('tools') && (
                      <NavLink to="/settings/tool-suppliers" className={({ isActive }) => navLinkClass(isActive, true)}>
                        <Wrench className="w-3.5 h-3.5 shrink-0" />
                        <span>Fornitori utensili</span>
                      </NavLink>
                    )}
                    {showCatalog && (
                      <NavLink to="/settings/normalized-suppliers" className={({ isActive }) => navLinkClass(isActive, true)}>
                        <Cog className="w-3.5 h-3.5 shrink-0" />
                        <span>Fornitori normalizzati</span>
                      </NavLink>
                    )}
                  </>
                )}

                {showCatalog && (
                  <>
                    <p className={sectionLabelClass}>Wire EDM</p>
                    <NavLink to="/settings/edm/config" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                      <span>Parametri globali</span>
                    </NavLink>
                    <NavLink to="/settings/edm/speeds" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Gauge className="w-3.5 h-3.5 shrink-0" />
                      <span>Velocità di taglio</span>
                    </NavLink>
                    <NavLink to="/settings/edm/cycles" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Zap className="w-3.5 h-3.5 shrink-0" />
                      <span>Cicli di taglio</span>
                    </NavLink>
                    <NavLink to="/settings/edm/drilling" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Drill className="w-3.5 h-3.5 shrink-0" />
                      <span>Tempi foratura</span>
                    </NavLink>
                  </>
                )}

                {hasPermission('dies.settings') && (
                  <>
                    <p className={sectionLabelClass}>Stampi</p>
                    <NavLink to="/settings/dies" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Hammer className="w-3.5 h-3.5 shrink-0" />
                      <span>Tariffe & template</span>
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
              <p className="text-xs font-medium text-foreground truncate">{user.full_name || user.username}</p>
              <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
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
