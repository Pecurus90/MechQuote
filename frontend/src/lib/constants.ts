export const STATUS_LABELS: Record<string, string> = {
  draft: 'Bozza',
  sent: 'Inviato',
  accepted: 'Accettato',
  rejected: 'Rifiutato',
  archived: 'Archiviato',
}

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  archived: 'bg-yellow-100 text-yellow-700',
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
