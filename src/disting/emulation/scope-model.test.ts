import { describe, expect, it } from 'vitest'
import type { ScopeSource, TracePoint } from '../types'
import {
  readTracePoint,
  selectAutomaticTrigger,
  selectScopeWindow,
} from './scope-model'

function point(time: number, input: number, output: number): TracePoint {
  return { time, inputs: [input], outputs: [output] }
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
})
