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
        <Route path="settings/templates" element={<SettingsPage />} />
        <Route path="settings/treatments" element={<SettingsPage />} />
        <Route path="settings/suppliers" element={<SettingsPage />} />
        <Route path="settings/cost-rules" element={<SettingsPage />} />
        <Route path="settings/edm-rules" element={<SettingsPage />} />
        <Route path="settings/cnc-rules" element={<SettingsPage />} />
        <Route path="settings/step-colors" element={<SettingsPage />} />
        <Route path="settings/company" element={<SettingsPage />} />
        <Route path="settings/pdf" element={<SettingsPage />} />
        <Route path="settings/backup" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
