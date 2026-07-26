import { describe, expect, it } from 'vitest'
import { DISTING_API } from './api-manifest'

describe('Disting API manifest', () => {
  it('keeps every documented Lua 1.12 global available in the simulator', () => {
    expect(DISTING_API.filter((entry) => !entry.simulator).map((entry) => entry.name)).toEqual([])
  })
})
