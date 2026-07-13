// Cambio password self-service (AUD-13). Modale auto-contenuto: gestisce il
// proprio form e la chiamata API. L'utente cambia la PROPRIA password.
import { useState } from 'react'
import api from '@/lib/api'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X, KeyRound } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ChangePasswordModal({ open, onClose }: Props) {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const close = () => { setOldPw(''); setNewPw(''); setConfirmPw(''); onClose() }

  const submit = async () => {
    if (newPw.length < 8) { toast.error('La nuova password deve avere almeno 8 caratteri'); return }
    if (newPw !== confirmPw) { toast.error('Le due nuove password non coincidono'); return }
    setBusy(true)
    try {
      await api.post('/auth/change-password', { old_password: oldPw, new_password: newPw })
      toast.success('Password aggiornata')
      close()
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err?.response?.data?.detail || 'Errore nel cambio password')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" onClick={close}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-primary" /> Cambia password
          </h3>
          <button onClick={close} aria-label="Chiudi" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-foreground">Password attuale</label>
            <Input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-foreground">Nuova password</label>
            <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" />
            <p className="mt-1 text-[11px] text-muted-foreground">Almeno 8 caratteri.</p>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-foreground">Conferma nuova password</label>
            <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={busy}>Annulla</Button>
          <Button onClick={submit} disabled={busy || !oldPw || !newPw || !confirmPw}>
            {busy ? 'Salvataggio…' : 'Aggiorna'}
          </Button>
        </div>
      </div>
    </div>
  )
}
