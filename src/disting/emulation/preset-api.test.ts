import { describe, expect, it } from 'vitest'
import { DistingPresetApi } from './preset-api'

describe('DistingPresetApi', () => {
  it('exposes companion algorithm and parameter metadata', () => {
    const preset = new DistingPresetApi()

    expect(preset.getAlgorithmCount()).toBe(2)
    expect(preset.getAlgorithmName(2)).toBe('Looper')
    expect(preset.getParameterCount(2)).toBe(2)
    expect(preset.getParameterName(2, 1)).toBe('Record')
    expect(preset.findAlgorithms('Looper')).toEqual([2])
    expect(preset.findParameters(2, 'Fade to clear')).toEqual([2])
  })

  it('sets raw and normalized companion parameter values', () => {
    const preset = new DistingPresetApi()

    expect(preset.setParameterNormalized(2, 1, 0.75)).toBe(true)
    expect(preset.getParameter(2, 1)).toBe(0.75)
    expect(preset.setParameter(2, 1, 4)).toBe(true)
    expect(preset.getParameter(2, 1)).toBe(1)
  })

  it('returns undefined or false for missing algorithms and parameters', () => {
    const preset = new DistingPresetApi()

    expect(preset.findAlgorithm('Missing')).toBeUndefined()
    expect(preset.findAlgorithms(4)).toBeUndefined()
    expect(preset.findParameter(99, 'Record')).toBeUndefined()
    expect(preset.getAlgorithmName(1)).toBeUndefined()
    expect(preset.getParameterName(2, 99)).toBeUndefined()
    expect(preset.setParameter(2, 1, Number.NaN)).toBe(false)
    expect(preset.setParameterNormalized(99, 1, 0.5)).toBe(false)
  })

  it('resets companion parameter state', () => {
    const preset = new DistingPresetApi()
    preset.setParameter(2, 2, 1)
    expect(preset.getParameterInfo(2, 2)).toMatchObject({ value: 1 })

    preset.reset()
    expect(preset.getParameter(2, 2)).toBe(0)
  })
})
