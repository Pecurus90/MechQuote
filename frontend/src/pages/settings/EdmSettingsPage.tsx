// Container che raggruppa le 4 pagine Wire EDM in tab interni.
import { useState } from 'react'
import { Zap } from 'lucide-react'

import StandardPage from '@/components/layout/StandardPage'
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
    <StandardPage
      icon={Zap}
      color="amber"
      title="Wire EDM"
      subtitle="Configurazione elettroerosione a filo"
      width="xl"
    >
      <div className="flex gap-2 border-b overflow-x-auto">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t ? 'border-amber-600 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'
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
    </StandardPage>
  )
}
