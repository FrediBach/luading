export const THEME_STORAGE_KEY = 'luading-theme'

export type ThemeMode = 'light' | 'dark'

export function browserThemeStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function storedTheme(storage?: Pick<Storage, 'getItem'>): ThemeMode {
  if (!storage) return 'dark'

  try {
    return storage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function persistTheme(
  theme: ThemeMode,
  storage?: Pick<Storage, 'setItem'>,
): void {
  if (!storage) return

  try {
    storage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Theme persistence is optional when storage is unavailable or blocked.
  }
}

export function toggledTheme(theme: ThemeMode): ThemeMode {
  return theme === 'dark' ? 'light' : 'dark'
}

export function monacoTheme(theme: ThemeMode): 'disting-nt' | 'disting-nt-light' {
  return theme === 'dark' ? 'disting-nt' : 'disting-nt-light'
}
