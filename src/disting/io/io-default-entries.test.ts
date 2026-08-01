import { describe, expect, it } from 'vitest'
import { defaultSignalSource } from '../emulation/signal-sources'
import { simulatorDefaultsFromSource } from '../emulation/simulator-defaults'
import type { SignalSourceConfig } from '../types'
import { inputDefaultEntry, outputDefaultEntry } from './io-default-entries'

function source(update: Partial<SignalSourceConfig> = {}) {
  return { ...defaultSignalSource('cv', 0), ...update }
}

describe('paste-ready simulator default entries', () => {
  it('copies clocked and free-running input settings in parser-compatible form', () => {
    expect(inputDefaultEntry('cv', source({
      shape: 'gate',
      timing: { mode: 'clock', division: '1/8' },
    }))).toBe('kCV, -- Type: Gate, Synced: true, Division: 1/8')
    expect(inputDefaultEntry('trigger', source({
      shape: 'sine',
      timing: { mode: 'free', frequencyHz: 3.5 },
    }))).toBe('kTrigger, -- Type: Sine LFO, Synced: false')
    expect(inputDefaultEntry('gate', source({ shape: 'manual' })))
      .toBe('kGate, -- Type: Manual / DC')
  })

  it('round-trips every copied input type through the source annotation parser', () => {
    const shapes: SignalSourceConfig['shape'][] = [
      'manual', 'sine', 'triangle', 'sawUp', 'sawDown', 'square', 'gate',
      'trigger', 'gateSequencer', 'noteSequencer', 'arpeggio', 'sampleHold',
      'noise', 'freeform',
    ]

    for (const shape of shapes) {
      const configured = source({
        shape,
        timing: { mode: 'clock', division: '1/16' },
      })
      const entry = inputDefaultEntry('cv', configured)
      const lua = `return {
  init = function()
    return {
      inputs = {
        ${entry}
      },
    }
  end,
}`
      expect(
        simulatorDefaultsFromSource(lua, ['cv'], 0).inputSources[0]?.shape,
        entry,
      ).toBe(shape)
    }
  })

  it('round-trips freeform CV points in a locale-independent compact form', () => {
    const configured = source({
      shape: 'freeform',
      timing: { mode: 'clock', division: '1/8' },
      freeformPoints: [
        { phase: 0, volts: -2.5 },
        { phase: 0.333, volts: 4.25 },
        { phase: 1, volts: 0 },
      ],
    })
    const entry = inputDefaultEntry('cv', configured)
    expect(entry).toBe(
      'kCV, -- Type: Freeform CV, Synced: true, Division: 1/8, Points: 0@-2.5|0.333@4.25|1@0',
    )
    const lua = `return {
  init = function()
    return {
      inputs = {
        ${entry}
      },
    }
  end,
}`
    expect(simulatorDefaultsFromSource(lua, ['cv'], 0).inputSources[0]).toMatchObject({
      shape: 'freeform',
      timing: { mode: 'clock', division: '1/8' },
      freeformPoints: configured.freeformPoints,
    })
  })

  it('copies all output audio defaults in parser-compatible form', () => {
    const expectations = [
      ['off', 'Off'],
      ['kick', 'Kick Trigger'],
      ['snare', 'Snare Trigger'],
      ['hat', 'Hi-hat Trigger'],
      ['synthNote', 'Synth Note'],
      ['synthTrigger', 'Synth Trigger'],
    ] as const

    for (const [destination, label] of expectations) {
      const entry = outputDefaultEntry('stepped', destination)
      expect(entry).toBe(`kStepped, -- Type: ${label}`)
      const lua = `return {
  init = function()
    return {
      outputs = {
        ${entry}
      },
    }
  end,
}`
      expect(simulatorDefaultsFromSource(lua, [], 1).outputAudioRoutes)
        .toEqual([destination])
    }
  })
})
