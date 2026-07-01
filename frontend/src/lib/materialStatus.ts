// Etichette e colori degli stati materiale (spec 18). Condivisi tra archivio
// e (in futuro) dashboard. Chiavi = valori backend (services/material_status.py).

export const MATERIAL_STATUS_LABELS: Record<string, string> = {
  non_necessario: 'Non necessario',
  non_ordinato: 'Da ordinare',
  parziale: 'Parziale',
  totalmente_evaso: 'Evaso',
}

export const MATERIAL_STATUS_COLORS: Record<string, string> = {
  non_necessario: 'bg-gray-100 text-gray-500',
  non_ordinato: 'bg-amber-100 text-amber-700',
  parziale: 'bg-blue-100 text-blue-700',
  totalmente_evaso: 'bg-green-100 text-green-700',
}

export const PART_STATE_LABELS: Record<string, string> = {
  ordinato: 'Ordinato',
  da_ordinare: 'Da ordinare',
  da_magazzino: 'Da magazzino',
  conto_lavoro: 'Conto lavoro',
  senza_fornitore: 'Senza fornitore',
  nessun_materiale: '—',
}

export const PART_STATE_COLORS: Record<string, string> = {
  ordinato: 'bg-green-100 text-green-700',
  da_ordinare: 'bg-amber-100 text-amber-700',
  da_magazzino: 'bg-indigo-100 text-indigo-700',
  conto_lavoro: 'bg-gray-100 text-gray-600',
  senza_fornitore: 'bg-red-100 text-red-700',
  nessun_materiale: 'bg-gray-50 text-gray-400',
}
