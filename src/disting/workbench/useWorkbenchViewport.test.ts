import { describe, expect, it } from 'vitest'
import { resolveWorkbenchDensity } from './useWorkbenchViewport'

describe('workbench viewport', () => {
  it('uses touch density for coarse-pointer layouts without changing preferences', () => {
    expect(resolveWorkbenchDensity('compact', false)).toBe('compact')
    expect(resolveWorkbenchDensity('comfortable', false)).toBe('comfortable')
    expect(resolveWorkbenchDensity('compact', true)).toBe('touch')
    expect(resolveWorkbenchDensity('comfortable', true)).toBe('touch')
  })
})
