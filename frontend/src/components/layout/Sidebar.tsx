import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, LineChart, Plus, Archive, FileText, Activity,
  Box, Building2, ClipboardList,
  Tag, Users, ChevronDown, ChevronRight, LogOut, Bell, Settings,
  Zap, Package, ShoppingCart, Wrench, Hammer,
  Truck, Factory, Shield, Sun, Moon, History,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { useNotifications } from '@/lib/useNotifications'
import NotificationPanel from '@/components/layout/NotificationPanel'

const navLinkClass = (isActive: boolean, small = false) =>
  cn(
    'flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors',
    small ? 'text-xs' : 'text-sm',
    isActive
      ? 'bg-primary/10 text-primary font-medium'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  )

const sectionLabelClass = 'px-2 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider'

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
  const { theme, toggle: toggleTheme } = useTheme()

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
  const canOrdersTools = hasPermission('orders.tools')

  const showCatalog = canSettings
  const showAziendaSection = canCompany
  const showSystemSection = canUsers || canBackup
  const canTools = hasPermission('tools')
  const showSettingsRoot = showCatalog || canTools || showAziendaSection || showSystemSection

  const [quotesOpen, setQuotesOpen] = useState(isQuotesActive)
  const [ordersOpen, setOrdersOpen] = useState(isOrdersActive)
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive)
  const [notifOpen, setNotifOpen] = useState(false)

  const { enabled: notifEnabled, unreadCount, items, loading: notifLoading, fetchList, markRead, markAllRead, clearRead } = useNotifications()

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

        {canDashboard && (
          <NavLink to="/statistics" className={({ isActive }) => navLinkClass(isActive)}>
            <LineChart className="w-4 h-4 shrink-0" />
            <span>Statistiche</span>
          </NavLink>
        )}

        <div className="pt-1">
          <button
            onClick={() => setQuotesOpen(o => !o)}
            className={cn(
              'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
              isQuotesActive ? 'text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 shrink-0" />
              <span>Preventivazione</span>
            </span>
            {quotesOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>

          {quotesOpen && (
            <div className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
              {canQuote && (
                <NavLink to="/quotes/new" className={({ isActive }) => navLinkClass(isActive, true)}>
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Nuovo Preventivo</span>
                </NavLink>
              )}
              {canArchive && (
                <NavLink to="/quotes/active" className={({ isActive }) => navLinkClass(isActive, true)}>
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  <span>Preventivi in corso</span>
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
        {(canOrdersMaterials || canOrdersTools) && (
          <div className="pt-1">
            <button
              onClick={() => setOrdersOpen(o => !o)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
                isOrdersActive ? 'text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 shrink-0" />
                <span>Ordini</span>
              </span>
              {ordersOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
            {ordersOpen && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
                {canOrdersMaterials && (
                  <NavLink to="/orders/materials" className={({ isActive }) => navLinkClass(isActive, true)}>
                    <Package className="w-3.5 h-3.5 shrink-0" />
                    <span>Ordini materiali</span>
                  </NavLink>
                )}
                {canOrdersTools && (
                  <NavLink to="/orders/tools" className={({ isActive }) => navLinkClass(isActive, true)}>
                    <Wrench className="w-3.5 h-3.5 shrink-0" />
                    <span>Ordini utensili</span>
                  </NavLink>
                )}
                <NavLink to="/orders/history" className={({ isActive }) => navLinkClass(isActive, true)}>
                  <History className="w-3.5 h-3.5 shrink-0" />
                  <span>Storico ordini</span>
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
                isSettingsActive ? 'text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <span className="flex items-center gap-2">
                <Settings className="w-4 h-4 shrink-0" />
                <span>Impostazioni</span>
              </span>
              {settingsOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>

            {settingsOpen && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">

                {showCatalog && (
                  <>
                    <p className={sectionLabelClass}>Catalogo</p>
                    <NavLink to="/settings/materials" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Box className="w-3.5 h-3.5 shrink-0" />
                      <span>Materiali</span>
                    </NavLink>
                    <NavLink to="/settings/normalized-items" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Package className="w-3.5 h-3.5 shrink-0" />
                      <span>Normalizzati</span>
                    </NavLink>
                    <NavLink to="/settings/catalog" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Factory className="w-3.5 h-3.5 shrink-0" />
                      <span>Lavorazioni & Macchine</span>
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
                    <NavLink to="/settings/suppliers" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Truck className="w-3.5 h-3.5 shrink-0" />
                      <span>Fornitori</span>
                    </NavLink>
                  </>
                )}

                {showCatalog && (
                  <>
                    <p className={sectionLabelClass}>Wire EDM</p>
                    <NavLink to="/settings/edm" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Zap className="w-3.5 h-3.5 shrink-0" />
                      <span>Wire EDM</span>
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
                    <NavLink to="/settings/system" className={({ isActive }) => navLinkClass(isActive, true)}>
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                      <span>Utenti, ruoli, backup</span>
                    </NavLink>
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
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
                title={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
              {notifEnabled && (
                <button
                  onClick={() => setNotifOpen(true)}
                  className="relative p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
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
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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
        onMarkAllRead={markAllRead}
        onClearRead={clearRead}
      />
    </aside>
  )
}
