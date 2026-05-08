import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo placeholder - ready for future logo */}
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">FDV</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">MechQuote</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Fratelli Dalla Via</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/login')}>
            Logout
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Fratelli Dalla Via
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Sistema di preventivazione tecnica per lavorazioni meccaniche di precisione.
            CNC, EDM e processi misti in pochi minuti.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" onClick={() => navigate('/dashboard')}>
              Vai alla Dashboard
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/quotes/new')}>
              Nuovo Preventivo
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Preventivi Manuali</h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Crea preventivi rapidi selezionando materiali, macchine e fasi di lavorazione.
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Import DXF & STEP</h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Carica file CAD per quotazioni assistite per EDM a filo e lavorazioni CNC.
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Export PDF</h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Genera PDF per cliente e PDF interno con dettaglio costi e cicli di lavorazione.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Company Info */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border p-8 text-center">
          <div className="w-24 h-24 bg-blue-600 rounded-full mx-auto mb-6 flex items-center justify-center">
            <span className="text-white font-bold text-3xl">FDV</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Fratelli Dalla Via</h3>
          <p className="text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Officina meccanica di precisione specializzata in lavorazioni CNC, elettroerosione a filo,
            e processi misti. Il nostro sistema di preventivazione garantisce rapidit e precisione
            nel calcolo dei costi di produzione.
          </p>
        </div>
      </main>
    </div>
  )
}
