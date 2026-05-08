// Mirror di backend/app/core/material_families.py — tieni i due file allineati.
// Lista quasi-statica: la duplicazione evita una chiamata di rete per popolare
// dropdown nelle settings; se aggiungi/rinomini uno slug, fai la migration backend
// e aggiorna entrambi i file.

export interface MaterialFamily {
  slug: string
  label: string
}

export const MATERIAL_FAMILIES: MaterialFamily[] = [
  { slug: 'acciaio_carbonio', label: 'Acciaio al carbonio' },
  { slug: 'acciaio_inox',     label: 'Acciaio inox' },
  { slug: 'acciaio_utensili', label: 'Acciaio per utensili' },
  { slug: 'alluminio',        label: 'Alluminio' },
  { slug: 'titanio',          label: 'Titanio' },
  { slug: 'ottone',           label: 'Ottone' },
  { slug: 'rame',             label: 'Rame' },
  { slug: 'plastica',         label: 'Plastica' },
  { slug: 'carburi',          label: 'Carburi metallici' },
  { slug: 'altro',            label: 'Altro' },
]

export const MATERIAL_FAMILY_LABELS: Record<string, string> = Object.fromEntries(
  MATERIAL_FAMILIES.map(f => [f.slug, f.label]),
)

export const familyLabel = (slug: string | null | undefined): string =>
  slug ? (MATERIAL_FAMILY_LABELS[slug] ?? slug) : '—'
