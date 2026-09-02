import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Prezzo in euro con 2 decimali fissi (it-IT). Es. 5 → "€ 5,00". */
export const eur2 = (v: number): string =>
  '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Data corta it-IT (gg/mm/aa). '—' se assente. */
export const dateShort = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—'
