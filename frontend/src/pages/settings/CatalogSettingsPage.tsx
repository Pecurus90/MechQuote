// Container che raggruppa il catalogo di produzione in 4 tab:
// Lavorazioni / Trattamenti / Centri di costo (macchine) / Template flusso.
import { useState } from 'react'
import { Factory } from 'lucide-react'

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
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
          <Factory className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Lavorazioni & Macchine</h1>
          <p className="text-xs text-gray-500">Catalogo di produzione: cosa si fa, dove si fa, in che sequenza</p>
        </div>
      </div>

      <div className="flex gap-2 border-b overflow-x-auto">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-800'
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
    </div>
  )
}
