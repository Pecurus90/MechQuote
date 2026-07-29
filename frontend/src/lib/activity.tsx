import type { LucideIcon } from 'lucide-react'
import { Send, Eye, CheckCheck, PackageCheck, XCircle, Hourglass, RotateCcw, Undo2, Truck, ClipboardList, TriangleAlert, HandCoins, Trash2, Clock } from 'lucide-react'

/** Mappa tipo evento → etichetta/icona/colore, UNICA fonte condivisa fra la
 *  dashboard (ActivityTimeline) e la pagina Attività del team (ActivityPage).
 *
 *  Contiene SOLO i tipi che compaiono nel feed team, cioè i broadcast per ruolo
 *  (notifiche con target_user_id NULL, vedi api/activity + api/dashboard.activity).
 *  Tutto il ciclo vita preventivo (letto, attesa cliente, confermato, completato,
 *  non ordinato, riaperto, ripristinato…) emette un evento feed dedicato (backend
 *  emit_activity) OLTRE alla notifica personale al creatore che resta invariata,
 *  così la squadra vede chi-fa-cosa su ogni preventivo. */
export interface ActivityKind {
  label: string
  Icon: LucideIcon
  cls: string
  /** true = evento di sistema (l'attore mostrato è "Sistema", non un utente). */
  system?: boolean
}

export const ACTIVITY_KINDS: Record<string, ActivityKind> = {
  quote_submitted:       { label: 'Inviato',               Icon: Send,          cls: 'bg-info/15 text-info' },
  quote_read:            { label: 'Letto',                 Icon: Eye,           cls: 'bg-state-letto/15 text-state-letto' },
  quote_awaiting_client: { label: 'In attesa cliente',     Icon: Hourglass,     cls: 'bg-state-attesa/15 text-state-attesa' },
  quote_await_reverted:  { label: 'Attesa annullata',      Icon: Undo2,         cls: 'bg-info/15 text-info' },
  quote_confirmed:       { label: 'Confermato',            Icon: CheckCheck,    cls: 'bg-confirmed/15 text-confirmed' },
  quote_completed:       { label: 'Completato',            Icon: PackageCheck,  cls: 'bg-success/15 text-success' },
  quote_not_ordered:     { label: 'Non ordinato',          Icon: XCircle,       cls: 'bg-state-perso/15 text-state-perso' },
  quote_reopened:        { label: 'Riaperto',              Icon: RotateCcw,     cls: 'bg-warning/15 text-warning' },
  quote_restored:        { label: 'Ripristinato',          Icon: RotateCcw,     cls: 'bg-info/15 text-info' },
  materials_ordered:     { label: 'Ordine materiale',      Icon: Truck,         cls: 'bg-info/15 text-info' },
  tools_ordered:         { label: 'Ordine utensili',       Icon: Truck,         cls: 'bg-info/15 text-info' },
  material_to_order:     { label: 'Fabbisogno materiale',  Icon: ClipboardList, cls: 'bg-warning/15 text-warning' },
  tools_low_stock_alert: { label: 'Utensili sotto minimo', Icon: TriangleAlert, cls: 'bg-warning/15 text-warning', system: true },
  direct_sale_created:   { label: 'Vendita diretta',       Icon: HandCoins,     cls: 'bg-sales/15 text-sales' },
  direct_sale_deleted:   { label: 'Vendita eliminata',     Icon: Trash2,        cls: 'bg-danger/15 text-danger' },
}

/** Fallback per tipi non ancora mappati: icona neutra, nessuna etichetta. */
export const ACTIVITY_FALLBACK: ActivityKind = { label: '', Icon: Clock, cls: 'bg-muted text-muted-foreground' }
