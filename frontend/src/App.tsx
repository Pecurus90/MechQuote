import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/lib/auth'
import type { UserRole } from '@/lib/auth'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import AppLayout from '@/components/layout/AppLayout'
import QuoteEditor from '@/pages/QuoteEditor'
import QuoteArchivePage from '@/pages/QuoteArchivePage'
import QuotesActivePage from '@/pages/QuotesActivePage'
import NewQuotePage from '@/pages/NewQuotePage'
import NewQuote2DPage from '@/pages/NewQuote2DPage'
import NewDieQuotePage from '@/pages/NewDieQuotePage'
import MaterialsPage from '@/pages/settings/MaterialsPage'
import NormalizedItemsPage from '@/pages/settings/NormalizedItemsPage'
import StepColorRulesPage from '@/pages/settings/StepColorRulesPage'
import CompanySettingsPage from '@/pages/settings/CompanySettingsPage'
import CustomersPage from '@/pages/settings/CustomersPage'
import QuoteCategoriesPage from '@/pages/settings/QuoteCategoriesPage'
import ActivityPage from '@/pages/dashboard/ActivityPage'
import StatisticsPage from '@/pages/statistics/StatisticsPage'
import OrdersMaterialsPage from '@/pages/orders/OrdersMaterialsPage'
import OrdersToolsPage from '@/pages/orders/OrdersToolsPage'
import OrdersHistoryPage from '@/pages/orders/OrdersHistoryPage'
import ToolsPage from '@/pages/tools/ToolsPage'
import OfficinaHub from '@/pages/officina/OfficinaHub'
import OfficinaDocumentsPage from '@/pages/officina/documenti/DocumentsPage'
import OfficinaMaterialsPage from '@/pages/officina/MaterialsPage'
import TempraResultsPage from '@/pages/officina/tempra/TempraResultsPage'
import ToolAttributesPage from '@/pages/settings/ToolAttributesPage'
import DiesSettingsPage from '@/pages/settings/DiesSettingsPage'
// Container "raggruppati" — ognuno ospita più tab interni:
import SuppliersSettingsPage from '@/pages/settings/SuppliersSettingsPage'
import EdmSettingsPage from '@/pages/settings/EdmSettingsPage'
import CatalogSettingsPage from '@/pages/settings/CatalogSettingsPage'
import SystemSettingsPage from '@/pages/settings/SystemSettingsPage'

function ProtectedRoute({
  children,
  roles,
  permission,
  anyPermission,
}: {
  children: React.ReactNode
  roles?: UserRole[]
  permission?: string
  // Accesso se l'utente ha ALMENO UNO di questi permessi (OR).
  anyPermission?: string[]
}) {
  const { user, loading, hasPermission } = useAuth()

  if (loading) return <div className="p-8 text-center text-muted-foreground">Caricamento...</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  if (permission && !hasPermission(permission)) return <Navigate to="/" replace />
  if (anyPermission && !anyPermission.some(hasPermission)) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="quotes/new" element={<NewQuotePage />} />
        <Route path="quotes/manual/new" element={<QuoteEditor />} />
        <Route path="quotes/2d/new" element={<ProtectedRoute permission="quotes.create"><NewQuote2DPage /></ProtectedRoute>} />
        <Route path="quotes/die/new" element={<ProtectedRoute permission="dies.create"><NewDieQuotePage /></ProtectedRoute>} />
        <Route path="quotes/:id" element={<QuoteEditor />} />
        <Route path="quotes/active" element={<ProtectedRoute permission="quotes.archive"><QuotesActivePage /></ProtectedRoute>} />
        <Route path="quotes/archive" element={<ProtectedRoute permission="quotes.archive"><QuoteArchivePage /></ProtectedRoute>} />
        <Route path="orders/materials" element={<ProtectedRoute permission="orders.materials"><OrdersMaterialsPage /></ProtectedRoute>} />
        <Route path="orders/tools" element={<ProtectedRoute permission="orders.tools"><OrdersToolsPage /></ProtectedRoute>} />
        <Route path="orders/history" element={<ProtectedRoute anyPermission={["orders.materials", "orders.tools"]}><OrdersHistoryPage /></ProtectedRoute>} />
        <Route path="tools" element={<ProtectedRoute permission="tools"><ToolsPage /></ProtectedRoute>} />
        <Route path="officina" element={<ProtectedRoute permission="officina"><OfficinaHub /></ProtectedRoute>} />
        <Route path="officina/documenti" element={<ProtectedRoute permission="officina"><OfficinaDocumentsPage /></ProtectedRoute>} />
        <Route path="officina/materiali" element={<ProtectedRoute permission="officina"><OfficinaMaterialsPage /></ProtectedRoute>} />
        <Route path="officina/tempra" element={<ProtectedRoute permission="officina"><TempraResultsPage /></ProtectedRoute>} />
        <Route path="activity" element={<ProtectedRoute permission="dashboard"><ActivityPage /></ProtectedRoute>} />
        <Route path="statistics" element={<ProtectedRoute permission="dashboard"><StatisticsPage /></ProtectedRoute>} />

        {/* Settings — pagine atomiche residue */}
        <Route path="settings/materials"  element={<ProtectedRoute permission="settings"><MaterialsPage /></ProtectedRoute>} />
        <Route path="settings/normalized-items" element={<ProtectedRoute permission="settings"><NormalizedItemsPage /></ProtectedRoute>} />
        <Route path="settings/tool-attributes" element={<ProtectedRoute permission="tools"><ToolAttributesPage /></ProtectedRoute>} />
        <Route path="settings/step-colors" element={<ProtectedRoute permission="settings"><StepColorRulesPage /></ProtectedRoute>} />
        <Route path="settings/categories" element={<ProtectedRoute permission="settings"><QuoteCategoriesPage /></ProtectedRoute>} />
        <Route path="settings/company"    element={<ProtectedRoute permission="company"><CompanySettingsPage /></ProtectedRoute>} />
        <Route path="settings/customers"  element={<ProtectedRoute permission="customers"><CustomersPage /></ProtectedRoute>} />
        <Route path="settings/dies"       element={<ProtectedRoute permission="dies.settings"><DiesSettingsPage /></ProtectedRoute>} />

        {/* Settings — container "raggruppati" con tab interni */}
        <Route path="settings/suppliers" element={<ProtectedRoute permission="settings"><SuppliersSettingsPage /></ProtectedRoute>} />
        <Route path="settings/edm"       element={<ProtectedRoute permission="settings"><EdmSettingsPage /></ProtectedRoute>} />
        <Route path="settings/catalog"   element={<ProtectedRoute permission="settings"><CatalogSettingsPage /></ProtectedRoute>} />
        <Route path="settings/system"    element={<ProtectedRoute permission="users"><SystemSettingsPage /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" richColors closeButton theme="light" />
      <AppRoutes />
    </AuthProvider>
  )
}
