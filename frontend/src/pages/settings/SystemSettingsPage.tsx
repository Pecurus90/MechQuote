// Container che raggruppa gli strumenti di amministrazione in 3 tab.
import { useState } from 'react'

import PageContainer from '@/components/ui/page-container'
import SettingsTabs from '@/components/settings/SettingsTabs'
import UsersPage from './UsersPage'
import RolesPage from './RolesPage'
import BackupSettingsPage from './BackupSettingsPage'

type Tab = 'users' | 'roles' | 'backup'

const TABS = [
  { key: 'users', label: 'Utenti' },
  { key: 'roles', label: 'Ruoli e Permessi' },
  { key: 'backup', label: 'Backup' },
]

export default function SystemSettingsPage() {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <PageContainer width="xl">
      <SettingsTabs tabs={TABS} active={tab} onChange={t => setTab(t as Tab)} accent="foreground" />

      <div className="-mx-6">
        {tab === 'users' && <UsersPage />}
        {tab === 'roles' && <RolesPage />}
        {tab === 'backup' && <BackupSettingsPage />}
      </div>
    </PageContainer>
  )
}
