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
/**
 * Normalizza un input numerico in stile italiano.
 * - Se c'è la VIRGOLA → è il separatore decimale: i PUNTI sono migliaia e
 *   vanno rimossi ("1.300,50" → 1300.50, "1300,50" → 1300.50).
 * - Se c'è solo il PUNTO (o niente) → il punto è decimale in stile EN
 *   ("1.5" → 1.5), per non rompere dimensioni/ore.
 * (Il vecchio `replace(',', '.')` trasformava "1.300,50" in 1.3 — corruzione.)
 */
function normalizeDecimal(value: string): string {
  const s = String(value).trim()
  return s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
}

export function parseDecimal(value: string): number {
  if (value == null || value === '') return 0
  const n = parseFloat(normalizeDecimal(value))
  return Number.isFinite(n) ? n : 0
}

/**
 * Variante che ritorna `null` per stringa vuota (vs `0`). Usare quando
 * il campo è opzionale e `0` ha significato diverso da "non specificato".
 */
export function parseDecimalOrNull(value: string): number | null {
  if (value == null || value === '') return null
  const n = parseFloat(normalizeDecimal(value))
  return Number.isFinite(n) ? n : null
}
