import { Card, CardContent } from '@/components/ui/card'
import { FileDown } from 'lucide-react'
import PrimaryCtaButton from '@/components/settings/PrimaryCtaButton'
import type { MaterialAggregateResult } from '@/types'

interface Props {
  aggregate: MaterialAggregateResult | null
  loading: boolean
  selectedCount: number
  totalQty: number
  totalWeight: number
  exporting: boolean
  onExport: () => void
}

export default function AggregatePreview({
  aggregate, loading, selectedCount, totalQty, totalWeight, exporting, onExport,
}: Props) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-700 mb-3">Materiali aggregati</h2>
      {selectedCount === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-gray-400">
            Seleziona uno o più preventivi per vedere l'aggregazione.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-gray-400">Calcolo...</CardContent></Card>
      ) : !aggregate || aggregate.groups.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-amber-700 bg-amber-50">
            Nessun materiale da ordinare nei preventivi selezionati
            (potrebbero essere tutti in conto lavoro o senza materiale).
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {aggregate.groups.map((g, gi) => (
            <Card key={gi}>
              <CardContent className="p-0">
                <div className="bg-blue-50 border-b border-blue-100 px-3 py-2 flex items-center justify-between">
                  <span className="font-semibold text-sm text-blue-900">{g.supplier_name}</span>
                  <span className="text-xs text-blue-700">{g.items.length} {g.items.length === 1 ? 'materiale' : 'materiali'}</span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {g.items.map((it, i) => (
                      <tr key={i} className={`border-b last:border-0 ${it.from_stock ? 'bg-amber-50/40' : ''}`}>
                        <td className="p-2">
                          <div className="font-medium text-gray-800 flex items-center gap-2 flex-wrap">
                            <span>{it.material_name}</span>
                            {it.family && <span className="text-gray-400 font-normal"> ({it.family.replace(/_/g, ' ')})</span>}
                            {it.from_stock && (
                              <span className="inline-block bg-amber-100 text-amber-800 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded">
                                Da magazzino
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500 text-[11px]">{it.dim_str}</div>
                        </td>
                        <td className="p-2 text-right font-mono whitespace-nowrap">
                          <div className={`font-semibold ${it.from_stock ? 'text-amber-700' : 'text-blue-700'}`}>{it.total_qty} pz</div>
                          <div className="text-[11px] text-gray-500">{it.total_weight_kg.toFixed(2)} kg</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardContent className="p-3 flex items-center justify-between bg-gray-50 text-sm">
              <span className="text-gray-600">Totali</span>
              <span className="font-mono text-gray-900 font-semibold">
                {totalQty} pz &middot; {totalWeight.toFixed(2)} kg
              </span>
            </CardContent>
          </Card>

          <PrimaryCtaButton
            color="blue"
            onClick={onExport}
            disabled={exporting || selectedCount === 0}
            className="w-full justify-center py-3"
          >
            <FileDown className="w-4 h-4" />
            {exporting ? 'Generazione in corso...' : `PDF ordine (${selectedCount} preventiv${selectedCount === 1 ? 'o' : 'i'})`}
          </PrimaryCtaButton>
          <p className="text-[11px] text-gray-400 text-center">
            I preventivi selezionati saranno marcati come "materiale ordinato"
            e verrà inviata notifica a ufficio tecnico e amministrazione.
          </p>
        </div>
      )}
    </div>
  )
}
