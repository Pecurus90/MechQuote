import { useEffect } from 'react'

/**
 * AUD-28: avvisa prima di ricaricare/chiudere la tab quando c'è lavoro non
 * salvato (es. wizard con DXF caricato e campi compilati). Copre refresh,
 * chiusura tab e navigazione "hard" via URL — i casi in cui altrimenti si
 * perde tutto senza preavviso. La navigazione in-app (react-router) resta
 * gestita dal router, non da qui.
 *
 * Uso: `useUnsavedGuard(isDirty)`. Passare `false` mentre si sta salvando o
 * dopo il salvataggio, così il redirect post-submit non fa scattare l'avviso.
 */
export function useUnsavedGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Richiesto da alcuni browser per mostrare il prompt nativo.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])
}
