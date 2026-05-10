export const STATUS_LABELS: Record<string, string> = {
  bozza:      'Bozza',
  inviato:    'Inviato',
  completato: 'Completato',
  // legacy fallback (pre-migrazione)
  draft:           'Bozza',
  sent:            'Completato',
  inviato_cliente: 'Completato',
  vinto:           'Completato',
  perso:           'Completato',
}

export const STATUS_COLORS: Record<string, string> = {
  bozza:      'bg-gray-100 text-gray-700',
  inviato:    'bg-amber-100 text-amber-700',
  completato: 'bg-green-100 text-green-700',
  // legacy fallback
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
