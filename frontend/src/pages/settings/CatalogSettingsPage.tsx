// Container che raggruppa il catalogo di produzione in 4 tab:
// Lavorazioni / Trattamenti / Centri di costo (macchine) / Template flusso.
import { useState } from 'react'

import PageContainer from '@/components/ui/page-container'
import SettingsTabs from '@/components/settings/SettingsTabs'
import OperationsPage from './OperationsPage'
import TreatmentsPage from './TreatmentsPage'
import MachinesPage from './MachinesPage'
import WorkflowTemplatesPage from './WorkflowTemplatesPage'

type Tab = 'operations' | 'treatments' | 'machines' | 'workflows'

const TABS = [
  { key: 'operations', label: 'Lavorazioni' },
  { key: 'treatments', label: 'Trattamenti' },
  { key: 'machines', label: 'Centri di costo' },
  { key: 'workflows', label: 'Template flusso' },
]

export default function CatalogSettingsPage() {
  const [tab, setTab] = useState<Tab>('operations')

  return (
    <PageContainer width="xl">
      <SettingsTabs tabs={TABS} active={tab} onChange={t => setTab(t as Tab)} accent="primary" />

      <div className="-mx-6">
        {tab === 'operations' && <OperationsPage />}
        {tab === 'treatments' && <TreatmentsPage />}
        {tab === 'machines' && <MachinesPage />}
        {tab === 'workflows' && <WorkflowTemplatesPage />}
      </div>
    </PageContainer>
  )
}
