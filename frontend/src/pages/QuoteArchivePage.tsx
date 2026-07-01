import { Archive } from 'lucide-react'
import QuotesListView from '@/components/quotes/QuotesListView'

/** Archivio = preventivi completati (spec 18). La lista, i filtri e la vista
 *  articoli espandibile vivono in QuotesListView, condiviso con "Preventivi
 *  in corso". */
export default function QuoteArchivePage() {
  return (
    <QuotesListView
      phase="completed"
      icon={Archive}
      title="Archivio Preventivi"
      subtitle="Preventivi completati, filtrabili per anno e tipo"
    />
  )
}
