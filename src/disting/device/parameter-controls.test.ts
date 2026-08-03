import { describe, expect, it } from 'vitest'
import type { ParameterDefinition } from '../types'
import {
  clampParameterPage,
  formatParameterValue,
  parameterControlKind,
  parameterPageCount,
  parameterPageRange,
  parameterPrecision,
  parameterStep,
  randomParameterValue,
} from './parameter-controls'

function parameter(
  update: Partial<ParameterDefinition> = {},
): ParameterDefinition {
  return {
    name: 'Parameter',
    min: 0,
    max: 100,
    value: 50,
    unit: '',
    scale: 1,
    ...update,
  }
}

describe('parameter control metadata', () => {
  it('uses the documented scale as the smallest numeric step', () => {
    expect(parameterStep(parameter({ scale: 1 }))).toBe(1)
    expect(parameterStep(parameter({ scale: 10 }))).toBe(0.1)
    expect(parameterStep(parameter({ scale: 100 }))).toBe(0.01)
    expect(parameterStep(parameter({ scale: 1000 }))).toBe(0.001)
    expect(parameterPrecision(parameter({ scale: 1000 }))).toBe(3)
  })

  it('chooses controls from normalized parameter metadata', () => {
    expect(parameterControlKind(parameter())).toBe('stepped')
    expect(parameterControlKind(parameter({ scale: 100 }))).toBe('continuous')
    expect(parameterControlKind(parameter({ min: -1, max: 1, scale: 100 }))).toBe('bipolar')
    expect(parameterControlKind(parameter({
      min: 1,
      max: 3,
      enumValues: ['A', 'B', 'C'],
    }))).toBe('enum-segmented')
    expect(parameterControlKind(parameter({
      min: 1,
      max: 5,
      enumValues: ['A', 'B', 'C', 'D', 'E'],
    }))).toBe('enum-menu')
  })

  it('formats scaled values and preserves 1-based enum indices', () => {
    expect(formatParameterValue(parameter({ scale: 100 }), 1.5)).toBe('1.50')
    expect(formatParameterValue(parameter({
      min: 1,
      max: 2,
      enumValues: ['Bounce', 'Warp'],
    }), 2)).toBe('Warp')
    expect(formatParameterValue(parameter({
      min: 1,
      max: 2,
      enumValues: ['Bounce', 'Warp'],
    }), 3)).toBe('Option 3')
  })

  it('clamps and slices parameter pages', () => {
    expect(parameterPageCount(0)).toBe(1)
    expect(parameterPageCount(8)).toBe(1)
    expect(parameterPageCount(9)).toBe(2)
    expect(clampParameterPage(8, 18)).toBe(2)
    expect(parameterPageRange(1, 18)).toEqual({
      page: 1,
      start: 8,
      end: 16,
    })
  })

  it('randomizes numeric parameters across representable values within their limits', () => {
    const definition = parameter({ min: -1.25, max: 2.5, scale: 100 })

    expect(randomParameterValue(definition, () => 0)).toBe(-1.25)
    expect(randomParameterValue(definition, () => 0.5)).toBe(0.63)
    expect(randomParameterValue(definition, () => 1)).toBe(2.5)
  })

  it('randomizes enums as valid integer option indices', () => {
    const definition = parameter({
      min: 1,
      max: 3,
      enumValues: ['Off', 'Gate', 'Latch'],
    })

    expect(randomParameterValue(definition, () => 0)).toBe(1)
    expect(randomParameterValue(definition, () => 0.5)).toBe(2)
    expect(randomParameterValue(definition, () => 1)).toBe(3)
  })
})
