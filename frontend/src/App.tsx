import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/lib/auth'
import type { UserRole } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import AppLayout from '@/components/layout/AppLayout'
import QuoteEditor from '@/pages/QuoteEditor'
import QuoteArchivePage from '@/pages/QuoteArchivePage'
import NewQuotePage from '@/pages/NewQuotePage'
import MaterialsPage from '@/pages/settings/MaterialsPage'
import MachinesPage from '@/pages/settings/MachinesPage'
import TreatmentsPage from '@/pages/settings/TreatmentsPage'
import PhaseTemplatesPage from '@/pages/settings/PhaseTemplatesPage'
import StepColorRulesPage from '@/pages/settings/StepColorRulesPage'
import CompanySettingsPage from '@/pages/settings/CompanySettingsPage'
import CustomersPage from '@/pages/settings/CustomersPage'
import BackupSettingsPage from '@/pages/settings/BackupSettingsPage'
import QuoteCategoriesPage from '@/pages/settings/QuoteCategoriesPage'
import UsersPage from '@/pages/settings/UsersPage'
import RolesPage from '@/pages/settings/RolesPage'
import ActivityPage from '@/pages/ActivityPage'
import EdmConfigPage from '@/pages/settings/edm/EdmConfigPage'
import EdmSpeedsPage from '@/pages/settings/edm/EdmSpeedsPage'
import CuttingCyclesPage from '@/pages/settings/edm/CuttingCyclesPage'
import DrillingTimesPage from '@/pages/settings/edm/DrillingTimesPage'

function ProtectedRoute({
  children,
  roles,
  permission,
}: {
  children: React.ReactNode
  roles?: UserRole[]
  permission?: string
}) {
  const { user, loading, hasPermission } = useAuth()

  if (loading) return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Caricamento...</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  if (permission && !hasPermission(permission)) return <Navigate to="/" replace />
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
        <Route path="quotes/:id" element={<QuoteEditor />} />
        <Route path="quotes/archive" element={<QuoteArchivePage />} />
        <Route path="activity" element={<ProtectedRoute permission="dashboard"><ActivityPage /></ProtectedRoute>} />

        {/* Settings — gated dal sistema dei permessi dinamici */}
        <Route path="settings/materials"  element={<ProtectedRoute permission="settings"><MaterialsPage /></ProtectedRoute>} />
        <Route path="settings/machines"   element={<ProtectedRoute permission="settings"><MachinesPage /></ProtectedRoute>} />
        <Route path="settings/templates"  element={<ProtectedRoute permission="settings"><PhaseTemplatesPage /></ProtectedRoute>} />
        <Route path="settings/treatments" element={<ProtectedRoute permission="settings"><TreatmentsPage /></ProtectedRoute>} />
        <Route path="settings/step-colors" element={<ProtectedRoute permission="settings"><StepColorRulesPage /></ProtectedRoute>} />
        <Route path="settings/categories" element={<ProtectedRoute permission="settings"><QuoteCategoriesPage /></ProtectedRoute>} />
        <Route path="settings/company"    element={<ProtectedRoute permission="company"><CompanySettingsPage /></ProtectedRoute>} />
        <Route path="settings/backup"     element={<ProtectedRoute permission="backup"><BackupSettingsPage /></ProtectedRoute>} />
        <Route path="settings/users"      element={<ProtectedRoute permission="users"><UsersPage /></ProtectedRoute>} />
        <Route path="settings/roles"      element={<ProtectedRoute permission="users"><RolesPage /></ProtectedRoute>} />

        {/* Wire EDM */}
        <Route path="settings/edm/speeds"   element={<ProtectedRoute permission="settings"><EdmSpeedsPage /></ProtectedRoute>} />
        <Route path="settings/edm/cycles"   element={<ProtectedRoute permission="settings"><CuttingCyclesPage /></ProtectedRoute>} />
        <Route path="settings/edm/drilling" element={<ProtectedRoute permission="settings"><DrillingTimesPage /></ProtectedRoute>} />
        <Route path="settings/edm/config"   element={<ProtectedRoute permission="settings"><EdmConfigPage /></ProtectedRoute>} />

        {/* Clienti */}
        <Route path="settings/customers" element={
          <ProtectedRoute permission="customers"><CustomersPage /></ProtectedRoute>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Toaster position="top-center" richColors closeButton theme="system" />
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  )
}
