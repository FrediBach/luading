import { describe, expect, it } from 'vitest'
import { DISTING_SCRIPT_GROUPS } from './script-examples'

describe('bundled script groups', () => {
  it('presents project examples as Luading without changing their stable ids', () => {
    const luadingGroup = DISTING_SCRIPT_GROUPS.find(({ name }) => name === 'Luading')

    expect(luadingGroup?.examples.length).toBeGreaterThan(0)
    expect(luadingGroup?.examples.every(({ id }) => id.startsWith('fredi-bach/'))).toBe(true)
    expect(DISTING_SCRIPT_GROUPS.some(({ name }) => name === 'Fredi Bach')).toBe(false)
  })
})
