import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formatta un prezzo unitario: minimo 2 decimali, fino a 4, taglia gli zeri
 *  finali oltre il 2° decimale. Gemello DRY di `_fmt_eur_unit` (backend).
 *  Esempi: 5 → "5.00" · 5.10 → "5.10" · 0.985 → "0.985" · 1.2345 → "1.2345".
 */
export function fmtUnitPrice(value: number): string {
  const s = (value || 0).toFixed(4)
  return s.replace(/(\.\d{2})(\d*?)0+$/, '$1$2')
}
