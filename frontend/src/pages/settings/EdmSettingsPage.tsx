// Container che raggruppa le 4 pagine Wire EDM in tab interni.
import { useState } from 'react'
import { Zap } from 'lucide-react'

import PageContainer from '@/components/ui/page-container'
import EdmConfigPage from './edm/EdmConfigPage'
import EdmSpeedsPage from './edm/EdmSpeedsPage'
import CuttingCyclesPage from './edm/CuttingCyclesPage'
import DrillingTimesPage from './edm/DrillingTimesPage'

type Tab = 'config' | 'speeds' | 'cycles' | 'drilling'

const TAB_LABELS: Record<Tab, string> = {
  config: 'Parametri globali',
  speeds: 'Velocità di taglio',
  cycles: 'Cicli di taglio',
  drilling: 'Tempi foratura',
}

export default function EdmSettingsPage() {
  const [tab, setTab] = useState<Tab>('config')

  return (
    <PageContainer width="xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Wire EDM</h1>
          <p className="text-xs text-gray-500">Configurazione elettroerosione a filo</p>
        </div>
      </div>

      <div className="flex gap-2 border-b overflow-x-auto">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="-mx-6">
        {tab === 'config' && <EdmConfigPage />}
        {tab === 'speeds' && <EdmSpeedsPage />}
        {tab === 'cycles' && <CuttingCyclesPage />}
        {tab === 'drilling' && <DrillingTimesPage />}
      </div>
    </PageContainer>
  )
}
