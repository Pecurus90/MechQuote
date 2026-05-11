import { Button } from '@/components/ui/button'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { PartIssue } from '@/lib/quoteValidation'

interface Props {
  issues: PartIssue[]
  onSelectPart: (partIdx: number) => void
  onClose: () => void
  onProceed: () => void
}

/** Modal di validazione preventivo: lista parti con problemi, click sul codice
 *  parte per navigare alla sezione, oppure "Genera comunque" per ignorare. */
export default function QuoteValidationModal({ issues, onSelectPart, onClose, onProceed }: Props) {
  useEscapeKey(onClose)
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <span className="text-amber-500 text-lg">⚠</span>
          <h2 className="font-semibold text-gray-800">Preventivo incompleto</h2>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
          {issues.map(({ partIdx, partCode, issues: partIssues }) => (
            <div key={partIdx}>
              <button
                onClick={() => onSelectPart(partIdx)}
                className="font-mono font-semibold text-blue-600 hover:underline text-sm"
              >
                {partCode}
              </button>
              <ul className="mt-1 space-y-0.5">
                {partIssues.map(issue => (
                  <li key={issue} className="text-sm text-gray-600 flex items-start gap-1.5">
                    <span className="text-gray-400 mt-0.5">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-gray-400 pt-1">Clicca sul codice parte per navigare direttamente alla sezione.</p>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Annulla</Button>
          <Button size="sm" onClick={onProceed}>Genera comunque →</Button>
        </div>
      </div>
    </div>
  )
}
