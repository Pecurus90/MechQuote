// Template di pagina standard: guscio unico per le pagine "normali"
// (liste, cataloghi, impostazioni). Compone PageContainer (larghezza/padding)
// + SettingsPageHeader (icona + titolo + sottotitolo + slot azioni) + contenuto.
//
// Obiettivo: una sola fonte per l'impaginazione. Cambiando QUESTO file (o i due
// mattoni che usa) si aggiornano tutte le pagine standard in un colpo.
//
// NON pensato per editor preventivi, hub a tab e login, che hanno layout propri:
// quelli restano su misura (vedi CLAUDE.md §0-bis "less is more" — niente
// componente tuttofare con troppe prop).
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import PageContainer, { type Width } from '@/components/ui/page-container'
import SettingsPageHeader, { type Color } from '@/components/settings/SettingsPageHeader'

interface Props {
  icon: LucideIcon
  title: string
  subtitle?: string
  color?: Color
  /** CTA / barra azioni a destra dell'header (es. bottone "Aggiungi"). */
  actions?: ReactNode
  /** Riga opzionale sopra l'header (es. breadcrumb "← Officina"). */
  breadcrumb?: ReactNode
  /** Larghezza: default 'lg' (form comodi); le liste passano 'xl' (80%). */
  width?: Width
  className?: string
  children: ReactNode
}

export default function StandardPage({
  icon, title, subtitle, color, actions, breadcrumb, width = 'lg', className, children,
}: Props) {
  const header = (
    <SettingsPageHeader icon={icon} title={title} subtitle={subtitle} color={color} action={actions} />
  )
  return (
    <PageContainer width={width} className={className}>
      {breadcrumb ? <div>{breadcrumb}{header}</div> : header}
      {children}
    </PageContainer>
  )
}
