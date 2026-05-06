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

interface SettingsTab {
  key: string
  label: string
  component: () => JSX.Element
}

interface SettingsGroup {
  label: string
  tabs: SettingsTab[]
}

// To add settings for a new feature: add a new group with its tabs here.
// Each group is visually separated so settings from different features never mix.
const GROUPS: SettingsGroup[] = [
  {
    label: 'Preventivazione',
    tabs: [
      { key: 'materials',   label: 'Materiali',      component: MaterialsPage },
      { key: 'machines',    label: 'Macchine',        component: MachinesPage },
      { key: 'templates',   label: 'Template Fasi',   component: PhaseTemplatesPage },
      { key: 'treatments',  label: 'Trattamenti',     component: TreatmentsPage },
      { key: 'suppliers',   label: 'Fornitori',       component: SuppliersPage },
      { key: 'cost-rules',  label: 'Regole di Costo', component: CostRulesPage },
      { key: 'step-colors', label: 'Colori STEP',     component: StepColorRulesPage },
      { key: 'categories',  label: 'Categorie',       component: QuoteCategoriesPage },
    ],
  },
  {
    label: 'Anagrafica e Sistema',
    tabs: [
      { key: 'customers', label: 'Clienti',      component: CustomersPage },
      { key: 'company',   label: 'Dati Azienda', component: CompanySettingsPage },
      { key: 'backup',    label: 'Backup',        component: BackupSettingsPage },
    ],
  },
]

const ALL_TABS = GROUPS.flatMap(g => g.tabs)

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('materials')
  const Active = ALL_TABS.find(t => t.key === activeTab)!.component

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar with group labels */}
      <div className="bg-white border-b shrink-0 overflow-x-auto">
        <div className="flex items-end gap-0 min-w-max">
          {GROUPS.map((group, gi) => (
            <div key={group.label} className={`flex items-end ${gi > 0 ? 'border-l border-gray-200' : ''}`}>
              <div className="flex flex-col">
                <span className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider select-none">
                  {group.label}
                </span>
                <div className="flex">
                  {group.tabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
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
            </div>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <Active />
      </div>
    </div>
  )
}
