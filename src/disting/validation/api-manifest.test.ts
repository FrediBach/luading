import { describe, expect, it } from 'vitest'
import {
  DISTING_API,
  DISTING_API_SUPPORT,
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
      sendMIDI: 'mock',
      setDisplayMode: 'partial',
    })
    expect(support.drawText).toBe('full')
  })
})
