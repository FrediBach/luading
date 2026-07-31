import { describe, expect, it, vi } from 'vitest'
import {
  browserThemeStorage,
  monacoTheme,
  persistTheme,
  storedTheme,
  THEME_STORAGE_KEY,
  toggledTheme,
} from './theme'

describe('workbench theme', () => {
  it('keeps the existing dark appearance as the default', () => {
    expect(browserThemeStorage()).toBeUndefined()
    expect(storedTheme()).toBe('dark')
    expect(storedTheme({ getItem: () => null })).toBe('dark')
    expect(storedTheme({ getItem: () => 'unexpected' })).toBe('dark')
  })

  it('restores and persists the light theme', () => {
    const setItem = vi.fn()

    expect(storedTheme({ getItem: () => 'light' })).toBe('light')
    persistTheme('light', { setItem })

    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light')
  })

  it('continues safely when browser storage is blocked', () => {
    expect(storedTheme({
      getItem: () => { throw new Error('blocked') },
    })).toBe('dark')

    expect(() => persistTheme('light', {
      setItem: () => { throw new Error('blocked') },
    })).not.toThrow()
  })

  it('toggles modes and selects the matching editor theme', () => {
    expect(toggledTheme('dark')).toBe('light')
    expect(toggledTheme('light')).toBe('dark')
    expect(monacoTheme('dark')).toBe('disting-nt')
    expect(monacoTheme('light')).toBe('disting-nt-light')
  })
})
