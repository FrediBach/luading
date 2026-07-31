import { describe, expect, it, vi } from 'vitest'
import {
  editorTypography,
  persistTextSize,
  storedTextSize,
  TEXT_SIZE_OPTIONS,
  TEXT_SIZE_STORAGE_KEY,
} from './appearance'

describe('workbench text size', () => {
  it('restores supported sizes and rejects missing or unknown values', () => {
    expect(storedTextSize()).toBe('standard')
    expect(storedTextSize({ getItem: () => 'large' })).toBe('large')
    expect(storedTextSize({ getItem: () => 'tiny' })).toBe('standard')
    expect(storedTextSize({ getItem: () => { throw new Error('blocked') } }))
      .toBe('standard')
  })

  it('persists the selected size without making storage mandatory', () => {
    const setItem = vi.fn()
    persistTextSize('large', { setItem })
    expect(setItem).toHaveBeenCalledWith(TEXT_SIZE_STORAGE_KEY, 'large')

    expect(() => persistTextSize('large', {
      setItem: () => { throw new Error('blocked') },
    })).not.toThrow()
  })

  it('provides readable Monaco dimensions for every size', () => {
    expect(TEXT_SIZE_OPTIONS.map((option) => option.id))
      .toEqual(['small', 'standard', 'large'])
    expect(editorTypography('small')).toEqual({ fontSize: 12.5, lineHeight: 21 })
    expect(editorTypography('standard')).toEqual({ fontSize: 14, lineHeight: 22 })
    expect(editorTypography('large')).toEqual({ fontSize: 16, lineHeight: 25 })
  })
})
