// Container che raggruppa le 4 pagine Wire EDM in tab interni.
import { useState } from 'react'

import PageContainer from '@/components/ui/page-container'
import SettingsTabs from '@/components/settings/SettingsTabs'
import EdmConfigPage from './edm/EdmConfigPage'
import EdmSpeedsPage from './edm/EdmSpeedsPage'
import CuttingCyclesPage from './edm/CuttingCyclesPage'
import DrillingTimesPage from './edm/DrillingTimesPage'
import ElectrodesPage from './edm/ElectrodesPage'

type Tab = 'config' | 'speeds' | 'cycles' | 'drilling' | 'electrodes'

const TABS = [
  { key: 'config', label: 'Parametri globali' },
  { key: 'speeds', label: 'Velocità di taglio' },
  { key: 'cycles', label: 'Cicli di taglio' },
  { key: 'drilling', label: 'Tempi foratura' },
  { key: 'electrodes', label: 'Elettrodi' },
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
        {tab === 'electrodes' && <ElectrodesPage />}
      </div>
    </PageContainer>
  )
}
