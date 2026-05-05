import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import LoginPage from '@/pages/LoginPage'
import HomePage from '@/pages/HomePage'
import DashboardPage from '@/pages/DashboardPage'
import AppLayout from '@/components/layout/AppLayout'
import QuoteEditor from '@/pages/QuoteEditor'
import SettingsPage from '@/pages/SettingsPage'
import MaterialsPage from '@/pages/settings/MaterialsPage'
import MachinesPage from '@/pages/settings/MachinesPage'
import SuppliersPage from '@/pages/settings/SuppliersPage'
import TreatmentsPage from '@/pages/settings/TreatmentsPage'
import CostRulesPage from '@/pages/settings/CostRulesPage'
import PhaseTemplatesPage from '@/pages/settings/PhaseTemplatesPage'
import StepColorRulesPage from '@/pages/settings/StepColorRulesPage'
import CompanySettingsPage from '@/pages/settings/CompanySettingsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setReady(true)
      return
    }
    api.get('/health').then(() => {
      setOk(true)
      setReady(true)
    }).catch(() => {
      localStorage.removeItem('token')
      setReady(true)
    })
  }, [])

  if (!ready) return <div className="p-8 text-center">Caricamento...</div>
  if (!ok) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="quotes/new" element={<QuoteEditor />} />
        <Route path="settings/materials" element={<MaterialsPage />} />
        <Route path="settings/machines" element={<MachinesPage />} />
        <Route path="settings/templates" element={<PhaseTemplatesPage />} />
        <Route path="settings/treatments" element={<TreatmentsPage />} />
        <Route path="settings/suppliers" element={<SuppliersPage />} />
        <Route path="settings/cost-rules" element={<CostRulesPage />} />
        <Route path="settings/edm-rules" element={<SettingsPage />} />
        <Route path="settings/cnc-rules" element={<SettingsPage />} />
        <Route path="settings/step-colors" element={<StepColorRulesPage />} />
        <Route path="settings/company" element={<CompanySettingsPage />} />
        <Route path="settings/pdf" element={<SettingsPage />} />
        <Route path="settings/backup" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
