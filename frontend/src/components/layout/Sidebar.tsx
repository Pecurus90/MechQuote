import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Plus, Archive, Settings, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Sidebar() {
  const location = useLocation()
  const isQuotesActive = location.pathname.startsWith('/quotes')
  const [quotesOpen, setQuotesOpen] = useState(isQuotesActive)

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

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {/* Dashboard */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )
          }
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          <span>Dashboard</span>
        </NavLink>

        {/* Preventivazione — collassabile */}
        <div className="pt-1">
          <button
            onClick={() => setQuotesOpen(o => !o)}
            className={cn(
              'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors',
              isQuotesActive
                ? 'text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <span className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 shrink-0" />
              <span>Preventivazione</span>
            </span>
            {quotesOpen
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            }
          </button>

          {quotesOpen && (
            <div className="mt-0.5 pl-3 border-l border-gray-100 ml-3 space-y-0.5">
              <NavLink
                to="/quotes/new"
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )
                }
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs">Nuovo Preventivo</span>
              </NavLink>
              <NavLink
                to="/quotes/archive"
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )
                }
              >
                <Archive className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs">Archivio Preventivi</span>
              </NavLink>
            </div>
          )}
        </div>

        {/* Impostazioni — link singolo */}
        <div className="pt-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Impostazioni</span>
          </NavLink>
        </div>
      </nav>
    </aside>
  )
}
