import { Wrench, Clock, Package, ChevronRight } from 'lucide-react'

// Pannello Alert: mostra 0..N righe per problemi attivi. Se tutte 0, niente
// visualizzazione (zero rumore). Ogni riga linka alla pagina di azione.
export interface AlertCounts {
  low_stock_tools: number
  stale_submitted: number
  to_order_materials: number
}

export default function AlertPanel({
  alerts, canTools, canOrderMaterials, canReview, onNavigate,
}: {
  alerts: AlertCounts
  canTools: boolean
  canOrderMaterials: boolean
  canReview: boolean
  onNavigate: (path: string) => void
}) {
  const rows = [
    canTools && alerts.low_stock_tools > 0 && {
      key: 'tools',
      icon: Wrench,
      bg: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      iconColor: 'text-orange-600',
      titleColor: 'text-orange-800',
      bodyColor: 'text-orange-700',
      title: `${alerts.low_stock_tools} utensil${alerts.low_stock_tools === 1 ? 'e' : 'i'} sotto la quantità minima`,
      body: 'Apri Ordini utensili per generare il PDF aggregato per fornitore',
      onClick: () => onNavigate('/orders/tools'),
    },
    canReview && alerts.stale_submitted > 0 && {
      key: 'stale',
      icon: Clock,
      bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      iconColor: 'text-amber-600',
      titleColor: 'text-amber-800',
      bodyColor: 'text-amber-700',
      title: `${alerts.stale_submitted} preventiv${alerts.stale_submitted === 1 ? 'o' : 'i'} in revisione da > 7 giorni`,
      body: 'Bottleneck di revisione: aprili per smaltire',
      onClick: () => onNavigate('/quotes/archive?status=inviato'),
    },
    canOrderMaterials && alerts.to_order_materials > 0 && {
      key: 'to-order',
      icon: Package,
      bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      iconColor: 'text-blue-600',
      titleColor: 'text-blue-800',
      bodyColor: 'text-blue-700',
      title: `${alerts.to_order_materials} preventiv${alerts.to_order_materials === 1 ? 'o confermato senza' : 'i confermati senza'} ordine materiale`,
      body: 'Apri Ordini materiali per generare la lista per fornitore',
      onClick: () => onNavigate('/orders/materials'),
    },
  ].filter(Boolean) as Array<{
    key: string; icon: typeof Wrench; bg: string; iconColor: string;
    titleColor: string; bodyColor: string; title: string; body: string;
    onClick: () => void
  }>

  if (rows.length === 0) return null

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <button
          key={r.key}
          type="button"
          onClick={r.onClick}
          className={`w-full border rounded-lg px-4 py-3 flex items-center gap-3 text-left transition-colors ${r.bg}`}
        >
          <r.icon className={`w-5 h-5 shrink-0 ${r.iconColor}`} />
          <div className="flex-1">
            <div className={`text-sm font-semibold ${r.titleColor}`}>{r.title}</div>
            <div className={`text-xs ${r.bodyColor}`}>{r.body}</div>
          </div>
          <ChevronRight className={`w-4 h-4 shrink-0 ${r.iconColor} opacity-70`} />
        </button>
      ))}
    </div>
  )
}
