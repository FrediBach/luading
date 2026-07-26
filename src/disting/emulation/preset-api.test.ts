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
})
