import { describe, expect, it } from 'vitest'
import { describeProgram, DISTING_CONSTANTS } from './lua-contract'

describe('Disting Lua contract description', () => {
  it('maps numeric I/O declarations to default CV and stepped buses', () => {
    const program = describeProgram({ name: 'Numeric', author: 'Test' }, {
      inputs: 3,
      outputs: 2,
    })

    expect(program).toMatchObject({
      name: 'Numeric',
      author: 'Test',
      inputCount: 3,
      outputCount: 2,
      inputKinds: ['cv', 'cv', 'cv'],
      outputKinds: ['stepped', 'stepped'],
      inputNames: ['Input 1', 'Input 2', 'Input 3'],
      outputNames: ['Output 1', 'Output 2'],
    })
  })

  it('maps typed buses and preserves sparse custom names', () => {
    const program = describeProgram({}, {
      inputs: {
        1: DISTING_CONSTANTS.kCV,
        2: DISTING_CONSTANTS.kTrigger,
        3: DISTING_CONSTANTS.kGate,
      },
      inputNames: { 2: 'Clock' },
      outputs: [DISTING_CONSTANTS.kStepped, DISTING_CONSTANTS.kLinear],
      outputNames: { 2: 'Smooth CV' },
    })

    expect(program.inputKinds).toEqual(['cv', 'trigger', 'gate'])
    expect(program.outputKinds).toEqual(['stepped', 'linear'])
    expect(program.inputNames).toEqual(['Input 1', 'Clock', 'Input 3'])
    expect(program.outputNames).toEqual(['Output 1', 'Smooth CV'])
  })

  it('parses integer, scaled, and enum parameter definitions', () => {
    const program = describeProgram({}, {
      parameters: [
        ['Level', -10, 10, 4, DISTING_CONSTANTS.kVolts],
        ['Fine', -100, 100, 25, DISTING_CONSTANTS.kCents, DISTING_CONSTANTS.kBy100],
        ['Mode', ['Bounce', 'Warp'], 2],
      ],
    })

    expect(program.parameters).toEqual([
      {
        name: 'Level',
        min: -10,
        max: 10,
        value: 4,
        unit: 'V',
        scale: 1,
      },
      {
        name: 'Fine',
        min: -1,
        max: 1,
        value: 0.25,
        unit: 'ct',
        scale: 100,
      },
      {
        name: 'Mode',
        min: 1,
        max: 2,
        value: 2,
        unit: '',
        scale: 1,
        enumValues: ['Bounce', 'Warp'],
      },
    ])
  })

  it('maps every documented parameter unit', () => {
    const units = [
      [DISTING_CONSTANTS.kNone, ''],
      [DISTING_CONSTANTS.kDb, 'dB'],
      [DISTING_CONSTANTS.kDb_minInf, 'dB'],
      [DISTING_CONSTANTS.kPercent, '%'],
      [DISTING_CONSTANTS.kHz, 'Hz'],
      [DISTING_CONSTANTS.kSemitones, 'st'],
      [DISTING_CONSTANTS.kCents, 'ct'],
      [DISTING_CONSTANTS.kMs, 'ms'],
      [DISTING_CONSTANTS.kSeconds, 's'],
      [DISTING_CONSTANTS.kFrames, 'frames'],
      [DISTING_CONSTANTS.kMIDINote, 'MIDI'],
      [DISTING_CONSTANTS.kMillivolts, 'mV'],
      [DISTING_CONSTANTS.kVolts, 'V'],
      [DISTING_CONSTANTS.kBPM, 'BPM'],
    ] as const
    const program = describeProgram({}, {
      parameters: units.map(([unit], index) => [`P${index}`, 0, 10, 0, unit]),
    })

    expect(program.parameters.map((parameter) => parameter.unit)).toEqual(
      units.map(([, label]) => label),
    )
  })

  it('normalizes metadata defaults and MIDI filters', () => {
    const program = describeProgram({}, {
      inputs: -4,
      outputs: Number.NaN,
      parameters: { 1: [false, 0, 1, 0] },
      midi: {
        channelParameter: 2.9,
        messages: { 1: 'note', 2: 'cc' },
      },
    })

    expect(program).toMatchObject({
      name: 'Untitled Lua Script',
      author: 'Unknown author',
      inputCount: 0,
      outputCount: 0,
      midi: {
        channelParameter: 2,
        messages: ['note', 'cc'],
      },
    })
    expect(program.parameters[0]?.name).toBe('Parameter 1')
  })
})
