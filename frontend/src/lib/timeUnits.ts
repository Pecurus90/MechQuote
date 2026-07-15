/**
 * Conversione ore ↔ minuti per i campi tempo.
 *
 * I tempi si INSERISCONO in minuti (più naturali in officina) ma si SALVANO in
 * ORE: la tariffa macchina è €/ora e il motore di calcolo fa `ore × €/ora`.
 * La conversione vive SOLO al bordo dell'input (display + commit); il database,
 * il cost engine, il PDF e le statistiche restano in ore. Vedi la memoria di
 * progetto sull'unità dei tempi.
 */

/** Ore → minuti per il display. Arrotonda a 2 decimali per evitare 9.9999. */
export const hoursToMinutes = (h: number | null | undefined): number =>
  Math.round((Number(h) || 0) * 60 * 100) / 100

/** Minuti → ore per il salvataggio (piena precisione). */
export const minutesToHours = (min: number | null | undefined): number =>
  (Number(min) || 0) / 60
