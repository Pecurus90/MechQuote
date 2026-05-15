import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { DieQuoteSpec, Quote } from '@/types'

interface Props {
  quote: Quote
  spec: DieQuoteSpec
}

/** Tabella riepilogo costi L1-L7 + prezzo finale, allineata alla spec utente.
 *  Mostra snapshot da `DieQuoteSpec.cost_*` (calcolato dal backend dopo recalc)
 *  + applica margine/sconto presi da Quote per derivare prezzo lordo/finale. */
export default function DieCostSummary({ quote, spec }: Props) {
  const margin = quote.global_margin_percent || 0
  const discount = quote.global_discount_percent || 0
  const industrial = spec.cost_industrial || 0
  const markup = industrial * margin / 100
  const lordo = industrial + markup
  const sconto = lordo * discount / 100
  const finale = lordo - sconto

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Riepilogo Costi</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <tbody>
            <Row label="Materiale piastre" value={spec.cost_material} />
            <Row label="Normalizzati" value={spec.cost_normalized} />
            <Row label="Lavorazioni meccaniche" value={spec.cost_machining} />
            <Row label="Accessori (progettazione + montaggio + extras)" value={spec.cost_accessories} />
            <tr className="border-t-2">
              <td className="px-4 py-2 font-semibold text-gray-800">Costo industriale</td>
              <td className="px-4 py-2 text-right font-semibold text-gray-800">{industrial.toFixed(2)} €</td>
            </tr>
            <Row label={`Margine ${margin.toFixed(0)}%`} value={markup} muted />
            <tr className="border-t">
              <td className="px-4 py-2 font-medium">Prezzo lordo</td>
              <td className="px-4 py-2 text-right font-medium">{lordo.toFixed(2)} €</td>
            </tr>
            {discount > 0 && (
              <tr>
                <td className="px-4 py-1.5 text-sm text-gray-500">Sconto cliente {discount.toFixed(0)}%</td>
                <td className="px-4 py-1.5 text-right text-sm text-red-500">-{sconto.toFixed(2)} €</td>
              </tr>
            )}
            <tr className="border-t-2 bg-rose-50">
              <td className="px-4 py-3 font-bold text-rose-900 uppercase text-xs tracking-wide">Prezzo finale</td>
              <td className="px-4 py-3 text-right font-bold text-rose-900 text-xl">{finale.toFixed(2)} €</td>
            </tr>
          </tbody>
        </table>
        {spec.delivery_days && (
          <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-600">
            Consegna: <span className="font-medium">{spec.delivery_days} giorni lavorativi</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className={`px-4 py-1.5 ${muted ? 'text-sm text-gray-500' : 'text-sm text-gray-700'}`}>{label}</td>
      <td className={`px-4 py-1.5 text-right ${muted ? 'text-sm text-gray-500' : 'text-sm text-gray-700'}`}>{value.toFixed(2)} €</td>
    </tr>
  )
}
