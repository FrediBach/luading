import { describe, expect, it } from 'vitest'
import { DISTING_DISPLAY } from '../types'
import { DISTING_CONSTANTS } from '../emulation/lua-contract'
import { LUA_SCRIPT_PARAMETER_OFFSET } from '../emulation/parameter-model'
import {
  DISTING_API,
  DISTING_API_BY_NAME,
  DISTING_API_PROFILE,
  DISTING_CONSTANTS as DISTING_CONSTANT_CATALOG,
  DISTING_CONSTANT_NAMES,
  DISTING_LIFECYCLE_BY_NAME,
} from '../validation/api-manifest'

const MANUAL_1_12_GLOBALS = [
  'findAlgorithm',
  'getAlgorithmCount',
  'getAlgorithmName',
  'getCurrentAlgorithm',
  'findParameter',
  'focusParameter',
  'getCurrentParameter',
  'getParameter',
  'getParameterCount',
  'getParameterName',
  'setParameter',
  'setParameterNormalized',
  'standardPot1Turn',
  'standardPot2Turn',
  'standardPot3Turn',
  'drawAlgorithmUI',
  'drawBox',
  'drawCircle',
  'drawLine',
  'drawParameterLine',
  'drawRectangle',
  'drawSmoothCircle',
  'drawSmoothLine',
  'drawStandardParameterLine',
  'drawText',
  'drawTinyText',
  'exit',
  'getBusVoltage',
  'getCpuCycleCount',
  'sendI2CCommand',
  'sendI2CGetter',
  'sendMIDI',
  'setDisplayMode',
] as const

describe('Disting NT Lua 1.12 manual conformance', () => {
  it('pins the firmware timing and display model', () => {
    expect(DISTING_API_PROFILE).toBe('Disting NT Lua 1.12')
    expect(DISTING_DISPLAY).toEqual({
      width: 256,
      height: 64,
      shades: 16,
      drawFps: 30,
      stepSeconds: 0.001,
    })
    expect(LUA_SCRIPT_PARAMETER_OFFSET).toBe(85)
  })

  it('contains every global documented in the 1.12 language extensions', () => {
    const implemented = new Set(DISTING_API.map((entry) => entry.name))
    expect(MANUAL_1_12_GLOBALS.filter((name) => !implemented.has(name))).toEqual([])
    expect(new Set(DISTING_API.map((entry) => entry.name)).size).toBe(DISTING_API.length)
    expect(DISTING_API.every((entry) => entry.support.length > 0)).toBe(true)
  })

  it('marks every drawing function as draw-only', () => {
    const drawing = DISTING_API.filter((entry) => entry.name.startsWith('draw'))
    expect(drawing.length).toBeGreaterThan(0)
    expect(drawing.every((entry) => entry.contexts?.includes('draw'))).toBe(true)
  })

  it('pins bus, output, unit, and scale constants', () => {
    expect(DISTING_CONSTANTS).toMatchObject({
      kCV: 0,
      kGate: 1,
      kTrigger: 2,
      kStepped: 0,
      kLinear: 1,
      kNone: 0,
      kDb: 1,
      kPercent: 2,
      kHz: 3,
      kSemitones: 4,
      kCents: 5,
      kMs: 6,
      kSeconds: 7,
      kFrames: 8,
      kMIDINote: 9,
      kMillivolts: 10,
      kVolts: 11,
      kBPM: 12,
      kDb_minInf: 13,
      kBy10: 10,
      kBy100: 100,
      kBy1000: 1000,
    })
    expect(DISTING_CONSTANT_NAMES.every((name) => name in DISTING_CONSTANTS)).toBe(true)
  })

  it('keeps signature metadata usable by validation and IntelliSense', () => {
    for (const entry of DISTING_API) {
      expect(entry.signature).toMatch(new RegExp(`^${entry.name}\\(`))
      expect(entry.documentation.length).toBeGreaterThan(10)
      expect(entry.detail).toContain('disting NT')
      expect(entry.overloads.length).toBeGreaterThan(0)
      expect(entry.overloads.every((overload) => overload.returns.length > 0)).toBe(true)
    }
  })

  it('pins required drawing colours and bounded MIDI arity structurally', () => {
    for (const name of [
      'drawBox',
      'drawCircle',
      'drawLine',
      'drawRectangle',
      'drawSmoothCircle',
      'drawSmoothLine',
    ]) {
      expect(DISTING_API_BY_NAME.get(name)?.overloads[0].parameters.at(-1)).toMatchObject({
        name: 'colour',
        acceptedTypes: ['number'],
      })
    }

    expect(DISTING_API_BY_NAME.get('sendMIDI')?.overloads[0].parameters).toEqual([
      expect.objectContaining({ name: 'destinations', acceptedTypes: ['integer'] }),
      expect.objectContaining({
        name: 'bytes',
        acceptedTypes: ['byte'],
        variadic: { min: 1, max: 3 },
      }),
    ])
  })

  it('separates manual constants from observed compatibility aliases', () => {
    const manual = DISTING_CONSTANT_CATALOG.filter((entry) => entry.provenance === 'manual-1.12')
    const aliases = DISTING_CONSTANT_CATALOG.filter((entry) => entry.category === 'compatibility-alias')

    expect(manual.every((entry) => entry.category !== 'compatibility-alias')).toBe(true)
    expect(aliases.map((entry) => entry.name)).toEqual([
      'kMilliseconds',
      'kInt',
      'kInteger',
      'kEnum',
      'kBool',
    ])
    expect(aliases.every((entry) => entry.provenance === 'official-corpus')).toBe(true)
  })

  it('pins the core algorithm lifecycle contract', () => {
    expect(DISTING_LIFECYCLE_BY_NAME.get('step')).toMatchObject({
      signature: 'step = function(self, dt, inputs)',
      validScriptKinds: ['algorithm'],
      cadence: 'Every 1 ms.',
    })
    expect(DISTING_LIFECYCLE_BY_NAME.get('draw')).toMatchObject({
      signature: 'draw = function(self)',
      validScriptKinds: ['algorithm'],
      cadence: 'Approximately 30 fps.',
    })
    expect(DISTING_LIFECYCLE_BY_NAME.get('midiMessage')).toMatchObject({
      signature: 'midiMessage = function(self, message)',
      validScriptKinds: ['algorithm'],
    })
  })
})
