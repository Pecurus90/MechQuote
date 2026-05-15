import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { DieQuoteSpec, Quote } from '@/types'

interface Props {
  quote: Quote
  spec: DieQuoteSpec
}

/** Tabella riepilogo costi L1-L7 + prezzo finale, allineata alla spec utente.
 *  Mostra snapshot da `DieQuoteSpec.cost_*` (calcolato dal backend dopo recalc)
 *  + applica margine/sconto presi da Quote per derivare prezzo lordo/finale.
 *  In modalità Rapida mostra il range min/max invece della tabella dettagliata. */
export default function DieCostSummary({ quote, spec }: Props) {
  const margin = quote.global_margin_percent || 0
  const discount = quote.global_discount_percent || 0
  const industrial = spec.cost_industrial || 0
  const markup = industrial * margin / 100
  const lordo = industrial + markup
  const sconto = lordo * discount / 100
  const finale = lordo - sconto

  if (spec.quick_mode) {
    // Range Rapida: applica margine + sconto ai due estremi
    const minLordo = spec.quick_min * (1 + margin / 100)
    const maxLordo = spec.quick_max * (1 + margin / 100)
    const minFinal = minLordo * (1 - discount / 100)
    const maxFinal = maxLordo * (1 - discount / 100)
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Stima Rapida <span className="text-xs font-normal text-rose-700 bg-rose-50 px-2 py-0.5 rounded">±20%</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-center py-4 bg-rose-50 rounded-lg">
            <p className="text-xs text-rose-700 uppercase tracking-wide mb-1">Prezzo stimato</p>
            <p className="text-2xl font-bold text-rose-900">
              {minFinal.toFixed(0)} — {maxFinal.toFixed(0)} €
            </p>
            <p className="text-[11px] text-gray-500 mt-2">
              Stima basata su peso castello × €/kg medio. Per maggiore precisione
              passa in modalità Dettagliata e compila piastre + feature.
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="px-2 py-1 text-gray-500">Materiale castello (stima)</td><td className="px-2 py-1 text-right">{spec.cost_material.toFixed(0)} €</td></tr>
              <tr><td className="px-2 py-1 text-gray-500">Lavorazioni meccaniche</td><td className="px-2 py-1 text-right">{spec.cost_machining.toFixed(0)} €</td></tr>
              <tr><td className="px-2 py-1 text-gray-500">Accessori</td><td className="px-2 py-1 text-right">{spec.cost_accessories.toFixed(0)} €</td></tr>
              <tr className="border-t"><td className="px-2 py-1 font-medium">Industriale (centrale)</td><td className="px-2 py-1 text-right font-medium">{industrial.toFixed(0)} €</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    )
  }

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
