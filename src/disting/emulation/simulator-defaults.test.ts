import { describe, expect, it } from 'vitest'
import { simulatorDefaultsFromSource } from './simulator-defaults'

describe('simulator source annotations', () => {
  it('reads explicit input generator and output audio defaults from trailing comments', () => {
    const source = `
return {
  init = function()
    return {
      inputs = {
        kCV,      -- Type: Gate, Synced: True, Division: 1/8
        kTrigger, -- Type: Sine LFO, Synced: false
        kCV,      -- Type: Note Sequencer (V/Oct), Division: 1 bar
      },
      outputs = {
        kStepped, -- Type: Kick Trigger
        kLinear,  -- Type: Synth Note (V/Oct)
        kLinear,  -- Type: Off
      },
    }
  end,
}`

    const defaults = simulatorDefaultsFromSource(
      source,
      ['cv', 'trigger', 'cv'],
      3,
    )

    expect(defaults.inputSources[0]).toMatchObject({
      shape: 'gate',
      timing: { mode: 'clock', division: '1/8' },
      pulseWidth: 0.5,
    })
    expect(defaults.inputSources[1]).toMatchObject({
      shape: 'sine',
      timing: { mode: 'free', frequencyHz: 1 },
    })
    expect(defaults.inputSources[2]).toMatchObject({
      shape: 'noteSequencer',
      timing: { mode: 'clock', division: '1 bar' },
      amplitude: 1,
    })
    expect(defaults.outputAudioRoutes).toEqual(['kick', 'synthNote', 'off'])
  })

  it('keeps hardware-derived defaults when annotations are absent or invalid', () => {
    const source = `
return {
  init = function()
    return {
      inputs = {
        kGate, -- An ordinary explanation
        kCV,   -- Type: Unknown, Synced: perhaps, Division: 1/64
      },
      outputs = { kLinear },
    }
  end,
}`

    const defaults = simulatorDefaultsFromSource(source, ['gate', 'cv'], 1)

    expect(defaults.inputSources[0]).toMatchObject({
      shape: 'gate',
      timing: { mode: 'clock', division: '1/4' },
    })
    expect(defaults.inputSources[1]).toMatchObject({
      shape: 'manual',
      timing: { mode: 'free', frequencyHz: 1 },
    })
    expect(defaults.outputAudioRoutes).toEqual(['off'])
  })

  it('does not treat comments on later lines as entry annotations', () => {
    const source = `return {
  init = function()
    return {
      inputs = {
        kCV,
        -- Type: Gate, Synced: true
      },
    }
  end,
}`

    expect(simulatorDefaultsFromSource(source, ['cv'], 0).inputSources[0]?.shape)
      .toBe('manual')
  })
})
