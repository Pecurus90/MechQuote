import { useNavigate } from 'react-router-dom'
import { FileText, Scan, Box, Hammer } from 'lucide-react'
import { NewQuoteChooser, type QuoteMode } from '@/pages/quotes/NewQuoteChooser'
import { useAuth } from '@/lib/auth'

// Container: solo route/navigazione + gating per permesso. Grafica in
// NewQuoteChooser (handoff).
// AUD-10: `available` non è più hardcoded. Un modo che richiede un permesso
// mancante viene NASCOSTO (non mostrato disabilitato con "In sviluppo", che
// sarebbe fuorviante) → niente più tile-click morto che rimbalza a /. Il 3D
// resta visibile come "In sviluppo" (ready: false, nessun permesso richiesto).
interface ModeDef extends Omit<QuoteMode, 'available'> {
  to?: string
  permission?: string   // permesso richiesto per vedere/usare il modo
  ready: boolean        // feature implementata
}

const MODE_DEFS: ModeDef[] = [
  { key: 'manual', title: 'Preventivo Manuale', description: 'Componi il codice e aggiungi parti e fasi a mano. Il metodo standard.', icon: FileText, tone: 'primary', to: '/quotes/manual/new', permission: 'quotes.create', ready: true },
  { key: '2d', title: 'Preventivo 2D', description: 'Carica un file DXF: profili, taglio EDM e grezzo calcolati dal disegno.', icon: Scan, tone: 'confirmed', to: '/quotes/2d/new', permission: 'quotes.create', ready: true },
  { key: '3d', title: 'Preventivo 3D', description: 'Analisi da modello 3D STEP. Presto disponibile.', icon: Box, tone: 'success', ready: false },
  { key: 'molds', title: 'Preventivazione Stampi', description: 'Stampi a blocco o a passo, con render e geometria calcolata.', icon: Hammer, tone: 'danger', to: '/quotes/die/new', permission: 'dies.create', ready: true },
]

export default function NewQuotePage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()

  const visible = MODE_DEFS.filter(m => !m.permission || hasPermission(m.permission))
  const modes: QuoteMode[] = visible.map(m => ({
    key: m.key, title: m.title, description: m.description, icon: m.icon, tone: m.tone,
    available: m.ready,
  }))

  const onPick = (key: string) => {
    const m = MODE_DEFS.find(x => x.key === key)
    if (m?.to) navigate(m.to)
  }
  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <NewQuoteChooser modes={modes} onPick={onPick} />
    </div>
  )
}
