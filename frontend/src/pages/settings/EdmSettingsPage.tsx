// Container che raggruppa le 4 pagine Wire EDM in tab interni.
import { useState } from 'react'

import PageContainer from '@/components/ui/page-container'
import SettingsTabs from '@/components/settings/SettingsTabs'
import EdmConfigPage from './edm/EdmConfigPage'
import EdmSpeedsPage from './edm/EdmSpeedsPage'
import CuttingCyclesPage from './edm/CuttingCyclesPage'
import DrillingTimesPage from './edm/DrillingTimesPage'

type Tab = 'config' | 'speeds' | 'cycles' | 'drilling'

const TABS = [
  { key: 'config', label: 'Parametri globali' },
  { key: 'speeds', label: 'Velocità di taglio' },
  { key: 'cycles', label: 'Cicli di taglio' },
  { key: 'drilling', label: 'Tempi foratura' },
]

export default function EdmSettingsPage() {
  const [tab, setTab] = useState<Tab>('config')

  return (
    <PageContainer width="xl">
      <SettingsTabs tabs={TABS} active={tab} onChange={t => setTab(t as Tab)} accent="edm" />

      <div className="-mx-6">
        {tab === 'config' && <EdmConfigPage />}
        {tab === 'speeds' && <EdmSpeedsPage />}
        {tab === 'cycles' && <CuttingCyclesPage />}
        {tab === 'drilling' && <DrillingTimesPage />}
      </div>
    </PageContainer>
  )
}
