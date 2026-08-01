import { describe, expect, it } from 'vitest'
import type { SignalSourceConfig, TracePoint } from '../types'
import {
  adjacentClockDivision,
  inputIsStepped,
  inputPlotRange,
  inputShapeDefaults,
  inputTraceValues,
  inputUsesPulseWidth,
  inputUsesStepCount,
  inputUsesTiming,
  inputWithSync,
} from './input-source-controls'

function source(
  update: Partial<SignalSourceConfig> = {},
): SignalSourceConfig {
  return {
    shape: 'sine',
    timing: { mode: 'free', frequencyHz: 2 },
    amplitude: 3,
    offset: 0,
    phase: 0,
    pulseWidth: 0.5,
    manualValue: 0,
    seed: 1,
    stepCount: 4,
    freeformPoints: [
      { phase: 0, volts: 0 },
      { phase: 1, volts: 0 },
    ],
    ...update,
  }
}

describe('input channel control helpers', () => {
  it('reports shape-dependent controls', () => {
    expect(inputUsesTiming(source({ shape: 'manual' }))).toBe(false)
    expect(inputUsesTiming(source({ shape: 'noise' }))).toBe(false)
    expect(inputUsesTiming(source({ shape: 'freeform' }))).toBe(true)
    expect(inputUsesTiming(source({ shape: 'trigger' }))).toBe(true)
    expect(inputUsesPulseWidth(source({ shape: 'square' }))).toBe(true)
    expect(inputUsesPulseWidth(source({ shape: 'sine' }))).toBe(false)
    expect(inputUsesStepCount(source({ shape: 'arpeggio' }))).toBe(true)
    expect(inputIsStepped(source({ shape: 'sampleHold' }))).toBe(true)
    expect(inputIsStepped(source({ shape: 'triangle' }))).toBe(false)
    expect(inputIsStepped(source({ shape: 'freeform' }))).toBe(false)
  })

  it('preserves existing shape defaults and unrelated settings', () => {
    const base = source({ amplitude: 9, stepCount: 13, offset: 2 })
    expect(inputShapeDefaults(base, 'gateSequencer')).toMatchObject({
      shape: 'gateSequencer',
      amplitude: 5,
      stepCount: 8,
      offset: 2,
    })
    expect(inputShapeDefaults(base, 'noteSequencer')).toMatchObject({
      shape: 'noteSequencer',
      amplitude: 1,
      stepCount: 8,
    })
    expect(inputShapeDefaults(base, 'triangle')).toMatchObject({
      shape: 'triangle',
      amplitude: 9,
      stepCount: 13,
    })
  })

  it('uses the existing defaults when toggling clock sync', () => {
    expect(inputWithSync(source(), true).timing).toEqual({
      mode: 'clock',
      division: '1/4',
    })
    expect(inputWithSync(source({
      timing: { mode: 'clock', division: '1/16' },
    }), false).timing).toEqual({
      mode: 'free',
      frequencyHz: 1,
    })
  })

  it('steps through clock divisions without wrapping', () => {
    expect(adjacentClockDivision('1/4', -1)).toBe('1/2')
    expect(adjacentClockDivision('1/4', 1)).toBe('1/8')
    expect(adjacentClockDivision('2 bars', -1)).toBe('2 bars')
    expect(adjacentClockDivision('1/32', 1)).toBe('1/32')
  })

  it('downsamples recent real trace data while retaining extrema', () => {
    const trace: TracePoint[] = Array.from({ length: 200 }, (_, index) => ({
      time: index / 1000,
      inputs: [index === 60 ? 9 : index === 130 ? -8 : Math.sin(index)],
      outputs: [],
    }))
    const values = inputTraceValues(trace, 0, 16, 200)
    expect(values).toHaveLength(16)
    expect(values).toContain(9)
    expect(values).toContain(-8)
  })

  it('derives a padded plot range from source configuration and trace values', () => {
    expect(inputPlotRange(source({ amplitude: 5, offset: 1 }), [-6, 4])).toEqual({
      min: -6.96,
      max: 6.96,
    })
    const gateRange = inputPlotRange(
      source({ shape: 'gate', amplitude: 5, offset: 0 }),
      [0, 5],
    )
    expect(gateRange.min).toBeLessThan(0)
    expect(gateRange.max).toBeGreaterThan(5)
    const freeformRange = inputPlotRange(source({
      shape: 'freeform',
      freeformPoints: [
        { phase: 0, volts: -9 },
        { phase: 1, volts: 7 },
      ],
    }), [])
    expect(freeformRange.min).toBeLessThan(-9)
    expect(freeformRange.max).toBeGreaterThan(7)
  })
})
