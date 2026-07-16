// src/components/layout/SidebarView.tsx
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Gauge, Sun, Moon, LogOut, ChevronDown, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RoleBadge } from '@/components/settings/RoleBadge'

interface NavLeaf {
  key: string
  label: string
  icon: LucideIcon
  active?: boolean
  badge?: { n: number; tone: 'danger' | 'warning' | 'info' }
}

interface NavNode extends NavLeaf {
  children?: NavLeaf[]
}

interface NavSection {
  label: string
  items: NavNode[]
}

interface SidebarViewProps {
  sections: NavSection[]
  onNavigate: (key: string) => void
  user: { name: string; roleLabel: string; roleColor?: string; initials: string }
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onChangePassword: () => void
  onLogout: () => void
}

const badgeTone: Record<'danger' | 'warning' | 'info', string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
}

function NavRow({
  item,
  onNavigate,
}: {
  item: NavNode
  onNavigate: (key: string) => void
}) {
  const [open, setOpen] = useState(true)
  const hasChildren = !!item.children?.length
  const Icon = item.icon

  return (
    <div>
      <button
        type="button"
        onClick={() => (hasChildren ? setOpen((o) => !o) : onNavigate(item.key))}
        className={cn(
          'mb-0.5 flex w-full items-center justify-between rounded-[9px] px-2.5 py-[9px] text-[13.5px] transition-colors',
          item.active
            ? 'bg-primary font-semibold text-primary-foreground'
            : 'font-medium text-foreground hover:bg-muted/70',
        )}
      >
        <span className="flex items-center gap-[11px]">
          <Icon className="h-[17px] w-[17px]" />
          {item.label}
        </span>
        <span className="flex items-center gap-1.5">
          {item.badge && (
            <span
              className={cn(
                'flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-[5px] text-[11px] font-bold text-white',
                badgeTone[item.badge.tone],
              )}
            >
              {item.badge.n}
            </span>
          )}
          {hasChildren && (
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open ? '' : '-rotate-90')}
            />
          )}
        </span>
      </button>

      {hasChildren && open && (
        <div className="ml-[13px] border-l border-border pl-2.5">
          {item.children!.map((child) => (
            <button
              key={child.key}
              type="button"
              onClick={() => onNavigate(child.key)}
              className={cn(
                'mb-0.5 flex w-full items-center gap-[11px] rounded-[9px] px-2.5 py-[9px] text-[13.5px] transition-colors',
                child.active
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'font-medium text-foreground hover:bg-muted/70',
              )}
            >
              <child.icon className="h-[17px] w-[17px]" />
              {child.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SidebarView({
  sections,
  onNavigate,
  user,
  theme,
  onToggleTheme,
  onChangePassword,
  onLogout,
}: SidebarViewProps) {
  const ThemeIcon = theme === 'dark' ? Sun : Moon
  return (
    <aside className="sticky top-0 flex h-screen w-[244px] flex-none flex-col border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-[11px] border-b border-border px-[18px] py-4">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-primary text-primary-foreground">
          <Gauge className="h-[19px] w-[19px]" />
        </div>
        <div className="leading-[1.15]">
          <div className="text-sm font-bold tracking-tight">MechQuote</div>
          <div className="text-[11px] text-muted-foreground">F.lli Dalla Via</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="px-2.5 pb-2 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground first:pt-1.5">
              {section.label}
            </div>
            {section.items.map((item) => (
              <NavRow key={item.key} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleTheme}
          className="mb-0.5 flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70"
        >
          <ThemeIcon className="h-[17px] w-[17px]" />
          {theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
        </button>
        <button
          type="button"
          onClick={onChangePassword}
          className="mb-0.5 flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70"
        >
          <KeyRound className="h-[17px] w-[17px]" />
          Cambia password
        </button>
        <div className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2">
          <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {user.initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-semibold">{user.name}</div>
            {user.roleLabel && (
              <div className="mt-1">
                <RoleBadge label={user.roleLabel} color={user.roleColor} />
              </div>
            )}
          </div>
          <button type="button" onClick={onLogout} aria-label="Esci" className="flex-none">
            <LogOut className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" />
          </button>
        </div>
      </div>
    </aside>
  )
}
