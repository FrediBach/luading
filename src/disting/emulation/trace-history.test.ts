import { describe, expect, it } from 'vitest'
import type { TracePoint } from '../types'
import { TraceHistory } from './trace-history'

function point(time: number): TracePoint {
  return { time, inputs: [time], outputs: [-time] }
}

describe('TraceHistory', () => {
  it('retains only the newest samples', () => {
    const history = new TraceHistory(3)

    history.append([point(0), point(1)])
    history.append([point(2), point(3)])

    expect(history.points.map((sample) => sample.time)).toEqual([1, 2, 3])
    expect(history.snapshot(2)).toBe(history.points)
  })

  it('replaces an oversized batch with its newest samples', () => {
    const history = new TraceHistory(2)

    history.append([point(0)])
    history.append([point(1), point(2), point(3)])

    expect(history.points.map((sample) => sample.time)).toEqual([2, 3])
  })

  it('clears samples without exposing them as enumerable React prop data', () => {
    const history = new TraceHistory()
    history.append([point(1)])

    expect(Object.keys(history)).toEqual([])
    history.clear()
    expect(history.points).toEqual([])
  })
})
