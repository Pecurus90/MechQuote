export const STATUS_LABELS: Record<string, string> = {
  bozza:           'Bozza',
  inviato:         'Inviato',
  letto:           'Letto',
  inviato_cliente: 'Inviato al cliente',
  vinto:           'Vinto',
  perso:           'Perso',
  // legacy fallback (pre-migrazione)
  draft:    'Bozza',
  sent:     'Inviato al cliente',
  won:      'Vinto',
  lost:     'Perso',
}

export const STATUS_COLORS: Record<string, string> = {
  bozza:           'bg-gray-100 text-gray-700',
  inviato:         'bg-amber-100 text-amber-700',
  letto:           'bg-blue-100 text-blue-700',
  inviato_cliente: 'bg-indigo-100 text-indigo-700',
  vinto:           'bg-green-100 text-green-700',
  perso:           'bg-red-100 text-red-700',
  // legacy fallback
  draft:    'bg-gray-100 text-gray-700',
}

export const PHASE_TYPES = [
  { value: 'raw_material_cutting', label: 'Taglio materiale grezzo' },
  { value: 'cnc_milling', label: 'Fresatura CNC' },
  { value: 'cnc_turning', label: 'Tornitura CNC' },
  { value: 'drilling', label: 'Foratura' },
  { value: 'tapping', label: 'Maschiatura' },
  { value: 'wire_edm', label: 'EDM a filo' },
  { value: 'sinker_edm', label: 'EDM a tuffo' },
  { value: 'grinding', label: 'Rettifica' },
  { value: 'manual_operation', label: 'Operazione manuale' },
  { value: 'heat_treatment', label: 'Trattamento termico' },
  { value: 'surface_treatment', label: 'Trattamento superficiale' },
  { value: 'quality_control', label: 'Controllo qualità' },
  { value: 'external_supplier', label: 'Fornitore esterno' },
  { value: 'packaging', label: 'Imballaggio' },
  { value: 'transport', label: 'Trasporto' },
  { value: 'custom_extra', label: 'Extra personalizzato' },
] as const
