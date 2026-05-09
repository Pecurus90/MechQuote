/**
 * Parsing decimali in stile italiano: accetta sia `.` che `,` come separator.
 *
 * Bug originale: `parseFloat("0,5")` ritorna 0 (si ferma alla virgola).
 * In Italia l'utente digita naturalmente `0,5` invece di `0.5` →
 * tutto il preventivo finisce con valori 0.
 *
 * Usare ovunque al posto di `parseFloat(e.target.value)` nei campi
 * numerici dei preventivi (ore, costi, dimensioni, percentuali).
 */
export function parseDecimal(value: string): number {
  if (value == null || value === '') return 0
  const cleaned = String(value).replace(',', '.').trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

/**
 * Variante che ritorna `null` per stringa vuota (vs `0`). Usare quando
 * il campo è opzionale e `0` ha significato diverso da "non specificato".
 */
export function parseDecimalOrNull(value: string): number | null {
  if (value == null || value === '') return null
  const cleaned = String(value).replace(',', '.').trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}
