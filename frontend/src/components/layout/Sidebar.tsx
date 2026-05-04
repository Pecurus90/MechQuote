import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Plus, Archive, Settings, Cog, Box, Layers,
  Ruler, Zap, FileText, Palette, Building2, FileDown, Database
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { section: 'Main', items: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/quotes/new', icon: Plus, label: 'Crea Preventivo' },
  ]},
  { section: 'Archivio', items: [
    { to: '/quotes', icon: Archive, label: 'Quote Archive' },
  ]},
  { section: 'Impostazioni Costi', items: [
    { to: '/settings/materials', icon: Box, label: 'Materials' },
    { to: '/settings/machines', icon: Cog, label: 'Machines' },
    { to: '/settings/templates', icon: Layers, label: 'Phase Templates' },
    { to: '/settings/treatments', icon: Ruler, label: 'Treatments' },
    { to: '/settings/suppliers', icon: Building2, label: 'Suppliers' },
  ]},
  { section: 'Regole', items: [
    { to: '/settings/cost-rules', icon: FileText, label: 'Cost Rules' },
    { to: '/settings/edm-rules', icon: Zap, label: 'EDM Rules' },
    { to: '/settings/cnc-rules', icon: Cog, label: 'CNC Rules' },
    { to: '/settings/step-colors', icon: Palette, label: 'STEP Color Rules' },
  ]},
  { section: 'Sistema', items: [
    { to: '/settings/company', icon: Building2, label: 'Company Settings' },
    { to: '/settings/pdf', icon: FileDown, label: 'PDF Settings' },
    { to: '/settings/backup', icon: Database, label: 'Backup / Export' },
  ]},
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <aside className="w-64 bg-white border-r h-screen sticky top-0 flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">FDV</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">MechQuote</h1>
            <p className="text-xs text-gray-500">Fratelli Dalla Via</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        {navItems.map((section) => (
          <div key={section.section}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {section.section}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      )
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
