/**
 * AUD-32: pre-check client sugli upload. Dà un errore leggibile SUBITO, prima
 * di spedire un file oversize o di tipo errato e attendere il rifiuto del
 * server (che con file grandi arriva dopo un lungo caricamento).
 *
 * Ritorna un messaggio d'errore in italiano, oppure null se il file va bene.
 * Il limite di 50 MB è coerente con il cap server-side (parts/officina).
 */
export function checkUploadFile(
  file: File,
  opts: { maxMB?: number; exts?: string[] } = {},
): string | null {
  const maxMB = opts.maxMB ?? 50
  if (file.size > maxMB * 1024 * 1024) {
    return `File troppo grande: ${(file.size / 1e6).toFixed(1)} MB (max ${maxMB} MB)`
  }
  if (opts.exts && opts.exts.length) {
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
    if (!opts.exts.includes(ext)) {
      return `Tipo non supportato (${ext || '—'}). Accettati: ${opts.exts.join(', ')}`
    }
  }
  return null
}
