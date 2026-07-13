// Container che raggruppa gli strumenti di amministrazione in tab.
// AUD-14: i tab sono gate per permesso — Utenti/Ruoli richiedono `users`,
// Backup richiede `backup`. Un utente con solo uno dei due vede solo i suoi
// tab (niente bottoni inefficaci). La route ammette `users` OPPURE `backup`.
import { useState } from 'react'

import { useAuth } from '@/lib/auth'
import PageContainer from '@/components/ui/page-container'
import SettingsTabs from '@/components/settings/SettingsTabs'
import UsersPage from './UsersPage'
import RolesPage from './RolesPage'
import BackupSettingsPage from './BackupSettingsPage'

type Tab = 'users' | 'roles' | 'backup'

export default function SystemSettingsPage() {
  const { hasPermission } = useAuth()
  const canUsers = hasPermission('users')
  const canBackup = hasPermission('backup')

  const tabs = [
    ...(canUsers ? [{ key: 'users', label: 'Utenti' }, { key: 'roles', label: 'Ruoli e Permessi' }] : []),
    ...(canBackup ? [{ key: 'backup', label: 'Backup' }] : []),
  ]

  const [tab, setTab] = useState<Tab>((tabs[0]?.key as Tab) ?? 'users')

  return (
    <PageContainer width="xl">
      <SettingsTabs tabs={tabs} active={tab} onChange={t => setTab(t as Tab)} accent="foreground" />

      <div className="-mx-6">
        {tab === 'users' && canUsers && <UsersPage />}
        {tab === 'roles' && canUsers && <RolesPage />}
        {tab === 'backup' && canBackup && <BackupSettingsPage />}
      </div>
    </PageContainer>
  )
}
