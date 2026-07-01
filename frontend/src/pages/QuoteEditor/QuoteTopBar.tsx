import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ChevronLeft, FileDown, Save, Send } from 'lucide-react'
import type { Quote } from '@/types'
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'
import { timeAgo } from '@/lib/timeAgo'
import QuoteStatusActions from '@/components/quotes/QuoteStatusActions'

interface Props {
  quote: Quote
  isLocked: boolean
  saving: boolean
  canSubmit: boolean
  onSave: () => void
  onSubmitForReview: () => void
  onPdfClick: () => void
  onWorkflowChanged: (q: Quote) => void
}

/** Top bar del QuoteEditor: numero preventivo, badge status, info workflow,
 *  azioni (Invia/PDF/Salva). Co-locato perché usato solo da QuoteEditor.
 */
export default function QuoteTopBar({
  quote, isLocked, saving, canSubmit,
  onSave, onSubmitForReview, onPdfClick, onWorkflowChanged,
}: Props) {
  const navigate = useNavigate()

  return (
    <div className="bg-card border-b px-6 py-3 flex items-center gap-3 flex-wrap">
      <button onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground mr-1">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <span className="font-mono font-bold text-lg text-primary">{quote.quote_number}</span>
      <span className="text-muted-foreground/40">|</span>
      <span className="text-sm text-muted-foreground">{quote.customer_name || 'Nessun cliente'}</span>
      <div className="flex-1" />
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[quote.status] ?? STATUS_COLORS.bozza}`}>
        {STATUS_LABELS[quote.status] ?? quote.status}
      </span>
      {quote.status === 'inviato' && quote.submitted_by && (
        <span className="text-xs text-muted-foreground">
          Inviato da <span className="font-medium text-foreground">{quote.submitted_by.full_name || quote.submitted_by.username}</span>
          {quote.submitted_at && <> · {timeAgo(quote.submitted_at)}</>}
        </span>
      )}
      {quote.status === 'confermato' && quote.confirmed_by && (
        <span className="text-xs text-muted-foreground">
          Confermato da <span className="font-medium text-foreground">{quote.confirmed_by.full_name || quote.confirmed_by.username}</span>
          {quote.confirmed_at && <> · {timeAgo(quote.confirmed_at)}</>}
        </span>
      )}
      {quote.status === 'completo' && quote.completed_by && (
        <span className="text-xs text-muted-foreground">
          Completo da <span className="font-medium text-foreground">{quote.completed_by.full_name || quote.completed_by.username}</span>
          {quote.completed_at && <> · {timeAgo(quote.completed_at)}</>}
        </span>
      )}
      {quote.status === 'bozza' && canSubmit && (
        <Button size="sm" variant="outline" onClick={onSubmitForReview} disabled={saving}>
          <Send className="w-3.5 h-3.5 mr-1" /> Invia per revisione
        </Button>
      )}
      <QuoteStatusActions quote={quote} onChanged={onWorkflowChanged} />
      <Button size="sm" variant="outline" onClick={onPdfClick}>
        <FileDown className="w-3.5 h-3.5 mr-1" /> PDF
      </Button>
      {!isLocked && (
        <Button size="sm" onClick={onSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Salvo...' : 'Salva'}
        </Button>
      )}
    </div>
  )
}
