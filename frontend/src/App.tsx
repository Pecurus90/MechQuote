import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import AppLayout from '@/components/layout/AppLayout'
import QuoteEditor from '@/pages/QuoteEditor'
import QuoteArchivePage from '@/pages/QuoteArchivePage'
import NewQuotePage from '@/pages/NewQuotePage'
import SettingsPage from '@/pages/SettingsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setReady(true); return }
    api.get('/health').then(() => {
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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="quotes/new" element={<NewQuotePage />} />
        <Route path="quotes/manual/new" element={<QuoteEditor />} />
        <Route path="quotes/:id" element={<QuoteEditor />} />
        <Route path="quotes/archive" element={<QuoteArchivePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/*" element={<Navigate to="/settings" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
