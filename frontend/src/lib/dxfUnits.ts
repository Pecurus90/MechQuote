// Override unità mm/pollici per i DXF: fonte UNICA della logica.
// Alcuni CAD dichiarano l'unità sbagliata nell'header (es. $INSUNITS=pollici ma
// disegno in mm): il backend applica raw×unit_factor, e qui si corregge la
// scala quando l'header "mente". Prima questa formula era duplicata a mano in
// NewQuote2DPage, DxfMeasureModal, e MANCAVA nei due percorsi EDM manuali
// (DxfProfilePicker, Dxf2dReselectModal) → lunghezza taglio/grezzo ×25.4 (audit A3).
import { useEffect, useState } from 'react'

export type DxfUnit = 'mm' | 'in'

/** L'override ha senso solo per disegni mm/unitless (factor 1) o pollici
 *  (factor 25.4); per unità metriche non-mm (cm/m) ci si fida del backend. */
export function isDxfUnitOverridable(unitFactor: number | undefined | null): boolean {
  const f = unitFactor ?? 1
  return f === 1 || Math.abs(f - 25.4) < 0.05
}

/** displayed_mm = value_backend × scale. Il backend ha già fatto raw×factor;
 *  scale = (unità scelta)/factor riporta ai mm reali quando l'header mente. */
export function dxfUnitScale(unitFactor: number | undefined | null, unit: DxfUnit): number {
  const f = unitFactor ?? 1
  return isDxfUnitOverridable(f) ? (unit === 'in' ? 25.4 : 1) / f : 1
}

/** Default = unità dichiarata dall'header (pollici se il backend ha convertito ×25.4). */
export function dxfDefaultUnit(unitFactor: number | undefined | null): DxfUnit {
  return (unitFactor ?? 1) > 1.5 ? 'in' : 'mm'
}

/** Stato unità + scala derivata + flag override, col default sincronizzato
 *  all'analisi DXF corrente (reset a ogni nuovo file). */
export function useDxfUnit(analysis: { unit_factor?: number } | null) {
  const [unit, setUnit] = useState<DxfUnit>('mm')
  const factor = analysis?.unit_factor ?? 1
  useEffect(() => {
    if (analysis) setUnit(dxfDefaultUnit(analysis.unit_factor))
  }, [analysis])
  return {
    unit,
    setUnit,
    overridable: isDxfUnitOverridable(factor),
    unitScale: dxfUnitScale(factor, unit),
  }
}
