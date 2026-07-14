import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import { useEscapeKey } from '@/lib/useEscapeKey'

interface Props {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

/** Modal di conferma riusabile per sostituire `window.confirm()`.
 *  Accessibile via tastiera (Esc chiude). Pattern:
 *
 *    const [pending, setPending] = useState<number | null>(null)
 *    <ConfirmDialog
 *      open={pending != null}
 *      title="Eliminare?"
 *      onConfirm={async () => { await api.delete(...); setPending(null) }}
 *      onCancel={() => setPending(null)}
 *    />
 *
 *  AUD-33: se `onConfirm` ritorna una Promise, i pulsanti si disabilitano
 *  automaticamente finché è in corso (niente doppio-tap → doppia esecuzione).
 *  Nessun cambio richiesto ai chiamanti.
 */
export default function ConfirmDialog({
  open, title, description, confirmLabel = 'Conferma', cancelLabel = 'Annulla',
  variant = 'destructive', onConfirm, onCancel,
}: Props) {
  const [busy, setBusy] = useState(false)

  // Reset del busy alla chiusura (riuso dello stesso dialog per azioni diverse).
  useEffect(() => { if (!open) setBusy(false) }, [open])

  // Esc/backdrop non annullano mentre l'azione è in corso.
  useEscapeKey(() => { if (!busy) onCancel() }, open)

  if (!open) return null

  const handleConfirm = async () => {
    if (busy) return
    try {
      setBusy(true)
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={() => { if (!busy) onCancel() }}
    >
      <Card className="w-full max-w-md bg-card shadow-xl" onClick={e => e.stopPropagation()}>
        <CardContent className="pt-5 pb-4 space-y-3">
          <div className="flex items-start gap-3">
            {variant === 'destructive' && (
              <div className="shrink-0 p-2 rounded-full bg-destructive/10">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground">{title}</h3>
              {description && (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={busy} autoFocus>
              {cancelLabel}
            </Button>
            <Button
              size="sm"
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? 'Attendere…' : confirmLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
