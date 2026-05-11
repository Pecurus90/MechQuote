import { useEffect } from 'react'

/**
 * Hook: aggancia un listener globale al tasto Escape e chiama `callback`
 * quando l'utente lo preme. Attivo solo quando `enabled` è true (tipico:
 * stato "modal aperta"). Cleanup automatico allo smount.
 *
 * Usage:
 *   const [open, setOpen] = useState(false)
 *   useEscapeKey(() => setOpen(false), open)
 */
export function useEscapeKey(callback: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') callback()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [callback, enabled])
}
