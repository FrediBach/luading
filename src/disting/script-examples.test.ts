import { describe, expect, it } from 'vitest'
import { DISTING_SCRIPT_EXAMPLES, DISTING_SCRIPT_GROUPS } from './script-examples'

describe('bundled script groups', () => {
  it('presents project examples as Luading without changing their stable ids', () => {
    const luadingGroup = DISTING_SCRIPT_GROUPS.find(({ name }) => name === 'Luading')

    expect(luadingGroup?.examples.length).toBeGreaterThan(0)
    expect(luadingGroup?.examples.every(({ id }) => id.startsWith('fredi-bach/'))).toBe(true)
    expect(DISTING_SCRIPT_GROUPS.some(({ name }) => name === 'Fredi Bach')).toBe(false)
  })

  it('includes the Melody Range Quantizer in the bundled selector', () => {
    expect(DISTING_SCRIPT_EXAMPLES.get('fredi-bach/Melody Range Quantizer'))
      .toMatchObject({
        name: 'Melody Range Quantizer',
        group: 'fredi-bach',
      })
  })
})
