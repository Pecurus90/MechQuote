import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, ExternalLink } from 'lucide-react'
import { guideBySlug } from './guides'
import amministrazioneHtml from './amministrazione.html?raw'
import ufficioTecnicoHtml from './ufficio-tecnico.html?raw'
import adminHtml from './admin.html?raw'
import crearePreventivoHtml from './creare-preventivo.html?raw'
import ordiniMaterialeHtml from './ordini-materiale.html?raw'
import ordiniUtensiliHtml from './ordini-utensili.html?raw'
import anagraficaUtensiliHtml from './anagrafica-utensili.html?raw'
import officinaHtml from './officina.html?raw'
import statisticheHtml from './statistiche.html?raw'
import archivioConsuntivoHtml from './archivio-consuntivo.html?raw'
import venditeDiretteHtml from './vendite-dirette.html?raw'
import normalizzatiHtml from './normalizzati.html?raw'
import richiesteMaterialeHtml from './richieste-materiale.html?raw'

// Visore guida: il documento HTML completo (con screenshot inline) è renderizzato
// in un <iframe srcDoc> così il suo CSS resta isolato da quello dell'app.
// L'iframe si auto-dimensiona all'altezza del contenuto (stessa origine, srcDoc).
// Questo file è lazy-loaded in App.tsx: il ~3 MB degli HTML pesa solo qui.

const HTML: Record<string, string> = {
  amministrazione: amministrazioneHtml,
  'ufficio-tecnico': ufficioTecnicoHtml,
  admin: adminHtml,
  'creare-preventivo': crearePreventivoHtml,
  'ordini-materiale': ordiniMaterialeHtml,
  'ordini-utensili': ordiniUtensiliHtml,
  'anagrafica-utensili': anagraficaUtensiliHtml,
  officina: officinaHtml,
  statistiche: statisticheHtml,
  'archivio-consuntivo': archivioConsuntivoHtml,
  'vendite-dirette': venditeDiretteHtml,
  normalizzati: normalizzatiHtml,
  'richieste-materiale': richiesteMaterialeHtml,
}

export default function GuideViewerPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const meta = guideBySlug(slug)
  const html = slug ? HTML[slug] : undefined
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(1200)

  useEffect(() => {
    const el = iframeRef.current
    if (!el) return
    let ro: ResizeObserver | null = null
    const measure = () => {
      const doc = el.contentDocument
      if (doc?.documentElement) {
        setHeight(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0))
      }
    }
    const onLoad = () => {
      measure()
      const doc = el.contentDocument
      if (doc?.body && 'ResizeObserver' in window) {
        ro = new ResizeObserver(measure)
        ro.observe(doc.body)
      }
      // Ri-misura per il layout tardivo (decodifica immagini).
      window.setTimeout(measure, 250)
      window.setTimeout(measure, 900)
    }
    el.addEventListener('load', onLoad)
    if (el.contentDocument?.readyState === 'complete') onLoad()
    return () => { el.removeEventListener('load', onLoad); ro?.disconnect() }
  }, [slug])

  if (!meta || !html) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Guida non trovata.{' '}
        <button type="button" className="text-primary underline" onClick={() => navigate('/guide')}>
          Torna alle guide
        </button>
      </div>
    )
  }

  const print = () => iframeRef.current?.contentWindow?.print()
  const openTab = () => {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  return (
    <div className="min-h-full bg-white">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 sm:px-6 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate('/guide')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Guide
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <h1 className="min-w-0 truncate font-semibold text-foreground">{meta.title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={openTab}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden sm:inline">Nuova scheda</span>
          </button>
          <button
            type="button"
            onClick={print}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Printer className="w-4 h-4" /> Stampa / PDF
          </button>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        title={meta.title}
        className="block w-full bg-white"
        style={{ height, border: 'none' }}
      />
    </div>
  )
}
