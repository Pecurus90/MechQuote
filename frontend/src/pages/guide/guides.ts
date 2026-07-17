// Registro delle guide all'uso (mini-app auto-contenuta, vedi CLAUDE.md §4).
// Aggiungere una guida = una voce qui + il file HTML `<slug>.html` (documento
// completo, con screenshot inline) importato in GuideViewerPage.
import type { Color } from '@/components/settings/SettingsPageHeader'

export interface GuideMeta {
  slug: string
  title: string
  /** Ruolo a cui è dedicata, mostrato in etichetta. */
  audience: string
  /** `user.role` che marca la guida come «la tua» nell'indice. */
  roleName?: string
  description: string
  color: Color
}

export const GUIDES: GuideMeta[] = [
  {
    slug: 'amministrazione',
    title: 'Guida Amministrazione',
    audience: 'Amministrazione',
    roleName: 'amministrazione',
    description:
      'Leggere i preventivi in arrivo, confermarli o metterli in attesa, e generare gli ordini di materiale e utensili.',
    color: 'violet',
  },
  {
    slug: 'ufficio-tecnico',
    title: 'Guida Ufficio Tecnico Plus',
    audience: 'Ufficio Tecnico Plus',
    roleName: 'ufficio_tecnico_plus',
    description:
      'Creare un preventivo, comporre parti e fasi di lavorazione, leggere il prezzo calcolato e inviarlo per revisione.',
    color: 'indigo',
  },
]

export function guideBySlug(slug?: string): GuideMeta | undefined {
  return GUIDES.find(g => g.slug === slug)
}
