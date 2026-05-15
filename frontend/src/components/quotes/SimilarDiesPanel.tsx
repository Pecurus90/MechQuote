import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Search, ChevronRight } from 'lucide-react'
import api from '@/lib/api'

interface SimilarDie {
  id: number
  quote_number: string
  customer_name: string | null
  die_subtype: string
  area_dm2: number
  n_bends: number
  n_punches: number
  cost_industrial: number
  final_price: number
  quote_date: string | null
  score: number
}

interface Props {
  quoteId: number
}

/** Pannello laterale "Preventivi simili": match per area castello ±20%,
 *  feature ±2, stesso subtype. Esclude le rev del quote corrente.
 *  Mostra fino a 5 risultati con prezzo finale come riferimento. */
export default function SimilarDiesPanel({ quoteId }: Props) {
  const navigate = useNavigate()
  const [similar, setSimilar] = useState<SimilarDie[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get<SimilarDie[]>(`/dies/find-similar/${quoteId}`)
      .then(r => setSimilar(r.data))
      .catch(() => setSimilar([]))
      .finally(() => setLoading(false))
  }, [quoteId])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Preventivi simili</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-gray-400">Ricerca in corso...</p></CardContent>
      </Card>
    )
  }

  if (similar.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" /> Preventivi simili
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">
            Nessun preventivo stampo storico abbastanza simile (area castello ±20%, feature ±2).
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="w-4 h-4 text-rose-500" />
          Preventivi simili <span className="text-sm font-normal text-gray-400">({similar.length})</span>
        </CardTitle>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </CardHeader>
      {!collapsed && (
        <CardContent className="p-0">
          <ul className="divide-y">
            {similar.map(s => (
              <li key={s.id}
                  onClick={() => navigate(`/quotes/${s.id}`)}
                  className="px-4 py-2.5 hover:bg-rose-50 cursor-pointer">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-rose-700">{s.quote_number}</span>
                  <span className="text-sm font-bold text-gray-800">{s.final_price.toFixed(0)} €</span>
                </div>
                {s.customer_name && (
                  <p className="text-xs text-gray-500 truncate">{s.customer_name}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {s.die_subtype} · area {s.area_dm2} dm² · pieghe {s.n_bends} · punzoni {s.n_punches}
                  {s.quote_date && <> · {new Date(s.quote_date).toLocaleDateString('it-IT')}</>}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
