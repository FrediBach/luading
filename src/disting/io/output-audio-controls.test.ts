import { describe, expect, it } from 'vitest'
import {
  emptyOutputAudioRoutes,
  normalizeOutputAudioRoutes,
  outputPlotRange,
  outputTraceValues,
  updateOutputAudioRoute,
} from './output-audio-controls'

describe('output audio controls', () => {
  it('selects and resets channel-local routes', () => {
    const initial = emptyOutputAudioRoutes(2)
    const routed = updateOutputAudioRoute(initial, 2, 1, 'snare')

    expect(initial).toEqual([
      { destination: 'off' },
      { destination: 'off' },
    ])
    expect(routed).toEqual([
      { destination: 'off' },
      { destination: 'snare' },
    ])
    expect(emptyOutputAudioRoutes(2)).toEqual(initial)
  })

  it('normalizes routes when the output count changes', () => {
    const routes = [
      { destination: 'kick' as const },
      { destination: 'synthNote' as const },
    ]

    expect(normalizeOutputAudioRoutes(routes, 1)).toEqual([
      { destination: 'kick' },
    ])
    expect(normalizeOutputAudioRoutes(routes, 3)).toEqual([
      { destination: 'kick' },
      { destination: 'synthNote' },
      { destination: 'off' },
    ])
    expect(normalizeOutputAudioRoutes(routes, 0)).toEqual([])
  })

  it('extracts recent output values and provides a visible plot range', () => {
    const trace = [
      { time: 0, inputs: [], outputs: [0, 2] },
      { time: 0.001, inputs: [], outputs: [5, 3] },
      { time: 0.002, inputs: [], outputs: [0, 4] },
    ]

    expect(outputTraceValues(trace, 1, 2)).toEqual([3, 4])
    expect(outputPlotRange([-2, 4])).toEqual({
      min: -2.48,
      max: 4.48,
    })
  })

  it('downsamples output plots directly while retaining extrema', () => {
    const trace = Array.from({ length: 1000 }, (_, index) => ({
      time: index / 1000,
      inputs: [],
      outputs: [index === 120 ? 8 : index === 760 ? -7 : 0],
    }))
    const values = outputTraceValues(trace, 0)

    expect(values).toHaveLength(64)
    expect(values).toContain(8)
    expect(values).toContain(-7)
  })
})
