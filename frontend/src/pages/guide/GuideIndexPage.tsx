import { useNavigate } from 'react-router-dom'
import { BookOpen, ArrowRight } from 'lucide-react'
import StandardPage from '@/components/layout/StandardPage'
import { useAuth } from '@/lib/auth'
import { GUIDES } from './guides'

// Indice delle guide all'uso. Ogni scheda apre la guida in visore (/guide/:slug).
// La guida che corrisponde al ruolo dell'utente è marcata «La tua».

const CHIP: Record<string, string> = {
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  indigo: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  primary: 'bg-primary/[0.13] text-primary',
}

export default function GuideIndexPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <StandardPage
      icon={BookOpen}
      color="primary"
      title="Guide all'uso"
      subtitle="Manuali passo-passo con schermate reali dell'app"
      width="xl"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {GUIDES.map(g => {
          const mine = !!g.roleName && user?.role === g.roleName
          return (
            <button
              key={g.slug}
              type="button"
              onClick={() => navigate(`/guide/${g.slug}`)}
              className="group text-left rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${CHIP[g.color] ?? CHIP.primary}`}>
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-foreground">{g.title}</h3>
                    {mine && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        La tua
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Per: {g.audience}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{g.description}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                Apri la guida
                <ArrowRight className="w-4 h-4 transition group-hover:translate-x-0.5" />
              </span>
            </button>
          )
        })}
      </div>
    </StandardPage>
  )
}
