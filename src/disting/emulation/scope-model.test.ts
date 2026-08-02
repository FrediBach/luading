import { describe, expect, it } from 'vitest'
import type { ScopeSource, TracePoint } from '../types'
import {
  readTracePoint,
  selectAutomaticTrigger,
  selectClockScopeWindow,
  selectScopeWindow,
} from './scope-model'

function point(
  time: number,
  input: number,
  output: number,
  clockBeats = time * 2,
): TracePoint {
  return { time, clockBeats, inputs: [input], outputs: [output] }
}

const input: ScopeSource = { kind: 'input', index: 0 }
const output: ScopeSource = { kind: 'output', index: 0 }

describe('oscilloscope model', () => {
  it('reads missing and present probe values', () => {
    const sample = point(0, 2, -3)
    expect(readTracePoint(sample, input)).toBe(2)
    expect(readTracePoint(sample, output)).toBe(-3)
    expect(readTracePoint(sample, { kind: 'output', index: 9 })).toBe(0)
  })

  it('selects the probe with the largest useful range', () => {
    const trace = [
      point(0, 0, -5),
      point(1, 0.5, 5),
    ]

    expect(selectAutomaticTrigger(trace, [input, output])).toEqual({
      source: output,
      level: 0,
      probeIndex: 1,
    })
    expect(selectAutomaticTrigger([point(0, 0, 0)], [input])).toBeNull()
  })

  it('locks rising and falling windows to interpolated crossings', () => {
    const trace = Array.from({ length: 21 }, (_, index) => (
      point(index * 0.1, index % 4 < 2 ? -1 : 1, 0)
    ))
    const trigger = { source: input, level: 0, probeIndex: 0 }
    const rising = selectScopeWindow(trace, 0.8, trigger, 'rising', 0.25)
    const falling = selectScopeWindow(trace, 0.8, trigger, 'falling', 0.25)

    expect(rising.locked).toBe(true)
    expect(rising.triggerTime).toBeCloseTo(1.35)
    expect(rising.startTime).toBeCloseTo(1.15)
    expect(falling.triggerTime).toBeCloseTo(1.15)
  })

  it('falls back to the latest untriggered time window', () => {
    const trace = [point(1, 0, 0), point(2, 0, 0), point(3, 0, 0)]
    const window = selectScopeWindow(trace, 1, null, 'rising')

    expect(window).toMatchObject({
      startTime: 2,
      endTime: 3,
      triggerTime: null,
      locked: false,
    })
    expect(window.points).toEqual(trace.slice(1))
  })

  it('locks to the recorded global-clock phase without a voltage edge', () => {
    const trace = [
      point(0, 0, 0, 0),
      point(0.5, 0, 0, 0.4),
      point(1, 0, 0, 0.8),
      point(1.5, 0, 0, 1.2),
      point(2.2, 0, 0, 1.2),
    ]
    const window = selectClockScopeWindow(trace, 0.8, 0.25)

    expect(window.locked).toBe(true)
    expect(window.triggerTime).toBeCloseTo(1.25)
    expect(window.startTime).toBeCloseTo(1.05)
    expect(window.endTime).toBeCloseTo(1.85)
  })

  it('waits on the latest time window until a global-clock beat is available', () => {
    const trace = [
      point(1, 0, 0, 0.5),
      point(1.5, 0, 0, 0.5),
      point(2, 0, 0, 0.5),
    ]
    const window = selectClockScopeWindow(trace, 0.8)

    expect(window).toMatchObject({
      startTime: 1.2,
      endTime: 2,
      triggerTime: null,
      locked: false,
    })
  })
})
