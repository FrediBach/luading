import { describe, expect, it } from 'vitest'
import {
  emptyOutputRoutes,
  normalizeOutputRoutes,
  outputPlotRange,
  outputTraceValues,
  outputRouteLabel,
  outputRouteWithMidiKind,
  updateOutputRoute,
  webAudioRoutes,
} from './output-audio-controls'

describe('output audio controls', () => {
  it('extracts recent output values and provides a visible plot range', () => {
    const trace = [
      { time: 0, clockBeats: 0, inputs: [], outputs: [0, 2] },
      { time: 0.001, clockBeats: 0.002, inputs: [], outputs: [5, 3] },
      { time: 0.002, clockBeats: 0.004, inputs: [], outputs: [0, 4] },
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
      clockBeats: index / 500,
      inputs: [],
      outputs: [index === 120 ? 8 : index === 760 ? -7 : 0],
    }))
    const values = outputTraceValues(trace, 0)

    expect(values).toHaveLength(64)
    expect(values).toContain(8)
    expect(values).toContain(-7)
  })

  it('normalizes exclusive output routes while preserving WebAudio defaults', () => {
    const routes = emptyOutputRoutes(3, ['kick', 'off', 'synthNote'])
    expect(routes).toEqual([
      { kind: 'webAudio', destination: 'kick' },
      { kind: 'off' },
      { kind: 'webAudio', destination: 'synthNote' },
    ])
    const midi = {
      kind: 'webMidiCc' as const,
      portId: 'synth',
      channel: 1 as const,
      controller: 74,
      minimumVolts: 0,
      maximumVolts: 5,
    }
    const updated = updateOutputRoute(routes, 3, 1, midi)
    expect(normalizeOutputRoutes(updated, 4)).toEqual([
      routes[0], midi, routes[2], { kind: 'off' },
    ])
    expect(webAudioRoutes(updated)).toEqual([
      { destination: 'kick' },
      { destination: 'off' },
      { destination: 'synthNote' },
    ])
  })

  it('creates and labels each MIDI output route family', () => {
    const cc = outputRouteWithMidiKind('webMidiCc', { kind: 'off' })
    const bend = outputRouteWithMidiKind('webMidiPitchBend', cc)
    const note = outputRouteWithMidiKind('webMidiNote', bend)

    expect(cc).toMatchObject({ kind: 'webMidiCc', controller: 1 })
    expect(bend).toMatchObject({ kind: 'webMidiPitchBend', minimumVolts: -5 })
    expect(note).toMatchObject({
      kind: 'webMidiNote',
      source: { kind: 'fixed', note: 60 },
    })
    expect(outputRouteLabel(cc)).toBe('MIDI · CC 1')
    expect(outputRouteLabel(bend)).toBe('MIDI · Pitch bend')
    expect(outputRouteLabel(note)).toBe('MIDI · note 60')
  })
})
