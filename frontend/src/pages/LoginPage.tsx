import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import {
  Cog, FileText, Drill, Truck, UserRound, LockKeyhole, Eye, EyeOff, LogIn, LoaderCircle,
} from 'lucide-react'
import { toast } from 'sonner'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setUser } = useAuth()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/auth/login', new URLSearchParams({ username, password }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      localStorage.setItem('token', res.data.access_token)
      const me = await api.get('/auth/me')
      setUser(me.data)
      navigate('/')
    } catch (e) {
      // Preferisci il messaggio del backend (già localizzato); fallback per stato.
      const err = e as { response?: { status?: number; data?: { detail?: string } } }
      const byStatus: Record<number, string> = {
        401: 'Credenziali non valide',
        429: 'Troppi tentativi, riprova tra poco',
        403: 'Account disattivato, contatta l\'amministratore',
      }
      const status = err?.response?.status
      toast.error(err?.response?.data?.detail || (status && byStatus[status]) || 'Credenziali non valide')
    } finally {
      setLoading(false)
    }
  }

  // Superficie "tecnica" scura, COSTANTE in entrambi i temi (non tokenizzata).
  const brandBg: React.CSSProperties = {
    backgroundColor: 'hsl(220 25% 11%)',
    backgroundImage: [
      'radial-gradient(circle at 12% 14%, hsl(217 91% 60% / 0.16), transparent 42%)',
      'linear-gradient(hsl(217 40% 40% / 0.14) 1px, transparent 1px)',
      'linear-gradient(90deg, hsl(217 40% 40% / 0.14) 1px, transparent 1px)',
    ].join(', '),
    backgroundSize: '100% 100%, 36px 36px, 36px 36px',
  }

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[1.1fr_1fr]">
      {/* Pannello brand — scuro fisso */}
      <div style={brandBg} className="relative flex flex-col justify-between px-8 py-8 text-white md:px-12 md:py-14">
        <div className="flex items-center gap-3">
          <div className="flex h-[46px] w-[46px] items-center justify-center rounded-xl" style={{ backgroundColor: 'hsl(217 91% 60%)' }}>
            <Cog className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-[21px] font-bold leading-none">MechQuote</div>
            <div className="mt-1 text-[12px] text-white/55">Fratelli Dalla Via · lavorazioni meccaniche di precisione</div>
          </div>
        </div>

        <div className="hidden md:block">
          <div className="space-y-1.5 font-mono text-[12px] text-white/45">
            <div className="flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> preventivazione tecnica</div>
            <div className="flex items-center gap-2"><Drill className="h-3.5 w-3.5" /> anagrafica utensili &amp; magazzino</div>
            <div className="flex items-center gap-2"><Truck className="h-3.5 w-3.5" /> ordini materiali e utensili</div>
          </div>
          <div className="my-4 h-px w-full bg-white/10" />
          <div className="text-[12px] text-white/40">Strumento interno · accesso riservato al personale</div>
        </div>
      </div>

      {/* Pannello form — sui token, segue il tema */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px]">
          <h1 className="text-[20px] font-bold text-foreground">Accedi</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">Inserisci le tue credenziali per continuare.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Username</label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <Input type="text" placeholder="Il tuo username" value={username}
                  onChange={e => setUsername(e.target.value)} required autoFocus
                  className="h-11 pl-10" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Password</label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <Input type={showPw ? 'text' : 'password'} placeholder="La tua password" value={password}
                  onChange={e => setPassword(e.target.value)} required
                  className="h-11 pl-10 pr-10" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  title={showPw ? 'Nascondi' : 'Mostra'}>
                  {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="flex h-[46px] w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground transition-[filter] hover:brightness-110 disabled:opacity-70">
              {loading
                ? <><LoaderCircle className="h-[18px] w-[18px] animate-spin" /> Accesso…</>
                : <><LogIn className="h-[18px] w-[18px]" /> Accedi</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
