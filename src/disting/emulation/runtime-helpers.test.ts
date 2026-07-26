import { describe, expect, it } from 'vitest'
import {
  applyCallbackOutput,
  detectInputEdges,
  midiMessageType,
  prepareMidiMessage,
  serialiseJsonState,
  sourceErrorDiagnostic,
  uiCallbackName,
} from './runtime-helpers'

describe('Disting runtime helpers', () => {
  it('applies dense and sparse callback outputs while retaining untouched voltages', () => {
    const outputs = [1, 2, 3]

    expect(applyCallbackOutput(outputs, { 2: 8 }, 'step')).toEqual([])
    expect(outputs).toEqual([1, 8, 3])
    expect(applyCallbackOutput(outputs, [4, 5], 'trigger')).toEqual([])
    expect(outputs).toEqual([4, 5, 3])
    expect(applyCallbackOutput(outputs, null, 'gate')).toEqual([])
    expect(outputs).toEqual([4, 5, 3])
  })

  it('reports invalid callback return types, indices, and voltages', () => {
    const outputs = [0]

    const nonTable = applyCallbackOutput(outputs, '5V', 'step')
    const invalidEntries = applyCallbackOutput(outputs, { 2: 5, 1: Number.NaN }, 'gate')

    expect(nonTable[0]).toMatchObject({
      ruleId: 'callback-output-table',
      callback: 'step',
    })
    expect(invalidEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'callback-output-index-2' }),
      expect.objectContaining({ ruleId: 'callback-output-value-1' }),
    ]))
    expect(outputs).toEqual([0])
  })

  it('emits trigger rising edges and both gate edges using 1-based input indices', () => {
    const rising = detectInputEdges(
      [5, 5, 5],
      ['cv', 'trigger', 'gate'],
      [false, false, false],
    )
    const falling = detectInputEdges(
      [0, 0, 0],
      ['cv', 'trigger', 'gate'],
      rising.nextHigh,
    )

    expect(rising.events).toEqual([
      { kind: 'trigger', input: 2 },
      { kind: 'gate', input: 3, rising: true },
    ])
    expect(falling.events).toEqual([
      { kind: 'gate', input: 3, rising: false },
    ])
  })

  it('classifies every documented MIDI message type', () => {
    expect([
      0x80, 0x90, 0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0,
    ].map(midiMessageType)).toEqual([
      'note',
      'note',
      'poly pressure',
      'cc',
      'program change',
      'aftertouch',
      'bend',
      undefined,
    ])
  })

  it('filters MIDI by message type and the selected channel parameter', () => {
    const midi = { channelParameter: 2, messages: ['note', 'cc'] }

    expect(prepareMidiMessage([0x92, 60, 300, 4], midi, [0, 3])).toEqual([0x92, 60, 255])
    expect(prepareMidiMessage([0x91, 60, 100], midi, [0, 3])).toBeUndefined()
    expect(prepareMidiMessage([0xe2, 0, 64], midi, [0, 3])).toBeUndefined()
    expect(prepareMidiMessage([0x92, 60, 100], midi, [0, 0])).toBeUndefined()
    expect(prepareMidiMessage([], midi, [0, 3])).toBeUndefined()
  })

  it('serialises JSON-friendly state and rejects circular data', () => {
    expect(serialiseJsonState({
      int: 42,
      array: [4, 8],
      nested: { enabled: true },
    })).toEqual({
      state: {
        int: 42,
        array: [4, 8],
        nested: { enabled: true },
      },
    })

    const circular: { self?: unknown } = {}
    circular.self = circular
    expect(serialiseJsonState(circular)).toEqual({
      state: null,
      error: 'serialise() returned data that could not be represented as JSON.',
    })
  })

  it('maps Lua errors to editor ranges and UI events to callback names', () => {
    expect(sourceErrorDiagnostic('script.lua:12:4: unexpected symbol')).toMatchObject({
      message: 'Lua error on line 12',
      range: {
        startLine: 12,
        startColumn: 4,
        endLine: 12,
        endColumn: 5,
      },
    })
    expect(sourceErrorDiagnostic('runtime exploded').range).toBeUndefined()
    expect(uiCallbackName('encoder2', 'release')).toBe('encoder2Release')
  })
})
