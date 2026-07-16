import { describe, it, expect } from 'vitest'
import { isDxfUnitOverridable, dxfUnitScale, dxfDefaultUnit } from '../../src/lib/dxfUnits'

describe('dxfUnits — override unità mm/pollici (audit A3)', () => {
  it('overridable solo per factor 1 (mm/unitless) o 25.4 (pollici)', () => {
    expect(isDxfUnitOverridable(1)).toBe(true)
    expect(isDxfUnitOverridable(25.4)).toBe(true)
    expect(isDxfUnitOverridable(10)).toBe(false)    // cm
    expect(isDxfUnitOverridable(1000)).toBe(false)  // m
    expect(isDxfUnitOverridable(undefined)).toBe(true) // default → 1
  })

  it('header onesto: nessuna correzione (scale 1)', () => {
    expect(dxfUnitScale(1, 'mm')).toBe(1)           // mm dichiarati mm
    expect(dxfUnitScale(25.4, 'in')).toBe(1)        // pollici dichiarati pollici (backend già ×25.4)
  })

  it('header che mente: la scala corregge ai mm reali', () => {
    // dichiara pollici (backend ×25.4) ma è mm → utente sceglie mm → divide il ×25.4
    expect(dxfUnitScale(25.4, 'mm')).toBeCloseTo(1 / 25.4, 6)
    // dichiara mm (backend ×1) ma è pollici → utente sceglie pollici → ×25.4
    expect(dxfUnitScale(1, 'in')).toBe(25.4)
  })

  it('unità metriche non-mm: si fida del backend (scale 1 anche se override richiesto)', () => {
    expect(dxfUnitScale(10, 'in')).toBe(1)
    expect(dxfUnitScale(1000, 'mm')).toBe(1)
  })

  it('default unità = quella dichiarata dallʼheader', () => {
    expect(dxfDefaultUnit(1)).toBe('mm')
    expect(dxfDefaultUnit(25.4)).toBe('in')
    expect(dxfDefaultUnit(undefined)).toBe('mm')
  })
})
