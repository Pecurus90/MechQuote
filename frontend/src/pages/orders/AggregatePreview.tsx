import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileDown } from 'lucide-react'
import type { MaterialAggregateResult } from '@/types'

interface Props {
  aggregate: MaterialAggregateResult | null
  loading: boolean
  selectedCount: number
  totalQty: number
  totalWeight: number
  creatingSupplierId: number | null
  onCreateSupplierOrder: (supplierId: number, supplierName: string) => void
}

export default function AggregatePreview({
  aggregate, loading, selectedCount, totalQty, totalWeight,
  creatingSupplierId, onCreateSupplierOrder,
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
          <p className="text-[11px] text-gray-400">
            Ogni fornitore genera un ordine e un CSV separati. Verrà inviata notifica
            a ufficio tecnico e amministrazione.
          </p>
          {aggregate.groups.map((g, gi) => {
            const isCreating = creatingSupplierId === g.supplier_id
            const disabled = creatingSupplierId !== null || g.supplier_id == null
            return (
              <Card key={gi}>
                <CardContent className="p-0">
                  <div className="bg-blue-50 border-b border-blue-100 px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold text-sm text-blue-900">{g.supplier_name}</span>
                      <span className="text-xs text-blue-700 ml-2">{g.items.length} {g.items.length === 1 ? 'materiale' : 'materiali'}</span>
                    </div>
                    {g.supplier_id != null ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onCreateSupplierOrder(g.supplier_id as number, g.supplier_name)}
                        title={`Crea l'ordine CSV per ${g.supplier_name}`}
                        className="shrink-0"
                      >
                        <FileDown className="w-3.5 h-3.5 mr-1" />
                        {isCreating ? 'Genero...' : 'Crea CSV'}
                      </Button>
                    ) : (
                      <span className="text-[11px] text-amber-600 shrink-0">Assegna un fornitore per ordinare</span>
                    )}
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
            )
          })}

          <Card>
            <CardContent className="p-3 flex items-center justify-between bg-gray-50 text-sm">
              <span className="text-gray-600">Totali</span>
              <span className="font-mono text-gray-900 font-semibold">
                {totalQty} pz &middot; {totalWeight.toFixed(2)} kg
              </span>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
