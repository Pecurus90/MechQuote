// Container che raggruppa le 4 pagine fornitori in tab interni.
// Le pagine atomiche restano file separati e si auto-gestiscono il padding/header.
import { useState } from 'react'

import PageContainer from '@/components/ui/page-container'
import SettingsTabs from '@/components/settings/SettingsTabs'
import MaterialSuppliersPage from './MaterialSuppliersPage'
import TreatmentSuppliersPage from './TreatmentSuppliersPage'
import ToolSuppliersPage from './ToolSuppliersPage'
import NormalizedSuppliersPage from './NormalizedSuppliersPage'

type Tab = 'materials' | 'treatments' | 'tools' | 'normalized'

const TABS = [
  { key: 'materials', label: 'Materiali' },
  { key: 'treatments', label: 'Lavorazioni esterne' },
  { key: 'tools', label: 'Utensili' },
  { key: 'normalized', label: 'Normalizzati' },
]

export default function SuppliersSettingsPage() {
  const [tab, setTab] = useState<Tab>('materials')

  return (
    <PageContainer width="xl">
      <SettingsTabs tabs={TABS} active={tab} onChange={t => setTab(t as Tab)} accent="primary" />

      <div className="-mx-6">  {/* compensa il p-6 del container: le pagine atomiche hanno già il loro padding */}
        {tab === 'materials' && <MaterialSuppliersPage />}
        {tab === 'treatments' && <TreatmentSuppliersPage />}
        {tab === 'tools' && <ToolSuppliersPage />}
        {tab === 'normalized' && <NormalizedSuppliersPage />}
      </div>
    </PageContainer>
  )
}
