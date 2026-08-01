import { describe, expect, it } from 'vitest'
import {
  apiAcceptsArgumentCount,
  compareDistingApiSurface,
  DISTING_API,
  DISTING_API_BY_NAME,
  DISTING_API_SUPPORT,
  DISTING_CONSTANTS,
  DISTING_CONSTANT_VALUES,
  DISTING_CONTRACT_PROVENANCE,
  DISTING_LIFECYCLE,
} from './api-manifest'

describe('Disting API manifest', () => {
  it('assigns every API a documented simulator support level', () => {
    expect(Object.keys(DISTING_API_SUPPORT).sort()).toEqual([
      'approximation',
      'full',
      'mock',
      'partial',
      'unsupported',
    ])
    expect(DISTING_API.filter((entry) => (
      entry.support !== 'full' && !entry.supportDetail
    ))).toEqual([])
    expect(DISTING_API.every((entry) => (
      entry.provenance in DISTING_CONTRACT_PROVENANCE
      && entry.overloads.length > 0
      && entry.overloads.every((overload) => (
        overload.parameters.every((parameter) => parameter.acceptedTypes.length > 0)
        && overload.returns.length > 0
      ))
      && ['worker', 'display', 'lua'].includes(entry.runtimeRegistration)
    ))).toBe(true)
  })

  it('classifies audited approximations, mocks, placeholders, and unsupported APIs', () => {
    const support = Object.fromEntries(DISTING_API.map((entry) => [
      entry.name,
      entry.support,
    ]))

    expect(support).toMatchObject({
      drawAlgorithmUI: 'partial',
      drawSmoothCircle: 'approximation',
      drawSmoothLine: 'approximation',
      exit: 'unsupported',
      getBusVoltage: 'partial',
      getCpuCycleCount: 'approximation',
      sendI2CCommand: 'mock',
      sendI2CGetter: 'mock',
      sendMIDI: 'partial',
      setDisplayMode: 'partial',
    })
    expect(support.drawText).toBe('full')
  })

  it('requires colour for the six documented drawing primitives', () => {
    for (const name of [
      'drawBox',
      'drawCircle',
      'drawLine',
      'drawRectangle',
      'drawSmoothCircle',
      'drawSmoothLine',
    ]) {
      const entry = DISTING_API_BY_NAME.get(name)
      const colour = entry?.overloads[0].parameters.at(-1)
      expect(entry?.signature).toMatch(/colour\)$/)
      expect(colour?.name).toBe('colour')
      expect(colour?.optional).not.toBe(true)
    }
  })

  it('models bounded MIDI bytes and table-or-byte I2C overloads', () => {
    const midi = DISTING_API_BY_NAME.get('sendMIDI')!
    const i2cCommand = DISTING_API_BY_NAME.get('sendI2CCommand')!
    const i2cGetter = DISTING_API_BY_NAME.get('sendI2CGetter')!

    expect([0, 1, 2, 3, 4, 5].map((count) => (
      apiAcceptsArgumentCount(midi, count)
    ))).toEqual([false, false, true, true, true, false])
    expect(midi.overloads[0].parameters[1].variadic).toEqual({ min: 1, max: 3 })
    expect(i2cCommand.overloads.map((overload) => (
      overload.parameters.at(-1)?.acceptedTypes
    ))).toEqual([['byte'], ['table']])
    expect(i2cGetter.overloads.map((overload) => (
      overload.parameters.at(-1)?.acceptedTypes
    ))).toEqual([['byte'], ['table']])
  })

  it('catalogues every runtime constant with category and provenance', () => {
    expect(DISTING_CONSTANTS.map((entry) => entry.name)).toEqual(
      Object.keys(DISTING_CONSTANT_VALUES),
    )
    expect(new Set(DISTING_CONSTANTS.map((entry) => entry.name)).size).toBe(
      DISTING_CONSTANTS.length,
    )
    expect(DISTING_CONSTANTS.filter((entry) => entry.category === 'compatibility-alias'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'kMilliseconds', provenance: 'official-corpus' }),
        expect.objectContaining({ name: 'kInt', provenance: 'official-corpus' }),
        expect.objectContaining({ name: 'kInteger', provenance: 'official-corpus' }),
        expect.objectContaining({ name: 'kEnum', provenance: 'official-corpus' }),
        expect.objectContaining({ name: 'kBool', provenance: 'official-corpus' }),
      ]))
  })

  it('provides one complete lifecycle catalog for validation and editor snippets', () => {
    const names = DISTING_LIFECYCLE.map((entry) => entry.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(expect.arrayContaining([
      'init',
      'step',
      'trigger',
      'gate',
      'draw',
      'ui',
      'setupUi',
      'midiMessage',
      'serialise',
      'pot1Turn',
      'encoder2Release',
    ]))
    expect(DISTING_LIFECYCLE.every((entry) => (
      entry.signature.startsWith(`${entry.name} = function(`)
      && entry.validScriptKinds.length > 0
      && entry.returnSemantics.length > 0
      && entry.cadence.length > 0
      && entry.snippet.length > 0
      && entry.provenance in DISTING_CONTRACT_PROVENANCE
    ))).toBe(true)
  })

  it('detects missing and uncatalogued runtime API registrations', () => {
    const names = DISTING_API.map((entry) => entry.name)
    expect(compareDistingApiSurface(names)).toEqual({ missing: [], unexpected: [] })
    expect(compareDistingApiSurface([...names.slice(1), 'unknownDistingApi'])).toEqual({
      missing: [names[0]],
      unexpected: ['unknownDistingApi'],
    })
  })
})
