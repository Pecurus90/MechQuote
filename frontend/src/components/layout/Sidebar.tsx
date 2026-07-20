import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, FilePlus2, ClipboardList, FolderOpen, Truck, Package,
  History, Drill, Users, BarChart3, Activity, Library, Settings, Box, Tag, Factory, Zap,
  Hammer, Building2, Shield, FileUp, Bolt, ShoppingCart, HardHat, Handshake, Sliders, Receipt,
  BookOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import api from '@/lib/api'
import type { Role } from '@/types'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { SidebarView } from '@/components/layout/SidebarView'
import ChangePasswordModal from '@/components/layout/ChangePasswordModal'

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

interface Leaf { key: string; label: string; icon: LucideIcon; active?: boolean; badge?: { n: number; tone: 'danger' | 'warning' | 'info' } }
interface Node extends Leaf { children?: Leaf[]; defaultCollapsed?: boolean }

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, hasPermission, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [pwOpen, setPwOpen] = useState(false)
  const path = location.pathname
  const at = (p: string) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?')

  const canQuote = hasPermission('quotes.create')
  const canArchive = hasPermission('quotes.archive')
  const canDashboard = hasPermission('dashboard')
  const canStatistics = hasPermission('statistics')
  const canCustomers = hasPermission('customers')
  const canSettings = hasPermission('settings')
  const canCompany = hasPermission('company')
  const canUsers = hasPermission('users')
  const canBackup = hasPermission('backup')
  const canSalesDirect = hasPermission('sales.direct')
  const canOrdersMaterials = hasPermission('orders.materials')
  const canOrdersNormalized = hasPermission('orders.normalized')
  const canOrdersTools = hasPermission('orders.tools')
  const canTools = hasPermission('tools')
  const canOfficina = hasPermission('officina')
  const canConfirm = hasPermission('quotes.confirm')

  // Badge numerici reali (code di lavoro da smaltire).
  const [ordersBadge, setOrdersBadge] = useState(0)
  const [toolsBadge, setToolsBadge] = useState(0)
  const [reviewBadge, setReviewBadge] = useState(0)
  useEffect(() => {
    if (canOrdersMaterials) api.get('/orders/materials/stats').then(r => setOrdersBadge(r.data?.to_order ?? 0)).catch(() => {})
    if (canTools) api.get('/orders/tools/stats').then(r => setToolsBadge(r.data?.low_stock ?? 0)).catch(() => {})
    // Preventivi da revisionare (inviato/letto): coda di chi conferma.
    if (canConfirm) api.get('/dashboard/queue-counts').then(r => setReviewBadge(r.data?.to_review ?? 0)).catch(() => {})
  }, [canOrdersMaterials, canTools, canConfirm])

  // Label + colore del ruolo dell'utente per la pillola nel footer. Presi da
  // /api/roles (aperto a ogni utente autenticato) così valgono anche per i
  // ruoli custom, non solo per i 4 di default.
  const [roleMeta, setRoleMeta] = useState<{ label: string; color?: string } | null>(null)
  useEffect(() => {
    if (!user?.role) { setRoleMeta(null); return }
    api.get('/roles')
      .then(r => {
        const found = (r.data as Role[]).find(x => x.name === user.role)
        setRoleMeta(found ? { label: found.label, color: found.color } : null)
      })
      .catch(() => {})
  }, [user?.role])

  // ─── Modello di navigazione ────────────────────────────────────────────────
  const operativita: Node[] = []
  if (canDashboard) operativita.push({ key: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, active: path === '/' || at('/dashboard') })
  {
    const children: Leaf[] = []
    if (canQuote) children.push({ key: '/quotes/new', label: 'Nuovo preventivo', icon: FilePlus2, active: at('/quotes/new') })
    if (canArchive) children.push({ key: '/quotes/active', label: 'Preventivi in corso', icon: ClipboardList, active: at('/quotes/active') })
    if (canArchive) children.push({ key: '/quotes/archive', label: 'Archivio preventivi', icon: FolderOpen, active: at('/quotes/archive') })
    if (children.length) operativita.push({ key: 'preventivi', label: 'Preventivi', icon: FileText, children, defaultCollapsed: true, badge: reviewBadge > 0 ? { n: reviewBadge, tone: 'info' } : undefined })
  }
  if (canSalesDirect) operativita.push({ key: '/sales/direct', label: 'Vendite dirette', icon: Receipt, active: at('/sales/direct') })
  if (canOrdersMaterials || canOrdersNormalized || canOrdersTools) {
    const children: Leaf[] = []
    if (canOrdersMaterials) children.push({ key: '/orders/materials', label: 'Ordini materiali', icon: Package, active: at('/orders/materials') })
    if (canOrdersMaterials) children.push({ key: '/orders/materials-file', label: 'Nuovo ordine materiale', icon: FileUp, active: at('/orders/materials-file') })
    if (canOrdersNormalized) children.push({ key: '/orders/normalized-file', label: 'Normalizzati da distinta', icon: Bolt, active: at('/orders/normalized-file') })
    if (canOrdersTools) children.push({ key: '/orders/tools', label: 'Ordini utensili', icon: ShoppingCart, active: at('/orders/tools') })
    children.push({ key: '/orders/history', label: 'Storico ordini', icon: History, active: at('/orders/history') })
    operativita.push({ key: 'ordini', label: 'Ordini', icon: Truck, children, defaultCollapsed: true, badge: ordersBadge > 0 ? { n: ordersBadge, tone: 'danger' } : undefined })
  }
  if (canTools) operativita.push({ key: '/tools', label: 'Utensili', icon: Drill, active: at('/tools'), badge: toolsBadge > 0 ? { n: toolsBadge, tone: 'warning' } : undefined })
  if (canCustomers) operativita.push({ key: '/settings/customers', label: 'Clienti', icon: Users, active: at('/settings/customers') })
  if (canOfficina) operativita.push({ key: '/officina', label: 'Officina', icon: HardHat, active: at('/officina') })
  if (canStatistics) operativita.push({ key: '/statistics', label: 'Statistiche', icon: BarChart3, active: at('/statistics') })
  if (canDashboard) operativita.push({ key: '/activity', label: 'Attività', icon: Activity, active: at('/activity') })
  // Guide all'uso: visibili a ogni utente autenticato (nessun permesso dedicato).
  operativita.push({ key: '/guide', label: 'Guide', icon: BookOpen, active: at('/guide') })

  const impostazioni: Node[] = []
  const showCatalog = canSettings || canTools
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
    <>
      <SidebarView
        sections={sections}
        onNavigate={(key) => { if (key.startsWith('/')) navigate(key) }}
        user={{
          name,
          roleLabel: roleMeta?.label ?? (user ? (ROLE_LABELS[user.role] ?? user.role) : ''),
          roleColor: roleMeta?.color,
          initials: initials(name),
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
        onChangePassword={() => setPwOpen(true)}
        onLogout={() => { logout(); navigate('/login') }}
      />
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  )
}
