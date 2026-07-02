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

/** Azioni di workflow del preventivo (spec 18): Conferma / Rimanda in bozza /
 *  Annulla conferma. Condiviso tra QuoteEditor e DieQuoteEditor — è il cuore
 *  del ciclo di vita, un solo punto per le chiamate API. */
export default function QuoteStatusActions({ quote, onChanged }: Props) {
  const { hasPermission } = useAuth()
  const [busy, setBusy] = useState(false)
  const [confirmUnconfirm, setConfirmUnconfirm] = useState(false)

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
        <Button size="sm" disabled={busy} onClick={() => call('confirm', 'Preventivo confermato')}>
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Conferma preventivo
        </Button>
      )}
      {canReview && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => call('reopen', 'Rimandato in bozza')}>
          <Undo2 className="w-3.5 h-3.5 mr-1" /> Rimanda in bozza
        </Button>
      )}
      {showUnconfirm && (
        <Button
          size="sm" variant="outline" disabled={busy}
          className="text-amber-700 border-amber-200 hover:bg-amber-50"
          onClick={() => setConfirmUnconfirm(true)}
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Annulla conferma
        </Button>
      )}
      <ConfirmDialog
        open={confirmUnconfirm}
        title="Annulla conferma"
        description="Il preventivo torna a 'letto' e diventa di nuovo modificabile. Gli ordini materiale già emessi restano nello storico, ma le coppie preventivo–fornitore vengono azzerate: il materiale andrà riordinato. Procedere?"
        confirmLabel="Annulla conferma"
        onConfirm={() => { setConfirmUnconfirm(false); call('unconfirm', 'Conferma annullata') }}
        onCancel={() => setConfirmUnconfirm(false)}
      />
    </>
  )
}
