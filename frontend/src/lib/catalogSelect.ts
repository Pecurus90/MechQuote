/**
 * Helper per le dropdown del preventivatore che caricano un catalogo con
 * filtro `?active=true` (CAT-1 Fase 2).
 *
 * Pattern: la lista del backend contiene solo le voci attive. Se la riga
 * in editing ha già un id salvato che NON è nella lista (perché la voce è
 * stata ritirata nel frattempo), bisogna comunque mostrarla nel select
 * della riga, con un suffisso "(ritirato)" — altrimenti il `<select>`
 * non trova l'option corrispondente al value e l'utente perde il valore.
 *
 * Le voci ritirate vengono ricostruite dal payload del preventivo:
 * `PartOut.material`, `PhaseOut.machine/operation/treatment/supplier`
 * (nested via joinedload — non serve una seconda chiamata).
 *
 * Uso tipico nei JSX dei `<select>`:
 *   {buildCatalogOptions(materials, part.material_id, part.material, m => m.name)
 *     .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
 */

export interface CatalogSelectOption {
  value: number | ''
  label: string
  /** true se l'option esiste solo per mostrare il valore corrente "ritirato". */
  isRetired?: boolean
}

/**
 * Costruisce le option di un `<select>` di catalogo con gestione
 * "voce ritirata".
 *
 * @param activeList     lista delle voci attive caricate dal backend
 *                       (`?active=true`).
 * @param currentValue   id attualmente salvato sulla riga in editing
 *                       (`undefined`/`null`/`0` => nessun valore => nessuna
 *                       option speciale).
 * @param currentItem    snapshot della voce agganciata, letto dal payload
 *                       del preventivo (es. `part.material`,
 *                       `phase.machine`). Se mancante o se la voce
 *                       agganciata è già attiva, l'helper ritorna solo le
 *                       option della lista attiva.
 * @param toLabel        funzione per produrre l'etichetta di una voce
 *                       (es. `m => m.name`).
 *
 * @returns option in ordine: prima l'eventuale "(ritirato)", poi le voci
 *          attive nell'ordine ricevuto dal backend (di solito già
 *          ordinato per nome).
 */
export function buildCatalogOptions<T extends { id: number }>(
  activeList: T[],
  currentValue: number | null | undefined,
  currentItem: T | null | undefined,
  toLabel: (item: T) => string,
): CatalogSelectOption[] {
  const options: CatalogSelectOption[] = activeList.map(item => ({
    value: item.id,
    label: toLabel(item),
  }))

  if (!currentValue) {
    return options
  }

  const alreadyPresent = options.some(o => o.value === currentValue)
  if (alreadyPresent) {
    return options
  }

  // La voce agganciata non è nella lista attiva: la ricostruiamo dal
  // payload se disponibile, altrimenti fallback "ritirato — id N" (sentinel
  // che dice all'utente che qualcosa di salvato esiste ma non è leggibile).
  const label = currentItem
    ? `${toLabel(currentItem)} (ritirato)`
    : `(ritirato — id ${currentValue})`

  return [
    { value: currentValue, label, isRetired: true },
    ...options,
  ]
}
