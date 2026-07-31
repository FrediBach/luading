import { describe, expect, it } from 'vitest'
import type { LuaProgram } from '../emulation/lua-contract'
import { DISTING_LIFECYCLE } from './api-manifest'
import {
  blocksContractExecution,
  validateProgramContract,
} from './contract-validator'

describe('validateProgramContract', () => {
  it('accepts a trigger-only script with sparse callback updates', () => {
    const program: LuaProgram = {
      name: 'Trigger only',
      author: 'Test',
      trigger: () => [5],
    }
    const findings = validateProgramContract(program, {
      inputs: [2],
      outputs: 2,
    })

    expect(findings.filter((item) => item.severity === 'error')).toEqual([])
    expect(findings.some((item) => item.ruleId === 'outputs-never-updated')).toBe(false)
    expect(findings.some((item) => item.ruleId === 'missing-trigger-callback')).toBe(false)
  })

  it('accepts numeric and typed I/O declarations', () => {
    const numeric = validateProgramContract({ step: () => [0] }, {
      inputs: 2,
      outputs: 1,
    })
    const typed = validateProgramContract({ gate: () => [0] }, {
      inputs: [1],
      outputs: [1],
    })

    expect(numeric.filter((item) => item.severity === 'error')).toEqual([])
    expect(typed.filter((item) => item.severity === 'error')).toEqual([])
  })

  it('rejects invalid bus and parameter metadata', () => {
    const findings = validateProgramContract({}, {
      inputs: 29,
      outputs: [7],
      parameters: [
        ['Bad range', 10, 0, 20, 99],
        ['Bad enum', ['A', 'B'], 3],
      ],
    })
    const rules = findings.map((item) => item.ruleId)

    expect(rules).toContain('inputs-count')
    expect(rules).toContain('outputs-type-1')
    expect(rules).toContain('parameter-1-range')
    expect(rules).toContain('parameter-1-default')
    expect(rules).toContain('parameter-1-unit')
    expect(rules).toContain('parameter-2-default')
  })

  it('blocks execution on contract errors but not warnings or informational findings', () => {
    const invalid = validateProgramContract({}, { inputs: 29 })
    const nonBlocking = validateProgramContract({}, { inputs: [2] })

    expect(blocksContractExecution(invalid)).toBe(true)
    expect(blocksContractExecution(nonBlocking)).toBe(false)
  })

  it('notes when edge inputs have no corresponding callback', () => {
    const findings = validateProgramContract({}, {
      inputs: [2, 1],
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'missing-trigger-callback', severity: 'info' }),
      expect.objectContaining({ ruleId: 'missing-gate-callback', severity: 'info' }),
    ]))
  })

  it('accepts firmware-compatible empty arrays, omitted units, and numeric enum labels', () => {
    const findings = validateProgramContract({ step: () => [] }, {
      inputs: [],
      outputs: {},
      outputNames: {},
      parameters: [
        ['MIDI channel', 0, 16, 0],
        ['PPQN', [24, 48, 96], 1],
      ],
    })

    expect(findings.filter((item) => item.severity === 'error')).toEqual([])
  })

  it('validates MIDI filter metadata', () => {
    const valid = validateProgramContract({ midiMessage: () => undefined }, {
      parameters: [['MIDI channel', 0, 16, 0]],
      midi: { channelParameter: 1, messages: ['note', 'cc'] },
    })
    const invalid = validateProgramContract({}, {
      parameters: [],
      midi: { channelParameter: 2, messages: ['sysex'] },
    })

    expect(valid.filter((item) => item.severity === 'error')).toEqual([])
    expect(invalid.map((item) => item.ruleId)).toEqual(expect.arrayContaining([
      'midi-channel-parameter',
      'midi-messages',
    ]))
  })

  it('rejects non-function lifecycle members and non-table init results', () => {
    const invalidProgram = Object.fromEntries([
      'init',
      'step',
      'trigger',
      'gate',
      'draw',
      'ui',
      'setupUi',
      'midiMessage',
      'serialise',
    ].map((name) => [name, true]))
    const callbackFindings = validateProgramContract(
      invalidProgram as unknown as LuaProgram,
      undefined,
    )
    const initFindings = validateProgramContract({}, 'not a table')

    expect(callbackFindings.filter((item) => item.ruleId.endsWith('-type'))).toHaveLength(9)
    expect(initFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'init-return', severity: 'error' }),
    ]))
  })

  it('validates custom UI callback types from the lifecycle catalog', () => {
    const customCallbacks = Object.fromEntries(
      DISTING_LIFECYCLE
        .filter((entry) => entry.customUi)
        .map((entry) => [entry.name, true]),
    )
    const findings = validateProgramContract(customCallbacks as LuaProgram, undefined)

    expect(findings.filter((item) => item.ruleId.endsWith('-type'))).toHaveLength(
      DISTING_LIFECYCLE.filter((entry) => entry.customUi).length,
    )
  })

  it('reports malformed I/O, names, and parameter shapes', () => {
    const findings = validateProgramContract({}, {
      inputs: 'two',
      outputs: { label: 'not a sequence' },
      inputNames: 'Inputs',
      outputNames: { 1: 42, 2: 'Extra' },
      parameters: {
        1: 'bad',
        2: ['', 0, 1, 0],
        3: ['Broken enum', {}, 1],
        4: ['Numbers', 0, Number.NaN, 0],
        5: ['Scale', 0, 10, 5, 0, 7],
      },
    })
    const rules = findings.map((item) => item.ruleId)

    expect(rules).toEqual(expect.arrayContaining([
      'inputs-shape',
      'outputs-shape',
      'inputNames-shape',
      'outputNames-1',
      'outputNames-extra-1',
      'outputNames-extra-2',
      'parameter-1-shape',
      'parameter-2-name',
      'parameter-3-enum',
      'parameter-3-default',
      'parameter-4-numbers',
      'parameter-5-scale',
    ]))
  })

  it('accepts every documented MIDI filter and parameter scale', () => {
    const messageTypes = ['note', 'cc', 'bend', 'aftertouch', 'poly pressure', 'program change']
    const findings = validateProgramContract({ midiMessage: () => undefined }, {
      parameters: [
        ['Channel', 0, 16, 1, 0],
        ['Tenths', 0, 100, 25, 11, 10],
        ['Hundredths', 0, 100, 25, 11, 100],
        ['Thousandths', 0, 1000, 25, 11, 1000],
      ],
      midi: { channelParameter: 1, messages: messageTypes },
    })

    expect(findings.filter((item) => item.severity === 'error')).toEqual([])
  })

  it('requires integer raw parameter fields even when values are scaled', () => {
    const invalid = validateProgramContract({}, {
      parameters: [['Fractional raw', 0, 10.5, 0.5, 0]],
    })
    const scaled = validateProgramContract({}, {
      parameters: [['Scaled', 0, 105, 5, 0, 10]],
    })

    expect(invalid).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'parameter-1-integers',
        severity: 'error',
      }),
    ]))
    expect(scaled.filter((item) => item.severity === 'error')).toEqual([])
  })

  it('reports unused edge callbacks, inert outputs, and missing identity metadata', () => {
    const findings = validateProgramContract({
      trigger: () => [],
      gate: () => [],
    }, {
      inputs: [0],
      outputs: 2,
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'unused-trigger-callback' }),
      expect.objectContaining({ ruleId: 'unused-gate-callback' }),
      expect.objectContaining({ ruleId: 'missing-program-name' }),
      expect.objectContaining({ ruleId: 'missing-program-author' }),
    ]))

    const inert = validateProgramContract({}, { outputs: 1 })
    expect(inert.some((item) => item.ruleId === 'outputs-never-updated')).toBe(true)
  })

  it('rejects invalid MIDI configuration shapes independently', () => {
    expect(validateProgramContract({}, { midi: [] }).map((item) => item.ruleId)).toContain('midi-shape')
    expect(validateProgramContract({}, {
      parameters: [['Channel', 0, 16, 1]],
      midi: { channelParameter: 1, messages: {} },
    }).map((item) => item.ruleId)).toContain('midi-messages')
  })
})
