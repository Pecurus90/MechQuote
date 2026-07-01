// Ciclo di vita preventivo (spec 18): bozza → inviato → letto → confermato → completo
export const STATUS_LABELS: Record<string, string> = {
  bozza:      'Bozza',
  inviato:    'Inviato',
  letto:      'Letto',
  confermato: 'Confermato',
  completo:   'Completo',
  // legacy fallback (pre-migrazione)
  completato: 'Completo',
  draft:           'Bozza',
  sent:            'Completo',
  inviato_cliente: 'Completo',
  vinto:           'Completo',
  perso:           'Completo',
}

export const STATUS_COLORS: Record<string, string> = {
  bozza:      'bg-gray-100 text-gray-700',
  inviato:    'bg-amber-100 text-amber-700',
  letto:      'bg-sky-100 text-sky-700',
  confermato: 'bg-violet-100 text-violet-700',
  completo:   'bg-green-100 text-green-700',
  // legacy fallback
  completato:      'bg-green-100 text-green-700',
  draft:           'bg-gray-100 text-gray-700',
  sent:            'bg-green-100 text-green-700',
  inviato_cliente: 'bg-green-100 text-green-700',
  vinto:           'bg-green-100 text-green-700',
  perso:           'bg-green-100 text-green-700',
}

// PHASE_TYPES rimosso: il vocabolario delle Lavorazioni è ora nel DB
// (tabella `operations`) gestito dall'utente da Settings → Catalogo →
// Lavorazioni. I behavior speciali (autocalc EDM) si attivano in base
// a `machine.machine_type`, non più al phase_type.
