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
  {
    slug: 'admin',
    title: 'Guida Amministratore',
    audience: 'Admin',
    roleName: 'admin',
    description:
      'Cataloghi (materiali, macchine, trattamenti), dati aziendali e default preventivi, clienti, utenti e permessi, backup.',
    color: 'primary',
  },
  {
    slug: 'creare-preventivo',
    title: 'Creare un preventivo',
    audience: 'Ufficio Tecnico',
    description:
      'Partire da zero o da un disegno 2D, comporre parti con materiale e fasi, leggere il prezzo calcolato e inviare per revisione.',
    color: 'primary',
  },
  {
    slug: 'ordini-materiale',
    title: 'Ordini materiale',
    audience: 'Amministrazione / Acquisti',
    description:
      'Il pool del materiale da ordinare (preventivi confermati + richieste officina), aggregato per fornitore, con emissione ordine e CSV.',
    color: 'primary',
  },
  {
    slug: 'ordini-utensili',
    title: 'Ordini utensili',
    audience: 'Acquisti / Utensileria',
    description:
      'Creare un ordine di utensili, esportarlo in CSV per il fornitore e ritrovarlo nello storico.',
    color: 'primary',
  },
  {
    slug: 'anagrafica-utensili',
    title: 'Anagrafica utensili',
    audience: 'Officina / Utensileria',
    description:
      'Il catalogo degli utensili: attributi, filtri, scansione codice e controllo delle scorte.',
    color: 'primary',
  },
  {
    slug: 'officina',
    title: 'Officina',
    audience: 'Produzione',
    description:
      'Documenti operativi, schede materiali e registro tempra/deformazioni per il personale di produzione.',
    color: 'primary',
  },
  {
    slug: 'statistiche',
    title: 'Statistiche',
    audience: 'Amministrazione / Direzione',
    description:
      'I numeri aggregati dell’azienda: preventivato, venduto, marginalità e confronti mese/anno.',
    color: 'primary',
  },
  {
    slug: 'archivio-consuntivo',
    title: 'Archivio & consuntivo',
    audience: 'Amministrazione',
    description:
      'Ritrovare i preventivi chiusi, aprirne il dettaglio articolo con i costi al pezzo e registrare venduto e costo reale.',
    color: 'primary',
  },
  {
    slug: 'vendite-dirette',
    title: 'Vendite dirette',
    audience: 'Amministrazione / Ufficio Tecnico',
    description:
      'Registrare un incasso fuori preventivo, che confluisce nel venduto delle statistiche.',
    color: 'primary',
  },
  {
    slug: 'normalizzati',
    title: 'Normalizzati',
    audience: 'Acquisti / Ufficio Tecnico',
    description:
      'Ordinare viti, bulloni e cuscinetti da una distinta: abbinamento automatico, alias imparati e CSV.',
    color: 'primary',
  },
  {
    slug: 'richieste-materiale',
    title: 'Richieste materiale',
    audience: 'Officina',
    description:
      'Il ponte officina → acquisti: segnalare un fabbisogno di materiale che finisce nella coda degli ordini.',
    color: 'primary',
  },
]

export function guideBySlug(slug?: string): GuideMeta | undefined {
  return GUIDES.find(g => g.slug === slug)
}
