import { describe, expect, it } from 'vitest'
import { formatDisplayFloat } from './display-format'

describe('display float formatting', () => {
  it('uses two decimal places for live interface values', () => {
    expect(formatDisplayFloat(5)).toBe('5.00')
    expect(formatDisplayFloat(1.234)).toBe('1.23')
    expect(formatDisplayFloat(-2.678)).toBe('-2.68')
  })

  it('does not expose negative zero after rounding', () => {
    expect(formatDisplayFloat(-0.001)).toBe('0.00')
  })
})
