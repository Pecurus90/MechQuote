import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Tema chiaro/scuro con selettore (spec 20). Applica class="dark" su <html>;
// i token semantici in index.css fanno il resto. Persistito in localStorage.

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'mechquote-theme'

function getInitial(): Theme {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s === 'light' || s === 'dark') return s
  } catch { /* localStorage non disponibile */ }
  return 'light'
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

// Applica il tema salvato PRIMA del primo render, per limitare il flash.
apply(getInitial())

interface ThemeCtx {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}
const ThemeContext = createContext<ThemeCtx | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitial)

  useEffect(() => {
    apply(theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeCtx {
  const c = useContext(ThemeContext)
  if (!c) throw new Error('useTheme deve stare dentro <ThemeProvider>')
  return c
}
