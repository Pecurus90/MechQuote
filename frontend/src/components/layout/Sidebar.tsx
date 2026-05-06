import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Plus, Archive, Box, Cog, Layers,
  Ruler, FileText, Palette, Building2, Database, Tag, Users,
  Settings, ChevronDown, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mainItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/quotes/new', icon: Plus, label: 'Nuovo Preventivo' },
  { to: '/quotes/archive', icon: Archive, label: 'Archivio Preventivi' },
]

const settingsGroups = [
  {
    label: 'Costi e Regole',
    items: [
      { to: '/settings/materials', icon: Box, label: 'Materiali' },
      { to: '/settings/machines', icon: Cog, label: 'Macchine' },
      { to: '/settings/templates', icon: Layers, label: 'Template Fasi' },
      { to: '/settings/treatments', icon: Ruler, label: 'Trattamenti' },
      { to: '/settings/suppliers', icon: Building2, label: 'Fornitori' },
      { to: '/settings/cost-rules', icon: FileText, label: 'Regole di Costo' },
      { to: '/settings/step-colors', icon: Palette, label: 'Colori STEP' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/settings/categories', icon: Tag, label: 'Categorie Preventivo' },
      { to: '/settings/customers', icon: Users, label: 'Clienti' },
      { to: '/settings/company', icon: Building2, label: 'Dati Azienda' },
      { to: '/settings/backup', icon: Database, label: 'Backup / Esporta' },
    ],
  },
]

export default function Sidebar() {
  const location = useLocation()
  const isSettingsActive = location.pathname.startsWith('/settings')
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive)

  return (
    <aside className="w-60 bg-white border-r h-screen sticky top-0 flex flex-col shrink-0">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">FDV</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">MechQuote</h1>
            <p className="text-xs text-gray-500">Fratelli Dalla Via</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Main items */}
        <ul className="space-y-0.5 mb-4">
          {mainItems.map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Impostazioni collapsible */}
        <div>
          <button
            onClick={() => setSettingsOpen(o => !o)}
            className={cn(
              'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors',
              isSettingsActive
                ? 'text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <span className="flex items-center gap-2.5">
              <Settings className="w-4 h-4 shrink-0" />
              <span>Impostazioni</span>
            </span>
            {settingsOpen
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            }
          </button>

          {settingsOpen && (
            <div className="mt-1 space-y-3 pl-3 border-l border-gray-100 ml-3">
              {settingsGroups.map(group => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map(item => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                              isActive
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            )
                          }
                        >
                          <item.icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate text-xs">{item.label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>
    </aside>
  )
}
