import { ClipboardList } from 'lucide-react'
import QuotesListView from '@/components/quotes/QuotesListView'

/** Preventivi in corso = tutto ciò che non è completo (bozza/inviato/letto/
 *  confermato), spec 18. Include azioni rapide per amministrazione (Conferma
 *  con mini-dialog + PDF) senza entrare nel preventivo. */
export default function QuotesActivePage() {
  return (
    <QuotesListView
      phase="active"
      icon={ClipboardList}
      title="Preventivi in corso"
      subtitle="Bozze, inviati, letti e confermati — la coda di lavoro"
      showQuickActions
    />
  )
}
