import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Ruler, BookOpen, Calculator, Hammer, Box } from 'lucide-react'
import { useAuth } from '@/lib/auth'

interface Tile {
  to: string
  icon: React.ReactNode
  title: string
  subtitle: string
  available: boolean
}

export default function OfficinaHub() {
  const { hasPermission } = useAuth()
  const canRead = hasPermission('officina')

  const tiles: Tile[] = [
    {
      to: '/officina/materiali',
      icon: <Box className="w-7 h-7 text-blue-700" />,
      title: 'Materiali',
      subtitle: 'Catalogo materiali con schede tecniche PDF',
      available: canRead,
    },
    {
      to: '/officina/documenti',
      icon: <FileText className="w-7 h-7 text-blue-700" />,
      title: 'Documenti',
      subtitle: 'Cataloghi PDF, manuali, schede generiche',
      available: canRead,
    },
    {
      to: '/officina/tabelle',
      icon: <Ruler className="w-7 h-7 text-blue-700" />,
      title: 'Tabelle reference',
      subtitle: 'Tolleranze ISO, filettature (M, MF, BSP, UNF, UNC, Whitworth)',
      available: false,
    },
    {
      to: '/officina/normative',
      icon: <BookOpen className="w-7 h-7 text-blue-700" />,
      title: 'Normative',
      subtitle: 'Procedure e regolamenti aziendali',
      available: false,
    },
    {
      to: '/officina/calcolatori',
      icon: <Calculator className="w-7 h-7 text-blue-700" />,
      title: 'Calcolatori',
      subtitle: 'Filettature, durezza Brinell/Vickers/Rockwell, smussi',
      available: false,
    },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Hammer className="w-6 h-6 text-blue-700" /> Officina
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Documentazione operativa, tabelle reference, calcolatori. Pensata per essere
          consultata in officina durante la lavorazione.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tiles.map(t => (
          t.available ? (
            <Link key={t.to} to={t.to} className="block">
              <Card className="hover:bg-blue-50/50 hover:border-blue-200 transition-colors cursor-pointer h-full">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">{t.icon}</div>
                  <div>
                    <h2 className="font-semibold text-gray-900">{t.title}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{t.subtitle}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Card key={t.to} className="opacity-50 cursor-not-allowed h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="shrink-0 mt-0.5 grayscale">{t.icon}</div>
                <div>
                  <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                    {t.title}
                    <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded uppercase tracking-wider">
                      In arrivo
                    </span>
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">{t.subtitle}</p>
                </div>
              </CardContent>
            </Card>
          )
        ))}
      </div>
    </div>
  )
}
