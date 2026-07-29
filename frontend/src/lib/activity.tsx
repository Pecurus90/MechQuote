import type { LucideIcon } from 'lucide-react'
import { Send, CheckCheck, PackageCheck, XCircle, Truck, ClipboardList, TriangleAlert, HandCoins, Clock } from 'lucide-react'

/** Mappa tipo evento → etichetta/icona/colore, UNICA fonte condivisa fra la
 *  dashboard (ActivityTimeline) e la pagina Attività del team (ActivityPage).
 *
 *  Contiene SOLO i tipi che compaiono nel feed team, cioè i broadcast per ruolo
 *  (notifiche con target_user_id NULL, vedi api/activity + api/dashboard.activity).
 *  Conferma/completato/non-ordinato emettono un evento feed dedicato (backend
 *  emit_activity) OLTRE alla notifica personale al creatore. Gli altri eventi
 *  del ciclo di vita (read/awaiting/reopened/restored) restano solo personali
 *  nell'inbox e non vanno qui. */
export interface ActivityKind {
  label: string
  Icon: LucideIcon
  cls: string
  /** true = evento di sistema (l'attore mostrato è "Sistema", non un utente). */
  system?: boolean
}

export const ACTIVITY_KINDS: Record<string, ActivityKind> = {
  quote_submitted:       { label: 'Inviato',               Icon: Send,          cls: 'bg-info/15 text-info' },
  quote_confirmed:       { label: 'Confermato',            Icon: CheckCheck,    cls: 'bg-confirmed/15 text-confirmed' },
  quote_completed:       { label: 'Completato',            Icon: PackageCheck,  cls: 'bg-success/15 text-success' },
  quote_not_ordered:     { label: 'Non ordinato',          Icon: XCircle,       cls: 'bg-state-perso/15 text-state-perso' },
  materials_ordered:     { label: 'Ordine materiale',      Icon: Truck,         cls: 'bg-info/15 text-info' },
  tools_ordered:         { label: 'Ordine utensili',       Icon: Truck,         cls: 'bg-info/15 text-info' },
  material_to_order:     { label: 'Fabbisogno materiale',  Icon: ClipboardList, cls: 'bg-warning/15 text-warning' },
  tools_low_stock_alert: { label: 'Utensili sotto minimo', Icon: TriangleAlert, cls: 'bg-warning/15 text-warning', system: true },
  direct_sale_created:   { label: 'Vendita diretta',       Icon: HandCoins,     cls: 'bg-sales/15 text-sales' },
}

/** Fallback per tipi non ancora mappati: icona neutra, nessuna etichetta. */
export const ACTIVITY_FALLBACK: ActivityKind = { label: '', Icon: Clock, cls: 'bg-muted text-muted-foreground' }
