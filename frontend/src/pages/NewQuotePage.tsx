import { useNavigate } from 'react-router-dom'
import { FileText, Scan, Box, Hammer, Plus } from 'lucide-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'

const modes = [
  {
    id: 'manual',
    icon: FileText,
    title: 'Preventivo Manuale',
    description: 'Inserisci fasi di lavorazione a mano. Adatto quando non hai un disegno CAD o vuoi massima flessibilità.',
    available: true,
    to: '/quotes/manual/new',
    color: 'blue',
  },
  {
    id: '2d',
    icon: Scan,
    title: 'Preventivo 2D',
    description: 'Carica un file DXF. Il sistema estrae i profili, calcola le lunghezze di taglio e crea automaticamente la fase Wire EDM con tempi calcolati.',
    available: true,
    to: '/quotes/2d/new',
    color: 'violet',
  },
  {
    id: '3d',
    icon: Box,
    title: 'Preventivo 3D',
    description: 'Carica un file STEP. Il sistema analizza il bounding box, il volume e i colori delle facce per suggerire il ciclo di lavorazione CNC.',
    available: false,
    color: 'emerald',
  },
  {
    id: 'molds',
    icon: Hammer,
    title: 'Preventivazione Stampi',
    description: 'Modulo dedicato per stampi tranciatura/piega lamiera. Wizard guidato + 7 livelli di costo + 5 template standard.',
    available: true,
    to: '/quotes/die/new',
    color: 'rose',
  },
] as const

const colorMap = {
  blue: {
    card: 'border-blue-200 hover:border-blue-400 hover:shadow-blue-100',
    icon: 'bg-blue-100 text-blue-600',
    badge: 'bg-blue-600 text-white',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  violet: {
    card: 'border-violet-200 hover:border-violet-400 hover:shadow-violet-100',
    icon: 'bg-violet-100 text-violet-600',
    badge: 'bg-violet-600 text-white',
    button: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
  emerald: {
    card: 'border-gray-200 opacity-60',
    icon: 'bg-emerald-100 text-emerald-500',
    badge: 'bg-gray-200 text-gray-500',
    button: '',
  },
  rose: {
    card: 'border-rose-200 hover:border-rose-400 hover:shadow-rose-100',
    icon: 'bg-rose-100 text-rose-600',
    badge: 'bg-rose-600 text-white',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
}

export default function NewQuotePage() {
  const navigate = useNavigate()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <SettingsPageHeader
          icon={Plus}
          color="blue"
          title="Nuovo Preventivo"
          subtitle="Scegli come vuoi costruire il preventivo"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {modes.map(mode => {
          const colors = colorMap[mode.color]
          return (
            <div
              key={mode.id}
              className={`relative rounded-xl border-2 p-6 flex flex-col gap-4 transition-all ${colors.card} ${
                mode.available ? 'cursor-pointer hover:shadow-md' : 'cursor-not-allowed'
              }`}
              onClick={() => mode.available && 'to' in mode && navigate(mode.to)}
            >
              {!mode.available && (
                <span className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">
                  In sviluppo
                </span>
              )}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors.icon}`}>
                <mode.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-gray-900 mb-1">{mode.title}</h2>
                <p className="text-sm text-gray-500 leading-relaxed">{mode.description}</p>
              </div>
              {mode.available && (
                <button
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${colors.button}`}
                >
                  Inizia →
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
