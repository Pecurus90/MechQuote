import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import api from '@/lib/api'
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setReady(true); return }
    api.get('/auth/me').then(() => {
      setOk(true)
      setReady(true)
    }).catch(() => {
      localStorage.removeItem('token')
      setReady(true)
    })
  }, [])

  if (!ready) return <div className="p-8 text-center text-gray-500">Caricamento...</div>
  if (!ok) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <>
    <Toaster position="top-center" richColors closeButton />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="quotes/new" element={<NewQuotePage />} />
        <Route path="quotes/manual/new" element={<QuoteEditor />} />
        <Route path="quotes/:id" element={<QuoteEditor />} />
        <Route path="quotes/archive" element={<QuoteArchivePage />} />
        <Route path="settings/materials" element={<MaterialsPage />} />
        <Route path="settings/machines" element={<MachinesPage />} />
        <Route path="settings/templates" element={<PhaseTemplatesPage />} />
        <Route path="settings/treatments" element={<TreatmentsPage />} />
        <Route path="settings/cost-rules" element={<CostRulesPage />} />
        <Route path="settings/step-colors" element={<StepColorRulesPage />} />
        <Route path="settings/company" element={<CompanySettingsPage />} />
        <Route path="settings/customers" element={<CustomersPage />} />
        <Route path="settings/backup" element={<BackupSettingsPage />} />
        <Route path="settings/categories" element={<QuoteCategoriesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
