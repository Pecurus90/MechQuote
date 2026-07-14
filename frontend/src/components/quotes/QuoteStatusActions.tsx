import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Undo2, RotateCcw } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import type { Quote } from '@/types'

interface Props {
  quote: Quote
  onChanged: (q: Quote) => void
}

// AUD-7: ogni azione apre un gate di conferma che dichiara la conseguenza.
interface Pending {
  path: string
  okMsg: string
  title: string
  description: string
  confirmLabel: string
  variant?: 'default' | 'destructive'
}

/** Azioni di workflow del preventivo (spec 18): Conferma / Rimanda in bozza /
 *  Annulla conferma. È il cuore del ciclo di vita, un solo punto per le
 *  chiamate API. Ogni azione passa da un ConfirmDialog che ne dichiara la
 *  conseguenza (AUD-7). */
export default function QuoteStatusActions({ quote, onChanged }: Props) {
  const { hasPermission } = useAuth()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)

  const canConfirm = hasPermission('quotes.confirm')
  const canEditLocked = hasPermission('quotes.edit_locked')
  const st = quote.status

  const call = async (path: string, okMsg: string) => {
    setBusy(true)
    try {
      const res = await api.post(`/quotes/${quote.id}/${path}`)
      onChanged(res.data)
      toast.success(okMsg)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Operazione non riuscita')
    } finally { setBusy(false) }
  }

  const canReview = canConfirm && (st === 'inviato' || st === 'letto')
  const showUnconfirm = canEditLocked && (st === 'confermato' || st === 'completo')
  if (!canReview && !showUnconfirm) return null

  return (
    <>
      {canReview && (
        <Button size="sm" disabled={busy} onClick={() => setPending({
          path: 'confirm', okMsg: 'Preventivo confermato',
          title: 'Confermare il preventivo?',
          description: 'Da qui il preventivo sarà bloccato in modifica. Procedere?',
          confirmLabel: 'Conferma',
        })}>
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Conferma preventivo
        </Button>
      )}
      {canReview && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending({
          path: 'reopen', okMsg: 'Rimandato in bozza',
          title: 'Rimandare in bozza?',
          description: 'Il preventivo tornerà modificabile come bozza.',
          confirmLabel: 'Rimanda in bozza',
        })}>
          <Undo2 className="w-3.5 h-3.5 mr-1" /> Rimanda in bozza
        </Button>
      )}
      {showUnconfirm && (
        <Button
          size="sm" variant="outline" disabled={busy}
          className="text-warning border-warning/30 hover:bg-warning/10"
          onClick={() => setPending({
            path: 'unconfirm', okMsg: 'Conferma annullata',
            title: 'Annulla conferma',
            description: "Il preventivo torna a 'letto' e diventa di nuovo modificabile. Gli ordini materiale già emessi restano nello storico, ma le coppie preventivo–fornitore vengono azzerate: il materiale andrà riordinato. Procedere?",
            confirmLabel: 'Annulla conferma',
          })}
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Annulla conferma
        </Button>
      )}
      <ConfirmDialog
        open={pending !== null}
        variant={pending?.variant ?? 'default'}
        title={pending?.title ?? ''}
        description={pending?.description}
        confirmLabel={pending?.confirmLabel ?? 'Conferma'}
        onConfirm={() => { const p = pending; setPending(null); if (p) call(p.path, p.okMsg) }}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
