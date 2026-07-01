// Container che raggruppa gli strumenti di amministrazione in 3 tab.
import { useState } from 'react'
import { Shield } from 'lucide-react'

import PageContainer from '@/components/ui/page-container'
import UsersPage from './UsersPage'
import RolesPage from './RolesPage'
import BackupSettingsPage from './BackupSettingsPage'

type Tab = 'users' | 'roles' | 'backup'

const TAB_LABELS: Record<Tab, string> = {
  users: 'Utenti',
  roles: 'Ruoli e Permessi',
  backup: 'Backup',
}

export default function SystemSettingsPage() {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <PageContainer width="xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted text-foreground flex items-center justify-center">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Sistema</h1>
          <p className="text-xs text-muted-foreground">Amministrazione: utenti, permessi e backup</p>
        </div>
      </div>

      <div className="flex gap-2 border-b overflow-x-auto">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t ? 'border-gray-700 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="-mx-6">
        {tab === 'users' && <UsersPage />}
        {tab === 'roles' && <RolesPage />}
        {tab === 'backup' && <BackupSettingsPage />}
      </div>
    </PageContainer>
  )
}
