import { describe, expect, it } from 'vitest'
import { DISTING_API_BY_NAME } from '../validation/api-manifest'
import { apiEntryForIntelliSense } from './disting-intellisense'

describe('Disting IntelliSense API support', () => {
  it('shows non-full support levels and API-specific limitations', () => {
    const cpu = DISTING_API_BY_NAME.get('getCpuCycleCount')
    const midi = DISTING_API_BY_NAME.get('sendMIDI')

    expect(cpu && apiEntryForIntelliSense(cpu)).toMatchObject({
      detail: expect.stringContaining('browser approximation'),
      documentation: expect.stringContaining('not a Disting NT CPU-cycle measurement'),
    })
    expect(midi && apiEntryForIntelliSense(midi)).toMatchObject({
      detail: expect.stringContaining('simulator mock'),
      documentation: expect.stringContaining('not transmitted to a MIDI destination'),
    })
  })

  it('does not add a caveat to fully simulated APIs', () => {
    const drawText = DISTING_API_BY_NAME.get('drawText')
    const entry = drawText && apiEntryForIntelliSense(drawText)

    expect(entry?.detail).not.toContain('simulation')
    expect(entry?.documentation).not.toContain('Simulator support')
  })
})
