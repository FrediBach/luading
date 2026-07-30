import { describe, expect, it } from 'vitest'
import {
  clampControlValue,
  controlValueToAngle,
  downsampleMinMax,
  keyboardAdjustedValue,
  parseControlValue,
  relativeEncoderSteps,
  signalPlotPath,
  snapControlValue,
  valueFromVerticalDrag,
} from './control-math'

describe('custom control math', () => {
  it('clamps and snaps values without floating point drift', () => {
    expect(clampControlValue(-3, 0, 10)).toBe(0)
    expect(clampControlValue(14, 0, 10)).toBe(10)
    expect(snapControlValue(0.3000000004, 0, 1, 0.1)).toBe(0.3)
    expect(snapControlValue(3.6, 1, 4, 1)).toBe(4)
  })

  it('maps values and vertical dragging to a rotary range', () => {
    expect(controlValueToAngle(0, 0, 10)).toBe(-135)
    expect(controlValueToAngle(5, 0, 10)).toBe(0)
    expect(controlValueToAngle(10, 0, 10)).toBe(135)
    expect(valueFromVerticalDrag(5, 80, 0, 10, 0.1)).toBe(10)
    expect(valueFromVerticalDrag(5, -80, 0, 10, 0.1)).toBe(0)
    expect(valueFromVerticalDrag(5, 80, 0, 10, 0.1, true)).toBe(5.5)
  })

  it('supports standard slider keyboard changes', () => {
    expect(keyboardAdjustedValue(5, 'ArrowUp', 0, 10, 1)).toBe(6)
    expect(keyboardAdjustedValue(5, 'ArrowLeft', 0, 10, 1)).toBe(4)
    expect(keyboardAdjustedValue(5, 'PageUp', 0, 10, 1)).toBe(10)
    expect(keyboardAdjustedValue(5, 'Home', 0, 10, 1)).toBe(0)
    expect(keyboardAdjustedValue(5, 'Escape', 0, 10, 1)).toBeNull()
  })

  it('parses exact values and rejects invalid input', () => {
    expect(parseControlValue(' 3.27 ', 0, 10, 0.1)).toBe(3.3)
    expect(parseControlValue('20', 0, 10, 1)).toBe(10)
    expect(parseControlValue('not a value', 0, 10, 1)).toBeNull()
  })

  it('converts accumulated encoder movement to relative steps', () => {
    expect(relativeEncoderSteps(7)).toBe(0)
    expect(relativeEncoderSteps(17)).toBe(2)
    expect(relativeEncoderSteps(-17)).toBe(-2)
  })

  it('downsamples while preserving extrema and endpoints', () => {
    const values = [0, 1, 8, -7, 2, 3, 10, -9, 4, 5, 6, 0]
    const sampled = downsampleMinMax(values, 8)
    expect(sampled).toHaveLength(8)
    expect(sampled[0]).toBe(0)
    expect(sampled.at(-1)).toBe(0)
    expect(sampled).toContain(10)
    expect(sampled).toContain(-9)
  })

  it('builds linear and stepped signal paths', () => {
    expect(signalPlotPath([0, 1], 10, 10, 0, 1)).toBe(
      'M0.00,10.00L10.00,0.00',
    )
    expect(signalPlotPath([0, 1], 10, 10, 0, 1, true)).toBe(
      'M0.00,10.00L10.00,10.00L10.00,0.00',
    )
  })
})

