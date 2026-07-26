import { describe, expect, it } from 'vitest'
import type { LuaProgram } from '../emulation/lua-contract'
import { validateProgramContract } from './contract-validator'

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
})
