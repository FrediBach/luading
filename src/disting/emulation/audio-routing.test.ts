import { describe, expect, it } from 'vitest'
import {
  collectAudioVoiceEvents,
  createAudioRoutingState,
  type OutputAudioRoute,
} from './audio-routing'
import type { TracePoint } from '../types'

function point(time: number, outputs: number[]): TracePoint {
  return { time, inputs: [], outputs }
}

describe('collectAudioVoiceEvents', () => {
  it('captures short rising edges between UI frames', () => {
    const routes: OutputAudioRoute[] = [{ destination: 'kick' }]
    const result = collectAudioVoiceEvents([
      point(1, [0]),
      point(1.001, [5]),
      point(1.002, [0]),
    ], routes, createAudioRoutingState(1))

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ kind: 'kick' })
    expect(result.events[0].offsetSeconds).toBeCloseTo(0.001)
  })

  it('does not retrigger a drum while an output remains high', () => {
    const routes: OutputAudioRoute[] = [{ destination: 'snare' }]
    const first = collectAudioVoiceEvents([
      point(2, [5]),
      point(2.01, [5]),
    ], routes, createAudioRoutingState(1))
    const second = collectAudioVoiceEvents([
      point(2.02, [5]),
      point(2.03, [0]),
    ], routes, first.state)

    expect(first.events).toHaveLength(1)
    expect(second.events).toHaveLength(0)
  })

  it('updates V/oct pitch before a simultaneous synth trigger', () => {
    const routes: OutputAudioRoute[] = [
      { destination: 'synthNote' },
      { destination: 'synthTrigger' },
    ]
    const result = collectAudioVoiceEvents(
      [point(3, [1, 5])],
      routes,
      createAudioRoutingState(2),
    )

    expect(result.events).toEqual([
      { kind: 'synth', offsetSeconds: 0, voltage: 1 },
      { kind: 'synth', offsetSeconds: 0, voltage: 1 },
    ])
  })
})
