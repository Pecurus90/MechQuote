import { useRef } from 'react'

// Barra tab canonica (P5, handoff Catalogo/Sistema): attivo = testo accento +
// underline 2.5px; hover = fondo muted; inattivo = muted-foreground. Scrolla in
// orizzontale su schermi stretti. Navigazione da tastiera con frecce ←→.
// `accent` = nome di una CSS var token (es. 'primary', 'edm', 'dies',
// 'foreground'); l'underline/colore attivo usano hsl(var(--accent)).

export interface SettingsTab { key: string; label: string }

interface Props {
  tabs: SettingsTab[]
  active: string
  onChange: (key: string) => void
  accent?: string
}

export default function SettingsTabs({ tabs, active, onChange, accent = 'primary' }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = tabs.findIndex(t => t.key === active)
    const next = e.key === 'ArrowRight' ? Math.min(tabs.length - 1, i + 1) : Math.max(0, i - 1)
    onChange(tabs[next].key)
    const btns = ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    btns?.[next]?.focus()
  }

  return (
    <div ref={ref} role="tablist" onKeyDown={onKey} className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(t => {
        const on = t.key === active
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.key)}
            style={on ? { color: `hsl(var(--${accent}))`, boxShadow: `inset 0 -2.5px 0 hsl(var(--${accent}))` } : undefined}
            className={`whitespace-nowrap rounded-t-md px-4 py-2.5 text-sm font-medium transition-colors ${
              on ? '' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
