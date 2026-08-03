import { describe, expect, it } from 'vitest'
import type { ParameterDefinition } from '../types'
import { blocksContractExecution } from '../validation/contract-validator'
import {
  matchingParameterPresetIndex,
  parseParameterPresets,
} from './parameter-presets'

const definitions: ParameterDefinition[] = [
  { name: 'Rate', min: 0.01, max: 10, value: 1, unit: 'Hz', scale: 100 },
  {
    name: 'Shape',
    min: 1,
    max: 2,
    value: 1,
    unit: '',
    scale: 1,
    enumValues: ['Triangle', 'Square'],
  },
]

describe('script parameter presets', () => {
  it('preserves source order and canonicalizes scaled values', () => {
    const result = parseParameterPresets({
      otherExtension: true,
      parameterPresets: [
        { name: 'Slow', values: [0.256, 1] },
        { name: 'Fast', values: { 1: 4, 2: 2 } },
      ],
    }, definitions)

    expect(result.diagnostics).toEqual([])
    expect(result.presets).toEqual([
      { name: 'Slow', values: [0.26, 1] },
      { name: 'Fast', values: [4, 2] },
    ])
    expect(result.presets[0].values).not.toBe(result.presets[1].values)
  })

  it('derives the first exact match and otherwise returns custom', () => {
    const presets = [
      { name: 'First', values: [1, 2] },
      { name: 'Duplicate values', values: [1, 2] },
      { name: 'Other', values: [2, 1] },
    ]

    expect(matchingParameterPresetIndex(presets, [1, 2])).toBe(0)
    expect(matchingParameterPresetIndex(presets, [2, 1])).toBe(2)
    expect(matchingParameterPresetIndex(presets, [1, 1])).toBeNull()
    expect(matchingParameterPresetIndex(presets, [1])).toBeNull()
  })

  it('ignores an absent extension and unrelated fields', () => {
    expect(parseParameterPresets(undefined, definitions)).toEqual({
      presets: [],
      diagnostics: [],
    })
    expect(parseParameterPresets({ future: true }, definitions)).toEqual({
      presets: [],
      diagnostics: [],
    })
  })

  it('keeps valid entries while diagnosing malformed entries without blocking', () => {
    const result = parseParameterPresets({
      parameterPresets: [
        { name: 'Valid', values: [1, 2] },
        'bad',
        { name: '', values: [1, 2] },
        { name: 'Valid', values: [1, 2] },
        { name: 'Wrong count', values: [1] },
        { name: 'Non-finite', values: [Number.NaN, 1] },
        { name: 'Out of range', values: [11, 1] },
        { name: 'Bad enum', values: [1, 1.5] },
      ],
    }, definitions)

    expect(result.presets).toEqual([{ name: 'Valid', values: [1, 2] }])
    expect(result.diagnostics.map((item) => item.ruleId)).toEqual([
      'parameter-preset-2-shape',
      'parameter-preset-3-name',
      'parameter-preset-4-duplicate-name',
      'parameter-preset-5-count',
      'parameter-preset-6-value-1-number',
      'parameter-preset-7-value-1-range',
      'parameter-preset-8-value-2-enum',
    ])
    expect(result.diagnostics.every((item) => (
      item.target === 'simulator'
      && item.severity === 'warning'
      && item.penalty === 0
    ))).toBe(true)
    expect(blocksContractExecution(result.diagnostics)).toBe(false)
  })

  it('diagnoses namespace, sequence, values, and zero-parameter shapes', () => {
    expect(parseParameterPresets('bad', definitions).diagnostics[0].ruleId)
      .toBe('luading-shape')
    expect(parseParameterPresets({ parameterPresets: 'bad' }, definitions)
      .diagnostics[0].ruleId).toBe('parameter-presets-shape')
    expect(parseParameterPresets({
      parameterPresets: [{ name: 'Bad values', values: 'bad' }],
    }, definitions).diagnostics[0].ruleId).toBe('parameter-preset-1-values-shape')
    expect(parseParameterPresets({
      parameterPresets: [{ name: 'Empty', values: [] }],
    }, []).diagnostics[0].ruleId).toBe('parameter-preset-1-no-parameters')
  })
})
