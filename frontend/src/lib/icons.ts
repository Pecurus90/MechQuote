import {
  FileText, BookOpen, Wrench, Hammer, Settings, ShieldCheck, AlertTriangle,
  ClipboardCheck, Ruler, Cog, Box, Layers, FlaskConical, Lightbulb,
  Folder, Archive, Truck, HardHat, ListChecks, ClipboardList, Calculator,
  Stamp, ScrollText, BookMarked, FileCog, Workflow, CircleAlert, Microscope,
  Drill, Zap,
} from 'lucide-react'

/** Catalogo icone selezionabili per le categorie Officina.
 *  Il nome stringa è salvato in DB (`OfficinaCategory.icon`).
 *  Mapping name → componente per render dinamico. */
export const ICON_MAP = {
  FileText, BookOpen, Wrench, Hammer, Settings, ShieldCheck, AlertTriangle,
  ClipboardCheck, Ruler, Cog, Box, Layers, FlaskConical, Lightbulb,
  Folder, Archive, Truck, HardHat, ListChecks, ClipboardList, Calculator,
  Stamp, ScrollText, BookMarked, FileCog, Workflow, CircleAlert, Microscope,
  Drill, Zap,
} as const

export type IconName = keyof typeof ICON_MAP
export const ICON_NAMES = Object.keys(ICON_MAP) as IconName[]

/** Helper: ritorna il componente icona dato il nome (fallback Folder). */
export function getIcon(name: string | null | undefined) {
  if (name && name in ICON_MAP) return ICON_MAP[name as IconName]
  return ICON_MAP.Folder
}
