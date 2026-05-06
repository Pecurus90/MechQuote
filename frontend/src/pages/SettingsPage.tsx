import { useState } from 'react'
import MaterialsPage from '@/pages/settings/MaterialsPage'
import MachinesPage from '@/pages/settings/MachinesPage'
import PhaseTemplatesPage from '@/pages/settings/PhaseTemplatesPage'
import TreatmentsPage from '@/pages/settings/TreatmentsPage'
import SuppliersPage from '@/pages/settings/SuppliersPage'
import CostRulesPage from '@/pages/settings/CostRulesPage'
import StepColorRulesPage from '@/pages/settings/StepColorRulesPage'
import QuoteCategoriesPage from '@/pages/settings/QuoteCategoriesPage'
import CustomersPage from '@/pages/settings/CustomersPage'
import CompanySettingsPage from '@/pages/settings/CompanySettingsPage'
import BackupSettingsPage from '@/pages/settings/BackupSettingsPage'

const TABS = [
  { key: 'materials',   label: 'Materiali',       component: MaterialsPage },
  { key: 'machines',    label: 'Macchine',         component: MachinesPage },
  { key: 'templates',   label: 'Template Fasi',    component: PhaseTemplatesPage },
  { key: 'treatments',  label: 'Trattamenti',      component: TreatmentsPage },
  { key: 'suppliers',   label: 'Fornitori',        component: SuppliersPage },
  { key: 'cost-rules',  label: 'Regole di Costo',  component: CostRulesPage },
  { key: 'step-colors', label: 'Colori STEP',      component: StepColorRulesPage },
  { key: 'categories',  label: 'Categorie',        component: QuoteCategoriesPage },
  { key: 'customers',   label: 'Clienti',          component: CustomersPage },
  { key: 'company',     label: 'Dati Azienda',     component: CompanySettingsPage },
  { key: 'backup',      label: 'Backup',           component: BackupSettingsPage },
] as const

type TabKey = typeof TABS[number]['key']

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('materials')
  const Active = TABS.find(t => t.key === activeTab)!.component

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b overflow-x-auto shrink-0">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-700 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Active />
      </div>
    </div>
  )
}
