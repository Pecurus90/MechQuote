import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

interface Props {
  open: boolean
  onClose: () => void
  onSend: (email: string) => Promise<void>
}

export default function EmailDialog({ open, onClose, onSend }: Props) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)

  if (!open) return null

  const handleSend = async () => {
    setSending(true)
    try { await onSend(email) } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <Card className="w-full max-w-sm bg-white shadow-xl">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-base">Invia Preventivo via Email</CardTitle>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Email destinatario</label>
            <Input type="email" className="mt-1" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="cliente@esempio.com" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSend} disabled={!email || sending}>
              {sending ? 'Invio...' : 'Invia'}
            </Button>
            <Button variant="outline" onClick={onClose}>Annulla</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
