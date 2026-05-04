import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import LoginPage from '@/pages/LoginPage'
import HomePage from '@/pages/HomePage'
import DashboardPage from '@/pages/DashboardPage'

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
      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
