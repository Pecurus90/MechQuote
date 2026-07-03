import { useNavigate } from 'react-router-dom'
import { FileText, Scan, Box, Hammer } from 'lucide-react'
import { NewQuoteChooser, type QuoteMode } from '@/pages/quotes/NewQuoteChooser'

// Container: solo route/navigazione. Grafica in NewQuoteChooser (handoff).
const MODES: (QuoteMode & { to?: string })[] = [
  { key: 'manual', title: 'Preventivo Manuale', description: 'Componi il codice e aggiungi parti e fasi a mano. Il metodo standard.', icon: FileText, tone: 'primary', available: true, to: '/quotes/manual/new' },
  { key: '2d', title: 'Preventivo 2D', description: 'Carica un file DXF: profili, taglio EDM e grezzo calcolati dal disegno.', icon: Scan, tone: 'confirmed', available: true, to: '/quotes/2d/new' },
  { key: '3d', title: 'Preventivo 3D', description: 'Analisi da modello 3D STEP. Presto disponibile.', icon: Box, tone: 'success', available: false },
  { key: 'molds', title: 'Preventivazione Stampi', description: 'Stampi a blocco o a passo, con render e geometria calcolata.', icon: Hammer, tone: 'danger', available: true, to: '/quotes/die/new' },
]

export default function NewQuotePage() {
  const navigate = useNavigate()
  const onPick = (key: string) => {
    const m = MODES.find(x => x.key === key)
    if (m?.to) navigate(m.to)
  }
  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <NewQuoteChooser modes={MODES} onPick={onPick} />
    </div>
  )
}
