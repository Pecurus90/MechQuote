import { useLocation } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

const pageTitles: Record<string, string> = {
  '/settings/materials': 'Materials',
  '/settings/machines': 'Machines',
  '/settings/templates': 'Phase Templates',
  '/settings/treatments': 'Treatments',
  '/settings/suppliers': 'Suppliers',
  '/settings/cost-rules': 'Cost Rules',
  '/settings/edm-rules': 'EDM Rules',
  '/settings/cnc-rules': 'CNC Rules',
  '/settings/step-colors': 'STEP Color Rules',
  '/settings/company': 'Company Settings',
  '/settings/pdf': 'PDF Settings',
  '/settings/backup': 'Backup / Export',
}

export default function SettingsPage() {
  const location = useLocation()
  const title = pageTitles[location.pathname] || 'Settings'

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">
            Questa sezione è in fase di sviluppo. Sarà disponibile a breve.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
