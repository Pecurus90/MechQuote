// Container che raggruppa il catalogo di produzione in 4 tab:
// Lavorazioni / Trattamenti / Centri di costo (macchine) / Template flusso.
import { useState } from 'react'
import { Factory } from 'lucide-react'

import StandardPage from '@/components/layout/StandardPage'
import OperationsPage from './OperationsPage'
import TreatmentsPage from './TreatmentsPage'
import MachinesPage from './MachinesPage'
import WorkflowTemplatesPage from './WorkflowTemplatesPage'

type Tab = 'operations' | 'treatments' | 'machines' | 'workflows'

const TAB_LABELS: Record<Tab, string> = {
  operations: 'Lavorazioni',
  treatments: 'Trattamenti',
  machines: 'Centri di costo',
  workflows: 'Template flusso',
}

export default function CatalogSettingsPage() {
  const [tab, setTab] = useState<Tab>('operations')

  return (
    <StandardPage
      icon={Factory}
      color="indigo"
      title="Lavorazioni & Macchine"
      subtitle="Catalogo di produzione: cosa si fa, dove si fa, in che sequenza"
      width="xl"
    >
      <div className="flex gap-2 border-b overflow-x-auto">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="-mx-6">
        {tab === 'operations' && <OperationsPage />}
        {tab === 'treatments' && <TreatmentsPage />}
        {tab === 'machines' && <MachinesPage />}
        {tab === 'workflows' && <WorkflowTemplatesPage />}
      </div>
    </StandardPage>
  )
}
