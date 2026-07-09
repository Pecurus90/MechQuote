import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, FilePlus2, ClipboardList, FolderOpen, Truck, Package,
  History, Drill, Users, BarChart3, Activity, Library, Settings, Box, Tag, Factory, Zap,
  Hammer, Building2, Shield, FileUp, Bolt, ShoppingCart, HardHat, Handshake, Sliders,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { SidebarView } from '@/components/layout/SidebarView'

// Container: costruisce il modello di navigazione (route + permessi + badge
// reali) e lo passa a SidebarView (grafica handoff). Nessuna grafica qui.

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  ufficio_tecnico: 'Ufficio tecnico',
  officina: 'Officina',
  amministrazione: 'Amministrazione',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface Leaf { key: string; label: string; icon: LucideIcon; active?: boolean; badge?: { n: number; tone: 'danger' | 'warning' } }
interface Node extends Leaf { children?: Leaf[] }

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, hasPermission, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const path = location.pathname
  const at = (p: string) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?')

  const canQuote = hasPermission('quotes.create')
  const canArchive = hasPermission('quotes.archive')
  const canDashboard = hasPermission('dashboard')
  const canCustomers = hasPermission('customers')
  const canSettings = hasPermission('settings')
  const canCompany = hasPermission('company')
  const canUsers = hasPermission('users')
  const canBackup = hasPermission('backup')
  const canOrdersMaterials = hasPermission('orders.materials')
  const canOrdersNormalized = hasPermission('orders.normalized')
  const canOrdersTools = hasPermission('orders.tools')
  const canTools = hasPermission('tools')
  const canOfficina = hasPermission('officina')
  const canDies = hasPermission('dies.settings')

  // Badge numerici reali.
  const [ordersBadge, setOrdersBadge] = useState(0)
  const [toolsBadge, setToolsBadge] = useState(0)
  useEffect(() => {
    if (canOrdersMaterials) api.get('/orders/materials/stats').then(r => setOrdersBadge(r.data?.to_order ?? 0)).catch(() => {})
    if (canTools) api.get('/orders/tools/stats').then(r => setToolsBadge(r.data?.low_stock ?? 0)).catch(() => {})
  }, [canOrdersMaterials, canTools])

  // ─── Modello di navigazione ────────────────────────────────────────────────
  const operativita: Node[] = []
  if (canDashboard) operativita.push({ key: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, active: path === '/' || at('/dashboard') })
  {
    const children: Leaf[] = []
    if (canQuote) children.push({ key: '/quotes/new', label: 'Nuovo preventivo', icon: FilePlus2, active: at('/quotes/new') })
    if (canArchive) children.push({ key: '/quotes/active', label: 'Preventivi in corso', icon: ClipboardList, active: at('/quotes/active') })
    if (canArchive) children.push({ key: '/quotes/archive', label: 'Archivio preventivi', icon: FolderOpen, active: at('/quotes/archive') })
    if (children.length) operativita.push({ key: 'preventivi', label: 'Preventivi', icon: FileText, children })
  }
  if (canOrdersMaterials || canOrdersNormalized || canOrdersTools) {
    const children: Leaf[] = []
    if (canOrdersMaterials) children.push({ key: '/orders/materials', label: 'Ordini materiali', icon: Package, active: at('/orders/materials') })
    if (canOrdersMaterials) children.push({ key: '/orders/materials-file', label: 'Materiali da distinta', icon: FileUp, active: at('/orders/materials-file') })
    if (canOrdersNormalized) children.push({ key: '/orders/normalized-file', label: 'Normalizzati da distinta', icon: Bolt, active: at('/orders/normalized-file') })
    if (canOrdersTools) children.push({ key: '/orders/tools', label: 'Ordini utensili', icon: ShoppingCart, active: at('/orders/tools') })
    children.push({ key: '/orders/history', label: 'Storico ordini', icon: History, active: at('/orders/history') })
    operativita.push({ key: 'ordini', label: 'Ordini', icon: Truck, children, badge: ordersBadge > 0 ? { n: ordersBadge, tone: 'danger' } : undefined })
  }
  if (canTools) operativita.push({ key: '/tools', label: 'Utensili', icon: Drill, active: at('/tools'), badge: toolsBadge > 0 ? { n: toolsBadge, tone: 'warning' } : undefined })
  if (canCustomers) operativita.push({ key: '/settings/customers', label: 'Clienti', icon: Users, active: at('/settings/customers') })
  if (canOfficina) operativita.push({ key: '/officina', label: 'Officina', icon: HardHat, active: at('/officina') })
  if (canDashboard) operativita.push({ key: '/statistics', label: 'Statistiche', icon: BarChart3, active: at('/statistics') })
  if (canDashboard) operativita.push({ key: '/activity', label: 'Attività', icon: Activity, active: at('/activity') })

  const impostazioni: Node[] = []
  const showCatalog = canSettings || canTools || canDies
  if (showCatalog) {
    const children: Leaf[] = []
    if (canSettings) {
      children.push({ key: '/settings/materials', label: 'Materiali', icon: Box, active: at('/settings/materials') })
      children.push({ key: '/settings/normalized-items', label: 'Normalizzati', icon: Bolt, active: at('/settings/normalized-items') })
      children.push({ key: '/settings/catalog', label: 'Lavorazioni & Macchine', icon: Factory, active: at('/settings/catalog') })
      children.push({ key: '/settings/categories', label: 'Categorie', icon: Tag, active: at('/settings/categories') })
    }
    if (canTools) children.push({ key: '/settings/tool-attributes', label: 'Attributi utensili', icon: Sliders, active: at('/settings/tool-attributes') })
    if (canSettings || canTools) children.push({ key: '/settings/suppliers', label: 'Fornitori', icon: Handshake, active: at('/settings/suppliers') })
    if (canSettings) children.push({ key: '/settings/edm', label: 'Wire EDM', icon: Zap, active: at('/settings/edm') })
    if (canDies) children.push({ key: '/settings/dies', label: 'Stampi', icon: Hammer, active: at('/settings/dies') })
    impostazioni.push({ key: 'catalogo', label: 'Catalogo', icon: Library, children })
  }
  if (canCompany || canUsers || canBackup) {
    const children: Leaf[] = []
    if (canCompany) children.push({ key: '/settings/company', label: 'Dati azienda', icon: Building2, active: at('/settings/company') })
    if (canUsers || canBackup) children.push({ key: '/settings/system', label: 'Utenti, ruoli, backup', icon: Shield, active: at('/settings/system') })
    impostazioni.push({ key: 'sistema', label: 'Sistema', icon: Settings, children })
  }

  const sections = [
    { label: 'Operatività', items: operativita },
    ...(impostazioni.length ? [{ label: 'Impostazioni', items: impostazioni }] : []),
  ].filter(s => s.items.length > 0)

  const name = user?.full_name || user?.username || '—'

  return (
    <SidebarView
      sections={sections}
      onNavigate={(key) => { if (key.startsWith('/')) navigate(key) }}
      user={{ name, roleLabel: user ? (ROLE_LABELS[user.role] ?? user.role) : '', initials: initials(name) }}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={() => { logout(); navigate('/login') }}
    />
  )
}
