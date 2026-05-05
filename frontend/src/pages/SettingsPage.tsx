import { Link, useLocation } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

const settingsSections = [
  { path: '/settings/materials', label: 'Materiali', desc: 'Gestione materiali e costi' },
  { path: '/settings/machines', label: 'Macchine', desc: 'Gestione macchine e tariffe orarie' },
  { path: '/settings/suppliers', label: 'Fornitori', desc: 'Gestione fornitori' },
  { path: '/settings/treatments', label: 'Trattamenti', desc: 'Gestione trattamenti e costi' },
  { path: '/settings/templates', label: 'Template Fasi', desc: 'Template per fasi di lavorazione' },
  { path: '/settings/cost-rules', label: 'Regole di Costo', desc: 'Configurazione regole automatiche' },
  { path: '/settings/step-colors', label: 'Colori STEP', desc: 'Regole colori file STEP' },
  { path: '/settings/company', label: 'Azienda', desc: 'Dati aziendali' },
  { path: '/settings/pdf', label: 'PDF', desc: 'Configurazione PDF' },
  { path: '/settings/backup', label: 'Backup', desc: 'Esporta/Importa dati' },
]

export default function SettingsPage() {
  const location = useLocation()
  const isMainSettings = location.pathname === '/settings'

  if (isMainSettings) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Impostazioni</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {settingsSections.map(s => (
            <Link key={s.path} to={s.path} className="no-underline">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{s.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500">{s.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Impostazioni</h1>
      <Card>
        <CardHeader>
          <CardTitle>Sezione in fase di sviluppo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Questa sezione sarà disponibile a breve.</p>
        </CardContent>
      </Card>
    </div>
  )
}
