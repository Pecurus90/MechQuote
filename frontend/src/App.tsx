import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth, UserRole } from '@/lib/auth'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import AppLayout from '@/components/layout/AppLayout'
import QuoteEditor from '@/pages/QuoteEditor'
import QuoteArchivePage from '@/pages/QuoteArchivePage'
import NewQuotePage from '@/pages/NewQuotePage'
import MaterialsPage from '@/pages/settings/MaterialsPage'
import MachinesPage from '@/pages/settings/MachinesPage'
import TreatmentsPage from '@/pages/settings/TreatmentsPage'
import CostRulesPage from '@/pages/settings/CostRulesPage'
import PhaseTemplatesPage from '@/pages/settings/PhaseTemplatesPage'
import StepColorRulesPage from '@/pages/settings/StepColorRulesPage'
import CompanySettingsPage from '@/pages/settings/CompanySettingsPage'
import CustomersPage from '@/pages/settings/CustomersPage'
import BackupSettingsPage from '@/pages/settings/BackupSettingsPage'
import QuoteCategoriesPage from '@/pages/settings/QuoteCategoriesPage'
import UsersPage from '@/pages/settings/UsersPage'

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode
  roles?: UserRole[]
}) {
  const { user, loading } = useAuth()

  if (loading) return <div className="p-8 text-center text-gray-500">Caricamento...</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
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

        {/* Settings — solo admin */}
        <Route path="settings/materials"  element={<ProtectedRoute roles={['admin']}><MaterialsPage /></ProtectedRoute>} />
        <Route path="settings/machines"   element={<ProtectedRoute roles={['admin']}><MachinesPage /></ProtectedRoute>} />
        <Route path="settings/templates"  element={<ProtectedRoute roles={['admin']}><PhaseTemplatesPage /></ProtectedRoute>} />
        <Route path="settings/treatments" element={<ProtectedRoute roles={['admin']}><TreatmentsPage /></ProtectedRoute>} />
        <Route path="settings/cost-rules" element={<ProtectedRoute roles={['admin']}><CostRulesPage /></ProtectedRoute>} />
        <Route path="settings/step-colors" element={<ProtectedRoute roles={['admin']}><StepColorRulesPage /></ProtectedRoute>} />
        <Route path="settings/company"    element={<ProtectedRoute roles={['admin']}><CompanySettingsPage /></ProtectedRoute>} />
        <Route path="settings/backup"     element={<ProtectedRoute roles={['admin']}><BackupSettingsPage /></ProtectedRoute>} />
        <Route path="settings/categories" element={<ProtectedRoute roles={['admin']}><QuoteCategoriesPage /></ProtectedRoute>} />
        <Route path="settings/users"      element={<ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>} />

        {/* Clienti — admin + ufficio_tecnico */}
        <Route path="settings/customers" element={
          <ProtectedRoute roles={['admin', 'ufficio_tecnico']}><CustomersPage /></ProtectedRoute>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" richColors closeButton />
      <AppRoutes />
    </AuthProvider>
  )
}
